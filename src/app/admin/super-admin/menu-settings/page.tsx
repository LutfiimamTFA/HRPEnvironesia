'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { MenuSettingsClient } from '@/components/dashboard/MenuSettingsClient';
import { MENU_CONFIG } from '@/lib/menu-config';

export default function MenuSettingsPage() {
  const hasAccess = useRoleGuard('super-admin');

  const menuItems = useMemo(() => MENU_CONFIG['super-admin'] || [], []);

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Menu Settings" menuConfig={menuItems}>
      <MenuSettingsClient />
    </DashboardLayout>
  );
}
