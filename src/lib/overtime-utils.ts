/**
 * Pengajuan Lembur — shared helpers for the manual-only overtime flow.
 *
 * Consolidates logic that used to be copy-pasted across
 * PengajuanLemburClient.tsx / OvertimeSubmissionForm.tsx /
 * RealtimeOvertimeTimer.tsx / OvertimeApprovalClient.tsx (duration math,
 * option labels, status labels) into one place, so every screen agrees on
 * what a duration/status/anomaly actually means.
 *
 * Deliberately does NOT read attendance_events, tap-in/tap-out, or any
 * Web Absen data — overtime eligibility/anomaly detection must work
 * identically for fingerprint/manual/lapangan/WFH/dinas employees, not just
 * Web Absen users. Anomaly flags are advisory ("Perlu Review") only — none
 * of them block submission.
 */

import type { OvertimeAnomalyFlag, OvertimeJobItem, OvertimeSubmission, OvertimeSubmissionStatus } from './types';

// ── Waktu & Kategori Lembur — option lists ──────────────────────────────────
// Tipe Lembur is deliberately just these two — Tanggal Merah/Libur Nasional
// is a REASON a day counts as "Hari Libur" (see HOLIDAY_TYPE_OPTIONS below),
// not a separate top-level type, and Dinas/Lapangan is a work LOCATION, not
// a lembur type (see WORK_LOCATION_OPTIONS) — mixing those two concepts into
// Tipe Lembur is exactly what made the dropdown confusing.

export const OVERTIME_TYPE_OPTIONS = [
  { value: 'hari_kerja', label: 'Hari Kerja' },
  { value: 'hari_libur', label: 'Hari Libur' },
] as const;
export type OvertimeTypeValue = (typeof OVERTIME_TYPE_OPTIONS)[number]['value'];

/** Display-only label map — also recognizes legacy "tanggal_merah"/"dinas_lapangan"/"urgent" values still sitting on old docs, even though the dropdown (OVERTIME_TYPE_OPTIONS) no longer offers them. */
const OVERTIME_TYPE_DISPLAY_LABELS: Record<string, string> = {
  hari_kerja: 'Hari Kerja',
  hari_libur: 'Hari Libur',
  tanggal_merah: 'Hari Libur (Tanggal Merah)',
  dinas_lapangan: 'Hari Kerja',
  urgent: 'Hari Kerja',
};

export function getOvertimeTypeLabel(value: string | null | undefined): string {
  return OVERTIME_TYPE_DISPLAY_LABELS[value || ''] || 'Hari Kerja';
}

export const HOLIDAY_TYPE_OPTIONS = [
  { value: 'weekend', label: 'Weekend' },
  { value: 'libur_nasional', label: 'Libur Nasional / Tanggal Merah' },
  { value: 'libur_perusahaan', label: 'Libur Perusahaan' },
  { value: 'cuti_bersama', label: 'Cuti Bersama' },
  { value: 'lainnya', label: 'Lainnya' },
] as const;
export type HolidayTypeValue = (typeof HOLIDAY_TYPE_OPTIONS)[number]['value'];

export function getHolidayTypeLabel(value: string | null | undefined, other?: string | null): string {
  const label = HOLIDAY_TYPE_OPTIONS.find((o) => o.value === value)?.label;
  if (!label) return '-';
  return value === 'lainnya' && other?.trim() ? `${label} - ${other.trim()}` : label;
}

export const WORK_LOCATION_OPTIONS = [
  { value: 'kantor', label: 'Kantor' },
  { value: 'wfh', label: 'WFH' },
  { value: 'lapangan', label: 'Lapangan' },
  { value: 'dinas', label: 'Dinas' },
  { value: 'lainnya', label: 'Lainnya' },
] as const;
export type WorkLocationValue = (typeof WORK_LOCATION_OPTIONS)[number]['value'];

/** Older docs may carry legacy `location`/`workLocation` values (rumah_wfh, luar_kantor, site_klien, remote, site) — normalized to the current canonical set for display. */
export function normalizeWorkLocationValue(value: string | null | undefined): WorkLocationValue {
  const raw = String(value || '').toLowerCase().trim();
  if (['kantor', 'office'].includes(raw)) return 'kantor';
  if (['wfh', 'rumah_wfh', 'remote', 'wfa'].includes(raw)) return 'wfh';
  if (['lapangan', 'luar_kantor', 'site'].includes(raw)) return 'lapangan';
  if (['dinas', 'site_klien'].includes(raw)) return 'dinas';
  return 'lainnya';
}

