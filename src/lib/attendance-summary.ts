/**
 * THE single source of truth for attendance headcount numbers — every page
 * that shows a "Hadir/Terlambat/Belum Tap In/..." card (Dashboard Karyawan,
 * Monitoring Absensi, and any future summary widget) must call
 * buildAttendanceSummary() with the same inputs instead of recomputing its
 * own version. Two pages with two different formulas is exactly how
 * Dashboard Karyawan and Monitoring Absensi drifted apart (Dashboard was
 * counting every active employee regardless of attendanceMethod, joining
 * attendance_events by a 7-day tsServer range instead of the selected day's
 * dateKey, and resolving one single "active site" for every employee's
 * shift instead of each employee's own brand/day schedule).
 *
 * This module only computes from already-fetched arrays — it intentionally
 * does not own Firestore querying, since the correct query shape (HRD scope,
 * legacy-field fallbacks, dateKey vs createdAt-range dual queries) is
 * genuinely page-specific. What must never differ between pages is the
 * MATH, which is why every per-employee formula below is delegated to the
 * same low-level helpers Monitoring Absensi already uses
 * (resolveSiteForBrand, resolveScheduleForDay, calculateAttendanceLateStatus,
 * getEventEmployeeUid, getEventDateKey, getEventType, validateAttendanceLocation).
 */

import type { AttendanceSite, WorkScheduleDay } from './types';
import { startOfDay, endOfDay } from 'date-fns';
import {
  resolveProfileUid,
  resolveSiteForBrand,
  resolveScheduleForDay,
  calculateAttendanceLateStatus,
  getEventEmployeeUid,
  getEventDateKey,
  getEventType,
  getEventTimestamp,
  validateAttendanceLocation,
} from './attendance-helpers';
import { normalizeAttendanceMethodBucket } from './attendance-methods';

const JS_DAY_TO_SCHEDULE_DAY: WorkScheduleDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * The one and only "which calendar day is this" conversion for attendance —
 * Asia/Jakarta, never the runtime's local timezone (which is UTC on most
 * Next.js server hosts) and never a raw `toISOString().slice(0,10)` (UTC).
 */
export function getJakartaDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
}

function getJakartaDayOfWeek(date: Date): WorkScheduleDay {
  const label = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'long' }).format(date).toLowerCase();
  return (JS_DAY_TO_SCHEDULE_DAY.includes(label as WorkScheduleDay) ? label : 'monday') as WorkScheduleDay;
}

/**
 * Same fallback chain Monitoring Absensi's resolveBrandId uses — companyId
 * variants and nested hrdEmploymentInfo/employmentInfo are older field
 * shapes some employee_profiles docs still carry.
 */
function resolveEmployeeBrandId(p: any): string | null {
  const id =
    p.brandId || p.companyId || p.brandID || p.companyID ||
    p.hrdEmploymentInfo?.brandId || p.hrdEmploymentInfo?.companyId ||
    p.employmentInfo?.brandId || p.employmentInfo?.companyId ||
    null;
  return typeof id === 'string' && id ? id : null;
}

function resolveEmployeeBrandName(p: any): string | null {
  return p.brandName || p.hrdEmploymentInfo?.brandName || p.companyName || null;
}

/** Same field chain Monitoring Absensi reads before normalizing to the web_absen/id_card/manual bucket. */
function resolveEmployeeAttendanceMethodRaw(p: any): string | undefined {
  return p.attendanceMethod || p.attendanceConfig?.method || p.hrdEmploymentInfo?.attendanceMethod;
}

