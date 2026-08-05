'use client';

import { useState, useMemo } from 'react';
import { where } from 'firebase/firestore';
import type { JobApplication, UserProfile, Brand, AttendanceSite, AttendanceEvent } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { startOfDay, endOfDay, subDays } from 'date-fns';
import { useHrdScopedBrands, useHrdScopedCollection } from '@/hooks/useHrdScopedCollection';
import { useHrdScopeContext } from '@/providers/hrd-scope-provider';
import { buildAttendanceSummary, getJakartaDateKey } from '@/lib/attendance-summary';
import { getEventEmployeeUid, getEventType, getEventDateKey } from '@/lib/attendance-helpers';
import { HrdScopeEmptyState } from './HrdScopeEmptyState';

import { GlobalFilterBar } from './GlobalFilterBar';
import { KpiCards } from './KpiCards';
import { NeedsActionPanel } from './NeedsActionPanel';
import { AnalyticsCharts } from './AnalyticsCharts';
import { AttendanceTable } from './AttendanceTable';
import { HRInsightsPanel } from './HRInsightsPanel';
import { DataCompletenessPanel } from './DataCompletenessPanel';
import { DataCompletenessVisualization } from './DataCompletenessVisualization';
import { QuickActionsPanel } from './QuickActionsPanel';
import { AttendanceOverviewChart } from './AttendanceOverviewChart';
import { AttendanceTrendChart } from './AttendanceTrendChart';
import { BrandDivisionBreakdownChart } from './BrandDivisionBreakdownChart';
import type { FilterState, AttendanceRecord, Kpi, ChartData } from './HrdDashboardTypes';
import { calculateKpisAndRecords, generateChartData } from './hrdDashboardUtils';

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-14 w-full rounded-xl" />
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

