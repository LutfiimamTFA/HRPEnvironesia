'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { PayrollTemplatesClient } from '@/components/dashboard/super-admin/PayrollTemplatesClient';
import { MENU_CONFIG } from '@/lib/menu-config';

export default function PayrollTemplatesPage() {
  const hasAccess = useRoleGuard('super-admin');

  const menuConfig = useMemo(() => MENU_CONFIG['super-admin'] || [], []);

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Template Payroll" menuConfig={menuConfig}>
      <PayrollTemplatesClient />
    </DashboardLayout>
  );
}
