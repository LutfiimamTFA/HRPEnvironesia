/**
 * Leave Balance — THE single place that answers "berapa sisa cuti karyawan
 * ini, sekarang?" Every page that shows a leave balance (Detail Pengajuan
 * Cuti, Data Karyawan, dashboards, leave history) must call
 * calculateLeaveBalance()/calculateLeaveBalanceForRequest() instead of
 * recomputing its own version — that drift (Detail Pengajuan Cuti reading a
 * stale leave_balances.currentBalance while Data Karyawan read a manually
 * typed hrdEmploymentInfo.sisaCuti) is exactly what caused the two pages to
 * disagree.
 *
 * This is deliberately "hitung on read": entitlementDays/usedDays/pendingDays
 * are derived live from the employee record + leave_requests every time it's
 * called, using whatever live Firestore listener the caller already has —
 * never a cached number that can go stale. buildLeavePolicyBalancePayload
 * below optionally persists a SNAPSHOT of that computation into
 * leave_policy_balances purely as a fast-read cache/history; the snapshot is
 * never the source of truth, calculateLeaveBalance() always is.
 *
 * Deliberately independent from the OLD leave_balances collection (one
 * perpetual doc per employee, no period/reset concept) written by the HRD
 * approval batch-write in persetujuan-cuti/page.tsx — this module never reads
 * or writes that collection.
 */

import { Timestamp } from 'firebase/firestore';
import type { LeavePolicy, LeavePolicyBalance } from './types';
import {
  resolveEmployeeUid,
  resolveLeavePolicyForEmployee,
  computeLeavePeriod,
  toDate,
  type LeavePeriod,
} from './leave-policy';