export function DashboardKaryawanClient() {
  const [view, setView] = useState('overview');

  const [filters, setFilters] = useState<FilterState>({
    date: new Date(),
    brandId: undefined,
    siteId: undefined,
    employmentType: undefined,
    searchTerm: '',
    needsActionOnly: false,
  });

  const activeEmployeeConstraints = useMemo(
    () => [where('isActive', '==', true), where('role', 'in', ['karyawan', 'manager'])],
    [],
  );
  const pendingPermissionConstraints = useMemo(
    () => [where('status', 'in', ['pending_hrd', 'pending_manager'])],
    [],
  );
  const pendingOvertimeConstraints = useMemo(
    () => [where('status', '==', 'pending_hrd')],
    [],
  );
  const pendingTripConstraints = useMemo(
    () => [where('status', '==', 'pending')],
    [],
  );

  const { isSuperAdmin, isAllCompanies, allowedBrandIds } = useHrdScopeContext();

  // --- Scoped Data Fetching ---
  const {
    data: users,
    isLoading: isLoadingUsers,
    isScopeConfigured,
    emptyStateMessage,
  } = useHrdScopedCollection<UserProfile>('users', { constraints: activeEmployeeConstraints });
  // attendance_sites stores brandIds as an array (one site can serve several
  // brands) — same fix as Monitoring Absensi's sites fetch, otherwise a site
  // whose brand sits at brandIds[1+] (not brandIds[0], the legacy brandId)
  // never comes back here and every lateness/shift calc below falls back to
  // "no site" for that brand.
  const { data: sites, isLoading: isLoadingSites } = useHrdScopedCollection<AttendanceSite>('attendance_sites', {
    brandField: 'brandIds',
    brandFieldMode: 'array',
    legacyBrandField: 'brandId',
  });
  const { data: brands, isLoading: isLoadingBrands } = useHrdScopedBrands();

  // HRD with exactly one allowed brand — pin the filter, don't render a
  // dropdown at all. Mirrors Monitoring Absensi's own singleBrand logic
  // exactly, so the two pages behave identically for a single-brand HRD.
  const singleBrand = !isSuperAdmin && !isAllCompanies && (brands?.length ?? 0) === 1 ? brands![0] : null;
  const effectiveBrandId = singleBrand ? singleBrand.id! : filters.brandId;
  const effectiveBrandIds = useMemo(
    () => (effectiveBrandId ? [effectiveBrandId] : allowedBrandIds),
    [effectiveBrandId, allowedBrandIds],
  );

  // attendance_events docs are written by the external Web Absen app and
  // don't reliably carry brandId, so — exactly like Monitoring Absensi —
  // this is fetched unscoped and filtered down to the HRD's visible
  // employees client-side inside buildAttendanceSummary(), instead of a
  // server-side brandId `where` that would silently drop every doc missing
  // that field. Two queries are merged: `dateKey` exact-match for the
  // selected day (what the KPI numbers are computed from — same field
  // Monitoring Absensi's primary query uses), plus a `createdAt` 7-day range
  // (older docs that predate `dateKey`, and what the trend chart needs).
  const selectedDateKey = getJakartaDateKey(filters.date);
  const todayDateKeyConstraints = useMemo(() => [where('dateKey', '==', selectedDateKey)], [selectedDateKey]);
  const { data: dateKeyEvents, isLoading: isLoadingDateKeyEvents } = useHrdScopedCollection<AttendanceEvent>('attendance_events', {
    constraints: todayDateKeyConstraints,
    unscoped: true,
  });

  const eventConstraints = useMemo(() => {
    const endDate = endOfDay(filters.date);
    const startDate = startOfDay(subDays(filters.date, 7));
    return [
      where('createdAt', '>=', startDate),
      where('createdAt', '<=', endDate),
    ];
  }, [filters.date]);
  const { data: rangeEvents, isLoading: isLoadingRangeEvents } = useHrdScopedCollection<AttendanceEvent>('attendance_events', {
    constraints: eventConstraints,
    unscoped: true,
  });

  const attendanceEvents = useMemo(() => {
    const byId = new Map<string, any>();
    for (const e of dateKeyEvents || []) byId.set((e as any).id, e);
    for (const e of rangeEvents || []) if (!byId.has((e as any).id)) byId.set((e as any).id, e);
    return Array.from(byId.values()) as AttendanceEvent[];
  }, [dateKeyEvents, rangeEvents]);
  const isLoadingEvents = isLoadingDateKeyEvents || isLoadingRangeEvents;

  // --- New Data Fetching for Pending Submissions ---
  const { data: pendingIzin } = useHrdScopedCollection('permission_requests', { constraints: pendingPermissionConstraints });

  const { data: pendingCuti } = useHrdScopedCollection('leave_requests', { constraints: pendingPermissionConstraints });

  const { data: pendingLembur } = useHrdScopedCollection('overtime_submissions', { constraints: pendingOvertimeConstraints });

  const { data: pendingDinas } = useHrdScopedCollection('business_trips', { constraints: pendingTripConstraints });

  // --- Employee profiles for data completeness ---
  const { data: profiles, isLoading: isLoadingProfiles } = useHrdScopedCollection('employee_profiles');

  const isLoading = isLoadingUsers || isLoadingSites || isLoadingBrands || isLoadingEvents || isLoadingProfiles;

  // attendanceRecords (the per-employee table/chart rows) still comes from
  // the users-collection pipeline below — AttendanceTable/charts expect its
  // richer per-record shape (siteId, employmentType, mode, address, ...).
  // The KPI NUMBERS above them are a separate concern: they must match
  // Monitoring Absensi's numbers for the same date/scope, which is why they
  // are computed by buildAttendanceSummary() instead of this function's own
  // `kpis` (ignored below) — see the note on that helper for why Monitoring
  // Absensi and Dashboard Karyawan previously disagreed.
  const { attendanceRecords } = useMemo(() => {
    return calculateKpisAndRecords(
      users,
      attendanceEvents,
      sites,
      brands,
      null,
      filters,
      pendingIzin as any[] | null,
      pendingCuti as any[] | null,
      pendingLembur as any[] | null,
    );
  }, [users, attendanceEvents, sites, brands, filters, pendingIzin, pendingCuti, pendingLembur]);

  // A specific brand chosen in the filter must narrow every KPI number —
  // isSuperAdmin/isAllCompanies mean "skip the brand check entirely" inside
  // buildAttendanceSummary, so both are neutralized once effectiveBrandId is
  // set (same fix applied to Monitoring Absensi's own summary call).
  const attendanceSummary = useMemo(() => buildAttendanceSummary({
    employees: profiles as any[] | null,
    attendanceEvents,
    attendanceSites: sites,
    conditionReports: [],
    leaveRequests: [],
    selectedDate: filters.date,
    allowedBrandIds: effectiveBrandIds,
    isSuperAdmin: isSuperAdmin && !effectiveBrandId,
    isAllCompanies: isAllCompanies && !effectiveBrandId,
  }), [profiles, attendanceEvents, sites, filters.date, effectiveBrandIds, effectiveBrandId, isSuperAdmin, isAllCompanies]);

  if (typeof window !== 'undefined') {
    const webAbsenUidSet = new Set(attendanceSummary.webAbsenEmployeeUids);
    const webAbsenEmployeesDebug = (profiles || []).filter((e: any) =>
      webAbsenUidSet.has(e.uid || e.userId || e.authUid || e.employeeUid || e.id),
    );
    // eslint-disable-next-line no-console
    console.log('[ATTENDANCE_SUMMARY_SYNC_DEBUG]', {
      page: 'dashboard',
      dateKey: attendanceSummary.dateKey,
      role: isSuperAdmin ? 'super-admin' : 'hrd',
      allowedBrandIds: effectiveBrandIds,
      totalActiveEmployees: attendanceSummary.totalActiveEmployees,
      totalWebAbsen: attendanceSummary.totalWebAbsen,
      sudahAbsenBerangkat: attendanceSummary.sudahAbsenBerangkat,
      belumAbsenBerangkat: attendanceSummary.belumAbsenBerangkat,
      sedangBekerja: attendanceSummary.sedangBekerja,
      sudahAbsenPulang: attendanceSummary.sudahAbsenPulang,
      belumAbsenPulang: attendanceSummary.belumAbsenPulang,
      tepatWaktu: attendanceSummary.tepatWaktu,
      terlambat: attendanceSummary.terlambat,
      perluReviewHRD: attendanceSummary.perluReviewHRD,
      kondisiKhusus: attendanceSummary.kondisiKhusus,
      webAbsenEmployees: webAbsenEmployeesDebug.map((e: any) => ({
        uid: e.uid || e.userId || e.authUid || e.employeeUid || e.id,
        name: e.fullName || e.name,
        brandId: e.brandId,
        attendanceMethod: e.attendanceMethod || e.attendanceConfig?.method,
      })),
      events: (attendanceEvents || []).map((e: any) => ({
        id: e.id,
        uid: getEventEmployeeUid(e),
        type: getEventType(e),
        dateKey: getEventDateKey(e),
        time: e.createdAt || e.timestamp || e.tsServer,
      })),
    });

    // Filter-specific debug — shows exactly what changes when the Brand
    // dropdown changes, so a "the filter looks selected but numbers didn't
    // move" report can be diagnosed straight from the console.
    const resolveEmployeeBrandIdDebug = (employee: any): string =>
      employee.brandId || employee.companyId || employee.brandID || employee.companyID ||
      employee.hrdEmploymentInfo?.brandId || employee.hrdEmploymentInfo?.companyId ||
      employee.employmentInfo?.brandId || employee.employmentInfo?.companyId || '';
    const scopedEmployeesDebug = (profiles || []).filter((e: any) =>
      effectiveBrandIds.includes(resolveEmployeeBrandIdDebug(e)),
    );
    const scopedEmployeeUidsDebug = new Set(
      scopedEmployeesDebug.map((e: any) => e.uid || e.id || e.employeeUid).filter(Boolean),
    );
    const scopedEventsDebug = (attendanceEvents || []).filter((e: any) => {
      const uid = (e as any).employeeUid || (e as any).uid || (e as any).userId || (e as any).employeeId || '';
      return scopedEmployeeUidsDebug.has(uid);
    });
    const selectedBrandLabel = singleBrand
      ? singleBrand.name
      : effectiveBrandId
        ? (brands || []).find((b) => b.id === effectiveBrandId)?.name ?? effectiveBrandId
        : (isSuperAdmin ? 'Semua Brand' : 'Semua Brand Saya');
    // eslint-disable-next-line no-console
    console.log('[DASHBOARD_FILTER_SYNC_DEBUG]', {
      selectedBrandId: filters.brandId ?? 'all',
      selectedBrandLabel,
      allowedBrandIds,
      effectiveBrandIds,
      totalEmployeesBeforeFilter: (profiles || []).length,
      scopedEmployees: scopedEmployeesDebug.map((e: any) => ({
        uid: e.uid || e.id,
        name: e.fullName || e.name,
        brandId: resolveEmployeeBrandIdDebug(e),
        brandName: e.brandName || e.companyName,
        attendanceMethod: e.attendanceMethod || e.attendanceConfig?.method,
      })),
      scopedEmployeeUids: Array.from(scopedEmployeeUidsDebug),
      attendanceEventsBeforeFilter: (attendanceEvents || []).length,
      scopedEvents: scopedEventsDebug.map((e: any) => ({
        id: (e as any).id,
        uid: (e as any).employeeUid || (e as any).uid || (e as any).userId || (e as any).employeeId,
        type: (e as any).eventType || (e as any).type || (e as any).action,
        dateKey: (e as any).dateKey || (e as any).attendanceDate || (e as any).localDate,
      })),
      summary: attendanceSummary,
    });
  }

  const pct = (val: number, total: number) => (total > 0 ? Math.round((val / total) * 100) : 0);
  // permission_requests/leave_requests/overtime_submissions all store
  // brandId directly on the request doc — filter by effectiveBrandId the
  // same way the attendance summary above does, so picking a brand narrows
  // these counts too instead of always showing every brand's pending items.
  const matchesEffectiveBrand = (r: any) => !effectiveBrandId || r.brandId === effectiveBrandId;
  const totalPendingIzin = (pendingIzin || []).filter(matchesEffectiveBrand).length;
  const totalPendingCuti = (pendingCuti || []).filter(matchesEffectiveBrand).length;
  const totalPendingLembur = (pendingLembur || []).filter(matchesEffectiveBrand).length;
  const totalPending = totalPendingIzin + totalPendingCuti + totalPendingLembur;

  // Labels/order mirror Monitoring Absensi's own vocabulary (Absen Berangkat/
  // Absen Pulang/Terlambat/Perlu Review) exactly, and every value below reads
  // straight off the same buildAttendanceSummary() result Monitoring uses —
  // "Hadir Hari Ini"/"On-Time"/"Anomali Absensi" were ambiguous about whether
  // they meant "tapped in" or "tapped in AND out", and never distinguished
  // "sedang bekerja" (in progress) from "sudah pulang" (finished) at all.
  const kpis: Kpi[] = [
    // ── Baris utama ──
    {
      title: 'Karyawan Aktif',
      value: attendanceSummary.totalActiveEmployees,
      color: 'slate',
      icon: '👥',
      description: 'Total semua karyawan aktif',
    },
    {
      title: 'Total Web Absen',
      value: attendanceSummary.totalWebAbsen,
      color: 'slate',
      icon: '📱',
      description: 'Karyawan dengan metode Web Absen',
    },
    {
      title: 'Sudah Absen Berangkat',
      value: attendanceSummary.sudahAbsenBerangkat,
      color: 'teal',
      icon: '✅',
      percentage: pct(attendanceSummary.sudahAbsenBerangkat, attendanceSummary.totalWebAbsen),
      description: `dari ${attendanceSummary.totalWebAbsen} Web Absen`,
    },
    {
      title: 'Belum Absen Berangkat',
      value: attendanceSummary.belumAbsenBerangkat,
      color: attendanceSummary.belumAbsenBerangkat > 0 ? 'red' : 'teal',
      icon: '🚫',
      deltaType: 'inverse',
      percentage: pct(attendanceSummary.belumAbsenBerangkat, attendanceSummary.totalWebAbsen),
      description: `dari ${attendanceSummary.totalWebAbsen} Web Absen`,
    },
    {
      title: 'Sedang Bekerja',
      value: attendanceSummary.sedangBekerja,
      color: 'blue',
      icon: '🧑‍💻',
      description: 'sudah masuk, belum pulang',
    },
    {
      title: 'Sudah Absen Pulang',
      value: attendanceSummary.sudahAbsenPulang,
      color: 'teal',
      icon: '🏁',
      description: 'sudah tap out hari ini',
    },
    {
      title: 'Belum Absen Pulang',
      value: attendanceSummary.belumAbsenPulang,
      color: attendanceSummary.belumAbsenPulang > 0 ? 'amber' : 'teal',
      icon: '⏳',
      deltaType: 'inverse',
      percentage: pct(attendanceSummary.belumAbsenPulang, attendanceSummary.sudahAbsenBerangkat),
      description: 'dari yang sudah berangkat',
    },

    // ── Baris kedua ──
    {
      title: 'Tepat Waktu',
      value: attendanceSummary.tepatWaktu,
      color: 'teal',
      icon: '⏰',
      percentage: pct(attendanceSummary.tepatWaktu, attendanceSummary.sudahAbsenBerangkat),
      description: 'dari yang sudah berangkat',
    },
    {
      title: 'Terlambat',
      value: attendanceSummary.terlambat,
      color: attendanceSummary.terlambat > 0 ? 'amber' : 'teal',
      icon: '⚠️',
      deltaType: 'inverse',
      percentage: pct(attendanceSummary.terlambat, attendanceSummary.sudahAbsenBerangkat),
      description: 'dari yang sudah berangkat',
    },
    {
      title: 'Perlu Review HRD',
      value: attendanceSummary.perluReviewHRD,
      color: attendanceSummary.perluReviewHRD > 0 ? 'red' : 'teal',
      icon: '🔎',
      deltaType: 'inverse',
      description: 'lokasi/kondisi/data perlu dicek',
    },
    {
      title: 'Kondisi Khusus',
      value: attendanceSummary.kondisiKhusus,
      color: attendanceSummary.kondisiKhusus > 0 ? 'blue' : 'slate',
      icon: '🩺',
      description: 'laporan kondisi khusus',
    },
    {
      title: 'Izin Pending',
      value: totalPendingIzin,
      color: totalPendingIzin > 0 ? 'blue' : 'slate',
      icon: '📋',
      href: '/admin/hrd/persetujuan-izin',
      description: 'menunggu persetujuan',
    },
    {
      title: 'Cuti Pending',
      value: totalPendingCuti,
      color: totalPendingCuti > 0 ? 'blue' : 'slate',
      icon: '🏖️',
      href: '/admin/hrd/persetujuan-cuti',
      description: 'menunggu persetujuan',
    },
    {
      title: 'Pending Approval',
      value: totalPending,
      color: totalPending > 0 ? 'amber' : 'slate',
      icon: '🔔',
      description: 'izin+cuti+lembur',
    },
  ];

  const dataCompletenessPct = useMemo(() => {
    if (!profiles || profiles.length === 0) return 0;
    const fields = 7; // number of fields to check
    const fieldChecks = [
      (p: any) => !!(p?.photoUrl || p?.photo),
      (p: any) => !!(p?.phone || p?.phoneNumber),
      (p: any) => !!(p?.address || p?.alamat),
      (p: any) => !!(p?.education || (Array.isArray(p?.pendidikan) && p.pendidikan.length > 0)),
      (p: any) => !!(p?.bankAccount || p?.rekening),
      (p: any) => !!(p?.bpjsNumber || p?.npwp),
      (p: any) => !!(
        (Array.isArray(p?.familyMembers) && p.familyMembers.length > 0) ||
        (Array.isArray(p?.keluarga) && p.keluarga.length > 0)
      ),
    ];
    const totalPct = profiles.reduce((acc, profile) => {
      const pct = fieldChecks.filter(check => check(profile)).length / fields * 100;
      return acc + pct;
    }, 0);
    return Math.round(totalPct / profiles.length);
  }, [profiles]);

  const chartData = useMemo(() => {
    return generateChartData(attendanceRecords, attendanceEvents, filters.date);
  }, [attendanceRecords, attendanceEvents, filters.date]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!isScopeConfigured) {
    return <HrdScopeEmptyState message={emptyStateMessage} />;
  }

  const filteredRecords = attendanceRecords.filter(record => {
    if (filters.needsActionOnly) {
      return record.flags.length > 0 || record.status === 'Belum Tap In' || record.status === 'Belum Tap Out';
    }
    return true;
  });

  const totalActive = attendanceSummary.totalActiveEmployees;

  const handleKpiCardClick = (title: string) => {
    // Can be extended to filter records based on KPI title
    // For now, just a placeholder for future implementation
    console.log('KPI clicked:', title);
  };

  return (
    <div className="space-y-5">
      {/* Sticky filter bar */}
      <div className="sticky top-16 z-20 bg-background/95 backdrop-blur-sm -mx-6 px-6 -mt-4 pt-4 pb-2">
        <GlobalFilterBar
          brands={brands || []}
          filters={filters}
          setFilters={setFilters}
          singleBrand={singleBrand}
          isSuperAdmin={isSuperAdmin}
          isLoadingBrands={isLoadingBrands}
        />
      </div>

      {/* KPI Cards - Executive Summary */}
      <KpiCards kpis={kpis} onCardClick={handleKpiCardClick} />

      {/* 2x2 Grid: Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AttendanceOverviewChart records={attendanceRecords} />
        <DataCompletenessVisualization profiles={profiles as any[] | null} users={users} />
        <AttendanceTrendChart events={attendanceEvents} date={filters.date} />
        <BrandDivisionBreakdownChart records={attendanceRecords} />
      </div>

      {/* Insights + Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <HRInsightsPanel
            kpis={kpis}
            pendingIzin={pendingIzin as any[] | null}
            pendingCuti={pendingCuti as any[] | null}
            pendingLembur={pendingLembur as any[] | null}
            pendingDinas={pendingDinas as any[] | null}
            totalActive={totalActive}
            dataCompletenessPct={dataCompletenessPct}
          />
        </div>
        <div>
          <QuickActionsPanel />
        </div>
      </div>

      {/* Needs Action */}
      <NeedsActionPanel
        records={attendanceRecords}
        pendingIzin={pendingIzin as any[] | null}
        pendingCuti={pendingCuti as any[] | null}
        pendingLembur={pendingLembur as any[] | null}
        pendingDinas={pendingDinas as any[] | null}
      />

      {/* Tabs: Overview | Analytics */}
      <Tabs value={view} onValueChange={setView} className="w-full">
        <TabsList className="bg-slate-100 dark:bg-slate-800/60">
          <TabsTrigger value="overview" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
            Laporan Kehadiran
          </TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
            Analytics Detail
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-5">
          {/* Attendance Table */}
          <AttendanceTable records={filteredRecords} />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <AnalyticsCharts chartData={chartData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