export interface AttendanceSummaryResult {
  dateKey: string;
  /** All active employees in scope, any attendance method — for a plain "Karyawan Aktif" headcount card. */
  totalActiveEmployees: number;
  /** Active employees in scope whose attendanceMethod normalizes to "web_absen" — the actual population every other number below is drawn from. */
  totalWebAbsen: number;
  /** Punya tap_in hari ini. */
  sudahAbsenBerangkat: number;
  /** Tidak punya tap_in hari ini. */
  belumAbsenBerangkat: number;
  /** Punya tap_in tapi belum punya tap_out. */
  sedangBekerja: number;
  /** Punya tap_out hari ini. */
  sudahAbsenPulang: number;
  /** Sama seperti sedangBekerja — tap_in tanpa tap_out. */
  belumAbsenPulang: number;
  /** tap_in ada dan calculatedLateMinutes === 0. */
  tepatWaktu: number;
  /** tap_in ada dan calculatedLateMinutes > 0. */
  terlambat: number;
  /** Lokasi perlu review, ada kondisi khusus, terlambat melewati latestCheckInWithoutReview, atau jadwal/site tidak ditemukan. */
  perluReviewHRD: number;
  kondisiKhusus: number;
  tidakValid: number;
  validOtomatis: number;
  webAbsenEmployeeUids: string[];
}

/**
 * `isSuperAdmin`/`isAllCompanies` mean "skip the brandId check entirely" —
 * pass `true` ONLY when the caller genuinely wants every brand. If the UI
 * has a brand filter and the user picked a specific company (even as a
 * Super Admin), the caller MUST pass `isSuperAdmin: false` /
 * `isAllCompanies: false` and narrow `allowedBrandIds` to that one id —
 * otherwise these flags silently ignore the selection and the KPI numbers
 * never change when the filter does.
 */
