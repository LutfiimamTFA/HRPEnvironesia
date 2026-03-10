'use client';

import type { ReactNode } from 'react';
import React, { useMemo } from 'react';
import type { MenuGroup, MenuItem } from '@/lib/menu-config';
import { SidebarNav } from './SidebarNav';
import { Topbar } from './Topbar';
import { SidebarProvider, SidebarInset } from '../ui/sidebar';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { NavigationSetting } from '@/lib/types';
import { MENU_CONFIG, ALL_MENU_GROUPS } from '@/lib/menu-config';

type DashboardLayoutProps = {
  children: React.ReactNode;
  pageTitle: string;
  actionArea?: ReactNode;
};

export function DashboardLayout({ 
  children, 
  pageTitle, 
  actionArea
}: DashboardLayoutProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const roleKey = useMemo(() => {
    if (!userProfile) return null;
    // For 'karyawan' role, only create a specific key if employmentType is a sub-type like 'magang' or 'training'.
    // A regular 'karyawan' (full-time) will just use the 'karyawan' role key.
    if (userProfile.role === 'karyawan' && userProfile.employmentType && userProfile.employmentType !== 'karyawan') {
        return `karyawan-${userProfile.employmentType}`;
    }
    return userProfile.role;
  }, [userProfile]);


  const settingsDocRef = useMemoFirebase(
    () => (roleKey ? doc(firestore, 'navigation_settings', roleKey) : null),
    [roleKey, firestore]
  );
  const { data: navSettings, isLoading: isLoadingSettings } = useDoc<NavigationSetting>(settingsDocRef);
  
  const menuConfig = useMemo(() => {
    if (!roleKey) return [];
    
    // While loading or if no settings are found, fall back to default role config.
    if (isLoadingSettings || !navSettings?.visibleMenuItems) {
      return MENU_CONFIG[roleKey] || [];
    }
    
    // If settings are found, filter the master list of all menus.
    const visibleKeys = new Set(navSettings.visibleMenuItems);
    
    const filteredMenuConfig = ALL_MENU_GROUPS.map(group => {
      const visibleItems = group.items.filter(item => visibleKeys.has(item.key));
      return {
        ...group,
        items: visibleItems,
      };
    }).filter(group => group.items.length > 0); // Remove groups that become empty after filtering

    return filteredMenuConfig;

  }, [roleKey, navSettings, isLoadingSettings]);

  return (
    <SidebarProvider>
        <SidebarNav menuConfig={menuConfig} />
        <SidebarInset>
          <Topbar 
            pageTitle={pageTitle} 
            actionArea={actionArea}
          />
          <main className="flex-1 items-start gap-4 p-4 sm:px-6 sm:py-6 md:gap-8">
            {children}
          </main>
        </SidebarInset>
    </SidebarProvider>
  );
}
