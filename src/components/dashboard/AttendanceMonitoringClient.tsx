'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import type { EmployeeProfile, AttendanceEvent, AttendanceSite } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '../ui/skeleton';
import { format, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';
import { Badge } from '../ui/badge';
import { Search } from 'lucide-react';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { MarkAttendanceInvalidDialog } from './MarkAttendanceInvalidDialog';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AttendanceDetailModal } from './AttendanceDetailModal';
import { AttendanceSummaryCard } from './AttendanceSummaryCard';
import { useAuth } from '@/providers/auth-provider';
import { useHrdScopeContext } from '@/providers/hrd-scope-provider';
import { useHrdScopedCollection, useHrdScopedBrands } from '@/hooks/useHrdScopedCollection';
import {
  resolveProfileUid,
  resolvePhotoUrl,
  resolveAddress,
  getEventTimestamp,
  getEventEmployeeUid,
  getEventDateKey,
  getEventType,
  validateAttendanceLocation,
  classifyFieldCondition,
  resolveSiteForBrand,
  resolveScheduleForDay,
  calculateAttendanceLateStatus,
  timeToMinutes,
  type LocationValidation,
  type FieldConditionResult,
} from '@/lib/attendance-helpers';
import { buildAttendanceSummary } from '@/lib/attendance-summary';
import type { WorkScheduleDay } from '@/lib/types';

const JS_DAY_TO_SCHEDULE_DAY: WorkScheduleDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
import { normalizeAttendanceMethodBucket } from '@/lib/attendance-methods';

// Quick status filter tabs
const STATUS_TABS = [
  { key: 'all', label: 'Semua' },
  { key: 'belum-tap-in', label: 'Belum Tap In' },
  { key: 'sedang-bekerja', label: 'Sedang Bekerja' },
  { key: 'selesai', label: 'Selesai' },
  { key: 'terlambat', label: 'Terlambat' },
  { key: 'tidak-valid', label: 'Tidak Valid' },
  { key: 'perlu-review', label: 'Perlu Review' },
  { key: 'kondisi-khusus', label: 'Ada Laporan Kondisi' },
] as const;

type StatusTabKey = typeof STATUS_TABS[number]['key'];

// Wording is deliberately non-approval: absensi is always counted once there's
// a tap-in, regardless of this status. This is a note/catatan trail for HRD,
// never a gate the attendance has to pass — see isCounted/requiresHrdApproval
// written alongside it below.
const HRD_REVIEW_LABEL: Record<string, string> = {
  valid_auto: 'Aman',
  needs_review: 'Perlu Catatan HRD',
  approved: 'Sudah Dicek HRD',
  rejected: 'Catatan Diabaikan',
  revision_requested: 'Diminta Klarifikasi',
  acknowledged: 'Terima Kasih',
  // Konfirmasi HRD (Detail modal): 'received' = laporan diterima (Terima
  // Kasih), 'noted' = HRD menulis catatan lewat Batalin. Neither blocks or
  // changes whether the attendance itself counts — same non-approval intent
  // as every other status here.
  received: 'Laporan Diterima HRD',
  noted: 'Ada Catatan HRD',
};

