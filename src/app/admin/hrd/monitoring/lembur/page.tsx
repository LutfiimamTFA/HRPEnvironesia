'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Timer } from 'lucide-react';

export default function LemburPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') return MENU_CONFIG['hrd'];
    return [];
  }, [userProfile]);
  
  if (!hasAccess) return null;

  return (
    <DashboardLayout pageTitle="Monitoring Lembur" menuConfig={menuConfig}>
      <Card>
        <CardHeader>
          <CardTitle>Monitoring Lembur</CardTitle>
          <CardDescription>Fitur ini sedang dalam pengembangan.</CardDescription>
        </CardHeader>
        <CardContent className="h-96 flex flex-col items-center justify-center text-center">
          <Timer className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="font-semibold">Halaman Monitoring Lembur</p>
          <p className="text-sm text-muted-foreground">Fungsionalitas untuk filter bulan, tabel rekapitulasi, dan peringkat lembur akan ada di sini.</p>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

    