// ── Entitlement (jatah cuti) resolution ─────────────────────────────────────
// LeavePolicy never carries a quota field (see leave-policy.ts) — the number
// of days comes from the employee's own record. Top-level fields are tried
// before the nested hrdEmploymentInfo ones so a value the Ubah Cuti/Ubah
// Kontrak forms mirror to the top level always wins; every write path that
// sets one of these fields (see karyawan/[id]/page.tsx's handleSaveHrd) sets
// ALL of them together, top-level AND nested, specifically so `??` here can
// never stop early on a stale value in one field while a fresher one sits in
// another — that mismatch (a leftover top-level 0 shadowing a freshly-saved
// nested 15) was the exact bug this order fixes. No default-12 fallback:
// unconfigured means 0, forcing HRD to set it explicitly via the resolver's
// own UI rather than silently assuming a number nobody chose.
export function resolveEmployeeLeaveEntitlementDays(employee: any): number {
  const hrdInfo = employee?.hrdEmploymentInfo || {};
  const rawValue =
    employee?.leaveEntitlementDays ??
    employee?.annualLeaveQuota ??
    employee?.jatahCuti ??
    hrdInfo.leaveEntitlementDays ??
    hrdInfo.annualLeaveQuota ??
    hrdInfo.jatahCuti ??
    0;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

/**
 * "Sisa Tahun Lalu" — leave carried over from the previous period, an
 * HRD-editable manual figure (never derived from leave_requests). Reads
 * hrdEmploymentInfo.carryOverCuti first — the field the "Ubah Cuti" form on
 * the employee detail page actually writes — then a couple of newer-style
 * name variants, defaulting to 0 (never fabricated).
 */
export function resolveEmployeeLeaveCarryOverDays(employee: any): number {
  const hrdInfo = employee?.hrdEmploymentInfo || {};
  const value =
    hrdInfo.carryOverCuti ??
    employee?.carryOverLeaveDays ??
    hrdInfo.carryOverLeaveDays ??
    employee?.carryOverCuti ??
    0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ── leave_requests matching ──────────────────────────────────────────────────
// leave_requests docs have been written by several different app
// versions/flows over time, so status/uid/date/duration are all read through
// a field-name fallback chain rather than trusting a single canonical name —
// the same defensive pattern used throughout this codebase (see
// resolveContractDates above). Getting any one of these chains wrong is what
// makes an already-approved request silently disappear from one page's
// balance while still showing correctly on another.

/** "Disetujui" statuses that actually consume quota — never rejected/cancelled/draft/pending. */
const APPROVED_LEAVE_STATUS_VALUES = new Set([
  'approved', 'disetujui', 'approved_by_hrd', 'disetujui_hrd', 'approved_hrd', 'hrd_approved',
  'active_leave', 'completed',
]);
const PENDING_LEAVE_STATUS_VALUES = new Set([
  'pending', 'submitted', 'pending_approval',
  'pending_manager', 'pending_manager_review', 'pending_supervisor', 'pending_director', 'pending_director_review',
  'pending_hrd', 'pending_hrd_review',
  'menunggu_approval_atasan', 'menunggu_persetujuan_atasan', 'menunggu_approval_hrd',
  'revision_requested', 'revision_requested_by_manager', 'revision_requested_by_director', 'revision_requested_by_hrd',
]);

/** Every field name a leave_requests doc might carry its HRD-decision status under — `status` is the only field the current write path (persetujuan-cuti's approve action) actually sets, the rest are defensive fallbacks for other tools/older docs. */
const STATUS_FIELD_NAMES = ['status', 'hrdApprovalStatus', 'hrdStatus', 'approvalStatus', 'statusHRD', 'statusHrd', 'hrdDecision'];

function collectStatusValues(request: any): string[] {
  return STATUS_FIELD_NAMES.map((field) => request?.[field])
    .filter((value) => typeof value === 'string' && value)
    .map((value) => value.toLowerCase());
}

/** True if ANY status-bearing field on this request is an "approved by HRD" value. */
export function isApprovedLeaveRequest(request: any): boolean {
  return collectStatusValues(request).some((value) => APPROVED_LEAVE_STATUS_VALUES.has(value));
}

/** True if ANY status-bearing field on this request is a "still awaiting a decision" value. */
export function isPendingLeaveRequest(request: any): boolean {
  return collectStatusValues(request).some((value) => PENDING_LEAVE_STATUS_VALUES.has(value));
}

/** Every UID-style field a leave_requests doc might carry (LeaveSubmissionClient.tsx writes employeeUid/requesterUid/uid/userId identically; createdByUid/employeeId are defensive fallbacks for other write paths). */
export function getLeaveRequestEmployeeUid(request: any): string | null {
  return (
    request?.employeeUid ||
    request?.requesterUid ||
    request?.uid ||
    request?.userId ||
    request?.createdByUid ||
    request?.employeeId ||
    null
  );
}

/**
 * Employee<->leave_request join. UID match is the reliable, primary path —
 * employeeId (an internal employee code, not a name) and employeeEmail are
 * secondary/tertiary fallbacks only used when no UID match is found, for
 * older docs that never got a matching UID written. Never joins by name.
 */
export function isLeaveRequestForEmployee(request: any, employee: any): boolean {
  const employeeUid = resolveEmployeeUid(employee);
  if (employeeUid && getLeaveRequestEmployeeUid(request) === employeeUid) return true;

  const employeeCode = employee?.employeeId || employee?.hrdEmploymentInfo?.employeeId;
  if (employeeCode && request?.employeeId && request.employeeId === employeeCode) return true;

  const employeeEmail = employee?.email || employee?.hrdEmploymentInfo?.email;
  if (
    employeeEmail &&
    request?.employeeEmail &&
    String(request.employeeEmail).toLowerCase() === String(employeeEmail).toLowerCase()
  ) {
    return true;
  }

  return false;
}

/** Every start/end field-name pair a leave_requests doc might carry its leave dates under — `startDate`/`endDate` is the only pair the current submission flow writes, the rest are defensive fallbacks. */
const DATE_FIELD_NAME_PAIRS: Array<[string, string]> = [
  ['startDate', 'endDate'],
  ['leaveStartDate', 'leaveEndDate'],
  ['mulai', 'selesai'],
  ['periodStart', 'periodEnd'],
];

/** Resolves a request's start/end dates through the field-name fallback chain above — stops at the first pair whose start field actually parses. */
export function resolveLeaveRequestDates(request: any): { start: Date | null; end: Date | null } {
  for (const [startField, endField] of DATE_FIELD_NAME_PAIRS) {
    const start = toDate(request?.[startField]);
    if (start) return { start, end: toDate(request?.[endField]) || start };
  }
  return { start: null, end: null };
}

/** Any overlap with the period counts — a leave spanning the period boundary still consumes quota from it, not just requests fully contained inside it. */
function requestOverlapsPeriod(request: any, periodStart: Date, periodEnd: Date): boolean {
  const { start, end } = resolveLeaveRequestDates(request);
  if (!start) return false;
  return start.getTime() <= periodEnd.getTime() && (end || start).getTime() >= periodStart.getTime();
}

function countWorkingDays(start: Date, end: Date): number {
  let count = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor.getTime() <= last.getTime()) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Every field name a leave_requests doc might carry its day-count under. If none is set at all (rather than just being 0), the count falls back to working days between the resolved start/end dates instead of silently contributing 0. */
const DURATION_FIELD_NAMES = ['durationDays', 'totalDays', 'jumlahHari', 'durasiHari', 'workingDays', 'duration'];

export function resolveLeaveRequestDurationDays(request: any): number {
  for (const field of DURATION_FIELD_NAMES) {
    const raw = request?.[field];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  const { start, end } = resolveLeaveRequestDates(request);
  if (start) return countWorkingDays(start, end || start);
  return 0;
}

/** Only "tahunan" (annual) leave consumes the annual quota — cuti besar/menikah/melahirkan are separate entitlements outside it, same distinction LeaveSubmissionClient.tsx's own balance check already makes. */
function countsAgainstQuota(request: any): boolean {
  return !request.leaveType || request.leaveType === 'tahunan';
}

function matchesRequest(a: any, b: any): boolean {
  if (!a || !b) return false;
  if (a.id && b.id) return a.id === b.id;
  return a === b;
}

// ── Result shapes ────────────────────────────────────────────────────────────

export type LeaveBalanceResult =
  | { found: false; reason: 'no_policy' }
  /** Contract-reset policy, but the employee's contractStartDate/contractEndDate aren't both set — never fabricate a period, surface "Periode kontrak belum diatur" instead. */
  | { found: false; reason: 'contract_incomplete'; policy: LeavePolicy }
  | {
      found: true;
      policyId: string;
      policyName: string;
      resetType: LeavePolicy['resetType'];
      periodKey: string;
      periodStart: Date;
      periodEnd: Date;
      entitlementDays: number;
      /** "Sisa Tahun Lalu" — manual, HRD-editable, never derived from leave_requests. */
      carryOverDays: number;
      usedDays: number;
      pendingDays: number;
      /** ids of the leave_requests docs that make up usedDays — for debugging which requests were matched/counted. */
      approvedRequestIds: string[];
      /** ids of the leave_requests docs that make up pendingDays. */
      pendingRequestIds: string[];
      /** entitlementDays + carryOverDays - usedDays — the "official" remaining balance. */
      remainingDays: number;
      /** entitlementDays + carryOverDays - usedDays - pendingDays — what can still be requested right now. */
      availableDays: number;
      status: 'active' | 'closed';
    };

/**
 * Resolves policy -> active period -> entitlement -> used/pending days from
 * leave_requests, for one employee, as of `asOfDate` (defaults to now). THE
 * function every page showing a leave balance should call.
 */
export function calculateLeaveBalance({
  employee,
  leaveRequests,
  leavePolicies,
  asOfDate = new Date(),
}: {
  employee: any;
  leaveRequests: any[] | null | undefined;
  leavePolicies: LeavePolicy[] | null | undefined;
  asOfDate?: Date;
}): LeaveBalanceResult {
  const policy = resolveLeavePolicyForEmployee(employee, leavePolicies);
  if (!policy) return { found: false, reason: 'no_policy' };

  const periodResult = computeLeavePeriod(policy, employee, asOfDate);
  if (periodResult.status === 'contract_incomplete') return { found: false, reason: 'contract_incomplete', policy };

  const { periodKey, periodStart, periodEnd } = periodResult.period;
  const entitlementDays = resolveEmployeeLeaveEntitlementDays(employee);
  const carryOverDays = resolveEmployeeLeaveCarryOverDays(employee);

  let usedDays = 0;
  let pendingDays = 0;
  const approvedRequestIds: string[] = [];
  const pendingRequestIds: string[] = [];
  for (const request of leaveRequests || []) {
    if (!isLeaveRequestForEmployee(request, employee)) continue;
    if (!countsAgainstQuota(request)) continue;
    if (!requestOverlapsPeriod(request, periodStart, periodEnd)) continue;
    const duration = resolveLeaveRequestDurationDays(request);
    if (isApprovedLeaveRequest(request)) {
      usedDays += duration;
      if (request?.id) approvedRequestIds.push(request.id);
    } else if (isPendingLeaveRequest(request)) {
      pendingDays += duration;
      if (request?.id) pendingRequestIds.push(request.id);
    }
  }

  return {
    found: true,
    policyId: policy.id || '',
    policyName: policy.name,
    resetType: policy.resetType,
    periodKey,
    periodStart,
    periodEnd,
    entitlementDays,
    carryOverDays,
    usedDays,
    pendingDays,
    approvedRequestIds,
    pendingRequestIds,
    remainingDays: entitlementDays + carryOverDays - usedDays,
    availableDays: entitlementDays + carryOverDays - usedDays - pendingDays,
    status: periodEnd.getTime() < asOfDate.getTime() ? 'closed' : 'active',
  };
}

export type LeaveBalanceForRequestResult =
  | { found: false; reason: 'no_policy' }
  | { found: false; reason: 'contract_incomplete'; policy: LeavePolicy }
  | {
      found: true;
      policy: LeavePolicy;
      period: LeavePeriod;
      entitlementDays: number;
      carryOverDays: number;
      /** Approved days in this period from every OTHER request — never includes `request`'s own duration. */
      usedDaysBeforeThisRequest: number;
      usedDaysIncludingThisRequest: number;
      /** entitlementDays + carryOverDays - usedDaysBeforeThisRequest — the balance right before this specific request, regardless of whether it's pending or already approved. */
      previousBalance: number;
      usedByThisRequest: number;
      /** previousBalance - usedByThisRequest. */
      balanceAfterApproval: number;
      pendingDays: number;
      availableDays: number;
    };

/**
 * Same as calculateLeaveBalance, but scoped to ONE specific leave_requests
 * doc — for the "Saldo Sebelumnya / Saldo Digunakan / Saldo Setelah
 * Approval" panel on the Detail Pengajuan Cuti view. The key difference:
 * `request` itself is always excluded from usedDaysBeforeThisRequest, so an
 * ALREADY-APPROVED request's own deduction isn't counted twice (previously:
 * previousBalance read the post-approval leave_balances.currentBalance
 * directly, which already had this request's days subtracted — showing
 * 11/1/11 instead of the correct 12/1/11).
 */
export function calculateLeaveBalanceForRequest({
  employee,
  leaveRequests,
  leavePolicies,
  request,
  asOfDate = new Date(),
}: {
  employee: any;
  leaveRequests: any[] | null | undefined;
  leavePolicies: LeavePolicy[] | null | undefined;
  request: any;
  asOfDate?: Date;
}): LeaveBalanceForRequestResult {
  const policy = resolveLeavePolicyForEmployee(employee, leavePolicies);
  if (!policy) return { found: false, reason: 'no_policy' };

  const periodResult = computeLeavePeriod(policy, employee, asOfDate);
  if (periodResult.status === 'contract_incomplete') return { found: false, reason: 'contract_incomplete', policy };

  const { period } = periodResult;
  const entitlementDays = resolveEmployeeLeaveEntitlementDays(employee);
  const carryOverDays = resolveEmployeeLeaveCarryOverDays(employee);

  let usedDaysBeforeThisRequest = 0;
  let pendingDays = 0;
  for (const other of leaveRequests || []) {
    if (matchesRequest(other, request)) continue; // never count the request itself as "before"
    if (!isLeaveRequestForEmployee(other, employee)) continue;
    if (!countsAgainstQuota(other)) continue;
    if (!requestOverlapsPeriod(other, period.periodStart, period.periodEnd)) continue;
    const duration = resolveLeaveRequestDurationDays(other);
    if (isApprovedLeaveRequest(other)) usedDaysBeforeThisRequest += duration;
    else if (isPendingLeaveRequest(other)) pendingDays += duration;
  }

  const usedByThisRequest = resolveLeaveRequestDurationDays(request);
  const previousBalance = entitlementDays + carryOverDays - usedDaysBeforeThisRequest;
  const balanceAfterApproval = previousBalance - usedByThisRequest;

  return {
    found: true,
    policy,
    period,
    entitlementDays,
    carryOverDays,
    usedDaysBeforeThisRequest,
    usedDaysIncludingThisRequest: usedDaysBeforeThisRequest + usedByThisRequest,
    previousBalance,
    usedByThisRequest,
    balanceAfterApproval,
    pendingDays,
    availableDays: previousBalance - pendingDays,
  };
}

// ── Persisted snapshot payload (leave_policy_balances cache) ────────────────

/**
 * Builds a leave_policy_balances document for the given employee/period — a
 * find-or-create-by-periodKey upsert (never blindly appended), so a contract
 * renewal produces a NEW doc for the new period while the old period's doc
 * stays untouched as history. Purely a fast-read cache: calculateLeaveBalance()
 * above is always re-run for anything user-facing, never this snapshot alone.
 */
export function buildLeavePolicyBalancePayload({
  employeeUid,
  employeeName,
  brandId,
  brandName,
  result,
}: {
  employeeUid: string;
  employeeName: string;
  brandId: string;
  brandName: string;
  result: Extract<LeaveBalanceResult, { found: true }>;
}): Omit<LeavePolicyBalance, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    employeeUid,
    employeeName,
    brandId,
    brandName,
    policyId: result.policyId,
    policyName: result.policyName,
    resetType: result.resetType,
    periodKey: result.periodKey,
    periodStart: Timestamp.fromDate(result.periodStart),
    periodEnd: Timestamp.fromDate(result.periodEnd),
    entitlementDays: result.entitlementDays,
    usedDays: result.usedDays,
    pendingDays: result.pendingDays,
    remainingDays: result.remainingDays,
    availableDays: result.availableDays,
    status: result.status,
  };
}
