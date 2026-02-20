'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AssessmentSubmissionsClient } from '@/components/dashboard/AssessmentSubmissionsClient';
import { AssessmentManagementClient } from '@/components/dashboard/AssessmentManagementClient';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useHrdMode } from '@/hooks/useHrdMode';

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
  const { mode, setMode } = useHrdMode();
  
  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') {
        return mode === 'recruitment' ? MENU_CONFIG['hrd-recruitment'] : MENU_CONFIG['hrd-employees'];
    }
    return [];
  }, [userProfile, mode]);

  if (!hasAccess) {
    return (
      <DashboardLayout 
        pageTitle="Assessments" 
        menuConfig={menuConfig}
        hrdMode={userProfile?.role === 'hrd' ? mode : undefined}
        onHrdModeChange={userProfile?.role === 'hrd' ? setMode : undefined}
      >
        <AssessmentsSkeleton />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
        pageTitle="Assessment Tools" 
        menuConfig={menuConfig}
        hrdMode={userProfile?.role === 'hrd' ? mode : undefined}
        onHrdModeChange={userProfile?.role === 'hrd' ? setMode : undefined}
    >
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
