/**
 * Leave Policy — answers exactly one question per brand: "reset cutinya
 * mengikuti apa?" (calendar year, or each employee's own contract period).
 * It deliberately owns NOTHING about quota/entitlement or used/pending/
 * remaining days — that's src/lib/leave-balance.ts's job, built on top of
 * the resolveLeavePolicyForEmployee/computeLeavePeriod functions here.
 *
 * This is deliberately an ADDITIVE layer on top of the existing leave system
 * (leave_requests / leave_balances / leave_balance_adjustments), not a
 * replacement of it. The OLD leave_balances is one perpetual doc per employee
 * (doc id == uid) with no period/reset concept, and is actively written to by
 * the HRD approval batch-write (src/app/admin/hrd/persetujuan-cuti/page.tsx)
 * — this module never touches that collection or that write path.
 */

import { startOfDay, endOfDay } from 'date-fns';
import type { LeavePolicy } from './types';

// ── Employee field resolution — same "many historical field-name fallbacks" ──
// pattern used throughout this codebase (see attendance-summary.ts,
// payroll-recap.ts) since employee_profiles docs were written by several
// different tools/versions over time.

/** Same brandId fallback chain used across the app (payroll-recap.ts, attendance-summary.ts). */
export function resolveEmployeeBrandId(employee: any): string | null {
  const id =
    employee?.brandId ||
    employee?.companyId ||
    employee?.hrdEmploymentInfo?.brandId ||
    employee?.hrdEmploymentInfo?.companyId ||
    null;
  return typeof id === 'string' && id ? id : null;
}

/** Same uid fallback chain as resolveProfileUid in attendance-helpers.ts. */
export function resolveEmployeeUid(employee: any): string | null {
  return (
    employee?.uid ||
    employee?.userId ||
    employee?.authUid ||
    employee?.employeeUid ||
    employee?.id ||
    employee?.__id ||
    null
  );
}

/** Exported so leave-balance.ts (and any other consumer) parses Firestore Timestamp/Date/string values the same way, instead of a second copy of this logic. */
export function toDate(value: any): Date | null {
  if (!value) return null;
  try {
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export interface ContractDates {
  start: Date | null;
  end: Date | null;
}

/**
 * Every contract-date field-name variant actually seen in this codebase
 * (src/lib/leave-utils.ts, the employee detail page, payroll-recap.ts):
 * contractStartDate/contractEndDate (top-level and nested under
 * hrdEmploymentInfo) and their Indonesian siblings kontrakMulai/kontrakSelesai.
 */
export function resolveContractDates(employee: any): ContractDates {
  const hrdInfo = employee?.hrdEmploymentInfo || {};
  const startRaw =
    employee?.contractStartDate ||
    hrdInfo.contractStartDate ||
    hrdInfo.kontrakMulai ||
    employee?.kontrakMulai ||
    null;
  const endRaw =
    employee?.contractEndDate ||
    hrdInfo.contractEndDate ||
    hrdInfo.kontrakSelesai ||
    employee?.kontrakSelesai ||
    null;
  return { start: toDate(startRaw), end: toDate(endRaw) };
}

// ── Policy resolution ───────────────────────────────────────────────────────

/**
 * Picks the active LeavePolicy whose brandIds includes this employee's brand.
 * Never picks an inactive policy, and never falls back to "the first policy"
 * when no brand match exists — a missing policy must surface as "no policy",
 * not silently apply some other brand's rules.
 */
export function resolveLeavePolicyForEmployee(
  employee: any,
  leavePolicies: LeavePolicy[] | null | undefined,
): LeavePolicy | null {
  const brandId = resolveEmployeeBrandId(employee);
  if (!brandId || !leavePolicies) return null;
  return leavePolicies.find((policy) => policy.isActive && (policy.brandIds || []).includes(brandId)) || null;
}

// ── Period resolution ───────────────────────────────────────────────────────

export interface LeavePeriod {
  /** Stable key for this period — "2026" for annual, "2026-07-01_2027-06-30" for contract. Used to find-or-create the right LeavePolicyBalance doc. */
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
}

export type LeavePeriodResult =
  | { status: 'ok'; period: LeavePeriod }
  /** Contract-reset policy, but the employee has no (complete) contractStartDate/contractEndDate yet — never fabricate a period from a half-known date. */
  | { status: 'contract_incomplete' };

function dateKey(date: Date): string {
  // en-CA formats as YYYY-MM-DD — same Asia/Jakarta date-key convention used
  // throughout the app (see getJakartaDateKey in attendance-summary.ts).
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
}

/**
 * Resolves the CURRENT period for a policy, relative to referenceDate
 * (defaults to now):
 *  - "annual": plain calendar year — 1 Januari to 31 Desember of
 *    referenceDate's year.
 *  - "contract": exactly the employee's own contractStartDate..contractEndDate
 *    — never computed/estimated, and never generated when either date is
 *    missing (status: 'contract_incomplete' instead).
 */
export function computeLeavePeriod(
  policy: LeavePolicy,
  employee: any,
  referenceDate: Date = new Date(),
): LeavePeriodResult {
  if (policy.resetType === 'annual') {
    const year = referenceDate.getFullYear();
    const periodStart = startOfDay(new Date(year, 0, 1));
    const periodEnd = endOfDay(new Date(year, 11, 31));
    return { status: 'ok', period: { periodKey: String(year), periodStart, periodEnd } };
  }

  // resetType === 'contract'
  const { start, end } = resolveContractDates(employee);
  if (!start || !end) return { status: 'contract_incomplete' };
  const periodStart = startOfDay(start);
  const periodEnd = endOfDay(end);
  return {
    status: 'ok',
    period: { periodKey: `${dateKey(periodStart)}_${dateKey(periodEnd)}`, periodStart, periodEnd },
  };
}

export const LEAVE_POLICY_RESET_TYPE_LABEL: Record<LeavePolicy['resetType'], string> = {
  annual: 'Per Tahun',
  contract: 'Per Kontrak',
};
