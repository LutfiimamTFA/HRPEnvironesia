'use client';

import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { JobManagementClient } from '@/components/dashboard/JobManagementClient';


export default function HrdDashboard() {
  const hasAccess = useRoleGuard('hrd');
  const [mode, setMode] = useState<'recruitment' | 'employees'>('recruitment');

  const menuConfig = useMemo(() => {
    return mode === 'recruitment' ? MENU_CONFIG['hrd-recruitment'] : MENU_CONFIG['hrd-employees'];
  }, [mode]);

  const pageTitle = mode === 'recruitment' ? 'Recruitment Dashboard' : 'Employee Dashboard';

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout 
      pageTitle={pageTitle} 
      menuConfig={menuConfig}
      hrdMode={mode}
      onHrdModeChange={setMode}
    >
      {mode === 'recruitment' ? (
        <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Recruitment Overview</h2>
            {/* Placeholder for Recruitment content */}
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Open Positions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">12</div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">New Applicants</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">+23</div>
                    </CardContent>
                </Card>
            </div>
            <JobManagementClient />
        </div>
      ) : (
         <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Employee Overview</h2>
            {/* Placeholder for Employee content */}
            <Card>
                <CardHeader>
                    <CardTitle>Employee Directory</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Employee directory table goes here.</p>
                </CardContent>
            </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
