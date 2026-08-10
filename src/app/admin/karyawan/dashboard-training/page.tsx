'use client';

import { useMemo } from 'react';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { MENU_CONFIG } from '@/lib/menu-config';
import { EmployeeDashboardClient } from '@/components/dashboard/karyawan/dashboard/EmployeeDashboardClient';

export default function TrainingDashboardPage() {
  const hasAccess = useRoleGuard('karyawan');
  // Sidebar menu choice preserved exactly as before this rebuild — not part
  // of this change's scope.
  const menuConfig = useMemo(() => MENU_CONFIG['karyawan'] || [], []);

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return <EmployeeDashboardClient menuConfig={menuConfig} />;
}
