'use client';

import { useMemo } from 'react';
import {
  ToggleLeft, Database, HardDrive, Users, Mail,
  FileText, Lock, Info,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MENU_CONFIG } from '@/lib/menu-config';
import { cn } from '@/lib/utils';

const FEATURES = [
  {
    icon: Database,
    title: 'Backup Otomatis',
    desc: 'Jalankan backup terjadwal secara otomatis ke Google Drive setiap hari.',
    risk: 'low',
    status: 'unknown',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
  },
  {
    icon: HardDrive,
    title: 'Google Drive Backup',
    desc: 'Aktifkan integrasi Google Drive untuk menyimpan hasil backup.',
    risk: 'low',
    status: 'unknown',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
  },
  {
    icon: Users,
    title: 'Candidate Portal',
    desc: 'Izinkan kandidat eksternal mendaftar dan melacak status lamaran via portal publik.',
    risk: 'medium',
    status: 'unknown',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-100',
  },
  {
    icon: Mail,
    title: 'Employee Invite',
    desc: 'Kirim undangan email ke karyawan baru agar bisa mengaktifkan akun HRP mereka.',
    risk: 'low',
    status: 'unknown',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
  },
  {
    icon: FileText,
    title: 'Offering Letter',
    desc: 'Aktifkan fitur generate dan pengiriman offering letter ke kandidat yang diterima.',
    risk: 'medium',
    status: 'unknown',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-100',
  },
  {
    icon: Lock,
    title: 'Maintenance Lock',
    desc: 'Kunci akses dashboard untuk role tertentu saat maintenance sistem berlangsung.',
    risk: 'high',
    status: 'unknown',
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-100',
  },
];

const RISK_BADGE: Record<string, { label: string; cls: string }> = {
  low:    { label: 'Risiko Rendah',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  medium: { label: 'Risiko Sedang',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  high:   { label: 'Risiko Tinggi',   cls: 'bg-red-50 text-red-700 border-red-200' },
};

export default function FeatureControlPage() {
  const hasAccess = useRoleGuard('super-admin');
  const menuConfig = useMemo(() => MENU_CONFIG['super-admin'] || [], []);

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Feature Control" menuConfig={menuConfig}>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
            <ToggleLeft className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Feature Control</h1>
              <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 text-[10px] font-semibold uppercase tracking-wide">
                Super Admin Only
              </Badge>
            </div>
            <p className="text-sm text-slate-500">
              Aktifkan atau nonaktifkan fitur utama HRP.
            </p>
          </div>
        </div>

        {/* Info */}
        <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-sm text-slate-600">
            Status fitur saat ini diambil dari <code className="rounded bg-slate-100 px-1 text-[12px]">system_settings/features</code>.
            Toggle aktif/nonaktif akan tersedia setelah konfigurasi Firestore collection tersebut selesai.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(feat => {
            const Icon = feat.icon;
            const riskBadge = RISK_BADGE[feat.risk];
            return (
              <Card key={feat.title} className={cn('border shadow-sm', feat.border)}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', feat.bg)}>
                      <Icon className={cn('h-4 w-4', feat.color)} />
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] font-semibold shrink-0', riskBadge.cls)}>
                      {riskBadge.label}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-800">{feat.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{feat.desc}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Status: Belum terkonfigurasi</span>
                    <div className="h-5 w-9 rounded-full border border-slate-200 bg-slate-100" title="Toggle belum aktif" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-xs text-slate-400">
          Perubahan fitur direkam di audit_logs. Fitur dengan risiko tinggi memerlukan konfirmasi dua langkah.
        </p>
      </div>
    </DashboardLayout>
  );
}
