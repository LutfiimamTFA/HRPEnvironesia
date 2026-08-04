'use client';
import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { PengajuanLemburClient } from '@/components/dashboard/karyawan/PengajuanLemburClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Timer } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function PengajuanLemburPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['karyawan', 'manager', 'hrd', 'super-admin']);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.role === 'hrd') return MENU_CONFIG['hrd'] || [];
    if (userProfile.employmentType === 'magang') return MENU_CONFIG['karyawan-magang'];
    if (userProfile.employmentType === 'training') return MENU_CONFIG['karyawan-training'];
    return MENU_CONFIG['karyawan'];
  }, [userProfile]);

  if (!hasAccess) {
    return <DashboardLayout pageTitle="Pengajuan Lembur" menuConfig={menuConfig}><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  // HRD is not allowed to submit overtime
  if (userProfile?.role === 'hrd') {
    return (
      <DashboardLayout pageTitle="Pengajuan Lembur" menuConfig={menuConfig}>
        <div className="mx-auto mt-10 max-w-lg">
          <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 bg-slate-50 py-8 text-center dark:border-slate-800 dark:bg-slate-900/50">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <Timer className="h-7 w-7 text-slate-400 dark:text-slate-500" />
              </div>
              <CardTitle className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                Fitur Tidak Tersedia
              </CardTitle>
            </CardHeader>
            <CardContent className="px-8 py-6 text-center">
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                Role <span className="font-semibold text-slate-700 dark:text-slate-300">HRD</span> tidak menggunakan pengajuan lembur.
                Jika Anda perlu mengajukan izin atau cuti, gunakan menu yang tersedia.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/karyawan/pengajuan-izin">Pengajuan Izin</Link>
                </Button>
                <Button asChild size="sm" className="bg-teal-500 hover:bg-teal-600 text-white">
                  <Link href="/admin/karyawan/pengajuan-cuti">Pengajuan Cuti</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Pengajuan Lembur" menuConfig={menuConfig}>
      <PengajuanLemburClient />
    </DashboardLayout>
  );
}