export function getWorkLocationLabel(value: string | null | undefined): string {
  return WORK_LOCATION_OPTIONS.find((o) => o.value === normalizeWorkLocationValue(value))?.label || 'Lainnya';
}

// ── Penugasan ────────────────────────────────────────────────────────────

export const ASSIGNMENT_TYPE_OPTIONS = [
  { value: 'terencana', label: 'Terencana' },
  { value: 'mendadak_urgent', label: 'Mendadak / Urgent' },
  { value: 'instruksi_atasan', label: 'Instruksi Atasan' },
  { value: 'kebutuhan_operasional', label: 'Kebutuhan Operasional' },
  { value: 'penyelesaian_deadline', label: 'Penyelesaian Deadline' },
  { value: 'lainnya', label: 'Lainnya' },
] as const;
export type AssignmentTypeValue = (typeof ASSIGNMENT_TYPE_OPTIONS)[number]['value'];

export function getAssignmentTypeLabel(value: string | null | undefined, other?: string | null): string {
  const label = ASSIGNMENT_TYPE_OPTIONS.find((o) => o.value === value)?.label;
  if (!label) return '-';
  return value === 'lainnya' && other?.trim() ? `${label} - ${other.trim()}` : label;
}

// ── Duration math (cross-midnight safe) ─────────────────────────────────────
// The form only ever produces the Indonesian 24-jam dot format ("17.00"),
// deliberately not a native <input type="time"> (renders as a locale-
// dependent, sometimes AM/PM, picker in some browsers). Older submissions
// were saved with a colon ("17:00") — parseHHmmToMinutes stays LENIENT
// (accepts either separator) so duration/overlap math still works reading
// those, while isValidIndonesianTime (used for the form's own input
// validation) stays STRICT dot-only, so a user can never type "17:00" into
// the form itself.

function parseHHmmToMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2})[.:](\d{2})$/.exec(hhmm?.trim() || '');
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Strict Indonesian 24-jam format — "17.00" valid, "17:00"/"5 PM"/"25.00"/"12.99" all invalid. Used for the form's own input validation only. */
export function isValidIndonesianTime(value: string | null | undefined): boolean {
  return /^([01]\d|2[0-3])\.([0-5]\d)$/.test(String(value ?? '').trim());
}

/** Strict counterpart to parseHHmmToMinutes — returns null for anything that isn't the canonical dot format (including legacy colon values), for callers that must only ever accept fresh, correctly-formatted user input. */
export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!isValidIndonesianTime(value)) return null;
  const [hour, minute] = String(value).trim().split('.').map(Number);
  return hour * 60 + minute;
}

/**
 * Auto-formats digits-as-typed into the "HH.MM" mask — "1" -> "1", "17" ->
 * "17", "170" -> "17.0", "1700" -> "17.00". Never validates range (a
 * half-typed "25" while the user is still typing "23" is expected) — that's
 * isValidIndonesianTime's job, checked separately at submit/blur.
 */
export function formatTimeInput(value: string): string {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2)}`;
}

/**
 * Computes duration from start/end (Indonesian dot format, or legacy colon
 * format on older docs), transparently handling overtime that crosses
 * midnight (e.g. 22.00 -> 01.00 = 180 minutes, not negative). A start ===
 * end pair is always 0 minutes (invalid — never treated as a full 24-hour
 * shift), left for the caller's "durasi harus > 0" validation.
 */
export function computeOvertimeDuration(
  startTime: string,
  endTime: string,
): { durationMinutes: number; isCrossDay: boolean } {
  const start = parseHHmmToMinutes(startTime);
  const end = parseHHmmToMinutes(endTime);
  if (start === null || end === null) return { durationMinutes: 0, isCrossDay: false };
  if (end === start) return { durationMinutes: 0, isCrossDay: false };
  if (end > start) return { durationMinutes: end - start, isCrossDay: false };
  // end < start — wrapped past midnight.
  return { durationMinutes: 24 * 60 - start + end, isCrossDay: true };
}

export function formatDurationLabel(totalMinutes: number | null | undefined): string {
  const minutes = Math.max(0, Math.round(totalMinutes || 0));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} menit`;
  if (m === 0) return `${h} jam`;
  return `${h} jam ${m} menit`;
}

