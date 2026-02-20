'use client';

import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Users, Briefcase, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';

export default function RecruitmentOverviewPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') return MENU_CONFIG['hrd-recruitment'];
    return [];
  }, [userProfile]);

  if (!hasAccess) {
    return (
      <DashboardLayout pageTitle="Recruitment Overview" menuConfig={menuConfig}>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Recruitment Overview" menuConfig={menuConfig}>
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Open Positions</CardTitle>
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">12</div>
                        <p className="text-xs text-muted-foreground">+2 from last month</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">New Applicants</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">+23</div>
                         <p className="text-xs text-muted-foreground">in the last 7 days</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Interviews Scheduled</CardTitle>
                         <UserCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">8</div>
                        <p className="text-xs text-muted-foreground">for this week</p>
                    </CardContent>
                </Card>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-4">
                    <Button asChild>
                        <Link href="/admin/jobs"><PlusCircle className="mr-2 h-4 w-4"/> Create New Job</Link>
                    </Button>
                    <Button asChild variant="outline">
                         <Link href="/admin/recruitment/pipeline"><Users className="mr-2 h-4 w-4"/> View Candidate Pipeline</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    </DashboardLayout>
  );
}
