'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { ALL_MENU_ITEMS, ALL_UNIQUE_MENU_ITEMS } from '@/lib/menu-config';
import type { NavigationSetting } from '@/lib/types';

export default function KandidatDashboard() {
  const hasAccess = useRoleGuard('kandidat');
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const settingsDocRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'navigation_settings', userProfile.role) : null),
    [userProfile, firestore]
  );

  const { data: navSettings, isLoading: isLoadingSettings } = useDoc<NavigationSetting>(settingsDocRef);

  const menuItems = useMemo(() => {
    const defaultItems = ALL_MENU_ITEMS.kandidat || [];

    if (isLoadingSettings) {
      return defaultItems;
    }

    if (navSettings) {
      return ALL_UNIQUE_MENU_ITEMS.filter(item => navSettings.visibleMenuItems.includes(item.label));
    }

    return defaultItems;
  }, [navSettings, isLoadingSettings]);


  if (!hasAccess || (userProfile && isLoadingSettings)) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }


  return (
    <DashboardLayout pageTitle="Dashboard Kandidat" menuItems={menuItems}>
      <p>This is the main content area for the Candidate dashboard. Manage your profile and job applications.</p>
    </DashboardLayout>
  );
}
