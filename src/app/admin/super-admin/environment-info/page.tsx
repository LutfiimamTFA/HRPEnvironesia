'use client';

import { useMemo } from 'react';
import { Server, Globe, FolderOpen, GitBranch, Cpu, Code2 } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MENU_CONFIG } from '@/lib/menu-config';
import { cn } from '@/lib/utils';

// Values readable from public env vars (NEXT_PUBLIC_*) or static at build time.
// Private keys and service account info are NEVER exposed here.
const ENV_ITEMS = [
  {
    icon: Cpu,
    label: 'Environment Mode',
    value: process.env.NODE_ENV ?? '—',
    desc: 'Runtime environment Next.js (development / production).',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    mono: true,
  },
  {
    icon: Globe,
    label: 'Firebase Project',
    value: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '—',
    desc: 'Project ID Firebase yang digunakan aplikasi ini.',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    mono: true,
  },
  {
    icon: Server,
    label: 'Vercel URL',
    value: process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL ?? '(lokal)',
    desc: 'URL deployment aktif di Vercel.',
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-100',
    mono: true,
  },
  {
    icon: GitBranch,
    label: 'Build Version',
    value: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'dev',
    desc: 'SHA commit Git dari build yang sedang berjalan.',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    mono: true,
  },
  {
    icon: FolderOpen,
    label: 'Google Drive Folder Aktif',
    value: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_ID ?? '(lihat server env)',
    desc: 'Folder ID Google Drive untuk menyimpan hasil backup. Nilai lengkap hanya tersedia di server.',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-100',
    mono: true,
  },
];

export default function EnvironmentInfoPage() {
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
    <DashboardLayout pageTitle="Environment Info" menuConfig={menuConfig}>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
            <Server className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Environment Info</h1>
              <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 text-[10px] font-semibold uppercase tracking-wide">
                Super Admin Only
              </Badge>
            </div>
            <p className="text-sm text-slate-500">
              Informasi environment aktif untuk debugging dan monitoring.
            </p>
          </div>
        </div>

        {/* Security note */}
        <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <Code2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-sm text-slate-600">
            Halaman ini hanya menampilkan variabel <code className="rounded bg-white px-1 text-[12px] border border-slate-200">NEXT_PUBLIC_*</code> yang
            sudah aman untuk ditampilkan di client. Private key, service account, client secret, dan refresh token
            tidak pernah dikirim ke browser.
          </p>
        </div>

        {/* Env cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ENV_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <Card key={item.label} className={cn('border shadow-sm', item.border)}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', item.bg)}>
                      <Icon className={cn('h-4 w-4', item.color)} />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className={cn(
                      'break-all text-sm font-medium text-slate-800',
                      item.mono && 'font-mono text-[13px]',
                    )}>
                      {item.value || <span className="text-slate-400 italic">tidak terset</span>}
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{item.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-xs text-slate-400">
          Variabel server-only (GOOGLE_CLIENT_SECRET, FIREBASE_PRIVATE_KEY, dll) tidak pernah ditampilkan di sini.
        </p>
      </div>
    </DashboardLayout>
  );
}
