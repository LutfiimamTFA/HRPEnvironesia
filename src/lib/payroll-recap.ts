/**
 * Payroll Recap Calculation
 * Source of truth for identity: employee_profiles + users + employees (same as Data Karyawan)
 * Source of truth for attendance: attendance_events only
 */

import {
  startOfMonth, endOfMonth, eachDayOfInterval, isWeekend,
  isWithinInterval, isBefore, isAfter, format, startOfDay, endOfDay,
} from 'date-fns';
import type { EmployeeProfile, AttendanceEvent } from '@/lib/types';

export type PeriodMode = 'calendar' | 'payroll' | 'custom';

export interface PayrollPeriod {
  mode: PeriodMode;
  startDate: Date;
  endDate: Date;
  displayLabel: string;
}

export interface LateDetail {
  date: string;          // YYYY-MM-DD
  tapInTime: string;     // HH:mm
  lateMinutes: number;
}

export interface PayrollRecapRow {
  employeeId: string;
  fullName: string;
  employeeNumber: string;
  brandId: string;
  brandName: string;
  divisionId?: string;
  divisionName: string;

  // Attendance stats
  hariKerja: number;
  hadir: number;
  terlambat: number;
  menitTerlambat: number;
  lateDetails: LateDetail[];        // per-day breakdown for modal
  pulangAwal: number;
  lupaHapIn: number;
  lupaHapOut: number;

  // Leave stats (sakit included in izin)
  izin: number;
  dinas: number;
  alpha: number;

  // Work stats
  totalJamKerja: number;

  // Detail izin untuk modal
  leaveDetails: Array<{
    date: string;
    type: string;
    formType?: string;
    reasonType?: string;
    keterangan?: string;
    days?: number;
    status: string;
  }>;

  // Metadata
  effectiveStart: Date;
  effectiveEnd: Date;
  isPartial: boolean;
  notYetActive: boolean;
}

// ─── Period Calculation ────────────────────────────────────────────────────────