export function minutesToHours(totalMinutes: number | null | undefined): number {
  return Math.round(((totalMinutes || 0) / 60) * 100) / 100;
}

// ── Anomaly detection — advisory only, never blocks submission ─────────────

const REVIEW_DURATION_MINUTES = 4 * 60;
const HIGH_DURATION_MINUTES = 6 * 60;
const LATE_NIGHT_HOUR = 22;
const CONSECUTIVE_DAY_STREAK_THRESHOLD = 3;

export type OvertimeAnomalyInput = {
  overtimeType: string;
  overtimeDate: Date;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isCrossDay?: boolean;
  evidenceFiles: unknown[];
  evidenceLinks: string[];
  /** Daftar Pekerjaan Lembur — used for the "durasi_pekerjaan_tidak_sesuai" and "bukti_pekerjaan_belum_lengkap" checks. */
  jobs?: Array<{ estimatedDurationMinutes: number; evidenceFiles?: unknown[]; evidenceLinks?: string[] }>;
  /** Other overtime dates (Date, any status except rejected/cancelled) this same employee already has on file — used for the "lembur beruntun" streak check. Does NOT include the submission being created/edited. */
  recentOtherOvertimeDates?: Date[];
  /** True if this submission's date+time-range overlaps another of this employee's own submissions. Computed by checkOvertimeOverlap() below. */
  overlapsAnotherSubmission?: boolean;
};

export function detectOvertimeAnomalies(input: OvertimeAnomalyInput): OvertimeAnomalyFlag[] {
  const flags: OvertimeAnomalyFlag[] = [];

  if (input.durationMinutes > HIGH_DURATION_MINUTES) flags.push('durasi_lebih_6_jam');
  else if (input.durationMinutes > REVIEW_DURATION_MINUTES) flags.push('durasi_lebih_4_jam');

  const endMinutes = parseHHmmToMinutes(input.endTime);
  if (endMinutes !== null) {
    // Past 22:00 either same-day (end >= 22:00, no wrap) or the very fact
    // it wrapped past midnight (end < start) always means it ran past 22:00.
    const start = parseHHmmToMinutes(input.startTime);
    const wrapped = start !== null && endMinutes <= start;
    if (wrapped || endMinutes >= LATE_NIGHT_HOUR * 60) flags.push('lewat_jam_22');
  }

  if (input.isCrossDay) flags.push('lintas_hari');

  const dayOfWeek = input.overtimeDate.getDay();
  if (input.overtimeType === 'tanggal_merah') flags.push('tanggal_merah');
  else if (input.overtimeType === 'hari_libur' || dayOfWeek === 0 || dayOfWeek === 6) flags.push('hari_libur');

  if (input.overlapsAnotherSubmission) flags.push('overlap_pengajuan_lain');

  if ((input.recentOtherOvertimeDates?.length || 0) >= CONSECUTIVE_DAY_STREAK_THRESHOLD - 1) {
    const allDayKeys = new Set(
      [...(input.recentOtherOvertimeDates || []), input.overtimeDate].map((d) => dayKey(d)),
    );
    if (hasConsecutiveRun(Array.from(allDayKeys), CONSECUTIVE_DAY_STREAK_THRESHOLD)) {
      flags.push('lembur_beruntun');
    }
  }

  const hasFiles = input.evidenceFiles.length > 0;
  const hasLinks = input.evidenceLinks.length > 0;
  if (!hasFiles && hasLinks) flags.push('bukti_hanya_link');

  if (input.jobs && input.jobs.length > 0) {
    const totalJobMinutes = input.jobs.reduce((sum, j) => sum + (j.estimatedDurationMinutes || 0), 0);
    if (totalJobMinutes !== input.durationMinutes) flags.push('durasi_pekerjaan_tidak_sesuai');

    const hasJobMissingEvidence = input.jobs.some(
      (j) => (j.evidenceFiles?.length || 0) === 0 && (j.evidenceLinks?.length || 0) === 0,
    );
    // Only flag per-job evidence gaps when the submission overall still has
    // at least one job WITH evidence — if every job lacks per-job evidence,
    // that's already covered by the submission-level "wajib minimal 1
    // bukti" validation instead of this advisory flag.
    if (hasJobMissingEvidence && (hasFiles || hasLinks)) flags.push('bukti_pekerjaan_belum_lengkap');
  }

  return flags;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function hasConsecutiveRun(dayKeys: string[], runLength: number): boolean {
  const days = dayKeys
    .map((k) => {
      const [y, m, d] = k.split('-').map(Number);
      return new Date(y, m, d).getTime();
    })
    .sort((a, b) => a - b);
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const diffDays = Math.round((days[i] - days[i - 1]) / 86400000);
    run = diffDays === 1 ? run + 1 : 1;
    if (run >= runLength) return true;
  }
  return false;
}

