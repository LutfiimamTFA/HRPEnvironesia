'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { DashboardKaryawanClient } from '@/components/dashboard/hrd/DashboardKaryawanClient';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { EmployeeProfile } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, UserCircle } from 'lucide-react';

export default function HrdKaryawanDashboardPage() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);

  const profileDocRef = useMemoFirebase(
    () => (userProfile?.uid ? doc(firestore, 'employee_profiles', userProfile.uid) : null),
    [userProfile?.uid, firestore]
  );
  const { data: employeeProfile, isLoading: profileLoading } = useDoc<EmployeeProfile>(profileDocRef);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') return MENU_CONFIG['hrd'];
    return [];
  }, [userProfile]);

  if (!hasAccess) {
    return <DashboardLayout pageTitle="Dashboard" menuConfig={menuConfig}><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  const isHrdProfileIncomplete =
    userProfile?.role === 'hrd' &&
    !profileLoading &&
    (!employeeProfile || !(employeeProfile as any)?.completeness?.isComplete);

  return (
    <DashboardLayout pageTitle="Dashboard Karyawan" menuConfig={menuConfig}>
      <div className="space-y-6">
        {isHrdProfileIncomplete && (
          <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="font-semibold text-amber-800 dark:text-amber-300">
              Data karyawan Anda belum lengkap
            </AlertTitle>
            <AlertDescription className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-amber-700 dark:text-amber-400">
                Lengkapi data diri agar absensi, izin, dan cuti dapat berjalan normal.
              </span>
              <Button asChild size="sm" className="shrink-0 gap-2 bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500">
                <Link href="/admin/karyawan/profile">
                  <UserCircle className="h-4 w-4" />
                  Lengkapi Data Saya
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <DashboardKaryawanClient />
      </div>
    </DashboardLayout>
  );
}
