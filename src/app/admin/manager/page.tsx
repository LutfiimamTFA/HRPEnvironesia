'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { MENU_CONFIG } from '@/lib/menu-config';

export default function ManagerDashboard() {
  const hasAccess = useRoleGuard('manager');
  const menuConfig = useMemo(() => MENU_CONFIG['manager'] || [], []);

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Manager's Dashboard" menuConfig={menuConfig}>
      <p>This is the main content area for the Manager dashboard. View team details and manage approvals.</p>
    </DashboardLayout>
  );
}