export function getReviewLevelFromFlags(flags: OvertimeAnomalyFlag[]): 'normal' | 'perlu_review' {
  return flags.length > 0 ? 'perlu_review' : 'normal';
}

const ANOMALY_FLAG_LABELS: Record<OvertimeAnomalyFlag, string> = {
  durasi_lebih_4_jam: 'Durasi Tinggi (>4 jam)',
  durasi_lebih_6_jam: 'Durasi Tinggi (>6 jam)',
  lewat_jam_22: 'Lewat Jam 22:00',
  lintas_hari: 'Lintas Hari',
  hari_libur: 'Hari Libur',
  tanggal_merah: 'Tanggal Merah',
  lembur_beruntun: 'Lembur Beruntun',
  overlap_pengajuan_lain: 'Overlap Pengajuan Lain',
  bukti_hanya_link: 'Bukti Hanya Link',
  durasi_pekerjaan_tidak_sesuai: 'Durasi Pekerjaan Tidak Sesuai',
  bukti_pekerjaan_belum_lengkap: 'Bukti Perlu Diperiksa',
};

export function getAnomalyFlagLabel(flag: OvertimeAnomalyFlag): string {
  return ANOMALY_FLAG_LABELS[flag] || flag;
}

/** True if two "HH:mm"-"HH:mm" (possibly cross-midnight) ranges on the same calendar date overlap. */
export function timeRangesOverlap(
  aStart: string, aEnd: string, bStart: string, bEnd: string,
): boolean {
  const a = computeOvertimeDuration(aStart, aEnd);
  const b = computeOvertimeDuration(bStart, bEnd);
  const aStartMin = parseHHmmToMinutes(aStart) ?? 0;
  const bStartMin = parseHHmmToMinutes(bStart) ?? 0;
  const aEndMin = aStartMin + a.durationMinutes;
  const bEndMin = bStartMin + b.durationMinutes;
  return aStartMin < bEndMin && bStartMin < aEndMin;
}

/** Checks a candidate submission against this employee's OTHER existing submissions for a same-date time overlap. Excludes rejected/cancelled submissions and (when editing) the submission's own id. */
export function checkOvertimeOverlap(
  candidate: { id?: string; overtimeDateKey: string; startTime: string; endTime: string },
  existing: Array<{ id?: string; overtimeDateKey: string; startTime: string; endTime: string; status: string }>,
): boolean {
  return existing.some((other) => {
    if (other.id && candidate.id && other.id === candidate.id) return false;
    if (['rejected_by_manager', 'rejected_by_hrd', 'rejected_manager', 'rejected_hrd', 'cancelled'].includes(other.status)) return false;
    if (other.overtimeDateKey !== candidate.overtimeDateKey) return false;
    return timeRangesOverlap(candidate.startTime, candidate.endTime, other.startTime, other.endTime);
  });
}

// ── Status labels — current (manual-only, staff -> atasan -> HRD) flow ─────

export const OVERTIME_STATUS_LABELS: Partial<Record<OvertimeSubmissionStatus, string>> = {
  draft: 'Draft Persiapan',
  submitted: 'Menunggu Validasi Atasan',
  pending_manager_review: 'Menunggu Validasi Atasan',
  approved_by_manager: 'Disetujui Atasan',
  pending_hrd_review: 'Menunggu Verifikasi HRD',
  approved_by_hrd: 'Disetujui HRD',
  rejected_by_manager: 'Ditolak Atasan',
  rejected_by_hrd: 'Ditolak HRD',
  revision_requested: 'Diminta Revisi',
  cancelled: 'Dibatalkan',

  // Legacy statuses — old docs only, no new write path produces these.
  pending_coordinator: 'Menunggu Validasi Atasan',
  pending_supervisor: 'Menunggu Validasi Atasan',
  pending_manager: 'Menunggu Validasi Atasan',
  rejected_by_coordinator: 'Ditolak Atasan',
  revision_requested_by_coordinator: 'Diminta Revisi',
  revision_requested_by_manager: 'Diminta Revisi',
  rejected_manager: 'Ditolak Atasan',
  revision_manager: 'Diminta Revisi',
  pending_hrd: 'Menunggu Verifikasi HRD',
  revision_requested_by_hrd: 'Diminta Revisi',
  rejected_hrd: 'Ditolak HRD',
  revision_hrd: 'Diminta Revisi',
  approved_hrd: 'Disetujui HRD',
  approved: 'Disetujui HRD',
};

