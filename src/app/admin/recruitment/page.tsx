'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { RecruitmentDashboardClient } from '@/components/recruitment/RecruitmentDashboardClient';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { MENU_CONFIG } from '@/lib/menu-config';
import { useAuth } from '@/providers/auth-provider';

export default function RecruitmentPage() {
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);
  const { userProfile } = useAuth();
  
  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile.role === 'hrd') return MENU_CONFIG['hrd'];
    return [];
  }, [userProfile]);

  if (!hasAccess) {
    return (
      <DashboardLayout pageTitle="Recruitment" menuConfig={[]}>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
        pageTitle="Recruitment" 
        menuConfig={menuConfig}
    >
      <RecruitmentDashboardClient />
    </DashboardLayout>
  );
}
