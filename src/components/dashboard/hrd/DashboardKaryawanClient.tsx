'use client';

import { useState, useMemo } from 'react';
import { where } from 'firebase/firestore';
import type { JobApplication, UserProfile, Brand, AttendanceSite, AttendanceEvent } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { startOfDay, endOfDay, subDays } from 'date-fns';
import { useHrdScopedBrands, useHrdScopedCollection } from '@/hooks/useHrdScopedCollection';
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

  // --- Scoped Data Fetching ---
  const {
    data: users,
    isLoading: isLoadingUsers,
    isScopeConfigured,
    emptyStateMessage,
  } = useHrdScopedCollection<UserProfile>('users', { constraints: activeEmployeeConstraints });
  const { data: sites, isLoading: isLoadingSites } = useHrdScopedCollection<AttendanceSite>('attendance_sites');
  const { data: brands, isLoading: isLoadingBrands } = useHrdScopedBrands();

  const eventConstraints = useMemo(() => {
    const endDate = endOfDay(filters.date);
    const startDate = startOfDay(subDays(filters.date, 7));
    return [
      where('tsServer', '>=', startDate),
      where('tsServer', '<=', endDate),
    ];
  }, [filters.date]);
  const { data: attendanceEvents, isLoading: isLoadingEvents } = useHrdScopedCollection<AttendanceEvent>('attendance_events', {
    constraints: eventConstraints,
  });

  // --- New Data Fetching for Pending Submissions ---
  const { data: pendingIzin } = useHrdScopedCollection('permission_requests', { constraints: pendingPermissionConstraints });

  const { data: pendingCuti } = useHrdScopedCollection('leave_requests', { constraints: pendingPermissionConstraints });

  const { data: pendingLembur } = useHrdScopedCollection('overtime_submissions', { constraints: pendingOvertimeConstraints });

  const { data: pendingDinas } = useHrdScopedCollection('business_trips', { constraints: pendingTripConstraints });

  // --- Employee profiles for data completeness ---
  const { data: profiles } = useHrdScopedCollection('employee_profiles');

  const isLoading = isLoadingUsers || isLoadingSites || isLoadingBrands || isLoadingEvents;

  const { kpis, attendanceRecords } = useMemo(() => {
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

  const totalActive = users?.filter(u =>
    u.isActive && ['karyawan', 'magang', 'training'].includes(u.role)
  ).length || 0;

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
          sites={sites || []}
          filters={filters}
          setFilters={setFilters}
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