export function getOvertimeStatusLabel(status: string | null | undefined): string {
  return OVERTIME_STATUS_LABELS[status as OvertimeSubmissionStatus] || status || 'Tidak Diketahui';
}

export type OvertimeStatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

const OVERTIME_STATUS_TONES: Partial<Record<OvertimeSubmissionStatus, OvertimeStatusTone>> = {
  draft: 'neutral',
  submitted: 'info',
  pending_manager_review: 'info',
  approved_by_manager: 'success',
  pending_hrd_review: 'info',
  approved_by_hrd: 'success',
  rejected_by_manager: 'danger',
  rejected_by_hrd: 'danger',
  revision_requested: 'warning',
  cancelled: 'neutral',
};

export function getOvertimeStatusTone(status: string | null | undefined): OvertimeStatusTone {
  return OVERTIME_STATUS_TONES[status as OvertimeSubmissionStatus] || 'neutral';
}

/** The current flow's approval stage for a submission — mirrors getLeaveProcessStage()'s role in the cuti feature, so every screen agrees on who's up next. */
export function getOvertimeApprovalStage(status: string | null | undefined): {
  stage: 'manager_pending' | 'hrd_pending' | 'approved' | 'rejected' | 'revision' | 'draft' | 'cancelled' | 'unknown';
  managerCanAct: boolean;
  hrdCanAct: boolean;
} {
  switch (status) {
    case 'draft':
      return { stage: 'draft', managerCanAct: false, hrdCanAct: false };
    case 'submitted':
    case 'pending_manager_review':
    case 'pending_coordinator':
    case 'pending_supervisor':
    case 'pending_manager':
      return { stage: 'manager_pending', managerCanAct: true, hrdCanAct: false };
    case 'approved_by_manager':
    case 'pending_hrd_review':
    case 'pending_hrd':
      return { stage: 'hrd_pending', managerCanAct: false, hrdCanAct: true };
    case 'approved_by_hrd':
    case 'approved_hrd':
    case 'approved':
      return { stage: 'approved', managerCanAct: false, hrdCanAct: false };
    case 'rejected_by_manager':
    case 'rejected_manager':
    case 'rejected_by_coordinator':
      return { stage: 'rejected', managerCanAct: false, hrdCanAct: false };
    case 'rejected_by_hrd':
    case 'rejected_hrd':
      return { stage: 'rejected', managerCanAct: false, hrdCanAct: false };
    case 'revision_requested':
    case 'revision_manager':
    case 'revision_hrd':
    case 'revision_requested_by_manager':
    case 'revision_requested_by_hrd':
    case 'revision_requested_by_coordinator':
      return { stage: 'revision', managerCanAct: false, hrdCanAct: false };
    case 'cancelled':
      return { stage: 'cancelled', managerCanAct: false, hrdCanAct: false };
    default:
      return { stage: 'unknown', managerCanAct: false, hrdCanAct: false };
  }
}

/** Minimal shape getOvertimeApprovalStage()'s callers actually need — avoids importing the full OvertimeSubmission type into every consumer. */
export type OvertimeSubmissionStatusLike = Pick<OvertimeSubmission, 'status'>;

// ── "Atasan / Koordinator Pemberi Tugas" candidate list — Penugasan ─────────
// A raw system role ("division_manager", "management", "staff") is never
// human-readable on its own — this section turns it into the label a staff
// member actually understands, prioritizing the employee's REAL jabatan
// (hrdEmploymentInfo.jobTitle/position/jabatan) over the role-name fallback,
// and groups/filters the dropdown so a plain staff member never shows up as
// a valid task-assigner option unless they're the direct supervisor, a
// division manager/coordinator, management, or HRD.

