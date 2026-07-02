'use client';

import { useMemo } from 'react';
import {
  HardDrive, FolderOpen, FileText, Mail, Paperclip,
  Trash2, AlertCircle,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MENU_CONFIG } from '@/lib/menu-config';
import { cn } from '@/lib/utils';

const STORAGE_ITEMS = [
  {
    icon: FolderOpen,
    title: 'Folder Backup Drive',
    desc: 'Daftar folder backup di Google Drive — verifikasi keberadaan folder dan akses service account.',
    source: 'Google Drive API',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    tagCls: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    icon: FileText,
    title: 'Dokumen Kandidat',
    desc: 'File CV, portofolio, dan lampiran kandidat yang tersimpan di Firebase Storage atau Drive.',
    source: 'Firebase Storage',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-100',
    tagCls: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    icon: Mail,
    title: 'Offering Letter',
    desc: 'File offering letter yang sudah digenerate dan dikirim ke kandidat.',
    source: 'Firebase Storage',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    tagCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    icon: Paperclip,
    title: 'Attachment Sistem',
    desc: 'Lampiran dari pengajuan cuti, izin, lembur, dan perjalanan dinas.',
    source: 'Firebase Storage',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    tagCls: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    icon: Trash2,
    title: 'File Orphan',
    desc: 'File di Storage yang tidak lagi memiliki referensi di Firestore — kandidat untuk pembersihan.',
    source: 'Firebase Storage + Firestore',
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-100',
    tagCls: 'bg-red-50 text-red-700 border-red-200',
  },
];

export default function StorageManagementPage() {
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
    <DashboardLayout pageTitle="Storage Management" menuConfig={menuConfig}>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
            <HardDrive className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Storage Management</h1>
              <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 text-[10px] font-semibold uppercase tracking-wide">
                Super Admin Only
              </Badge>
            </div>
            <p className="text-sm text-slate-500">
              Kelola status file, folder backup, dokumen kandidat, dan attachment sistem.
            </p>
          </div>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-700">
            Operasi hapus file bersifat permanen dan tidak dapat dibatalkan. Semua tindakan hapus memerlukan konfirmasi
            eksplisit dan dicatat di audit_logs. Fitur penghapusan akan diaktifkan setelah review keamanan.
          </p>
        </div>

        {/* Storage category cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STORAGE_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className={cn('border shadow-sm', item.border)}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', item.bg)}>
                      <Icon className={cn('h-4 w-4', item.color)} />
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] font-semibold shrink-0', item.tagCls)}>
                      {item.source}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-800">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.desc}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Ukuran: Belum dimuat</span>
                    <span className="text-[11px] text-slate-300">—</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-xs text-slate-400">
          Data ukuran storage dimuat via API route — tidak ada akses Firebase Admin SDK dari browser.
        </p>
      </div>
    </DashboardLayout>
  );
}
