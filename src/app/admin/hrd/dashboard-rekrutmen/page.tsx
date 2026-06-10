'use client';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { RecruitmentDashboardClient } from '@/components/recruitment/RecruitmentDashboardClient';

export default function HrdRekrutmenDashboardPage() {
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);

  if (!hasAccess) {
    return <DashboardLayout pageTitle="Dashboard"><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  return (
    <DashboardLayout pageTitle="Dashboard Rekrutmen">
      <RecruitmentDashboardClient />
    </DashboardLayout>
  );
}