function normalizeText(value: any): string {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Every value that's a SYSTEM ROLE/LEVEL, never a real jabatan — a
 * jobTitle/position/jabatan-shaped field can still literally hold one of
 * these (e.g. hrdEmploymentInfo.structuralPosition === "management") when
 * the employee's specific title was never entered, and treating that as a
 * "real jabatan" is exactly the "Yusuf Wiryawan — management" bug this
 * guards against.
 */
const SYSTEM_ROLE_VALUES = new Set([
  'management',
  'division_manager',
  'manager',
  'staff',
  'hrd',
  'employee',
  'super_admin',
  'admin',
  'karyawan',
]);

function isSystemRoleValue(value: any): boolean {
  return SYSTEM_ROLE_VALUES.has(normalizeText(value));
}

/** A jobTitle/position/jabatan CANDIDATE — empty string if it's blank or turns out to be a system role/level value in disguise, never returned as-is otherwise. */
function cleanDisplayPosition(value: any): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (isSystemRoleValue(text)) return '';
  return text;
}

export function getReadableRoleLabel(role: any): string {
  const raw = normalizeText(role);
  if (raw === 'division_manager') return 'Manager Divisi';
  if (raw === 'manager') return 'Manager';
  if (raw === 'management') return 'Manajemen / Direksi';
  if (raw === 'director' || raw === 'direktur') return 'Direktur';
  if (raw === 'head') return 'Head / Kepala Bagian';
  if (raw === 'hrd') return 'Staff HRD';
  if (raw === 'staff') return 'Staff';
  if (raw === 'super_admin' || raw === 'super-admin' || raw === 'admin') return 'Super Admin';
  if (raw === 'employee' || raw === 'karyawan') return 'Karyawan';
  if (raw === 'coordinator') return 'Koordinator';
  if (raw === 'supervisor') return 'Supervisor';
  if (raw === 'mandor') return 'Mandor';
  return 'Pegawai';
}

/**
 * Real jabatan from HRD data first (tried across every field name/nesting
 * this codebase has ever stored one under — hrdEmploymentInfo,
 * strukturKepegawaian, and top-level) — a raw system role/level value in
 * any of those fields is skipped, never shown as-is. Only once every
 * candidate is empty or role-shaped does this fall back to
 * getReadableRoleLabel(), tried against every role-ish field the employee
 * doc might carry. Never guesses a SPECIFIC title (e.g. never assumes
 * "management" means "Direktur") — an employee with no jabatan on file and
 * role "management" always shows the generic "Manajemen / Direksi".
 */
export function getDisplayPosition(employee: any): string {
  const hrd = employee?.hrdEmploymentInfo || {};
  const struktur = employee?.strukturKepegawaian || {};
  const candidates = [
    hrd.jobTitle, hrd.position, hrd.jabatan, hrd.structuralPosition,
    struktur.jobTitle, struktur.position, struktur.jabatan, struktur.structuralPosition,
    employee?.jobTitle, employee?.position, employee?.jabatan, employee?.structuralPosition, employee?.title,
  ];

  for (const candidate of candidates) {
    const cleaned = cleanDisplayPosition(candidate);
    if (cleaned) return cleaned;
  }

  return getReadableRoleLabel(
    employee?.role || employee?.userRole || employee?.accessRole || employee?.structuralLevel || hrd.role,
  );
}

export type TaskAssignerCategory = 'direct_supervisor' | 'division_manager' | 'same_division_staff' | 'management' | 'hrd';

export const TASK_ASSIGNER_CATEGORY_LABELS: Record<TaskAssignerCategory, string> = {
  direct_supervisor: 'Atasan Langsung',
  division_manager: 'Manager / Koordinator',
  same_division_staff: 'Rekan / Staff Satu Divisi',
  management: 'Manajemen / Direksi',
  hrd: 'HRD / Administrasi',
};

/** True unless the employee doc explicitly signals they're no longer active — never assumes inactive just because the flag is missing. */
function isActiveEmployee(candidate: any): boolean {
  if (candidate?.isActive === false) return false;
  const status = normalizeText(candidate?.employmentStatus || candidate?.status || candidate?.hrdEmploymentInfo?.employmentStatus);
  return !['resigned', 'terminated', 'inactive', 'nonaktif'].includes(status);
}

