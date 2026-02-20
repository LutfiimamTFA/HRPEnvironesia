'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { JobManagementClient } from '@/components/dashboard/JobManagementClient';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { useHrdMode } from '@/hooks/useHrdMode';

export default function JobsPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['super-admin', 'hrd']);
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
        pageTitle="Job Postings" 
        menuConfig={menuConfig}
        hrdMode={userProfile?.role === 'hrd' ? mode : undefined}
        onHrdModeChange={userProfile?.role === 'hrd' ? setMode : undefined}
      >
        <div className="space-y-4">
          <Skeleton className="h-10 w-1/4 self-end" />
          <Skeleton className="h-48 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
        pageTitle="Job Postings" 
        menuConfig={menuConfig}
        hrdMode={userProfile?.role === 'hrd' ? mode : undefined}
        onHrdModeChange={userProfile?.role === 'hrd' ? setMode : undefined}
    >
      <JobManagementClient />
    </DashboardLayout>
  );
}