export function buildAttendanceSummary({
  employees,
  attendanceEvents,
  attendanceSites,
  conditionReports = [],
  leaveRequests = [],
  selectedDate,
  allowedBrandIds,
  isSuperAdmin = false,
  isAllCompanies = false,
  onlyWebAbsen = true,
}: {
  employees: any[] | null | undefined;
  attendanceEvents: any[] | null | undefined;
  attendanceSites: AttendanceSite[] | null | undefined;
  conditionReports?: any[] | null;
  leaveRequests?: any[] | null;
  selectedDate: Date;
  allowedBrandIds: string[];
  isSuperAdmin?: boolean;
  isAllCompanies?: boolean;
  onlyWebAbsen?: boolean;
}): AttendanceSummaryResult {
  const dateKey = getJakartaDateKey(selectedDate);
  const dayOfWeek = getJakartaDayOfWeek(selectedDate);

  // ── Scope: active employees whose brand is in allowedBrandIds (Super Admin / "all companies" HRD skip this check) ──
  const scopedEmployees = (employees || []).filter((p: any) => {
    if (p.isActive === false) return false;
    const status = p.status || p.employmentStatus || '';
    if (status === 'inactive' || status === 'nonaktif' || status === 'Nonaktif') return false;
    const role = p.role || '';
    if (role === 'candidate' || role === 'kandidat') return false;
    if (isSuperAdmin || isAllCompanies) return true;
    const brandId = resolveEmployeeBrandId(p);
    return !!brandId && allowedBrandIds.includes(brandId);
  });
  const totalActiveEmployees = scopedEmployees.length;

  const webAbsenEmployees = onlyWebAbsen
    ? scopedEmployees.filter((p: any) => normalizeAttendanceMethodBucket(resolveEmployeeAttendanceMethodRaw(p)) === 'web_absen')
    : scopedEmployees;
  const totalWebAbsen = webAbsenEmployees.length;

  const webAbsenEmployeeUids = webAbsenEmployees
    .map((p: any) => resolveProfileUid(p))
    .filter((uid): uid is string => !!uid);
  const employeeUidSet = new Set(webAbsenEmployeeUids);

  // ── Events for the selected day, scoped to the web-absen employees above ──
  const eventsByUid = new Map<string, any[]>();
  for (const event of attendanceEvents || []) {
    if (getEventDateKey(event) !== dateKey) continue;
    const uid = getEventEmployeeUid(event);
    if (!uid || !employeeUidSet.has(uid)) continue;
    if (!eventsByUid.has(uid)) eventsByUid.set(uid, []);
    eventsByUid.get(uid)!.push(event);
  }

  const siteCache = new Map<string, AttendanceSite | null>();
  const resolveSite = (brandId: string | null, brandName: string | null): AttendanceSite | null => {
    const key = `${brandId ?? ''}::${brandName ?? ''}`;
    if (siteCache.has(key)) return siteCache.get(key)!;
    const site = resolveSiteForBrand(attendanceSites, brandId, brandName);
    siteCache.set(key, site);
    return site;
  };

  let sudahAbsenBerangkat = 0, tepatWaktu = 0, terlambat = 0, belumAbsenBerangkat = 0, belumAbsenPulang = 0,
    sedangBekerja = 0, sudahAbsenPulang = 0, tidakValid = 0, perluReviewHRD = 0, kondisiKhusus = 0, validOtomatis = 0;

  for (const profile of webAbsenEmployees) {
    const uid = resolveProfileUid(profile);
    const events = uid ? eventsByUid.get(uid) || [] : [];
    const checkInEvent = events.find((e) => getEventType(e) === 'tap_in') ?? null;
    const checkOutEvent = events.find((e) => getEventType(e) === 'tap_out') ?? null;
    const isInvalid = !!(checkInEvent?.isInvalid || checkOutEvent?.isInvalid);

    const isOnLeave = (leaveRequests || []).some((req: any) => {
      if (req.employeeId !== uid) return false;
      if (!req.startDate?.toDate || !req.endDate?.toDate) return false;
      const selected = startOfDay(selectedDate).getTime();
      const reqStart = startOfDay(req.startDate.toDate()).getTime();
      const reqEnd = endOfDay(req.endDate.toDate()).getTime();
      return selected >= reqStart && selected <= reqEnd;
    });

    if (isInvalid) tidakValid++;

    // Cuti and invalid rows are excluded from sudahAbsenBerangkat/belumAbsenBerangkat/lateness
    // — same as Monitoring Absensi's own status derivation (they get their own
    // 'Cuti Tahunan'/'Tidak Valid' status, never 'Belum Tap In').
    if (isOnLeave || isInvalid) continue;

    if (!checkInEvent) {
      belumAbsenBerangkat++;
      continue;
    }

    sudahAbsenBerangkat++;
    if (checkOutEvent) {
      sudahAbsenPulang++;
    } else {
      sedangBekerja++;
      belumAbsenPulang++;
    }

    const brandId = resolveEmployeeBrandId(profile);
    const brandName = resolveEmployeeBrandName(profile);
    const site = resolveSite(brandId, brandName);
    const daySchedule = resolveScheduleForDay(site as any, dayOfWeek);
    const graceMins = Number((site as any)?.lateToleranceMinutes ?? (site as any)?.shift?.graceLateMinutes ?? 0);
    const latestCheckInWithoutReview: string | null = (site as any)?.latestCheckInWithoutReview ?? null;
    const scheduleMissing = !daySchedule?.startTime;

    const lateResult = calculateAttendanceLateStatus({
      tapInTime: getEventTimestamp(checkInEvent),
      scheduledStartTime: daySchedule?.startTime ?? null,
      lateToleranceMinutes: graceMins,
      latestCheckInWithoutReview,
    });

    if (lateResult.isLate) terlambat++;
    else if (lateResult.lateMinutes !== null) tepatWaktu++;

    const siteRadiusConfig = site
      ? { office: site.office, radiusM: (site as any).checkInRadiusMeters ?? site.radiusM, validAddressKeywords: site.validAddressKeywords }
      : null;
    const locationValidation = validateAttendanceLocation(checkInEvent, siteRadiusConfig);
    const locationNeedsReview = !locationValidation.isValidAuto;

    const hasConditionReport = (conditionReports || []).some((r: any) => {
      const reportUid = r.uid || r.employeeUid;
      if (reportUid !== uid) return false;
      return r.dateKey === dateKey || r.reportDate === dateKey;
    });
    if (hasConditionReport) kondisiKhusus++;

    const needsReview = locationNeedsReview || hasConditionReport || lateResult.needsTimeReview || scheduleMissing;
    if (needsReview) perluReviewHRD++;
    else validOtomatis++;
  }

  return {
    dateKey,
    totalActiveEmployees,
    totalWebAbsen,
    sudahAbsenBerangkat,
    belumAbsenBerangkat,
    sedangBekerja,
    sudahAbsenPulang,
    belumAbsenPulang,
    tepatWaktu,
    terlambat,
    perluReviewHRD,
    kondisiKhusus,
    tidakValid,
    validOtomatis,
    webAbsenEmployeeUids,
  };
}
