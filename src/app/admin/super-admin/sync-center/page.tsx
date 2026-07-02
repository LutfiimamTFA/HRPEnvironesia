'use client';

import { useMemo } from 'react';
import {
  RefreshCw, ShieldCheck, User, Users, UserCheck,
  GitMerge, Clock,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MENU_CONFIG } from '@/lib/menu-config';
import { cn } from '@/lib/utils';

const SYNC_TASKS = [
  {
    icon: ShieldCheck,
    title: 'Sync Role User',
    desc: 'Sinkronkan custom claims Firebase Auth dengan field role di collection users.',
    scope: 'Firebase Auth + Firestore users',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    tag: 'Auth',
    tagCls: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    icon: User,
    title: 'Sync Employee Profile',
    desc: 'Pastikan setiap akun karyawan aktif memiliki dokumen employee_profiles yang lengkap.',
    scope: 'Firestore users → employee_profiles',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    tag: 'Firestore',
    tagCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    icon: Users,
    title: 'Sync Nama Karyawan',
    desc: 'Update field fullName di semua collection terkait agar konsisten dengan data master.',
    scope: 'users, employee_profiles, audit_logs',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-100',
    tag: 'Multi-collection',
    tagCls: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    icon: UserCheck,
    title: 'Sync Status Kandidat',
    desc: 'Selaraskan status kandidat antara collection candidates dan applications.',
    scope: 'candidates + applications',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    tag: 'Rekrutmen',
    tagCls: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    icon: GitMerge,
    title: 'Sync Approval Flow',
    desc: 'Pastikan rantai approver (manager, HRD) di semua pengajuan masih valid dan tidak menunjuk ke akun yang sudah dihapus.',
    scope: 'leaves, permissions, overtimes',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-100',
    tag: 'Approval',
    tagCls: 'bg-orange-50 text-orange-700 border-orange-200',
  },
];

export default function SyncCenterPage() {
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
    <DashboardLayout pageTitle="Sync Center" menuConfig={menuConfig}>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
            <RefreshCw className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Sync Center</h1>
              <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 text-[10px] font-semibold uppercase tracking-wide">
                Super Admin Only
              </Badge>
            </div>
            <p className="text-sm text-slate-500">
              Jalankan sinkronisasi data sistem secara aman.
            </p>
          </div>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-700">
            Semua operasi sync berjalan secara read-then-write dengan konfirmasi eksplisit. Tidak ada data yang diubah
            tanpa tombol "Jalankan Sync" diklik. Fitur eksekusi akan diaktifkan setelah testing selesai.
          </p>
        </div>

        {/* Sync task cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SYNC_TASKS.map(task => {
            const Icon = task.icon;
            return (
              <Card key={task.title} className={cn('border shadow-sm', task.border)}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', task.bg)}>
                      <Icon className={cn('h-4 w-4', task.color)} />
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] font-semibold shrink-0', task.tagCls)}>
                      {task.tag}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-800">{task.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{task.desc}</p>
                  <p className="mt-2 text-[10px] font-medium text-slate-400">Scope: {task.scope}</p>
                  <div className="mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      className="w-full border-slate-200 text-slate-400 text-xs"
                    >
                      Belum Tersedia
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-xs text-slate-400">
          Sync otomatis berjalan via API route server-side — tidak ada operasi langsung dari client ke Firestore Admin SDK.
        </p>
      </div>
    </DashboardLayout>
  );
}
