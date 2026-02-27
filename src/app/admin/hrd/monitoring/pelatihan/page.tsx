'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { GraduationCap } from 'lucide-react';

export default function PelatihanPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') return MENU_CONFIG['hrd'];
    return [];
  }, [userProfile]);
  
  if (!hasAccess) return null;

  return (
    <DashboardLayout pageTitle="Pengembangan SDM" menuConfig={menuConfig}>
      <Card>
        <CardHeader>
          <CardTitle>Pengembangan SDM</CardTitle>
          <CardDescription>Fitur ini sedang dalam pengembangan.</CardDescription>
        </CardHeader>
        <CardContent className="h-96 flex flex-col items-center justify-center text-center">
          <GraduationCap className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="font-semibold">Halaman Pelatihan & Pengembangan</p>
          <p className="text-sm text-muted-foreground">Pustaka video pelatihan dan ringkasan progres karyawan akan ditampilkan di sini.</p>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

    