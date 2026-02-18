'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { NavigationSetting } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { ALL_MENU_ITEMS, ALL_UNIQUE_MENU_ITEMS } from '@/lib/menu-config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AssessmentSubmissionsClient } from '@/components/dashboard/AssessmentSubmissionsClient';
import { AssessmentManagementClient } from '@/components/dashboard/AssessmentManagementClient';

function AssessmentsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export default function AssessmentsPage() {
  const hasAccess = useRoleGuard(['super-admin', 'hrd']);
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const settingsDocRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'navigation_settings', userProfile.role) : null),
    [userProfile, firestore]
  );
  const { data: navSettings, isLoading: isLoadingSettings } = useDoc<NavigationSetting>(settingsDocRef);
  const menuItems = useMemo(() => {
    const defaultItems = ALL_MENU_ITEMS[userProfile?.role as keyof typeof ALL_MENU_ITEMS] || [];
    if (isLoadingSettings) return defaultItems;
    if (navSettings) {
      return ALL_UNIQUE_MENU_ITEMS.filter(item => navSettings.visibleMenuItems.includes(item.label));
    }
    return defaultItems;
  }, [navSettings, isLoadingSettings, userProfile]);

  if (!hasAccess || isLoadingSettings) {
    return (
      <DashboardLayout pageTitle="Assessments" menuItems={menuItems}>
        <AssessmentsSkeleton />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Assessment Tools" menuItems={menuItems}>
      <Tabs defaultValue="submissions">
        <TabsList className="grid w-full grid-cols-2 max-w-lg">
          <TabsTrigger value="submissions">Candidate Submissions</TabsTrigger>
          <TabsTrigger value="management">Assessment Builder</TabsTrigger>
        </TabsList>
        <TabsContent value="submissions" className="mt-6">
          <AssessmentSubmissionsClient />
        </TabsContent>
        <TabsContent value="management" className="mt-6">
          <AssessmentManagementClient />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