/**
 * A plain staff/karyawan is only a valid task-assigner option if they share
 * BOTH the submitting employee's brand AND division — a same-division
 * colleague, project member, or technical PIC genuinely can hand out
 * overtime work in real teams, even without a manager title. Never matches
 * the submitter themselves, and never matches anyone role-shaped as
 * manager/management/HRD (those already have their own category via
 * resolveCandidateCategory — this function is deliberately scoped to the
 * "plain staff" case that would otherwise be excluded entirely).
 */
function isSameDivisionStaff(candidate: any, currentEmployee: any): boolean {
  if (!currentEmployee) return false;
  const candidateUid = candidate?.uid || candidate?.id;
  const currentUid = currentEmployee?.uid || currentEmployee?.id;
  if (!candidateUid || !currentUid || candidateUid === currentUid) return false;
  if (!isActiveEmployee(candidate)) return false;

  const candidateBrandId =
    candidate?.brandId || candidate?.companyId ||
    candidate?.hrdEmploymentInfo?.brandId || candidate?.hrdEmploymentInfo?.companyId || '';
  const currentBrandId =
    currentEmployee?.brandId || currentEmployee?.companyId ||
    currentEmployee?.hrdEmploymentInfo?.brandId || currentEmployee?.hrdEmploymentInfo?.companyId || '';
  const normCandidateBrandId = normalizeText(Array.isArray(candidateBrandId) ? candidateBrandId[0] : candidateBrandId);
  const normCurrentBrandId = normalizeText(Array.isArray(currentBrandId) ? currentBrandId[0] : currentBrandId);
  if (!normCandidateBrandId || normCandidateBrandId !== normCurrentBrandId) return false;

  const candidateDivisionId =
    candidate?.divisionId || candidate?.hrdEmploymentInfo?.divisionId || candidate?.strukturKepegawaian?.divisionId || '';
  const currentDivisionId =
    currentEmployee?.divisionId || currentEmployee?.hrdEmploymentInfo?.divisionId || currentEmployee?.strukturKepegawaian?.divisionId || '';
  const candidateDivisionName =
    candidate?.divisionName || candidate?.hrdEmploymentInfo?.divisionName || candidate?.hrdEmploymentInfo?.divisi ||
    candidate?.strukturKepegawaian?.divisionName || '';
  const currentDivisionName =
    currentEmployee?.divisionName || currentEmployee?.hrdEmploymentInfo?.divisionName || currentEmployee?.hrdEmploymentInfo?.divisi ||
    currentEmployee?.strukturKepegawaian?.divisionName || '';

  const sameDivision =
    (candidateDivisionId && currentDivisionId && normalizeText(candidateDivisionId) === normalizeText(currentDivisionId)) ||
    (candidateDivisionName && currentDivisionName && normalizeText(candidateDivisionName) === normalizeText(currentDivisionName));
  if (!sameDivision) return false;

  const role = normalizeText(candidate?.role || candidate?.userRole);
  return ['staff', 'employee', 'karyawan'].includes(role) || !role;
}

export type TaskAssignerCandidate = {
  uid: string;
  name: string;
  role: string;
  roleLabel: string;
  position: string;
  divisionId?: string;
  divisionName?: string;
  brandId?: string;
  brandName?: string;
  isDirectSupervisor: boolean;
  category: TaskAssignerCategory;
};

/** null return means "not a valid task-assigner option" — plain staff with no management/coordinator/HRD signal. */
function resolveCandidateCategory(user: any, isDirectSupervisor: boolean): TaskAssignerCategory | null {
  if (isDirectSupervisor) return 'direct_supervisor';
  const role = String(user?.role || '').toLowerCase();
  const level = String(user?.structuralLevel || '').toLowerCase();
  if (role === 'hrd') return 'hrd';
  if (role === 'management' || role === 'director' || role === 'direktur' || level === 'management') return 'management';
  if (
    role === 'manager' || role === 'direktur' ||
    level === 'division_manager' || level === 'coordinator' || level === 'supervisor' || level === 'mandor'
  ) return 'division_manager';
  return null;
}

