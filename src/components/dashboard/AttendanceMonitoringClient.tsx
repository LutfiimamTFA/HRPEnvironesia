'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, serverTimestamp } from 'firebase/firestore';
import type { EmployeeProfile, AttendanceEvent, AttendanceSite } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '../ui/skeleton';
import { format, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';
import { Badge } from '../ui/badge';
import { Search, MoreVertical, CheckCircle2, XCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
  type LocationValidation,
  type FieldConditionResult,
} from '@/lib/attendance-helpers';
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
};

const HRD_REVIEW_BADGE_CLASS: Record<string, string> = {
  valid_auto: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  needs_review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  rejected: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  revision_requested: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

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

function isPerluReview(row: AttendanceRecord): boolean {
  return row.isInvalid ||
    row.hrdReviewStatus === 'needs_review' ||
    (row.lateMinutes !== null && row.lateMinutes > 15) ||
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
  const { isSuperAdmin, isConfigured, isAllCompanies, allowedBrandIds, emptyStateMessage } = useHrdScopeContext();
  const { data: scopedBrands, isLoading: isLoadingBrands } = useHrdScopedBrands();

  // --- Data Fetching — all brand-scoped via roles_hrd/{uid}.allowedBrandIds ---
  const { data: sites, isLoading: isLoadingConfig } = useHrdScopedCollection<AttendanceSite>('attendance_sites');

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

  const leaveConstraints = useMemo(() => [where('status', 'in', ['approved', 'active_leave'])], []);
  const { data: leaveRequests, isLoading: isLoadingLeaves } = useHrdScopedCollection<any>('leave_requests', { constraints: leaveConstraints });

  const isLoading = isLoadingConfig || isLoadingProfiles || isLoadingUsers || isLoadingBrands || isLoadingEvents || isLoadingLeaves;

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
      // the HRD-scope query itself filters on) — hrdEmploymentInfo is only a
      // fallback for older docs that never got the top-level field written.
      const id = p.brandId || p.hrdEmploymentInfo?.brandId;
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

      const siteForBrand = resolveSiteForBrand(sites as any, profileBrandId);
      const daySchedule = resolveScheduleForDay(siteForBrand as any, selectedDayOfWeek);

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

      const graceMins = (siteForBrand as any)?.lateToleranceMinutes ?? (siteForBrand as any)?.shift?.graceLateMinutes ?? 0;

      let lateMinutes: number | null = null;
      if (tapInTimestamp && daySchedule) {
        const shiftStart = new Date(tapInTimestamp);
        const [startHour, startMinute] = daySchedule.startTime.split(':').map(Number);
        shiftStart.setHours(startHour, startMinute + graceMins, 0, 0);
        if (tapInTimestamp > shiftStart) {
          lateMinutes = differenceInMinutes(tapInTimestamp, shiftStart);
        }
      } else if (tapInTimestamp) {
        const shiftStart = new Date(tapInTimestamp);
        shiftStart.setHours(9, 0, 0, 0);
        if (tapInTimestamp > shiftStart) {
          lateMinutes = differenceInMinutes(tapInTimestamp, shiftStart);
        }
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

      const specialCondition = (checkInEvent as any)?.specialCondition || (checkOutEvent as any)?.specialCondition || null;
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
      const lateNeedsReview = lateMinutes !== null && lateMinutes > 15;

      const hrdReviewStatus = (checkInEvent as any)?.hrdReviewStatus || (checkOutEvent as any)?.hrdReviewStatus ||
        (specialCondition || locationNeedsReview || photoMissing || lateNeedsReview
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

      const reviewReasonLabel =
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
      if (earlyLeaveMinutes !== null && earlyLeaveMinutes > 0) noteExtras.push(`Pulang awal ${earlyLeaveMinutes} menit`);
      if (lateLeaveMinutes !== null && lateLeaveMinutes > 0) noteExtras.push(`Pulang lebih lambat ${lateLeaveMinutes} menit`);
      if (locationValidation && tapInTimestamp) {
        if (locationValidation.radiusStatus === 'sesuai') noteExtras.push('Radius sesuai');
        else if (locationValidation.radiusStatus === 'ringan' && locationValidation.excessM !== null) noteExtras.push(`Melebihi radius ${locationValidation.excessM} m`);
        else if (locationValidation.radiusStatus === 'signifikan' && locationValidation.excessM !== null) noteExtras.push(`Melebihi radius ${locationValidation.excessM} m`);
      }
      if (fieldCondition && fieldCondition.category !== 'normal') {
        noteExtras.push(fieldCondition.reasonText ? `Alasan: ${fieldCondition.reasonText}` : fieldCondition.categoryLabel);
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
        systemNote,
        reviewReasons,
        reviewReasonLabel,
        fieldCondition,
        rawEvent: checkInEvent || checkOutEvent,
        rawEventIn: checkInEvent || null,
        rawEventOut: checkOutEvent || null,
      });
    }

    const stats = {
      total: rows.length,
      hadir: rows.filter(r => r.status === 'Selesai' || r.status === 'Sedang Bekerja').length,
      belumTapIn: rows.filter(r => r.status === 'Belum Tap In').length,
      sedangBekerja: rows.filter(r => r.status === 'Sedang Bekerja').length,
      selesai: rows.filter(r => r.status === 'Selesai').length,
      terlambat: rows.filter(r => r.lateMinutes !== null && r.lateMinutes > 0).length,
      tidakValid: rows.filter(r => r.isInvalid).length,
      perluReview: rows.filter(isPerluReview).length,
      kondisiKhusus: rows.filter(r => !!r.specialCondition).length,
      validOtomatis: rows.filter(r => r.hrdReviewStatus === 'valid_auto').length,
    };

    return { tableData: rows, summaryStats: stats };
  }, [allEmployeeProfiles, allUsers, attendanceEvents, sites, scopedBrands, effectiveBrandFilter, date, leaveRequests]);

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

  // Writes a CATATAN, not an approval decision. isCounted/requiresHrdApproval
  // never change here — absensi is already counted the moment there's a
  // tap-in, regardless of what HRD notes down. reviewOnly:true marks this
  // whole workflow as "for HRD's awareness", not a gate the record must pass.
  const handleHrdReview = async (
    hrdStatus: 'approved' | 'rejected' | 'revision_requested' | 'valid_auto' | 'needs_review',
    note: string,
    row: AttendanceRecord | null = selectedRecord,
  ) => {
    if (!firestore || !userProfile || !row) return;
    const ids = [row.tapInId, row.tapOutId].filter(Boolean) as string[];
    if (ids.length === 0) {
      toast({ variant: 'destructive', title: 'Tidak ada catatan absensi untuk dicatat.' });
      return;
    }
    try {
      await Promise.all(ids.map((id) =>
        setDocumentNonBlocking(
          doc(firestore, 'attendance_events', id),
          {
            hrdReviewStatus: hrdStatus,
            hrdReviewNote: note || null,
            hrdReviewedByUid: userProfile.uid,
            hrdReviewedByName: (userProfile as any).displayName || userProfile.fullName || userProfile.email,
            hrdReviewedAt: serverTimestamp(),
            isCounted: true,
            requiresHrdApproval: false,
            reviewOnly: true,
          },
          { merge: true },
        )
      ));
      toast({ title: `Catatan tersimpan: ${HRD_REVIEW_LABEL[hrdStatus]?.toLowerCase() ?? 'diperbarui'}.` });
      mutateEvents();
      setIsDetailModalOpen(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan catatan', description: error.message });
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
                  <TableHead className="text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10 px-3.5">Karyawan</TableHead>
                  <TableHead className="text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Brand / Divisi</TableHead>
                  <TableHead className="text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Tap In</TableHead>
                  <TableHead className="text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Tap Out</TableHead>
                  <TableHead className="text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Status</TableHead>
                  <TableHead className="text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Catatan Sistem</TableHead>
                  <TableHead className="text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Bukti Foto</TableHead>
                  <TableHead className="text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Validasi Lokasi</TableHead>
                  <TableHead className="text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Kondisi</TableHead>
                  <TableHead className="text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10">Catatan HRD</TableHead>
                  <TableHead className="text-right text-[11px] uppercase font-black text-slate-500 dark:text-slate-400 h-10 pr-3.5">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length > 0 ? filteredRows.map((row, idx) => (
                  <TableRow
                    key={`${row.id}-${idx}`}
                    className={`border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
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

                    {/* Catatan Sistem — auto summary so HRD reads "why" without opening detail */}
                    <TableCell className="py-3 max-w-[260px]">
                      <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">{row.systemNote}</p>
                      {row.lateMinutes !== null && row.lateMinutes > 0 && (
                        <Badge variant="outline" className="mt-1 text-xs px-2 py-0.5 border-orange-200 text-orange-700 dark:border-orange-800 dark:text-orange-400">
                          Terlambat {row.lateMinutes}m
                        </Badge>
                      )}
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

                    {/* Validasi Lokasi — badges plus the actual Status Radius reading (meters vs office limit) */}
                    <TableCell className="py-3 max-w-[200px]">
                      {row.locationValidation ? (
                        <>
                          <div className="flex flex-wrap gap-1">
                            {row.locationValidation.badges.map((b) => (
                              <Badge key={b} variant="outline" className="text-xs px-2 py-0.5">{b}</Badge>
                            ))}
                          </div>
                          {row.locationValidation.distanceM !== null && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                              {row.locationValidation.radiusSummary}
                            </p>
                          )}
                        </>
                      ) : <span className="text-[12px] text-slate-400">—</span>}
                    </TableCell>

                    {/* Kondisi Lapangan + Alasan Karyawan */}
                    <TableCell className="py-3 max-w-[190px]">
                      {row.fieldCondition && row.fieldCondition.category !== 'normal' ? (
                        <>
                          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 text-xs px-2 py-0.5">
                            {row.fieldCondition.categoryLabel}
                          </Badge>
                          {row.fieldCondition.reasonText && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug line-clamp-2">
                              {row.fieldCondition.reasonText}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-[12px] text-slate-400">—</span>
                      )}
                    </TableCell>

                    {/* Review HRD — shows the reason(s), not just "Perlu Review" */}
                    <TableCell className="py-3 max-w-[210px]">
                      {row.hrdReviewStatus ? (
                        <Badge className={`${HRD_REVIEW_BADGE_CLASS[row.hrdReviewStatus] ?? ''} text-xs px-2 py-1 h-auto whitespace-normal text-left leading-snug`}>
                          {row.reviewReasonLabel}
                        </Badge>
                      ) : (
                        <span className="text-[12px] text-slate-400">—</span>
                      )}
                    </TableCell>

                    {/* Aksi */}
                    <TableCell className="py-3 text-right pr-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-8 px-2.5"
                          onClick={() => handleOpenDetail(row)}
                        >
                          Detail
                        </Button>
                        {/* Quick actions — only surfaced for rows that actually need a decision, kept in a small dropdown so the table stays uncluttered */}
                        {row.hrdReviewStatus === 'needs_review' && (row.tapInId || row.tapOutId) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                const note = window.prompt('Catatan HRD untuk absensi ini:', '');
                                if (note) handleHrdReview('needs_review', note, row);
                              }}>
                                <ShieldCheck className="h-4 w-4 mr-2 text-slate-600" /> Tambah Catatan
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleHrdReview('approved', '', row)}>
                                <CheckCircle2 className="h-4 w-4 mr-2 text-blue-600" /> Tandai Sudah Dicek
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleHrdReview('revision_requested', '', row)}>
                                <RefreshCw className="h-4 w-4 mr-2 text-purple-600" /> Minta Klarifikasi
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleHrdReview('rejected', '', row)} className="text-slate-600 focus:text-slate-600">
                                <XCircle className="h-4 w-4 mr-2" /> Abaikan Catatan
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
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
        onMarkInvalid={selectedRecord && (selectedRecord.tapInId || selectedRecord.tapOutId) && !selectedRecord.isInvalid
          ? () => handleOpenMarkInvalid(selectedRecord)
          : undefined
        }
        onReview={handleHrdReview}
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
