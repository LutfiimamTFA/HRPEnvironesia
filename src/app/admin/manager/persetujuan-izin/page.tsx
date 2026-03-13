'use client';
import { useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { PersetujuanIzinClient } from '@/components/dashboard/approvals/PersetujuanIzinClient';
import { useRouter } from 'next/navigation';

export default function PersetujuanIzinManagerPage() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();

  // Loosen the role guard to allow 'karyawan' role to access the page initially
  const hasAccess = useRoleGuard(['manager', 'karyawan']); 
  
  useEffect(() => {
    // Post-load check to ensure only authorized users stay
    if (!loading && userProfile) {
      const isManagerRole = userProfile.role === 'manager';
      const isDivisionManager = !!userProfile.isDivisionManager;
      
      if (!isManagerRole && !isDivisionManager) {
        router.replace('/admin');
      }
    }
  }, [loading, userProfile, router]);


  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.role === 'karyawan' && userProfile.isDivisionManager) {
        return MENU_CONFIG['karyawan'];
    }
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  // Render skeleton while access is being verified
  if (!hasAccess || loading) {
    return <DashboardLayout pageTitle="Persetujuan Izin" menuConfig={menuConfig}><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  // Final check before rendering content
  if (!userProfile || (!userProfile.isDivisionManager && userProfile.role !== 'manager')) {
      return <DashboardLayout pageTitle="Akses Ditolak" menuConfig={menuConfig}><p>Anda tidak memiliki izin untuk mengakses halaman ini.</p></DashboardLayout>;
  }

  return (
    <DashboardLayout pageTitle="Persetujuan Izin Tim" menuConfig={menuConfig}>
      <PersetujuanIzinClient mode="manager" />
    </DashboardLayout>
  );
}
