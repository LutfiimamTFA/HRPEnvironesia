'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { ALL_MENU_ITEMS } from '@/lib/menu-config';
import type { NavigationSetting } from '@/lib/types';


export default function HrdDashboard() {
  const hasAccess = useRoleGuard('hrd');
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const settingsDocRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'navigation_settings', userProfile.role) : null),
    [userProfile, firestore]
  );

  const { data: navSettings, isLoading: isLoadingSettings } = useDoc<NavigationSetting>(settingsDocRef);

  const menuItems = useMemo(() => {
    const allItems = ALL_MENU_ITEMS.hrd || [];
    if (!navSettings) {
      // If no settings are found (e.g., not set by admin yet), or still loading, show all items.
      return allItems;
    }
    return allItems.filter(item => navSettings.visibleMenuItems.includes(item.label));
  }, [navSettings]);


  if (!hasAccess || (userProfile && isLoadingSettings)) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Dashboard HRD" menuItems={menuItems}>
      <p>This is the main content area for the HRD dashboard. Manage recruitment and applications from here.</p>
    </DashboardLayout>
  );
}
