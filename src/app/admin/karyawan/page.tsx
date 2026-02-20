'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { MENU_CONFIG } from '@/lib/menu-config';


export default function KaryawanDashboard() {
  const hasAccess = useRoleGuard('karyawan');
  const menuConfig = useMemo(() => MENU_CONFIG['karyawan'] || [], []);

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Employee Dashboard" menuConfig={menuConfig}>
      <p>This is the main content area for the Employee dashboard. Access your personal information and company resources.</p>
    </DashboardLayout>
  );
}
