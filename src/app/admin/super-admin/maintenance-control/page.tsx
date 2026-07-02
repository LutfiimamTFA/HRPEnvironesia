'use client';

import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { MaintenanceControlClient } from '@/components/dashboard/super-admin/MaintenanceControlClient';
import { Loader2, ShieldAlert } from 'lucide-react';

export default function MaintenanceControlPage() {
  const hasAccess = useRoleGuard('super-admin');

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Maintenance Control">
      <div className="space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
            <ShieldAlert className="h-4.5 w-4.5 text-amber-600" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-800">Maintenance Control</p>
            <p className="text-xs text-slate-400">
              Digunakan untuk mengunci akses role/modul yang sedang bermasalah. <span className="font-medium text-slate-500">Berbeda dengan Pengumuman Sistem</span>, yang hanya digunakan untuk menampilkan informasi, modal, atau banner kepada user.
            </p>
          </div>
        </div>
        <MaintenanceControlClient />
      </div>
    </DashboardLayout>
  );
}