export function calculatePayrollPeriod(
  mode: PeriodMode,
  year: number,
  month: number,
  customStart?: Date,
  customEnd?: Date
): PayrollPeriod {
  let startDate: Date;
  let endDate: Date;
  let displayLabel: string;

  if (mode === 'calendar') {
    startDate = startOfMonth(new Date(year, month, 1));
    endDate = endOfMonth(new Date(year, month, 1));
    displayLabel = startDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  } else if (mode === 'payroll') {
    startDate = new Date(year, month - 1, 26, 0, 0, 0);
    endDate = new Date(year, month, 25, 23, 59, 59);
    displayLabel = `Payroll ${new Date(year, month, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`;
  } else {
    startDate = customStart ? startOfDay(customStart) : startOfMonth(new Date());
    endDate = customEnd ? endOfDay(customEnd) : endOfMonth(new Date());
    displayLabel = `${format(startDate, 'd MMM yyyy')} – ${format(endDate, 'd MMM yyyy')}`;
  }

  return { mode, startDate, endDate, displayLabel };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getWorkingDays(startDate: Date, endDate: Date, holidays: string[] = []): number {
  try {
    const holidaySet = new Set(holidays);
    const allDays = eachDayOfInterval({ start: startOfDay(startDate), end: startOfDay(endDate) });
    return allDays.filter(d => !isWeekend(d) && !holidaySet.has(format(d, 'yyyy-MM-dd'))).length;
  } catch {
    return 0;
  }
}

function isWebAbsenMethod(method: any): boolean {
  if (!method) return false;
  const n = String(method).toLowerCase().trim();
  return n === 'web_absen' || n === 'web' || n === 'web absen';
}

function isExcludedRole(role: any): boolean {
  if (!role) return false;
  const n = String(role).toLowerCase().trim();
  return ['hrd', 'super_admin', 'superadmin', 'admin', 'direktur', 'direksi', 'management', 'director'].includes(n);
}

/**
 * Normalize employee number for matching (uppercase, remove spaces/dashes/underscores)
 */
export function normalizeEmployeeNumber(value: any): string {
  if (!value) return '';
  return String(value).toUpperCase().replace(/[\s\-_]/g, '');
}

/**
 * Merge identity data from all three collections — same priority as Data Karyawan page.
 * Mutates the profile object with enriched name/identity from users + employees.
 */
export function mergeEmployeeIdentity(
  profile: any,
  user?: any,
  employeeDoc?: any
): any {
  if (!profile) return profile;
  // Resolve best name across all three sources
  const resolvedName =
    employeeDoc?.fullName?.trim() ||
    profile?.fullName?.trim() ||
    profile?.namaLengkap?.trim() ||
    (profile as any)?.employeeName?.trim() ||
    (profile as any)?.name?.trim() ||
    (profile as any)?.displayName?.trim() ||
    (profile as any)?.nama?.trim() ||
    (profile?.dataDiriIdentitas as any)?.fullName?.trim() ||
    (profile?.dataDiriIdentitas as any)?.namaLengkap?.trim() ||
    (profile?.dataDiriIdentitas as any)?.namaPanggilan?.trim() ||
    (profile?.dataDiriIdentitas as any)?.nama?.trim() ||
    (profile?.hrdEmploymentInfo as any)?.fullName?.trim() ||
    (profile?.hrdEmploymentInfo as any)?.namaLengkap?.trim() ||
    user?.fullName?.trim() ||
    (user as any)?.displayName?.trim() ||
    employeeDoc?.name?.trim() ||
    employeeDoc?.email?.trim() ||
    profile?.email?.trim() ||
    user?.email?.trim() ||
    '';

  // Return enriched copy — don't mutate original
  return {
    ...profile,
    _resolvedName: resolvedName || null,
    // Carry user/employee uid if profile doesn't have one
    _uid: (profile as any).uid || (profile as any).id || user?.uid || employeeDoc?.uid || '',
  };
}

/**
 * Resolve name from merged employee object.
 * Never falls back to employeeNumber to keep name/NIK rows visually distinct.
 */
function resolveName(employee: any): string {
  // Pre-resolved name from mergeEmployeeIdentity
  if (employee._resolvedName) return employee._resolvedName;

  // Direct profile fields
  if (employee.fullName?.trim()) return employee.fullName.trim();
  if (employee.namaLengkap?.trim()) return employee.namaLengkap.trim();
  if (employee.nama?.trim()) return employee.nama.trim();
  if (employee.displayName?.trim()) return employee.displayName.trim();
  if (employee.name?.trim()) return employee.name.trim();
  if (employee.employeeName?.trim()) return employee.employeeName.trim();
  if (employee.namakaryawan?.trim()) return employee.namakaryawan.trim();
  if (employee.namaKaryawan?.trim()) return employee.namaKaryawan.trim();
  // Nested objects
  if (employee.dataDiriIdentitas?.fullName?.trim()) return employee.dataDiriIdentitas.fullName.trim();
  if (employee.dataDiriIdentitas?.namaLengkap?.trim()) return employee.dataDiriIdentitas.namaLengkap.trim();
  if (employee.dataDiriIdentitas?.namaPanggilan?.trim()) return employee.dataDiriIdentitas.namaPanggilan.trim();
  if (employee.dataDiriIdentitas?.nama?.trim()) return employee.dataDiriIdentitas.nama.trim();
  if (employee.hrdEmploymentInfo?.fullName?.trim()) return employee.hrdEmploymentInfo.fullName.trim();
  if (employee.hrdEmploymentInfo?.namaLengkap?.trim()) return employee.hrdEmploymentInfo.namaLengkap.trim();
  // Email as penultimate fallback
  if (employee.email?.trim()) return employee.email.trim();
  // Never return employeeNumber — that duplicates the NIK row
  return 'Data karyawan';
}

function resolveEmployeeNumber(employee: any): string {
  if (employee.employeeNumber) return employee.employeeNumber;
  if (employee.employeeId) return employee.employeeId;
  if (employee.employeeCode) return employee.employeeCode;
  if (employee.nomorIndukKaryawan) return employee.nomorIndukKaryawan;
  if (employee.nomorInduk) return employee.nomorInduk;
  if (employee.nip) return employee.nip;
  if (employee.dataDiriIdentitas?.employeeNumber) return employee.dataDiriIdentitas.employeeNumber;
  if (employee.dataDiriIdentitas?.employeeId) return employee.dataDiriIdentitas.employeeId;
  if (employee.hrdEmploymentInfo?.employeeNumber) return employee.hrdEmploymentInfo.employeeNumber;
  if (employee.hrdEmploymentInfo?.employeeId) return employee.hrdEmploymentInfo.employeeId;
  return '';
}

function resolveBrandId(profile: any): string | null {
  const id = profile.hrdEmploymentInfo?.brandId || profile.brandId;
  return typeof id === 'string' && id ? id : null;
}

function resolveBrandName(profile: any, brandMap: Map<string, string>): string {
  const bId = resolveBrandId(profile);
  if (bId) return brandMap.get(bId) || bId;
  return profile.hrdEmploymentInfo?.brandName || profile.brandName || profile.companyName || '-';
}

function resolveDivision(profile: any): string {
  return profile.hrdEmploymentInfo?.divisionName ||
    profile.hrdEmploymentInfo?.divisi ||
    profile.divisionName ||
    profile.division ||
    '-';
}

function resolveJoinDate(employee: any): Date | null {
  const raw =
    employee.joinDate ||
    employee.startWorkDate ||
    employee.tanggalMulaiKerja ||
    employee.startDate ||
    employee.hrdEmploymentInfo?.joinDate ||
    employee.hrdEmploymentInfo?.startWorkDate ||
    employee.hrdEmploymentInfo?.tanggalMulaiKerja ||
    employee.dataDiriIdentitas?.joinDate ||
    null;
  if (!raw) return null;
  try {
    if (raw instanceof Date) return raw;
    if (typeof raw.toDate === 'function') return raw.toDate();
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

function resolveResignDate(employee: any): Date | null {
  const raw =
    employee.resignDate ||
    employee.endDate ||
    employee.tanggalBerhenti ||
    employee.lastWorkDate ||
    employee.hrdEmploymentInfo?.resignDate ||
    employee.hrdEmploymentInfo?.endDate ||
    null;
  if (!raw) return null;
  try {
    if (raw instanceof Date) return raw;
    if (typeof raw.toDate === 'function') return raw.toDate();
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

function getEventDateStr(event: any): string | null {
  if (event.datetime?.date) return event.datetime.date;
  const ts = event.tsServer || event.tsClient || event.createdAt;
  if (!ts) return null;
  try {
    let d: Date;
    if (ts instanceof Date) d = ts;
    else if (typeof ts === 'number') d = new Date(ts);
    else if (typeof ts === 'string') d = new Date(ts);
    else if (typeof ts.toDate === 'function') d = ts.toDate();
    else return null;
    return format(d, 'yyyy-MM-dd');
  } catch { return null; }
}

function getEventTimeStr(event: any): string {
  const ts = event.tsServer || event.tsClient || event.createdAt;
  if (!ts) return '-';
  try {
    let d: Date;
    if (ts instanceof Date) d = ts;
    else if (typeof ts === 'number') d = new Date(ts);
    else if (typeof ts === 'string') d = new Date(ts);
    else if (typeof ts.toDate === 'function') d = ts.toDate();
    else return '-';
    return format(d, 'HH:mm');
  } catch { return '-'; }
}

function getEventKind(type: string): 'in' | 'out' | null {
  const t = String(type).toLowerCase().trim();
  if (t === 'check-in' || t === 'tapin' || t === 'tap_in' || t === 'in') return 'in';
  if (t === 'check-out' || t === 'tapout' || t === 'tap_out' || t === 'out') return 'out';
  return null;
}

// ─── Deduplicate by NIK ───────────────────────────────────────────────────────

/**
 * Score how "complete" a profile is — higher = prefer this record when deduplicating.
 */
function profileCompleteness(emp: any): number {
  let score = 0;
  if (resolveName(emp) !== 'Data karyawan') score += 8;
  if (emp._uid || emp.uid || emp.id) score += 4;
  const method = emp.attendanceMethod || emp.hrdEmploymentInfo?.attendanceMethod;
  if (isWebAbsenMethod(method)) score += 2;
  if (resolveBrandId(emp)) score += 1;
  return score;
}

/**
 * Deduplicate a list of merged employee objects by normalized NIK.
 * Keeps the record with the highest completeness score.
 */
export function deduplicateByNik(employees: any[]): any[] {
  const best = new Map<string, any>();
  for (const emp of employees) {
    const empNo = resolveEmployeeNumber(emp);
    if (!empNo) continue; // no NIK → include as-is later
    const key = normalizeEmployeeNumber(empNo);
    const existing = best.get(key);
    if (!existing || profileCompleteness(emp) > profileCompleteness(existing)) {
      best.set(key, emp);
    }
  }
  // Include employees with no NIK (they can't be deduped by NIK)
  const noNik = employees.filter(emp => !resolveEmployeeNumber(emp));
  return [...best.values(), ...noNik];
}

// ─── Per-employee Recap ────────────────────────────────────────────────────────

export function generateEmployeePayrollRecap(
  employee: EmployeeProfile,
  period: PayrollPeriod,
  allEvents: AttendanceEvent[],
  approvedPermissions: any[],
  brandMap: Map<string, string>,
  holidays: string[] = []
): PayrollRecapRow {
  const employeeId = (employee as any)._uid || (employee as any).uid || (employee as any).id || '';
  const employeeNumber = resolveEmployeeNumber(employee);
  const normalizedEmployeeNumber = normalizeEmployeeNumber(employeeNumber);

  // ── Effective date range ──
  let effectiveStart = startOfDay(period.startDate);
  let effectiveEnd = endOfDay(period.endDate);
  let isPartial = false;
  let notYetActive = false;

  const joinDate = resolveJoinDate(employee);
  if (joinDate) {
    const joinDay = startOfDay(joinDate);
    if (isAfter(joinDay, endOfDay(period.endDate))) {
      notYetActive = true;
    } else if (isAfter(joinDay, effectiveStart)) {
      effectiveStart = joinDay;
      isPartial = true;
    }
  }

  const resignDate = resolveResignDate(employee);
  if (resignDate) {
    const resignDay = endOfDay(resignDate);
    if (isBefore(resignDay, effectiveStart)) {
      notYetActive = true;
    } else if (isBefore(resignDay, effectiveEnd)) {
      effectiveEnd = resignDay;
      isPartial = true;
    }
  }

  if (notYetActive) {
    return {
      employeeId,
      fullName: resolveName(employee),
      employeeNumber,
      brandId: resolveBrandId(employee) || '',
      brandName: resolveBrandName(employee, brandMap),
      divisionId: (employee as any).divisionId,
      divisionName: resolveDivision(employee),
      hariKerja: 0, hadir: 0, terlambat: 0, menitTerlambat: 0, lateDetails: [],
      pulangAwal: 0, lupaHapIn: 0, lupaHapOut: 0,
      izin: 0, dinas: 0, alpha: 0, totalJamKerja: 0,
      leaveDetails: [], effectiveStart: period.startDate, effectiveEnd: period.endDate,
      isPartial: false, notYetActive: true,
    };
  }

  const hariKerja = getWorkingDays(effectiveStart, effectiveEnd, holidays);

  // ── Filter events: date range FIRST, then employee match ──
  const myEvents = allEvents.filter(e => {
    const ev = e as any;

    // Date range filter — reject outside effective period
    const dateStr = getEventDateStr(ev);
    if (!dateStr) return false;
    try {
      const d = new Date(dateStr);
      if (d < startOfDay(effectiveStart) || d > endOfDay(effectiveEnd)) return false;
    } catch { return false; }

    // Employee match by UID (primary)
    const evUid = ev.uid || ev.userId || ev.employeeUid;
    if (evUid && evUid === employeeId) return true;

    // Employee match by normalized NIK (secondary, only when NIK is available)
    if (normalizedEmployeeNumber) {
      const evEmpNo = ev.employeeNumber || ev.nomorIndukKaryawan;
      if (evEmpNo && normalizeEmployeeNumber(evEmpNo) === normalizedEmployeeNumber) return true;
    }

    return false;
  });

  // ── Build per-day maps ──
  const checkInByDay = new Map<string, any>();
  const checkOutByDay = new Map<string, any>();

  for (const ev of myEvents) {
    const dateStr = getEventDateStr(ev as any) || '';
    const kind = getEventKind((ev as any).type || '');
    if (kind === 'in' && !checkInByDay.has(dateStr)) checkInByDay.set(dateStr, ev);
    if (kind === 'out' && !checkOutByDay.has(dateStr)) checkOutByDay.set(dateStr, ev);
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // ── Attendance stats ──
  const hadirDays = new Set<string>();
  let terlambat = 0;
  let menitTerlambat = 0;
  const lateDetails: LateDetail[] = [];
  let pulangAwal = 0;
  let lupaHapIn = 0;
  let lupaHapOut = 0;
  let totalMinutes = 0;

  for (const [dateStr, ev] of checkInByDay) {
    hadirDays.add(dateStr);

    const late = (ev as any).lateMinutes ?? 0;
    if (late > 0) {
      terlambat++;
      menitTerlambat += late;
      lateDetails.push({
        date: dateStr,
        tapInTime: getEventTimeStr(ev),
        lateMinutes: late,
      });
    }

    if (!checkOutByDay.has(dateStr) && dateStr !== todayStr) {
      lupaHapOut++;
    }
  }

  for (const [dateStr] of checkOutByDay) {
    hadirDays.add(dateStr);
    if (!checkInByDay.has(dateStr) && dateStr !== todayStr) lupaHapIn++;
    const ev = checkOutByDay.get(dateStr);
    const early = (ev as any).earlyLeaveMinutes ?? 0;
    if (early > 0) pulangAwal++;
  }

  for (const [dateStr, inEv] of checkInByDay) {
    const outEv = checkOutByDay.get(dateStr);
    if (!outEv) continue;
    const workDur = (inEv as any).workDurationMinutes || (outEv as any).workDurationMinutes;
    if (workDur) totalMinutes += workDur;
  }

  const hadir = hadirDays.size;

  // ── Approved permissions in period ──
  const permissionsInPeriod = approvedPermissions.filter(perm => {
    const permUid = perm.uid || perm.applicantUid || perm.requesterUid || perm.employeeUid;
    const permEmpNo = perm.employeeNumber || perm.nomorIndukKaryawan;
    const uidMatch = permUid && permUid === employeeId;
    const empNoMatch = permEmpNo && normalizeEmployeeNumber(permEmpNo) === normalizedEmployeeNumber;
    if (!uidMatch && !empNoMatch) return false;

    try {
      const ps = perm.startDate?.toDate?.() || new Date(perm.startDate);
      const pe = perm.endDate?.toDate?.() || new Date(perm.endDate);
      return isWithinInterval(ps, { start: effectiveStart, end: effectiveEnd }) ||
             isWithinInterval(pe, { start: effectiveStart, end: effectiveEnd }) ||
             (isBefore(ps, effectiveStart) && isAfter(pe, effectiveEnd));
    } catch { return false; }
  });

  let izin = 0;
  const leaveDetails: any[] = [];

  for (const perm of permissionsInPeriod) {
    const formType = perm.formType || perm.type || 'izin';
    const isPermission = [
      'sakit', 'tidak_masuk', 'datang_terlambat', 'pulang_awal',
      'keluar_kantor', 'duka', 'akademik', 'administrasi_resmi',
      'lainnya', 'keperluan_pribadi', 'izin', 'permission', 'sick'
    ].some(t => String(formType).toLowerCase().includes(t));
    if (!isPermission) continue;

    try {
      const ps = startOfDay(perm.startDate?.toDate?.() || new Date(perm.startDate));
      const pe = endOfDay(perm.endDate?.toDate?.() || new Date(perm.endDate));
      const permDays = eachDayOfInterval({ start: ps, end: pe })
        .filter(d => d >= startOfDay(effectiveStart) && d <= endOfDay(effectiveEnd))
        .filter(d => !isWeekend(d));
      izin += permDays.length;
      for (const day of permDays) {
        leaveDetails.push({
          date: format(day, 'yyyy-MM-dd'),
          type: formType,
          formType: perm.formType,
          reasonType: perm.reasonType || '',
          keterangan: perm.keterangan || perm.notes || perm.reason || '',
          days: 1,
          status: perm.status || 'approved',
        });
      }
    } catch { /* skip */ }
  }

  const dinas = permissionsInPeriod.filter(p => {
    const t = (p.type || p.formType || '').toLowerCase();
    return t === 'dinas' || t === 'business_trip';
  }).length;

  // ── Alpha: past working days only ──
  const effectiveWorkingDays = eachDayOfInterval({
    start: startOfDay(effectiveStart),
    end: startOfDay(effectiveEnd),
  }).filter(d => !isWeekend(d) && !holidays.includes(format(d, 'yyyy-MM-dd')));

  let alpha = 0;
  for (const day of effectiveWorkingDays) {
    const dateStr = format(day, 'yyyy-MM-dd');
    if (dateStr >= todayStr) continue;
    if (hadirDays.has(dateStr)) continue;
    const hasPermission = permissionsInPeriod.some(perm => {
      try {
        const ps = startOfDay(perm.startDate?.toDate?.() || new Date(perm.startDate));
        const pe = endOfDay(perm.endDate?.toDate?.() || new Date(perm.endDate));
        return day >= ps && day <= pe;
      } catch { return false; }
    });
    if (hasPermission) continue;
    alpha++;
  }

  return {
    employeeId,
    fullName: resolveName(employee),
    employeeNumber,
    brandId: resolveBrandId(employee) || '',
    brandName: resolveBrandName(employee, brandMap),
    divisionId: (employee as any).divisionId,
    divisionName: resolveDivision(employee),
    hariKerja,
    hadir,
    terlambat,
    menitTerlambat,
    lateDetails: lateDetails.sort((a, b) => a.date.localeCompare(b.date)),
    pulangAwal,
    lupaHapIn,
    lupaHapOut,
    izin,
    dinas,
    alpha,
    totalJamKerja: Math.floor(totalMinutes / 60),
    leaveDetails,
    effectiveStart,
    effectiveEnd,
    isPartial,
    notYetActive: false,
  };
}

// ─── Batch Recap ──────────────────────────────────────────────────────────────

export function generatePayrollRecap(
  employees: EmployeeProfile[],
  period: PayrollPeriod,
  attendanceEvents: AttendanceEvent[],
  approvedPermissions: any[],
  brands: any[],
  holidays: string[] = []
): PayrollRecapRow[] {
  const brandMap = new Map(brands.map((b: any) => [b.id, b.name]));

  const webAbsenEmployees = (employees as any[]).filter(emp => {
    if (emp.isActive === false) return false;
    const status = (emp.status || emp.employmentStatus || '').toLowerCase();
    if (status === 'inactive' || status === 'nonaktif') return false;
    const method = emp.attendanceMethod || emp.hrdEmploymentInfo?.attendanceMethod;
    if (!isWebAbsenMethod(method)) return false;
    const role = emp.role || emp.hrdEmploymentInfo?.role || '';
    if (isExcludedRole(role)) return false;
    return true;
  });

  // Deduplicate by NIK before generating recap
  const deduped = deduplicateByNik(webAbsenEmployees);

  return deduped
    .map(emp => generateEmployeePayrollRecap(emp, period, attendanceEvents, approvedPermissions, brandMap, holidays))
    .filter(row => !row.notYetActive)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));
}