const HRD_REVIEW_BADGE_CLASS: Record<string, string> = {
  valid_auto: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  needs_review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  rejected: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  revision_requested: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  acknowledged: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  received: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  noted: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

interface HrdReviewEntry {
  status: string;
  note: string | null;
  reviewedByName: string | null;
  reviewedAt: any;
}

/**
 * Reads one side's HRD confirmation off its own event doc — checkIn's
 * confirmation lives at `hrdConfirmation.checkIn` on the tap-in doc,
 * checkOut's at `hrdConfirmation.checkOut` on the tap-out doc, written by
 * handleHrdConfirmationSide below. 'received' stores its human-readable text
 * under `message`, 'noted' stores HRD's own text under `note` — normalized
 * here into one `note` field so the Detail modal doesn't need to know which
 * status uses which underlying field name.
 *
 * Falls back to the pre-migration flat fields (hrdReviewStatus/hrdReviewNote/
 * hrdReviewedByName/hrdReviewedAt) for any event written before Firestore
 * rules were locked down to the hrdConfirmation.* shape, so older
 * confirmations don't just disappear from the UI.
 */
function readHrdConfirmation(event: any, side: 'checkIn' | 'checkOut'): HrdReviewEntry | null {
  const confirmation = event?.hrdConfirmation?.[side];
  if (confirmation?.status) {
    return {
      status: confirmation.status,
      note: confirmation.status === 'received' ? (confirmation.message ?? null) : (confirmation.note ?? null),
      reviewedByName: confirmation.receivedByName ?? confirmation.notedByName ?? null,
      reviewedAt: confirmation.receivedAt ?? confirmation.notedAt ?? null,
    };
  }
  if (event?.hrdReviewStatus) {
    return {
      status: event.hrdReviewStatus,
      note: event.hrdReviewNote ?? null,
      reviewedByName: event.hrdReviewedByName ?? null,
      reviewedAt: event.hrdReviewedAt ?? null,
    };
  }
  return null;
}

interface AttendanceRecord {
  id: string;
  name: string;
  employeeNumber: string;
  brandName: string;
  brandId?: string;
  divisionName: string;
  attendanceMethod: 'fingerprint' | 'web_absen' | 'not_set';
  tapIn: string;
  tapOut: string;
  tapInId: string | null;
  tapOutId: string | null;
  status: string;
  mode: 'onsite' | 'offsite' | '-';
  photoUrl?: string | null;
  hasPhoto: boolean;
  /** Tap-in photo/address — recorded separately from tap-out so Monitoring can tell them apart (was previously merged into one photoUrl/hasPhoto). */
  photoUrlIn: string | null;
  hasPhotoIn: boolean;
  addressIn: string;
  /** Tap-out photo/address — optional depending on site setting, but tracked distinctly once it exists. */
  photoUrlOut: string | null;
  hasPhotoOut: boolean;
  addressOut: string;
  locationValidationOut: LocationValidation | null;
  address: string;
  location: { lat: number; lng: number } | null;
  lateMinutes: number | null;
  /**
   * The single source of truth for lateness, computed once here by
   * calculateAttendanceLateStatus and read verbatim by AttendanceDetailModal
   * — never recomputed there, and never derived from an event's own stored
   * lateMinutes/status. `calculatedLateMinutes`/`lateMinutes` above are
   * always the same value; both exist so the field name matches whichever
   * caller is reading it.
   */
  calculatedLateMinutes: number | null;
  calculatedAttendanceStatus: 'Terlambat' | 'Normal' | null;
  calculatedIsLate: boolean;
  attendanceSiteId: string | null;
  attendanceSiteName: string | null;
  /** "Jam Masuk" actually used for the calc above — null means no schedule could be resolved for this brand/day (scheduleMissing). */
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  lateToleranceMinutesUsed: number;
  latestCheckInWithoutReview: string | null;
  /** True when there's genuinely no resolvable site/schedule for this brand+day — calculatedLateMinutes is null in that case, never coerce it to "Normal". */
  scheduleMissing: boolean;
  /** No attendance_sites doc matched this employee's brand at all — Super Admin needs to add the brand to a site's brandIds. Distinct from dayInactive. */
  siteMissing: boolean;
  /** A site WAS matched, but this weekday has no workSchedules/shift entry — a normal "not a working day" state, not a misconfiguration. */
  dayInactive: boolean;
  earlyLeaveMinutes: number | null;
  workDurationMinutes: number | null;
  isInvalid: boolean;
  isOnLeave: boolean;
  specialCondition: string | null;
  locationValidation: LocationValidation | null;
  hrdReviewStatus: string | null;
  hrdReviewNote?: string | null;
  hrdReviewedByName?: string | null;
  hrdReviewedAt?: any;
  /** Per-side HRD review, read straight off each event's own doc — never merged with the other side. Used by the Detail modal's two independent Catatan HRD sections. */
  hrdReviewCheckIn: HrdReviewEntry | null;
  hrdReviewCheckOut: HrdReviewEntry | null;
  /** Short auto-generated explanation of the row's state — lets HRD read "why" without opening detail. */
  systemNote: string;
  /** Which specific things triggered "Perlu Review" (e.g. "Lokasi", "Terlambat", "Foto", "Kondisi Khusus"). */
  reviewReasons: string[];
  /** Ready-to-render Review HRD label, e.g. "Perlu Review: Lokasi, Terlambat" or "Aman / Valid Otomatis". */
  reviewReasonLabel: string;
  /** Kondisi Lapangan + Alasan Karyawan — categorized explanation for an off-site/out-of-radius tap. */
  fieldCondition: FieldConditionResult | null;
  rawEvent?: any;
  rawEventIn?: any;
  rawEventOut?: any;
  /** The matching attendance_condition_reports docs — check-in and check-out are two independent reports and must never collapse into (or fall back to) each other. Proof photos live here, never on rawEvent/rawEventIn/rawEventOut. */
  conditionReport?: any | null;
  rawConditionReport?: any | null;
  rawConditionReportIn?: any | null;
  rawConditionReportOut?: any | null;
}

/** report.reportType is the canonical field; conditionType is an older alias some docs still use. */
function getConditionReportType(report: any): string | null {
  return report?.reportType || report?.conditionType || null;
}

/** report.dateKey is canonical; reportDate is an older alias. */
function getConditionReportDateKey(report: any): string | null {
  return report?.dateKey || report?.reportDate || null;
}

function conditionReportMatchesEmployee(report: any, employeeUid: string): boolean {
  return report?.employeeUid === employeeUid || report?.uid === employeeUid || report?.userId === employeeUid;
}

/** Newest first, by reportedAt (when the staff actually filed it) falling back to createdAt. */
function sortConditionReportsByRecency(reports: any[]): any[] {
  return [...reports].sort((a, b) => {
    const at = a?.reportedAt?.toMillis?.() ?? a?.createdAt?.toMillis?.() ?? 0;
    const bt = b?.reportedAt?.toMillis?.() ?? b?.createdAt?.toMillis?.() ?? 0;
    return bt - at;
  });
}

/**
 * Matches a staff's "laporan kondisi khusus" (attendance_condition_reports
 * docs) to their attendance row for the selected date — check-in and
 * check-out are resolved completely independently so a check-in report can
 * never be shown as (or silently replace) the check-out report or vice versa.
 * Each side tries the event's own linked-id field first (but only accepts it
 * if the linked doc's own type actually matches — a bad link shouldn't cross
 *-contaminate the other side), then falls back to uid+date+type matching,
 * picking the most recent report when more than one exists for that type.
 */
function getConditionReportsForEmployee({
  reports,
  employeeUid,
  dateKey,
  checkInEvent,
  checkOutEvent,
}: {
  reports: any[];
  employeeUid: string;
  dateKey: string | null;
  checkInEvent: any;
  checkOutEvent: any;
}): { checkIn: any | null; checkOut: any | null } {
  const matchingForEmployeeDate = reports.filter(
    (r) => conditionReportMatchesEmployee(r, employeeUid) && getConditionReportDateKey(r) === dateKey,
  );

  const checkInCandidates = sortConditionReportsByRecency(
    matchingForEmployeeDate.filter((r) => getConditionReportType(r) === 'check_in'),
  );
  const checkOutCandidates = sortConditionReportsByRecency(
    matchingForEmployeeDate.filter((r) => getConditionReportType(r) === 'check_out'),
  );

  const checkInLinkedIds = [
    checkInEvent?.checkInConditionReportId,
    checkInEvent?.conditionReportId,
    ...(checkInEvent?.linkedConditionReportIds || []),
  ].filter(Boolean);
  const checkOutLinkedIds = [
    checkOutEvent?.checkOutConditionReportId,
    checkOutEvent?.conditionReportId,
    ...(checkOutEvent?.linkedConditionReportIds || []),
  ].filter(Boolean);

  const byLinkedId = (ids: string[]) => reports.find((r) => ids.includes(r.id)) || null;

  const linkedCheckIn = byLinkedId(checkInLinkedIds);
  const linkedCheckOut = byLinkedId(checkOutLinkedIds);

  const checkIn =
    (linkedCheckIn && getConditionReportType(linkedCheckIn) === 'check_in' ? linkedCheckIn : null) ||
    checkInCandidates[0] ||
    null;
  const checkOut =
    (linkedCheckOut && getConditionReportType(linkedCheckOut) === 'check_out' ? linkedCheckOut : null) ||
    checkOutCandidates[0] ||
    null;

  return { checkIn, checkOut };
}

function MonitoringSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

/** systemNote is built as "headline • extra1 • extra2 …" — split for a clean 2-line table cell instead of one long line that gets clamped mid-word. */
function splitSystemNote(note: string): { headline: string; extra: string } {
  const [headline = '', ...rest] = note.split(' • ');
  return { headline, extra: rest.join(' • ') };
}

/** Kondisi column: a single short badge instead of the full per-side breakdown (still available in the Detail modal). */
function getKondisiSummary(row: AttendanceRecord): string | null {
  const hasCondition = !!(row.rawConditionReportIn || row.rawConditionReportOut || (row.fieldCondition && row.fieldCondition.category !== 'normal'));
  if (hasCondition) return 'Kondisi Khusus';
  if (row.locationValidation && !row.locationValidation.isValidAuto) return 'Lokasi Review';
  return null;
}

/** Catatan HRD column: a single short badge instead of the full reviewReasonLabel sentence (e.g. "Perlu Catatan HRD: Lokasi, Terlambat, Kondisi Khusus"). */
function getCatatanHrdSummary(row: AttendanceRecord): string | null {
  if (row.hrdReviewStatus === 'needs_review') {
    return `Perlu Catatan: ${row.reviewReasons[0] ?? 'Review'}`;
  }
  if (row.hrdReviewStatus === 'received' || row.hrdReviewStatus === 'acknowledged') return 'Laporan Diterima HRD';
  if (row.hrdReviewStatus === 'noted') return 'Ada Catatan HRD';
  if (row.hrdReviewStatus) return 'Sudah Dicek HRD';
  return null;
}

function isPerluReview(row: AttendanceRecord): boolean {
  // Lateness-driven review is already folded into hrdReviewStatus (gated by
  // the site's latestCheckInWithoutReview cutoff, or the 15-menit fallback
  // when that isn't configured) — a separate flat `lateMinutes > 15` check
  // here would re-flag a merely-late-but-not-yet-past-cutoff tap-in (e.g.
  // 08:30 against a 09:00 cutoff) even though it's correctly valid_auto.
  return row.isInvalid ||
    row.hrdReviewStatus === 'needs_review' ||
    (row.status === 'Selesai' && row.workDurationMinutes !== null && row.workDurationMinutes < 420);
}

export function AttendanceMonitoringClient() {
  const [date, setDate] = useState<Date | null>(new Date());
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusTab, setStatusTab] = useState<StatusTabKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [eventsToDelete, setEventsToDelete] = useState<{ tapInId: string | null; tapOutId: string | null; userName: string | null }>({ tapInId: null, tapOutId: null, userName: null });
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [isMarkInvalidDialogOpen, setIsMarkInvalidDialogOpen] = useState(false);
  const [recordToMarkInvalid, setRecordToMarkInvalid] = useState<any>(null);

  const firestore = useFirestore();
  const { toast } = useToast();
  const { userProfile } = useAuth();

  // --- HRD scope (Super Admin sees everything; HRD only their allowedBrandIds) ---
  const { isSuperAdmin, isConfigured, isAllCompanies, allowedBrandIds, emptyStateMessage, isLoading: isHrdScopeLoading, scope: hrdScope } = useHrdScopeContext();
  const hrdScopeReady = !isHrdScopeLoading;
  const hrdScopeType = hrdScope?.scopeType ?? null;
  const { data: scopedBrands, isLoading: isLoadingBrands } = useHrdScopedBrands();

  // --- Data Fetching — all brand-scoped via roles_hrd/{uid}.allowedBrandIds ---
  // attendance_sites stores brandIds as an array (one site can serve several
  // brands) — the default "single" brandField mode only matches `brandId`
  // (legacy first-element-only field), so a brand present in brandIds[1+]
  // but not brandIds[0] would silently never come back here, even though
  // Firestore rules (hrdCanAccessSiteData) already allow reading it. This
  // mirrors the rules' own array-aware matching, plus a legacy fallback for
  // any site doc that predates the brandIds field and only has brandId.
  const { data: sites, isLoading: isLoadingConfig } = useHrdScopedCollection<AttendanceSite>('attendance_sites', {
    brandField: 'brandIds',
    brandFieldMode: 'array',
    legacyBrandField: 'brandId',
  });

  const { data: allEmployeeProfiles, isLoading: isLoadingProfiles } = useHrdScopedCollection<EmployeeProfile>('employee_profiles');

  const { data: allUsers, isLoading: isLoadingUsers } = useHrdScopedCollection<any>('users');

  // Real attendance_events docs (written by the external Web Absen/AbsenHRP
  // app) don't reliably carry `brandId`, so brand-scoping this query server
  // side (like the other collections) would silently drop older events —
  // instead we fetch every event for the selected date, unscoped, and filter
  // it down to the HRD's visible employees client-side (see visibleEvents
  // below). Two queries are merged: `dateKey` exact-match for docs that have
  // it, plus a `createdAt` Asia/Jakarta day-range fallback for older docs
  // that predate the `dateKey` field.
  const selectedDateString = date ? format(date, 'yyyy-MM-dd') : null;

  const dateKeyEventsQuery = useMemoFirebase(() => {
    if (!selectedDateString) return null;
    return query(collection(firestore, 'attendance_events'), where('dateKey', '==', selectedDateString));
  }, [firestore, selectedDateString]);
  const { data: dateKeyEvents, isLoading: isLoadingDateKeyEvents, mutate: mutateDateKeyEvents } = useCollection<AttendanceEvent>(dateKeyEventsQuery);

  const rangeEventsQuery = useMemoFirebase(() => {
    if (!selectedDateString) return null;
    const start = new Date(`${selectedDateString}T00:00:00+07:00`);
    const end = new Date(`${selectedDateString}T23:59:59.999+07:00`);
    return query(
      collection(firestore, 'attendance_events'),
      where('createdAt', '>=', start),
      where('createdAt', '<=', end),
    );
  }, [firestore, selectedDateString]);
  const { data: rangeEvents, isLoading: isLoadingRangeEvents, mutate: mutateRangeEvents } = useCollection<AttendanceEvent>(rangeEventsQuery);

  const attendanceEvents = useMemo(() => {
    const byId = new Map<string, any>();
    for (const e of dateKeyEvents || []) byId.set((e as any).id, e);
    for (const e of rangeEvents || []) if (!byId.has((e as any).id)) byId.set((e as any).id, e);
    return Array.from(byId.values());
  }, [dateKeyEvents, rangeEvents]);

  const isLoadingEvents = isLoadingDateKeyEvents || isLoadingRangeEvents;
  const mutateEvents = () => { mutateDateKeyEvents(); mutateRangeEvents(); };

  // Web Absen writes "laporan kondisi khusus" (special condition report) proof
  // photos to their own collection, keyed by reportDate + root-level brandId.
  // A date-only query used to be issued here regardless of HRD scope — since
  // Firestore rejects a `list` outright when the query can't prove every
  // possible matching doc is readable, an HRD limited to specific brands
  // (e.g. Greenlab) got a hard permission-denied instead of a filtered
  // result. The query must always carry the same brand constraint the rules
  // check, and must not run at all before roles_hrd has finished loading.
  const conditionReportsQuery = useMemoFirebase(() => {
    if (!selectedDateString || !hrdScopeReady) return null;

    const reportsRef = collection(firestore, 'attendance_condition_reports');

    // Super Admin or an HRD explicitly scoped to every company.
    if (isSuperAdmin || hrdScopeType === 'all_companies') {
      return query(reportsRef, where('reportDate', '==', selectedDateString));
    }

    // Scope still resolving to an empty brand list — never fall back to a
    // date-only query in this state, that's exactly the bug being fixed.
    if (!allowedBrandIds?.length) return null;

    if (allowedBrandIds.length === 1) {
      return query(
        reportsRef,
        where('reportDate', '==', selectedDateString),
        where('brandId', '==', allowedBrandIds[0]),
      );
    }

    return query(
      reportsRef,
      where('reportDate', '==', selectedDateString),
      where('brandId', 'in', allowedBrandIds.slice(0, 30)),
    );
  }, [firestore, selectedDateString, hrdScopeReady, hrdScopeType, isSuperAdmin, allowedBrandIds]);
  const { data: conditionReportsByReportDate, isLoading: isLoadingConditionReportsA, error: conditionReportsErrorA } = useCollection<any>(conditionReportsQuery);

  // Older docs written before `reportDate` existed only carry `dateKey` — same
  // brand-scoping rules apply, so this mirrors the query above exactly rather
  // than reusing a single query object (the field name differs).
  const conditionReportsDateKeyQuery = useMemoFirebase(() => {
    if (!selectedDateString || !hrdScopeReady) return null;

    const reportsRef = collection(firestore, 'attendance_condition_reports');

    if (isSuperAdmin || hrdScopeType === 'all_companies') {
      return query(reportsRef, where('dateKey', '==', selectedDateString));
    }

    if (!allowedBrandIds?.length) return null;

    if (allowedBrandIds.length === 1) {
      return query(
        reportsRef,
        where('dateKey', '==', selectedDateString),
        where('brandId', '==', allowedBrandIds[0]),
      );
    }

    return query(
      reportsRef,
      where('dateKey', '==', selectedDateString),
      where('brandId', 'in', allowedBrandIds.slice(0, 30)),
    );
  }, [firestore, selectedDateString, hrdScopeReady, hrdScopeType, isSuperAdmin, allowedBrandIds]);
  const { data: conditionReportsByDateKey, isLoading: isLoadingConditionReportsB, error: conditionReportsErrorB } = useCollection<any>(conditionReportsDateKeyQuery);

  const conditionReports = useMemo(() => {
    const byId = new Map<string, any>();
    for (const r of conditionReportsByReportDate || []) byId.set((r as any).id, r);
    for (const r of conditionReportsByDateKey || []) if (!byId.has((r as any).id)) byId.set((r as any).id, r);
    return Array.from(byId.values());
  }, [conditionReportsByReportDate, conditionReportsByDateKey]);

  const isLoadingConditionReports = isLoadingConditionReportsA || isLoadingConditionReportsB;
  const conditionReportsError = conditionReportsErrorA || conditionReportsErrorB || null;

  useEffect(() => {
    if (!conditionReportsError) return;
    // Never let this take down the rest of Monitoring Absen — attendance
    // data above is unaffected; only the condition-report join degrades.
    console.error(
      '[AttendanceMonitoring] Gagal membaca laporan kondisi',
      {
        code: (conditionReportsError as any)?.code,
        message: conditionReportsError.message,
        selectedDate: selectedDateString,
        allowedBrandIds,
        hrdScopeType,
      },
      conditionReportsError,
    );
  }, [conditionReportsError, selectedDateString, allowedBrandIds, hrdScopeType]);

  const leaveConstraints = useMemo(() => [where('status', 'in', ['approved', 'active_leave'])], []);
  const { data: leaveRequests, isLoading: isLoadingLeaves } = useHrdScopedCollection<any>('leave_requests', { constraints: leaveConstraints });

  const isLoading = isLoadingConfig || isLoadingProfiles || isLoadingUsers || isLoadingBrands || isLoadingEvents || isLoadingLeaves || isLoadingConditionReports;

  // HRD with exactly one allowed brand — pin the filter, don't render a dropdown at all.
  const singleBrand = !isSuperAdmin && !isAllCompanies && (scopedBrands?.length ?? 0) === 1 ? scopedBrands![0] : null;
  const effectiveBrandFilter = singleBrand ? singleBrand.id! : brandFilter;

  // --- Data Processing ---
  const { tableData, summaryStats } = useMemo(() => {
    const empty = {
      tableData: [] as AttendanceRecord[],
      summaryStats: { total: 0, hadir: 0, belumTapIn: 0, sedangBekerja: 0, selesai: 0, terlambat: 0, tidakValid: 0, perluReview: 0, kondisiKhusus: 0, validOtomatis: 0 },
    };
    if (!allEmployeeProfiles || !scopedBrands) return empty;

    const safeFormatTime = (timestamp: Date | null): string => {
      if (!timestamp) return '-';
      try {
        if (!(timestamp instanceof Date) || isNaN(timestamp.getTime())) return '-';
        return format(timestamp, 'HH:mm');
      } catch {
        return '-';
      }
    };

    // ── NIK normalization ────────────────────────────────────────────────────
    const normalizeNik = (v: string | null | undefined): string => {
      if (!v) return '';
      return v.trim().replace(/\s+/g, '').toUpperCase();
    };

    // ── Lookup maps from users collection ───────────────────────────────────
    const userByUid = new Map<string, any>();
    const userByEmail = new Map<string, any>();
    for (const u of allUsers || []) {
      const uid = u.uid || u.id;
      if (uid) userByUid.set(uid, u);
      const email = (u.email || '').toLowerCase().trim();
      if (email) userByEmail.set(email, u);
    }

    // ── Helper: get brand ID with comprehensive fallback ────────────────────
    const resolveBrandId = (p: any): string | null => {
      // Top-level employee_profiles.brandId is canonical (matches the field
      // the HRD-scope query itself filters on) — every other variant below
      // is a fallback for older docs that stored it under a different name
      // (companyId instead of brandId) or nested under hrdEmploymentInfo/
      // employmentInfo instead of top-level.
      const id =
        p.brandId || p.companyId || p.brandID || p.companyID ||
        p.hrdEmploymentInfo?.brandId || p.hrdEmploymentInfo?.companyId ||
        p.employmentInfo?.brandId || p.employmentInfo?.companyId ||
        null;
      if (id && typeof id === 'string') return id;
      return null;
    };

    const brandMap = new Map(scopedBrands.map(b => [b.id, b.name]));
    // Per-brand site resolution — karyawan PT A follows PT A's site/hours,
    // karyawan PT B follows PT B's, instead of everyone sharing one
    // "the first active site" fallback.
    const selectedDayOfWeek: WorkScheduleDay = date ? JS_DAY_TO_SCHEDULE_DAY[date.getDay()] : 'monday';

    // ── Active non-candidate profiles ────────────────────────────────────────
    const activeProfiles = allEmployeeProfiles.filter((p: any) => {
      if (p.isActive === false) return false;
      const status = p.status || p.employmentStatus || '';
      if (status === 'inactive' || status === 'nonaktif' || status === 'Nonaktif') return false;
      const role = p.role || '';
      if (role === 'candidate' || role === 'kandidat') return false;
      return true;
    });

    // ── Web Absen employees ─────────────────────────────────────────────────
    const webAbsenProfiles = activeProfiles.filter((p: any) => {
      // Read the canonical bucket, not the raw value — other editors may
      // still write "web_photo"/"hybrid" (see normalizeAttendanceMethodBucket).
      const method = p.attendanceMethod || p.attendanceConfig?.method || p.hrdEmploymentInfo?.attendanceMethod;
      return normalizeAttendanceMethodBucket(method) === 'web_absen';
    });

    // ── Deduplicate by uid ──────────────────────────────────────────────────
    const seenUids = new Set<string>();
    const dedupedProfiles = webAbsenProfiles.filter((p: any) => {
      const uid = resolveProfileUid(p);
      if (!uid || seenUids.has(uid)) return false;
      seenUids.add(uid);
      return true;
    });

    // ── Condition reports (attendance_condition_reports) scoped to this HRD's
    // visible employees only — never show a condition report belonging to an
    // employee outside allowedBrandIds, even though the query itself is unscoped.
    const visibleEmployeeUids = new Set(
      dedupedProfiles.map((p: any) => resolveProfileUid(p)).filter(Boolean) as string[]
    );
    const scopedConditionReports = (conditionReports || []).filter((r: any) =>
      visibleEmployeeUids.has(r.uid) || visibleEmployeeUids.has(r.employeeUid)
    );

    // ── NIK lookup: normalizedNik → profile ─────────────────────────────────
    const profileByNik = new Map<string, any>();
    // ── Email lookup: email → profile ───────────────────────────────────────
    const profileByEmail = new Map<string, any>();
    for (const p of dedupedProfiles as any[]) {
      const rawNik = p.hrdEmploymentInfo?.employeeId || p.employeeNumber || p.employeeId ||
        p.nomorIndukKaryawan || p.dataDiriIdentitas?.employeeNumber || p.dataDiriIdentitas?.employeeId;
      const nik = normalizeNik(rawNik);
      if (nik) profileByNik.set(nik, p);
      const email = (p.email || '').toLowerCase().trim();
      if (email) profileByEmail.set(email, p);
    }

    // ── Scope events to HRD's visible employees BEFORE grouping ──────────────
    // attendance_events isn't queried with a brandId filter (older docs may
    // not even have brandId set) — so the HRD scope boundary is enforced here
    // instead, against the UID set of employees this HRD is already allowed
    // to see (dedupedProfiles, which came from the brand-scoped employee_profiles query).
    const webAbsenEmployees = dedupedProfiles as any[];
    const allowedEmployeeUids = new Set(
      webAbsenEmployees.map((e) => resolveProfileUid(e)).filter(Boolean) as string[],
    );
    const visibleEvents = (attendanceEvents || []).filter((event: any) => {
      const eventUid = getEventEmployeeUid(event);
      return !!eventUid && allowedEmployeeUids.has(eventUid);
    });

    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('[MONITORING_ABSEN_JOIN_DEBUG]', {
        selectedDateKey: selectedDateString,
        webAbsenEmployeesCount: webAbsenEmployees.length,
        attendanceEventsCount: (attendanceEvents || []).length,
        visibleEventsCount: visibleEvents.length,
        employeeUids: webAbsenEmployees.map((e) => ({
          name: e.fullName,
          uid: resolveProfileUid(e),
          employeeId: e.employeeId,
          brandId: e.brandId,
        })),
        events: (attendanceEvents || []).map((e: any) => ({
          id: e.id,
          employeeUid: e.employeeUid,
          uid: e.uid,
          userId: e.userId,
          employeeId: e.employeeId,
          dateKey: getEventDateKey(e),
          eventType: e.eventType,
          type: e.type,
          action: e.action,
          createdAt: e.createdAt,
          timestamp: e.timestamp,
          tsServer: e.tsServer,
          brandId: e.brandId,
        })),
      });
    }

    // ── Group events by all possible employee keys ───────────────────────────
    const eventsByUid = new Map<string, any[]>();
    const eventsByNik = new Map<string, any[]>();
    const eventsByEmail = new Map<string, any[]>();

    for (const e of visibleEvents as any[]) {
      const uid = getEventEmployeeUid(e);
      if (uid) {
        if (!eventsByUid.has(uid)) eventsByUid.set(uid, []);
        eventsByUid.get(uid)!.push(e);
      }
      const rawNik = e.employeeNumber || e.nomorIndukKaryawan || e.employeeId || e.nik;
      const nik = normalizeNik(rawNik);
      if (nik) {
        if (!eventsByNik.has(nik)) eventsByNik.set(nik, []);
        eventsByNik.get(nik)!.push(e);
      }
      const email = (e.email || e.employeeEmail || '').toLowerCase().trim();
      if (email) {
        if (!eventsByEmail.has(email)) eventsByEmail.set(email, []);
        eventsByEmail.get(email)!.push(e);
      }
    }

    // ── Resolve functions ────────────────────────────────────────────────────
    const resolveName = (p: any, profileUid: string, e?: any): string => {
      const fromProfile = p.fullName || p.dataDiriIdentitas?.fullName || p.namaLengkap ||
        p.displayName || p.name;
      if (fromProfile) return fromProfile;
      const userRecord = userByUid.get(profileUid);
      const fromUser = userRecord?.fullName || userRecord?.displayName || userRecord?.namaLengkap || userRecord?.name;
      if (fromUser) return fromUser;
      const profileEmail = (p.email || '').toLowerCase().trim();
      const userByEmailRecord = profileEmail ? userByEmail.get(profileEmail) : null;
      const fromUserByEmail = userByEmailRecord?.fullName || userByEmailRecord?.displayName;
      if (fromUserByEmail) return fromUserByEmail;
      const fromEvent = e?.employeeName || e?.fullName || e?.name || e?.displayName || e?.userName;
      if (fromEvent) return fromEvent;
      return p.email || e?.email || 'Data karyawan belum lengkap';
    };

    const resolveEmployeeNumber = (p: any, e?: any): string =>
      p.hrdEmploymentInfo?.employeeId || p.employeeNumber || p.employeeId || p.employeeCode ||
      p.nomorIndukKaryawan || p.dataDiriIdentitas?.employeeNumber || p.dataDiriIdentitas?.employeeId ||
      e?.employeeNumber || e?.employeeId || e?.nomorIndukKaryawan || 'ID belum diatur';

    const resolveBrand = (p: any, bId: string | null, e?: any): string => {
      if (bId) return brandMap.get(bId) || bId;
      return p.hrdEmploymentInfo?.brandName || p.brandName || p.companyName || p.company ||
        e?.brandName || e?.company || '-';
    };

    const resolveDivision = (p: any, e?: any): string =>
      p.hrdEmploymentInfo?.divisionName || p.hrdEmploymentInfo?.divisi ||
      p.divisionName || p.division ||
      e?.divisionName || e?.division || e?.divisi || '-';

    // ── Build table rows ─────────────────────────────────────────────────────
    const rows: AttendanceRecord[] = [];

    for (const profile of dedupedProfiles) {
      const profileUid = resolveProfileUid(profile as any)!;
      const profileBrandId = resolveBrandId(profile as any);

      // Brand filter: only apply if not "all"
      if (effectiveBrandFilter !== 'all' && profileBrandId !== effectiveBrandFilter) continue;

      let userEvents: any[] = [];

      userEvents = eventsByUid.get(profileUid) || [];

      if (userEvents.length === 0) {
        const rawNik = profile.hrdEmploymentInfo?.employeeId || (profile as any).employeeNumber ||
          (profile as any).employeeId || (profile as any).nomorIndukKaryawan ||
          (profile as any).dataDiriIdentitas?.employeeNumber;
        const nik = normalizeNik(rawNik);
        if (nik && eventsByNik.has(nik)) {
          userEvents = eventsByNik.get(nik)!;
        }
      }

      if (userEvents.length === 0) {
        const email = ((profile as any).email || '').toLowerCase().trim();
        if (email && eventsByEmail.has(email)) {
          userEvents = eventsByEmail.get(email)!;
        }
      }

      const checkInEvent = userEvents.find((e: any) => getEventType(e) === 'tap_in');
      const checkOutEvent = userEvents.find((e: any) => getEventType(e) === 'tap_out');
      const eventData = checkInEvent || checkOutEvent;

      const resolvedName = resolveName(profile, profileUid, eventData);
      const resolvedEmployeeNumber = resolveEmployeeNumber(profile, eventData);
      const resolvedBrand = resolveBrand(profile, profileBrandId, eventData);
      const resolvedDivision = resolveDivision(profile, eventData);

      const tapInTimestamp = checkInEvent ? getEventTimestamp(checkInEvent) : null;
      const tapOutTimestamp = checkOutEvent ? getEventTimestamp(checkOutEvent) : null;

      const siteForBrand = resolveSiteForBrand(sites as any, profileBrandId, resolvedBrand);
      const daySchedule = resolveScheduleForDay(siteForBrand as any, selectedDayOfWeek);

      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log('[ATTENDANCE_SITE_MATCH_DEBUG]', {
          employeeName: resolvedName,
          employeeUid: profileUid,
          employeeBrandId: profileBrandId,
          employeeBrandName: resolvedBrand,
          allowedBrandIds,
          loadedSites: (sites || []).map((s: any) => ({
            id: s.id,
            name: s.name,
            isActive: s.isActive,
            brandId: s.brandId,
            brandIds: s.brandIds,
            brandNames: s.brandNames,
          })),
          matchedSiteId: siteForBrand?.id ?? null,
          matchedSiteName: siteForBrand?.name ?? null,
        });
        if (!siteForBrand) {
          // eslint-disable-next-line no-console
          console.warn(
            '[ATTENDANCE_SITE_MATCH_DEBUG] Brand karyawan belum terhubung ke site absensi.',
            { employeeName: resolvedName, employeeBrandId: profileBrandId, employeeBrandName: resolvedBrand },
          );
        }
      }

      const isInvalid = !!(checkInEvent?.isInvalid || checkOutEvent?.isInvalid);

      const isOnLeave = leaveRequests?.some((req: any) => {
        if (req.employeeId !== profileUid) return false;
        if (!date) return false;
        const selectedDateTime = startOfDay(date).getTime();
        const reqStart = startOfDay(req.startDate.toDate()).getTime();
        const reqEnd = endOfDay(req.endDate.toDate()).getTime();
        return selectedDateTime >= reqStart && selectedDateTime <= reqEnd;
      }) ?? false;

      let status: string;
      if (isInvalid) {
        status = 'Tidak Valid';
      } else if (isOnLeave) {
        status = 'Cuti Tahunan';
      } else if (tapInTimestamp && tapOutTimestamp) {
        status = 'Selesai';
      } else if (tapInTimestamp && !tapOutTimestamp) {
        status = 'Sedang Bekerja';
      } else {
        status = 'Belum Tap In';
      }

      const graceMins: number = Number((siteForBrand as any)?.lateToleranceMinutes ?? (siteForBrand as any)?.shift?.graceLateMinutes ?? 0);
      const latestCheckInWithoutReview: string | null = (siteForBrand as any)?.latestCheckInWithoutReview ?? null;
      const scheduledStartTime: string | null = daySchedule?.startTime ?? null;

      // Jam Masuk (scheduledStartTime) + Toleransi Telat (graceMins) is the
      // ONLY basis for lateness — never latestCheckInWithoutReview, which is
      // purely a review-gating cutoff (needsTimeReview below). The one and
      // only lateness formula lives in calculateAttendanceLateStatus — the
      // Detail modal reads its result off this row (record.calculatedLateMinutes
      // etc.) instead of recomputing, so the two screens can never disagree.
      //
      // tapInTimestamp is handed to the helper as-is (a real Date/Timestamp
      // instant) — the helper itself resolves wall-clock hour/minute via
      // Intl.DateTimeFormat(timeZone:'Asia/Jakarta'), never Date#getHours(),
      // which reads whatever timezone the JS runtime happens to be in (UTC
      // during Next.js server rendering on most hosts) rather than WIB.
      const lateResult = calculateAttendanceLateStatus({
        tapInTime: tapInTimestamp,
        scheduledStartTime,
        lateToleranceMinutes: graceMins,
        latestCheckInWithoutReview,
      });
      const lateMinutes = lateResult.lateMinutes;

      // Two distinct "can't compute lateness" reasons, surfaced separately so
      // the UI never lumps "brand isn't configured in any site at all" (Super
      // Admin needs to fix attendance_sites) together with "site found, but
      // this weekday just isn't a working day for it" (a normal, expected
      // state — e.g. Sunday against a Mon-Fri site — not a misconfiguration).
      const siteMissing = !!tapInTimestamp && !siteForBrand;
      const dayInactive = !!tapInTimestamp && !!siteForBrand && !scheduledStartTime;
      const scheduleMissing = siteMissing || dayInactive;

      if (typeof window !== 'undefined' && tapInTimestamp) {
        // eslint-disable-next-line no-console
        console.log('[ATTENDANCE_LATE_CALC_DEBUG]', {
          employeeName: resolvedName,
          dateKey: selectedDateString,
          dayKey: selectedDayOfWeek,
          brandId: profileBrandId,
          tapInTime: safeFormatTime(tapInTimestamp),
          tapInRaw: (checkInEvent as any)?.createdAt ?? (checkInEvent as any)?.timestamp ?? (checkInEvent as any)?.tsServer ?? null,
          matchedSiteName: siteForBrand?.name ?? null,
          workSchedules: (siteForBrand as any)?.workSchedules ?? null,
          selectedSchedule: daySchedule,
          scheduledStartTime,
          lateToleranceMinutes: graceMins,
          latestCheckInWithoutReview,
          scheduledStartMinutes: timeToMinutes(scheduledStartTime),
          lateThresholdMinutes: timeToMinutes(scheduledStartTime) != null ? (timeToMinutes(scheduledStartTime) as number) + graceMins : null,
          tapInMinutes: timeToMinutes(tapInTimestamp),
          calculatedLateMinutes: lateResult.lateMinutes,
          calculatedStatus: lateResult.statusLabel,
          siteMissing,
          dayInactive,
          scheduleMissing,
          storedLateMinutes: (checkInEvent as any)?.lateMinutes,
          storedStatus: (checkInEvent as any)?.status,
        });
      }

      // Pulang awal/lebih lambat are informational statuses only — there is
      // no "batas pulang awal" tolerance to subtract; tap-out is never
      // blocked or rejected for happening early or late, per spec.
      let earlyLeaveMinutes: number | null = null;
      let lateLeaveMinutes: number | null = null;
      if (tapOutTimestamp && daySchedule) {
        const shiftEnd = new Date(tapOutTimestamp);
        const [endHour, endMinute] = daySchedule.endTime.split(':').map(Number);
        shiftEnd.setHours(endHour, endMinute, 0, 0);
        if (tapOutTimestamp < shiftEnd) {
          earlyLeaveMinutes = differenceInMinutes(shiftEnd, tapOutTimestamp);
        } else if (tapOutTimestamp > shiftEnd) {
          lateLeaveMinutes = differenceInMinutes(tapOutTimestamp, shiftEnd);
        }
      } else if (tapOutTimestamp) {
        const shiftEnd = new Date(tapOutTimestamp);
        shiftEnd.setHours(17, 0, 0, 0);
        if (tapOutTimestamp < shiftEnd) {
          earlyLeaveMinutes = differenceInMinutes(shiftEnd, tapOutTimestamp);
        } else if (tapOutTimestamp > shiftEnd) {
          lateLeaveMinutes = differenceInMinutes(tapOutTimestamp, shiftEnd);
        }
      }

      let workDurationMinutes: number | null = null;
      if (tapInTimestamp && tapOutTimestamp) {
        workDurationMinutes = differenceInMinutes(tapOutTimestamp, tapInTimestamp);
      }

      // Check-in and check-out condition reports are resolved completely
      // independently — never a single `.find()` across all reports, which is
      // exactly what previously let a check-in report silently stand in for
      // (or hide) the check-out report.
      const { checkIn: conditionReportIn, checkOut: conditionReportOut } = getConditionReportsForEmployee({
        reports: scopedConditionReports,
        employeeUid: profileUid,
        dateKey: selectedDateString,
        checkInEvent,
        checkOutEvent,
      });

      const specialCondition =
        conditionReportIn?.conditionNote ||
        conditionReportIn?.note ||
        conditionReportIn?.reasonLabel ||
        conditionReportOut?.conditionNote ||
        conditionReportOut?.note ||
        conditionReportOut?.reasonLabel ||
        (checkInEvent as any)?.specialCondition ||
        (checkOutEvent as any)?.specialCondition ||
        null;

      if (typeof window !== 'undefined' && (conditionReportIn || conditionReportOut || specialCondition)) {
        console.log('[CONDITION_JOIN_DEBUG]', {
          employeeName: resolvedName,
          employeeUid: profileUid,
          dateKey: selectedDateString,
          checkInConditionReportId: (checkInEvent as any)?.checkInConditionReportId,
          checkOutConditionReportId: (checkOutEvent as any)?.checkOutConditionReportId,
          linkedConditionReportIds: (checkInEvent as any)?.linkedConditionReportIds,
          conditionReportInFound: !!conditionReportIn,
          conditionReportInId: conditionReportIn?.id,
          conditionReportOutFound: !!conditionReportOut,
          conditionReportOutId: conditionReportOut?.id,
        });
      }
      const siteRadiusConfig = siteForBrand
        ? {
            office: siteForBrand.office,
            radiusM: (siteForBrand as any).checkInRadiusMeters ?? siteForBrand.radiusM,
            validAddressKeywords: siteForBrand.validAddressKeywords,
          }
        : null;
      const locationValidation = checkInEvent ? validateAttendanceLocation(checkInEvent, siteRadiusConfig) : null;
      const siteRadiusConfigOut = siteForBrand
        ? {
            office: siteForBrand.office,
            radiusM: (siteForBrand as any).checkOutRadiusMeters ?? siteForBrand.radiusM,
            validAddressKeywords: siteForBrand.validAddressKeywords,
          }
        : null;
      const locationValidationOut = checkOutEvent ? validateAttendanceLocation(checkOutEvent, siteRadiusConfigOut) : null;
      const fieldCondition = checkInEvent ? classifyFieldCondition(checkInEvent, locationValidation) : null;
      const photoUrlIn = resolvePhotoUrl(checkInEvent);
      const photoUrlOut = resolvePhotoUrl(checkOutEvent);
      const photoUrl = photoUrlIn || photoUrlOut;
      const locationNeedsReview = !!(locationValidation && !locationValidation.isValidAuto && tapInTimestamp);
      const photoMissing = !!checkInEvent && !photoUrlIn;

      // "Perlu review karena jam" is gated by latestCheckInWithoutReview — a
      // wall-clock cutoff, completely independent from lateMinutes/tolerance
      // above (lateResult.needsTimeReview, computed by the same helper via
      // the same Asia/Jakarta-safe time parsing). A tap-in can be late
      // (lateMinutes > 0) without needing review yet (still before the
      // cutoff). Sites that haven't configured latestCheckInWithoutReview
      // fall back to the old flat 15-minute heuristic instead of never
      // flagging lateness for review at all.
      const lateNeedsReview = latestCheckInWithoutReview
        ? lateResult.needsTimeReview
        : (lateMinutes !== null && lateMinutes > 15);

      // Absen Berangkat and Absen Pulang are genuinely separate
      // attendance_events docs — the Detail modal's two Konfirmasi HRD
      // sections each read/write only their own side's doc via
      // hrdConfirmation.checkIn / hrdConfirmation.checkOut. Computed first
      // (before the combined hrdReviewStatus below, which just ORs the two
      // together for the table's single badge/needs-review logic).
      const hrdReviewCheckIn = checkInEvent ? readHrdConfirmation(checkInEvent, 'checkIn') : null;
      const hrdReviewCheckOut = checkOutEvent ? readHrdConfirmation(checkOutEvent, 'checkOut') : null;

      const hrdReviewStatus = hrdReviewCheckIn?.status || hrdReviewCheckOut?.status ||
        (specialCondition || locationNeedsReview || photoMissing || lateNeedsReview || scheduleMissing
          ? 'needs_review'
          : (tapInTimestamp ? 'valid_auto' : null));

      // ── Catatan reasons — so the Catatan HRD column reads "Perlu Catatan HRD: Lokasi"
      // instead of a bare status. This is a note trail, never an approval gate —
      // absensi is already counted (isCounted true) regardless of this value.
      const reviewReasons: string[] = [];
      if (specialCondition) reviewReasons.push('Kondisi Khusus');
      if (locationNeedsReview) reviewReasons.push('Lokasi');
      if (lateNeedsReview) reviewReasons.push('Terlambat');
      if (photoMissing) reviewReasons.push('Foto');
      if (siteMissing) reviewReasons.push('Site Belum Diatur');
      else if (dayInactive) reviewReasons.push('Hari Nonaktif');

      const reviewReasonLabel =
        hrdReviewStatus === 'received' ? HRD_REVIEW_LABEL.received :
        hrdReviewStatus === 'noted' ? HRD_REVIEW_LABEL.noted :
        hrdReviewStatus === 'acknowledged' ? HRD_REVIEW_LABEL.acknowledged :
        hrdReviewStatus === 'approved' ? HRD_REVIEW_LABEL.approved :
        hrdReviewStatus === 'rejected' ? HRD_REVIEW_LABEL.rejected :
        hrdReviewStatus === 'revision_requested' ? HRD_REVIEW_LABEL.revision_requested :
        hrdReviewStatus === 'valid_auto' ? HRD_REVIEW_LABEL.valid_auto :
        hrdReviewStatus === 'needs_review' ? (reviewReasons.length ? `Perlu Catatan HRD: ${reviewReasons.join(', ')}` : 'Perlu Catatan HRD') :
        '-';

      // ── Catatan Sistem — one-line auto summary so HRD doesn't need to open detail ──
      let systemNote: string;
      if (isInvalid) systemNote = 'Absensi ditandai tidak valid';
      else if (isOnLeave) systemNote = 'Sedang cuti tahunan';
      else if (status === 'Selesai') systemNote = `Selesai kerja ${safeFormatTime(tapInTimestamp)}–${safeFormatTime(tapOutTimestamp)}`;
      else if (status === 'Sedang Bekerja') systemNote = `Sedang bekerja sejak ${safeFormatTime(tapInTimestamp)}`;
      else systemNote = 'Belum melakukan tap in';

      // Priority order: lateness/early leave, then radius status, then the
      // employee's own field condition/reason, then the review-pending tag —
      // capped at 3 so the cell stays a readable 2-line summary.
      const noteExtras: string[] = [];
      if (lateMinutes !== null && lateMinutes > 0) noteExtras.push(`Terlambat ${lateMinutes} menit`);
      if (siteMissing) noteExtras.push('Site absensi belum diatur untuk brand ini');
      else if (dayInactive) noteExtras.push('Hari ini nonaktif di jadwal site');
      if (earlyLeaveMinutes !== null && earlyLeaveMinutes > 0) noteExtras.push(`Pulang awal ${earlyLeaveMinutes} menit`);
      if (lateLeaveMinutes !== null && lateLeaveMinutes > 0) noteExtras.push(`Pulang lebih lambat ${lateLeaveMinutes} menit`);
      if (locationValidation && tapInTimestamp) {
        if (locationValidation.radiusStatus === 'sesuai') noteExtras.push('Radius sesuai');
        else if (locationValidation.radiusStatus === 'ringan' && locationValidation.excessM !== null) noteExtras.push(`Melebihi radius ${locationValidation.excessM} m`);
        else if (locationValidation.radiusStatus === 'signifikan' && locationValidation.excessM !== null) noteExtras.push(`Melebihi radius ${locationValidation.excessM} m`);
      }
      if (fieldCondition && fieldCondition.category !== 'normal') {
        noteExtras.push(fieldCondition.reasonText ? `Kondisi: ${fieldCondition.reasonText}` : `Kondisi: ${fieldCondition.categoryLabel}`);
      }
      if (hrdReviewStatus === 'needs_review') noteExtras.push('Perlu catatan HRD');
      if (checkInEvent) noteExtras.push(photoUrlIn ? 'Foto masuk ada' : 'Foto masuk tidak ada');
      if (checkOutEvent) noteExtras.push(photoUrlOut ? 'Foto pulang ada' : 'Foto pulang belum ada');
      if (noteExtras.length) systemNote += ` • ${noteExtras.slice(0, 4).join(' • ')}`;

      rows.push({
        id: profileUid,
        name: resolvedName,
        employeeNumber: resolvedEmployeeNumber,
        brandId: profileBrandId ?? undefined,
        brandName: resolvedBrand,
        divisionName: resolvedDivision,
        attendanceMethod: 'web_absen',
        tapIn: safeFormatTime(tapInTimestamp),
        tapOut: safeFormatTime(tapOutTimestamp),
        tapInId: checkInEvent?.id || null,
        tapOutId: checkOutEvent?.id || null,
        status,
        mode: ((checkInEvent as any)?.mode as string)?.toLowerCase() === 'offsite' ? 'offsite' : '-',
        photoUrl,
        hasPhoto: !!photoUrl,
        photoUrlIn,
        hasPhotoIn: !!photoUrlIn,
        addressIn: resolveAddress(checkInEvent),
        photoUrlOut,
        hasPhotoOut: !!photoUrlOut,
        addressOut: resolveAddress(checkOutEvent),
        locationValidationOut,
        address: resolveAddress(checkInEvent) || resolveAddress(checkOutEvent),
        location: (checkInEvent as any)?.location || null,
        lateMinutes,
        calculatedLateMinutes: lateResult.lateMinutes,
        calculatedAttendanceStatus: lateResult.lateMinutes === null ? null : lateResult.statusLabel,
        calculatedIsLate: lateResult.isLate,
        attendanceSiteId: siteForBrand?.id ?? null,
        attendanceSiteName: siteForBrand?.name ?? null,
        scheduledStartTime,
        scheduledEndTime: daySchedule?.endTime ?? null,
        lateToleranceMinutesUsed: graceMins,
        latestCheckInWithoutReview,
        scheduleMissing,
        siteMissing,
        dayInactive,
        earlyLeaveMinutes,
        workDurationMinutes,
        isInvalid,
        isOnLeave,
        specialCondition,
        locationValidation,
        hrdReviewStatus,
        hrdReviewNote: (checkInEvent as any)?.hrdReviewNote || (checkOutEvent as any)?.hrdReviewNote || null,
        hrdReviewedByName: (checkInEvent as any)?.hrdReviewedByName || (checkOutEvent as any)?.hrdReviewedByName || null,
        hrdReviewedAt: (checkInEvent as any)?.hrdReviewedAt || (checkOutEvent as any)?.hrdReviewedAt || null,
        hrdReviewCheckIn,
        hrdReviewCheckOut,
        systemNote,
        reviewReasons,
        reviewReasonLabel,
        fieldCondition,
        rawEvent: checkInEvent || checkOutEvent,
        rawEventIn: checkInEvent || null,
        rawEventOut: checkOutEvent || null,
        // Kept for any older reader that expects one combined report — prefers
        // check-in only because that was this field's prior behavior; the
        // modal itself must use rawConditionReportIn/Out below, never this.
        conditionReport: conditionReportIn || conditionReportOut || null,
        rawConditionReport: conditionReportIn || conditionReportOut || null,
        rawConditionReportIn: conditionReportIn,
        rawConditionReportOut: conditionReportOut,
      });
    }

    // Summary cards are computed by the same buildAttendanceSummary() helper
    // Dashboard Karyawan uses — this is the fix for the two pages showing
    // different numbers for the same date/scope. `rows` above (the table)
    // still uses its own richer per-row join (NIK/email fallback matching,
    // photos, condition-report cards, etc.) since that detail is out of
    // scope for a shared numeric summary; for the uid-matched majority of
    // records the two will agree, since both are built on the same
    // resolveSiteForBrand/resolveScheduleForDay/calculateAttendanceLateStatus
    // primitives.
    const scopedAllowedBrandIds = effectiveBrandFilter !== 'all' ? [effectiveBrandFilter] : allowedBrandIds;
    // A specific brand chosen in the filter must narrow the summary even for
    // Super Admin / "all companies" HRD — isSuperAdmin/isAllCompanies mean
    // "skip the brand check", so both must be neutralized once a single
    // brand is selected, or the filter would visibly do nothing for those
    // roles.
    const summary = buildAttendanceSummary({
      employees: allEmployeeProfiles,
      attendanceEvents,
      attendanceSites: sites as any,
      conditionReports,
      leaveRequests,
      selectedDate: date ?? new Date(),
      allowedBrandIds: scopedAllowedBrandIds,
      isSuperAdmin: isSuperAdmin && effectiveBrandFilter === 'all',
      isAllCompanies: isAllCompanies && effectiveBrandFilter === 'all',
    });

    const stats = {
      total: summary.totalWebAbsen,
      hadir: summary.sudahAbsenBerangkat,
      belumTapIn: summary.belumAbsenBerangkat,
      sedangBekerja: summary.sedangBekerja,
      selesai: summary.sudahAbsenPulang,
      terlambat: summary.terlambat,
      tidakValid: summary.tidakValid,
      perluReview: summary.perluReviewHRD,
      kondisiKhusus: summary.kondisiKhusus,
      validOtomatis: summary.validOtomatis,
    };

    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('[ATTENDANCE_SUMMARY_SYNC_DEBUG]', {
        page: 'monitoring',
        dateKey: summary.dateKey,
        role: isSuperAdmin ? 'super-admin' : 'hrd',
        allowedBrandIds: scopedAllowedBrandIds,
        summary,
        eventUids: (attendanceEvents || []).map((e: any) => getEventEmployeeUid(e)),
      });
    }

    return { tableData: rows, summaryStats: stats };
  }, [allEmployeeProfiles, allUsers, attendanceEvents, sites, scopedBrands, effectiveBrandFilter, date, leaveRequests, conditionReports, allowedBrandIds, isSuperAdmin, isAllCompanies]);

  // Apply tab + search filter
  const filteredRows = useMemo(() => {
    return tableData.filter(row => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match = row.name.toLowerCase().includes(q) ||
          row.employeeNumber.toLowerCase().includes(q) ||
          row.brandName.toLowerCase().includes(q);
        if (!match) return false;
      }

      switch (statusTab) {
        case 'belum-tap-in': return row.status === 'Belum Tap In';
        case 'sedang-bekerja': return row.status === 'Sedang Bekerja';
        case 'selesai': return row.status === 'Selesai';
        case 'terlambat': return row.lateMinutes !== null && row.lateMinutes > 0;
        case 'tidak-valid': return row.isInvalid;
        case 'perlu-review': return isPerluReview(row);
        case 'kondisi-khusus': return !!row.specialCondition;
        default: return true;
      }
    });
  }, [tableData, statusTab, searchQuery]);

  // selectedRecord is a snapshot taken when the Detail modal opens (see
  // handleOpenDetail) — without this, a write that succeeds via
  // handleHrdConfirmationSide re-fetches attendance_events into tableData,
  // but the modal keeps rendering the stale pre-write snapshot (toast fires,
  // Firestore updates, buttons never disappear). Re-sync it to the matching
  // row every time tableData recomputes, so the open modal always reflects
  // the latest hrdReviewCheckIn/hrdReviewCheckOut without a page reload.
  useEffect(() => {
    if (!selectedRecord) return;
    const latest = tableData.find((row) => row.id === selectedRecord.id);
    if (latest && latest !== selectedRecord) setSelectedRecord(latest);
  }, [tableData, selectedRecord]);

  const handleMarkInvalid = async (attendanceUid: string, reason: string, note: string) => {
    if (!firestore || !userProfile) throw new Error('Tidak terautentikasi');
    const attendanceRef = doc(firestore, 'attendance_events', attendanceUid);
    await setDocumentNonBlocking(
      attendanceRef,
      {
        isInvalid: true,
        invalidatedAt: serverTimestamp(),
        invalidatedByUid: userProfile.uid,
        invalidatedByName: (userProfile as any).displayName || userProfile.fullName || userProfile.email,
        invalidReason: reason,
        invalidNote: note,
        payrollExcluded: true,
        status: 'invalid',
      },
      { merge: true }
    );
    mutateEvents();
  };

  // Detail modal's two independent Konfirmasi HRD sections (Absen Berangkat /
  // Absen Pulang) call this instead of handleHrdReview above — each side
  // writes ONLY its own attendance_events doc (tapInId for checkIn, tapOutId
  // for checkOut), so confirming one side can never touch, overwrite, or
  // clear whatever HRD already recorded for the other side.
  //
  // status is 'received' (Terima Kasih — laporan sudah diterima) or 'noted'
  // (Batalin + catatan wajib — laporan belum bisa diterima, tapi absensi
  // TETAP dihitung; this is documentation, never an approval gate — see
  // isCounted/requiresHrdApproval below, unchanged either way).
  // Firestore rules now only let HRD write hrdConfirmation, hrdConfirmationUpdatedAt,
  // hrdConfirmationUpdatedByUid, hrdConfirmationUpdatedByName on attendance_events — every
  // other field (hrdReviewStatus, isCounted, status, lateMinutes, ...) is rejected. So this
  // writes ONLY hrdConfirmation.checkIn / hrdConfirmation.checkOut via updateDoc + dot-path
  // keys, never a full-document setDoc merge that could carry other fields along.
  //
  // action is 'received' (Terima Kasih — laporan sudah diterima) or 'noted'
  // (Beri Catatan HRD — laporan tetap diterima dan tetap dihitung, tapi ada
  // catatan). Neither ever touches the attendance record itself (status,
  // keterlambatan, tap in/out, payroll, isCounted) — this is a note trail on
  // top of an attendance that already counts, not an approval gate.
  const handleHrdConfirmationSide = async (
    side: 'checkIn' | 'checkOut',
    action: 'received' | 'noted',
    noteText: string,
    row: AttendanceRecord | null = selectedRecord,
  ) => {
    if (!firestore || !userProfile || !row) return;
    // checkIn -> tap-in event id, checkOut -> tap-out event id, never crossed —
    // the two sides are separate attendance_events docs.
    const eventId = side === 'checkIn' ? row.tapInId : row.tapOutId;
    if (!eventId) {
      toast({ variant: 'destructive', title: 'Tidak ada catatan absensi untuk dicatat.' });
      return;
    }
    if (action === 'noted' && !noteText.trim()) {
      toast({ variant: 'destructive', title: 'Catatan HRD wajib diisi.' });
      return;
    }

    const sideLabel = side === 'checkIn' ? 'berangkat' : 'pulang';
    const currentUserUid = userProfile.uid;
    const currentUserName = (userProfile as any).displayName || userProfile.fullName || userProfile.email || 'HRD';
    const employeeName = row.name;

    const confirmationEntry =
      action === 'received'
        ? {
            status: 'received' as const,
            message: `Laporan absen ${sideLabel} ${employeeName} sudah diterima.`,
            receivedByUid: currentUserUid,
            receivedByName: currentUserName,
            receivedAt: serverTimestamp(),
          }
        : {
            status: 'noted' as const,
            note: noteText.trim(),
            notedByUid: currentUserUid,
            notedByName: currentUserName,
            notedAt: serverTimestamp(),
          };

    const confirmationKey = side === 'checkIn' ? 'hrdConfirmation.checkIn' : 'hrdConfirmation.checkOut';
    const payload = {
      [confirmationKey]: confirmationEntry,
      hrdConfirmationUpdatedAt: serverTimestamp(),
      hrdConfirmationUpdatedByUid: currentUserUid,
      hrdConfirmationUpdatedByName: currentUserName,
    };

    console.log('[HRD_CONFIRMATION_UPDATE_DEBUG]', {
      eventId,
      side,
      action,
      employeeName,
      currentUserUid,
      payload,
    });

    try {
      await updateDoc(doc(firestore, 'attendance_events', eventId), payload);
      toast({
        title: action === 'received'
          ? `Laporan absen ${sideLabel} sudah diterima.`
          : 'Catatan HRD berhasil disimpan.',
      });

      // Optimistic local patch — selectedRecord is a snapshot taken when the
      // modal opened, and mutateEvents() below has to round-trip a Firestore
      // fetch before tableData (and the useEffect that resyncs selectedRecord
      // to it) catches up. Without this, the write succeeds and the toast
      // fires, but the section still shows the Terima Kasih/Beri Catatan HRD
      // buttons until that round-trip lands. serverTimestamp() itself resolves
      // server-side, so `reviewedAt` here is a local-clock stand-in shaped
      // like a Firestore Timestamp (`.toDate()`) purely so formatReviewedAt
      // in the modal can render it immediately; the real value arrives on the
      // next snapshot and overwrites this via the tableData resync effect.
      const optimisticEntry: HrdReviewEntry = {
        status: action,
        note: (action === 'received' ? (confirmationEntry as any).message : (confirmationEntry as any).note) ?? null,
        reviewedByName: currentUserName,
        reviewedAt: { toDate: () => new Date() },
      };
      setSelectedRecord((prev) => {
        if (!prev || prev.id !== row.id) return prev;
        const next = {
          ...prev,
          hrdReviewCheckIn: side === 'checkIn' ? optimisticEntry : prev.hrdReviewCheckIn,
          hrdReviewCheckOut: side === 'checkOut' ? optimisticEntry : prev.hrdReviewCheckOut,
        };
        console.log('[HRD_CONFIRMATION_LOCAL_STATE_UPDATED]', {
          eventId,
          side,
          action,
          selectedRecordAfterUpdate: next,
        });
        return next;
      });

      // Realtime listener (mutateEvents) re-fetches attendance_events and the
      // Detail modal re-derives hrdReviewCheckIn/hrdReviewCheckOut from it —
      // no full page reload needed for the modal to reflect the new status.
      mutateEvents();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan', description: error.message });
    }
  };

  const handleOpenDetail = (row: AttendanceRecord) => {
    setSelectedRecord(row);
    setIsDetailModalOpen(true);
  };

  const handleOpenMarkInvalid = (row: AttendanceRecord) => {
    setRecordToMarkInvalid({
      id: row.tapInId || row.tapOutId || row.id,
      name: row.name,
      tapIn: row.tapIn,
      employeeNumber: row.employeeNumber,
    });
    setIsMarkInvalidDialogOpen(true);
  };

  const statusBadgeClass = (row: AttendanceRecord) => {
    if (row.isInvalid) return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 font-semibold';
    switch (row.status) {
      case 'Sedang Bekerja': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 font-semibold';
      case 'Selesai': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'Belum Tap In': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'Cuti Tahunan': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
      default: return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300';
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setDate(new Date());
    setBrandFilter('all');
    setStatusTab('all');
  };

  // HRD with no brand access configured at all — stop here with a clear message.
  if (!isSuperAdmin && isConfigured === false) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-8 text-center">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{emptyStateMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters — compact single row: Cari | Tanggal | Perusahaan | Status | Reset */}
      <div className="bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 items-end">
          {/* Search */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
              Cari
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Nama / ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 h-9 text-sm"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
              Tanggal
            </label>
            <GoogleDatePicker value={date} onChange={setDate} />
          </div>

          {/* Brand — scoped to HRD's allowedBrandIds, never global */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
              Perusahaan
            </label>
            {singleBrand ? (
              <div className="h-9 flex items-center px-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 text-sm font-medium text-slate-700 dark:text-slate-200">
                {singleBrand.name}
              </div>
            ) : (
              <Select value={brandFilter} onValueChange={setBrandFilter} disabled={isLoadingBrands}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={isSuperAdmin ? 'Semua Brand' : 'Semua Brand Saya'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isSuperAdmin ? 'Semua Brand' : 'Semua Brand Saya'}</SelectItem>
                  {scopedBrands?.map(brand => (
                    <SelectItem key={brand.id!} value={brand.id!}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
              Status
            </label>
            <Select value={statusTab} onValueChange={(val) => setStatusTab(val as StatusTabKey)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_TABS.map(tab => (
                  <SelectItem key={tab.key} value={tab.key}>{tab.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reset Button */}
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-sm flex-1"
              onClick={handleResetFilters}
            >
              Reset
            </Button>
          </div>
        </div>
      </div>

      {conditionReportsError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Laporan kondisi khusus tidak dapat dimuat untuk sebagian/seluruh brand (izin akses ditolak). Data absensi utama tetap tampil normal.
        </div>
      )}

      {isLoading ? <MonitoringSkeleton /> : (
        <>
          {/* Summary Cards */}
          <AttendanceSummaryCard stats={summaryStats} />

          {/* Kondisi Khusus + active status filter — combined into one thin strip so they don't push the table down */}
          {(summaryStats.kondisiKhusus > 0 || statusTab !== 'all') && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {summaryStats.kondisiKhusus > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300">
                  <span className="font-semibold">{summaryStats.kondisiKhusus}</span> laporan kondisi khusus — ada catatan lapangan
                </span>
              )}
              {statusTab !== 'all' && (
                <Badge variant="outline" className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 text-xs" onClick={() => setStatusTab('all')}>
                  {STATUS_TABS.find(t => t.key === statusTab)?.label}
                  <span className="ml-1">×</span>
                </Badge>
              )}
            </div>
          )}

          {/* Info Banner */}
          <div className="px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <span className="font-semibold">Monitoring ini hanya menampilkan karyawan dengan metode Web Absen.</span>{' '}
              Menampilkan {tableData.length} karyawan, {filteredRows.length} sesuai filter.
            </p>
          </div>

          {/* Table */}
          <div className="rounded-lg border bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                  <TableHead className="w-[160px] text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10 px-3.5">Karyawan</TableHead>
                  <TableHead className="w-[190px] text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Brand / Divisi</TableHead>
                  <TableHead className="w-[70px] text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Tap In</TableHead>
                  <TableHead className="w-[70px] text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Tap Out</TableHead>
                  <TableHead className="w-[150px] text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Status</TableHead>
                  <TableHead className="w-[240px] text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Catatan Sistem</TableHead>
                  <TableHead className="w-[150px] text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Bukti Foto</TableHead>
                  <TableHead className="w-[130px] text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Validasi Lokasi</TableHead>
                  <TableHead className="w-[130px] text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Kondisi</TableHead>
                  <TableHead className="w-[160px] text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Catatan HRD</TableHead>
                  <TableHead className="w-[90px] text-center text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10 pr-3.5">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length > 0 ? filteredRows.map((row, idx) => (
                  <TableRow
                    key={`${row.id}-${idx}`}
                    className={`h-[66px] align-middle border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                      row.isInvalid ? 'opacity-60' : row.hrdReviewStatus === 'needs_review' ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''
                    }`}
                  >
                    {/* Karyawan */}
                    <TableCell className="px-3.5 py-3">
                      <p className="font-semibold text-[13px] text-slate-900 dark:text-white leading-snug">{row.name}</p>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-snug">{row.employeeNumber}</p>
                    </TableCell>

                    {/* Brand / Divisi */}
                    <TableCell className="py-3">
                      <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 leading-snug">{row.brandName}</p>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-snug">{row.divisionName}</p>
                    </TableCell>

                    {/* Tap In */}
                    <TableCell className="py-3 text-[13px] text-slate-700 dark:text-slate-200 tabular-nums">
                      {row.tapIn !== '-' ? (
                        <span className="font-medium">{row.tapIn}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>

                    {/* Tap Out */}
                    <TableCell className="py-3 text-[13px] text-slate-700 dark:text-slate-200 tabular-nums">
                      {row.tapOut !== '-' ? (
                        <span className="font-medium">{row.tapOut}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge className={`${statusBadgeClass(row)} text-xs px-2 py-0.5`}>
                          {row.isInvalid ? 'Tidak Valid' : row.status}
                        </Badge>
                        {row.status === 'Sedang Bekerja' && (
                          <Badge variant="outline" className="text-xs px-2 py-0.5 border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                            Belum Tap Out
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Catatan Sistem — auto summary so HRD reads "why" without opening detail.
                        Max 2 lines: the primary state, then the important extras — full text
                        is still available via the native title tooltip on hover. */}
                    <TableCell className="py-3" title={row.systemNote}>
                      {(() => {
                        const { headline, extra } = splitSystemNote(row.systemNote);
                        return (
                          <>
                            <p className="text-[13px] text-slate-700 dark:text-slate-200 leading-snug line-clamp-1">{headline}</p>
                            {extra && (
                              <p className="mt-0.5 text-[12px] text-amber-700 dark:text-amber-400 leading-snug line-clamp-1">{extra}</p>
                            )}
                          </>
                        );
                      })()}
                    </TableCell>

                    {/* Bukti Foto — Masuk vs Pulang are shown distinctly, badges only (HRD doesn't need to open each photo here) */}
                    <TableCell className="py-3">
                      {row.tapInId || row.tapOutId ? (
                        <div className="flex flex-wrap gap-1">
                          {row.tapInId && (
                            <Badge variant="outline" className={`text-xs px-2 py-0.5 ${row.hasPhotoIn ? 'border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400' : 'border-slate-200 text-slate-400'}`}>
                              {row.hasPhotoIn ? 'Masuk Ada' : 'Masuk Tidak Ada'}
                            </Badge>
                          )}
                          {row.tapOutId ? (
                            <Badge variant="outline" className={`text-xs px-2 py-0.5 ${row.hasPhotoOut ? 'border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400' : 'border-slate-200 text-slate-400'}`}>
                              {row.hasPhotoOut ? 'Pulang Ada' : 'Pulang Tidak Ada'}
                            </Badge>
                          ) : row.tapInId && (
                            <Badge variant="outline" className="text-xs px-2 py-0.5 border-slate-200 text-slate-400">
                              Pulang Belum Ada
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs px-2 py-0.5 border-slate-200 text-slate-400">Foto Tidak Ada</Badge>
                      )}
                    </TableCell>

                    {/* Validasi Lokasi — one short badge; radius/jarak detail lives in the Detail modal now */}
                    <TableCell className="py-3">
                      {row.locationValidation?.badges?.[0] ? (
                        <Badge variant="outline" className="text-xs px-2 py-0.5">{row.locationValidation.badges[0]}</Badge>
                      ) : (
                        <span className="text-[12px] text-slate-400">—</span>
                      )}
                    </TableCell>

                    {/* Kondisi — one short badge; full per-side (Masuk/Pulang) breakdown with
                        notes lives in the Detail modal, never duplicated/truncated here. */}
                    <TableCell className="py-3">
                      {(() => {
                        const kondisi = getKondisiSummary(row);
                        return kondisi ? (
                          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 text-xs px-2 py-0.5">
                            {kondisi}
                          </Badge>
                        ) : (
                          <span className="text-[12px] text-slate-400">—</span>
                        );
                      })()}
                    </TableCell>

                    {/* Catatan HRD — one short badge; the full per-side note/acknowledgement
                        flow (Absen Masuk / Absen Pulang, Terima Kasih / Batalin) happens only
                        in the Detail modal, never from an action here. */}
                    <TableCell className="py-3">
                      {(() => {
                        const catatan = getCatatanHrdSummary(row);
                        return catatan ? (
                          <Badge className={`${HRD_REVIEW_BADGE_CLASS[row.hrdReviewStatus ?? ''] ?? ''} text-xs px-2 py-0.5`}>
                            {catatan}
                          </Badge>
                        ) : (
                          <span className="text-[12px] text-slate-400">—</span>
                        );
                      })()}
                    </TableCell>

                    {/* Aksi — Detail only. All HRD review actions moved into the Detail modal. */}
                    <TableCell className="py-3 text-center pr-3.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={() => handleOpenDetail(row)}
                      >
                        Detail
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={11} className="h-24 text-center text-slate-600 dark:text-slate-400">
                      {statusTab !== 'all'
                        ? `Tidak ada karyawan dengan filter "${STATUS_TABS.find(t => t.key === statusTab)?.label}".`
                        : effectiveBrandFilter !== 'all'
                        ? 'Tidak ada karyawan Web Absen di brand yang dipilih.'
                        : 'Belum ada karyawan dengan metode Web Absen.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <DeleteConfirmationDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={async () => {
          const { tapInId, tapOutId } = eventsToDelete;
          if (!tapInId && !tapOutId) return;
          try {
            const promises: Promise<any>[] = [];
            if (tapInId) promises.push(deleteDocumentNonBlocking(doc(firestore, 'attendance_events', tapInId)));
            if (tapOutId) promises.push(deleteDocumentNonBlocking(doc(firestore, 'attendance_events', tapOutId)));
            await Promise.all(promises);
            toast({ title: 'Absensi Dibatalkan', description: `Catatan absensi untuk ${eventsToDelete.userName} telah dihapus.` });
            mutateEvents();
          } catch (error: any) {
            toast({ variant: 'destructive', title: 'Gagal Membatalkan', description: error.message || 'Terjadi kesalahan pada server.' });
          } finally {
            setIsDeleteConfirmOpen(false);
          }
        }}
        itemName={`catatan absensi untuk ${eventsToDelete.userName}`}
        itemType=""
      />

      <AttendanceDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => { setIsDetailModalOpen(false); setSelectedRecord(null); }}
        record={selectedRecord}
        onReviewSide={handleHrdConfirmationSide}
      />

      <MarkAttendanceInvalidDialog
        open={isMarkInvalidDialogOpen}
        onOpenChange={setIsMarkInvalidDialogOpen}
        attendanceRecord={recordToMarkInvalid}
        onConfirm={handleMarkInvalid}
      />
    </div>
  );
}