/**
 * Builds the "Atasan / Koordinator Pemberi Tugas" dropdown candidate list —
 * direct supervisor (resolveApprovalTarget's result) pinned first and always
 * included even if their base user doc lacks a matching role/level, then
 * division managers/coordinators, same-division staff/colleagues, management/
 * direksi, and HRD. A plain staff member is only included when they share
 * the submitter's brand+division (isSameDivisionStaff) — real teams often
 * have overtime coordinated by a project member or technical PIC, not only
 * a manager — every OTHER plain staff member (different division/brand) is
 * still excluded entirely.
 */
export function buildTaskAssignerCandidates(
  allUsers: any[] | null | undefined,
  currentUserUid: string | null | undefined,
  primaryTarget: { approvalTargetUid: string | null; approvalTargetName: string | null } | null | undefined,
  currentEmployee?: any,
): TaskAssignerCandidate[] {
  const seen = new Set<string>();
  const candidates: TaskAssignerCandidate[] = [];

  const push = (user: any, isDirectSupervisor: boolean) => {
    const uid = user?.uid || user?.id;
    if (!uid || seen.has(uid)) return;
    const category = resolveCandidateCategory(user, isDirectSupervisor) ||
      (isSameDivisionStaff(user, currentEmployee) ? 'same_division_staff' : null);
    if (!category) return;
    seen.add(uid);
    const rawBrandId = user.brandId ?? user.hrdEmploymentInfo?.brandId;
    candidates.push({
      uid,
      name: user.fullName || user.displayName || user.name || user.email || uid,
      role: user.role || user.structuralLevel || '',
      roleLabel: getReadableRoleLabel(user.role || user.structuralLevel),
      position: getDisplayPosition(user),
      divisionId: user.divisionId || user.hrdEmploymentInfo?.divisionId || undefined,
      divisionName: user.divisionName || user.managedDivision || user.hrdEmploymentInfo?.divisionName || user.hrdEmploymentInfo?.divisi || undefined,
      brandId: (Array.isArray(rawBrandId) ? rawBrandId[0] : rawBrandId) || undefined,
      brandName: user.brandName || user.hrdEmploymentInfo?.brandName || undefined,
      isDirectSupervisor,
      category,
    });
  };

  if (primaryTarget?.approvalTargetUid) {
    const directSupervisorUser = (allUsers || []).find((u) => (u.uid || u.id) === primaryTarget.approvalTargetUid);
    push(directSupervisorUser || { uid: primaryTarget.approvalTargetUid, fullName: primaryTarget.approvalTargetName }, true);
  }

  (allUsers || []).forEach((u: any) => {
    if ((u.uid || u.id) === currentUserUid) return;
    push(u, false);
  });

  const categoryOrder: TaskAssignerCategory[] = ['direct_supervisor', 'division_manager', 'same_division_staff', 'management', 'hrd'];
  return candidates.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));
}

/**
 * Dropdown-row subtitle — "Atasan Langsung • Manager Divisi DTIC • PT
 * Environesia Global Saraya" for managers/management/HRD. Same-division
 * staff get a deliberately shorter "Staff • Web Developer • DTIC" (or just
 * "Staff • DTIC" with no specific jabatan on file) — brand is omitted since
 * it's always the submitter's own brand, and would just be noise repeated
 * on every row in that group.
 */
export function getTaskAssignerSubtitle(candidate: TaskAssignerCandidate): string {
  if (candidate.category === 'same_division_staff') {
    const parts: string[] = ['Staff'];
    if (candidate.position && candidate.position !== 'Staff') parts.push(candidate.position);
    if (candidate.divisionName) parts.push(candidate.divisionName);
    return parts.join(' • ');
  }
  const parts: string[] = [];
  if (candidate.isDirectSupervisor) parts.push('Atasan Langsung');
  parts.push(candidate.position || candidate.roleLabel);
  if (candidate.divisionName) parts.push(candidate.divisionName);
  if (candidate.brandName) parts.push(candidate.brandName);
  return parts.join(' • ');
}

/** Selected-value summary — "Daniel — Atasan Langsung / Manager Divisi DTIC". */
export function getTaskAssignerSummaryLabel(candidate: TaskAssignerCandidate): string {
  const parts: string[] = [];
  if (candidate.isDirectSupervisor) parts.push('Atasan Langsung');
  const positionWithDivision = candidate.divisionName ? `${candidate.position} ${candidate.divisionName}` : candidate.position;
  parts.push(positionWithDivision || candidate.roleLabel);
  return `${candidate.name} — ${parts.join(' / ')}`;
}
