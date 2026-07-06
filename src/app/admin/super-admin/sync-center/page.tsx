'use client';

import { useMemo, useState } from 'react';
import {
  RefreshCw, ShieldCheck, Menu, ToggleLeft, Wrench, Settings, BarChart3, Trash2, Hammer,
  Clock, Search, Hammer as FixIcon, History, AlertTriangle, CheckCircle2, XCircle, Loader2, Info, ShieldOff,
} from 'lucide-react';
import { collection, orderBy, query, where, limit as fbLimit } from 'firebase/firestore';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth as useFirebaseAuth, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MENU_CONFIG } from '@/lib/menu-config';
import { cn } from '@/lib/utils';

type SyncKey =
  | 'role-access'
  | 'menu-settings'
  | 'feature-flags'
  | 'maintenance-config'
  | 'system-settings'
  | 'analytics-config'
  | 'clear-stale-sessions'
  | 'repair-technical-config';

type RiskLevel = 'low' | 'medium' | 'high';

interface SyncIssue {
  id: string;
  entityName: string;
  issueType: string;
  currentValue: string;
  masterValue: string;
  sourceCollection: string;
  targetCollection: string;
  action: string;
  resultMessage?: string;
  title?: string;
  explanation?: string;
  impact?: string;
}

interface SyncRunResult {
  syncType: SyncKey;
  dryRun: boolean;
  status: 'completed' | 'failed';
  totalChecked: number;
  totalIssues: number;
  totalFixed: number;
  sourceCollection: string;
  targetCollection: string;
  issues: SyncIssue[];
  errors: string[];
  truncated: boolean;
}

const RISK_META: Record<RiskLevel, { label: string; explanation: string; cls: string }> = {
  low: {
    label: 'Risiko Rendah',
    explanation: 'Hanya membersihkan atau melengkapi config teknis. Tidak menyentuh data HRD.',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  medium: {
    label: 'Risiko Sedang',
    explanation: 'Mengubah pengaturan teknis yang bisa memengaruhi tampilan/menu sistem.',
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  high: {
    label: 'Risiko Tinggi',
    explanation: 'Dapat memengaruhi akses fitur sistem. Wajib konfirmasi sebelum dijalankan.',
    cls: 'bg-red-50 text-red-700 border-red-200',
  },
};

const SYNC_TASKS: {
  key: SyncKey;
  icon: typeof ShieldCheck;
  title: string;
  desc: string;
  scope: string;
  risk: RiskLevel;
  /** Grammar helper for the post-run summary sentence, e.g. "config" vs "sesi online lama". */
  unitLabel: string;
  color: string; bg: string; border: string;
}[] = [
  {
    key: 'role-access',
    icon: ShieldCheck,
    title: 'Perbaiki Akses Role Teknis',
    desc: 'Mengecek apakah akses teknis Super Admin, HRD, dan role lain sudah terbaca dengan benar oleh sistem.',
    scope: 'users → roles_admin, roles_hrd',
    risk: 'low',
    unitLabel: 'akses role',
    color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100',
  },
  {
    key: 'menu-settings',
    icon: Menu,
    title: 'Perbaiki Config Menu Sidebar',
    desc: 'Mengecek apakah pengaturan menu/sidebar setiap role sudah tersedia dan tidak rusak.',
    scope: 'navigation_settings (laporan saja)',
    risk: 'low',
    unitLabel: 'config menu',
    color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-100',
  },
  {
    key: 'feature-flags',
    icon: ToggleLeft,
    title: 'Perbaiki Config Feature Control',
    desc: 'Mengecek apakah saklar fitur website sudah tersedia, seperti Candidate Portal, Offering Letter, Backup, dan Maintenance Lock.',
    scope: 'system_settings/features',
    risk: 'high',
    unitLabel: 'saklar fitur',
    color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100',
  },
  {
    key: 'maintenance-config',
    icon: Wrench,
    title: 'Perbaiki Config Maintenance',
    desc: 'Mengecek apakah pengaturan Maintenance Control sudah lengkap agar sistem bisa mengunci role/modul dengan benar saat dibutuhkan.',
    scope: 'system_maintenance',
    risk: 'high',
    unitLabel: 'config maintenance',
    color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100',
  },
  {
    key: 'system-settings',
    icon: Settings,
    title: 'Perbaiki Pengaturan Sistem',
    desc: 'Mengecek pengaturan teknis dasar seperti session security, menu visibility, backup export, dan fitur sistem.',
    scope: 'system_settings',
    risk: 'medium',
    unitLabel: 'pengaturan sistem',
    color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200',
  },
  {
    key: 'analytics-config',
    icon: BarChart3,
    title: 'Perbaiki Config Analytics',
    desc: 'Mengecek konfigurasi teknis Analytics Sistem agar data user online, event, dan laporan test tidak rusak.',
    scope: 'analytics (laporan saja)',
    risk: 'low',
    unitLabel: 'data analytics',
    color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100',
  },
  {
    key: 'clear-stale-sessions',
    icon: Trash2,
    title: 'Bersihkan Sesi Online Lama',
    desc: 'Menghapus data user online yang sudah basi agar Analytics tidak salah membaca user yang sebenarnya sudah tidak aktif.',
    scope: 'online_sessions',
    risk: 'low',
    unitLabel: 'sesi online lama',
    color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100',
  },
  {
    key: 'repair-technical-config',
    icon: Hammer,
    title: 'Lengkapi Config Teknis yang Hilang',
    desc: 'Membuat dokumen konfigurasi teknis yang belum ada, tetapi tetap dalam status aman dan nonaktif jika belum digunakan.',
    scope: 'system_settings, system_maintenance',
    risk: 'medium',
    unitLabel: 'config teknis',
    color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100',
  },
];

function formatDateTime(ts: any): string | null {
  if (!ts) return null;
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d?.getTime?.())) return null;
  return d.toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  }) + ' WIB';
}

type CardStatus = 'idle' | 'issues_found' | 'running' | 'fixed' | 'clean';

function SyncTaskCard({ task }: { task: (typeof SYNC_TASKS)[number] }) {
  const firestore = useFirestore();
  const auth = useFirebaseAuth();
  const { toast } = useToast();
  const [preview, setPreview] = useState<SyncRunResult | null>(null);
  const [lastResult, setLastResult] = useState<SyncRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runningFix, setRunningFix] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const lastRunQuery = useMemoFirebase(
    () => query(collection(firestore, 'sync_logs'), where('syncType', '==', task.key), orderBy('startedAt', 'desc'), fbLimit(1)),
    [firestore, task.key],
  );
  const { data: lastRuns } = useCollection<any>(lastRunQuery);
  const lastRun = lastRuns?.[0];

  const historyQuery = useMemoFirebase(
    () => query(collection(firestore, 'sync_logs'), where('syncType', '==', task.key), orderBy('startedAt', 'desc'), fbLimit(20)),
    [firestore, task.key],
  );
  const { data: history } = useCollection<any>(historyQuery);

  const callSync = async (dryRun: boolean): Promise<SyncRunResult | null> => {
    const user = auth.currentUser;
    if (!user) return null;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/sync/${task.key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message ?? 'Perbaikan gagal dijalankan. Coba ulangi atau cek Firestore Rules/API server.');
    return data as SyncRunResult;
  };

  const handlePreview = async () => {
    setRunning(true);
    setLastResult(null);
    try {
      const result = await callSync(true);
      setPreview(result);
      toast({
        title: result && result.totalIssues > 0 ? `${result.totalIssues} masalah teknis ditemukan` : 'Tidak ada masalah teknis yang perlu diperbaiki',
        description: 'Cek ini hanya mencari masalah. Belum ada data yang diubah.',
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Perbaikan gagal dijalankan', description: err?.message ?? 'Coba ulangi atau cek Firestore Rules/API server.' });
    } finally {
      setRunning(false);
    }
  };

  const handleRun = async () => {
    setConfirmOpen(false);
    setRunningFix(true);
    try {
      const result = await callSync(false);
      setLastResult(result);
      setPreview(null);
      setDetailOpen(true);
      toast({
        title: result && result.totalFixed > 0
          ? `Perbaikan teknis selesai. ${result.totalFixed} ${task.unitLabel} berhasil diperbaiki.`
          : 'Tidak ada masalah teknis yang perlu diperbaiki.',
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Perbaikan gagal dijalankan', description: err?.message ?? 'Coba ulangi atau cek Firestore Rules/API server.' });
    } finally {
      setRunningFix(false);
    }
  };

  const hasPreviewed = !!preview;
  const canRun = hasPreviewed && preview.totalIssues > 0 && !running && !runningFix;

  const cardStatus: CardStatus = runningFix
    ? 'running'
    : lastResult
      ? (lastResult.totalFixed > 0 ? 'fixed' : 'clean')
      : preview
        ? (preview.totalIssues > 0 ? 'issues_found' : 'clean')
        : 'idle';

  const statusMeta: Record<CardStatus, { label: string; cls: string }> = {
    idle: { label: 'Belum dicek', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
    issues_found: { label: 'Menunggu perbaikan', cls: 'bg-red-50 text-red-700 border-red-200' },
    running: { label: 'Sedang memperbaiki', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    fixed: { label: 'Berhasil diperbaiki', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    clean: { label: 'Tidak ada masalah', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  };

  const displayed = preview ?? lastResult;
  const Icon = task.icon;
  const riskMeta = RISK_META[task.risk];

  return (
    <>
      <Card className={cn('border shadow-sm', task.border)}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', task.bg)}>
              <Icon className={cn('h-4 w-4', task.color)} />
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline" className={cn('text-[10px] font-semibold shrink-0', statusMeta[cardStatus].cls)}>
                {statusMeta[cardStatus].label}
              </Badge>
              <Badge variant="outline" title={riskMeta.explanation} className={cn('text-[9px] font-medium shrink-0', riskMeta.cls)}>
                {riskMeta.label}
              </Badge>
            </div>
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-800">{task.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{task.desc}</p>
          <p className="mt-2 text-[10px] font-medium text-slate-400">Cakupan: {task.scope}</p>

          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2.5 text-[11px]">
            <div>
              <p className="text-slate-400">Terakhir diperbaiki</p>
              <p className="font-medium text-slate-700">{lastRun ? (formatDateTime(lastRun.finishedAt) ?? '-') : 'Belum pernah'}</p>
            </div>
            <div>
              <p className="text-slate-400">Masalah / Diperbaiki</p>
              <p className="font-medium text-slate-700">{lastRun ? `${lastRun.totalIssues} / ${lastRun.totalFixed}` : '-'}</p>
            </div>
          </div>

          {displayed && (
            <div className="mt-3 space-y-2">
              <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {displayed.dryRun
                  ? 'Preview hanya menampilkan masalah teknis. Belum ada data yang diubah.'
                  : displayed.totalFixed > 0
                    ? `Perbaikan teknis selesai. ${displayed.totalFixed} ${task.unitLabel} berhasil diperbaiki.`
                    : 'Tidak ada masalah teknis yang perlu diperbaiki.'}
              </p>

              {displayed.issues.length === 0 ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-700">
                  Tidak ada masalah teknis yang perlu diperbaiki.
                </p>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {displayed.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className={cn(
                        'rounded-lg border p-2.5 text-[11px]',
                        issue.resultMessage ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50',
                      )}
                    >
                      <p className="font-semibold text-slate-800">{issue.title ?? issue.entityName}</p>
                      {issue.explanation && <p className="mt-1 text-slate-600">{issue.explanation}</p>}
                      <p className="mt-1.5">
                        <span className="font-medium text-slate-500">Yang Akan Dilakukan: </span>
                        <span className="text-slate-700">{issue.action}</span>
                      </p>
                      {issue.impact && (
                        <p className="mt-1">
                          <span className="font-medium text-slate-500">Dampak: </span>
                          <span className="text-slate-700">{issue.impact}</span>
                        </p>
                      )}
                      <p className={cn('mt-1.5 font-semibold', issue.resultMessage ? 'text-emerald-700' : 'text-red-600')}>
                        {issue.resultMessage ? `✓ ${issue.resultMessage}` : 'Status: Menunggu perbaikan'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {displayed.truncated && (
                <p className="flex items-center gap-1 text-[11px] text-amber-700">
                  <AlertTriangle className="h-3 w-3" /> Data dibatasi per-run, jalankan ulang untuk melanjutkan.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" onClick={handlePreview} disabled={running || runningFix} className="flex-1 gap-1.5 text-xs">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Cek Masalah Teknis
            </Button>
            <Button
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={!canRun}
              title="Tombol ini hanya memperbaiki konfigurasi teknis website yang muncul di hasil cek."
              className="flex-1 gap-1.5 text-xs bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {runningFix ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FixIcon className="h-3.5 w-3.5" />}
              {runningFix ? 'Memperbaiki...' : hasPreviewed ? 'Perbaiki Config Teknis' : 'Cek Masalah Teknis dulu'}
            </Button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-slate-400">
            Cek ini hanya mencari masalah, belum ada data yang diubah. Perbaikan hanya berlaku untuk config teknis yang tampil di hasil cek.
          </p>
          <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)} className="mt-1 w-full gap-1.5 text-xs text-slate-500">
            <History className="h-3.5 w-3.5" /> Lihat Riwayat Perbaikan
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Perbaiki Config Teknis?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <p>
                  Sistem akan memperbaiki konfigurasi teknis website berdasarkan hasil pengecekan. Proses ini{' '}
                  <strong>tidak akan mengubah data HRD</strong> seperti data karyawan, kandidat, approval, payroll,
                  kontrak, atau keputusan SDM.
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs">
                  <span className="text-slate-500">Total dicek</span><span className="font-medium text-slate-800">{preview?.totalChecked} data</span>
                  <span className="text-slate-500">Masalah teknis ditemukan</span><span className="font-medium text-slate-800">{preview?.totalIssues} data</span>
                  <span className="text-slate-500">Config teknis yang akan diperbaiki</span><span className="font-medium text-slate-800">{preview?.totalIssues} data</span>
                  <span className="text-slate-500">Data HRD</span><span className="font-medium text-emerald-700">Tidak akan diubah</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-emerald-600 hover:bg-emerald-700" onClick={handleRun}>
              Ya, Perbaiki Config Teknis
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {lastResult && lastResult.totalFixed > 0
                ? `Perbaikan teknis selesai. ${lastResult.totalFixed} ${task.unitLabel} berhasil diperbaiki.`
                : 'Tidak ada masalah teknis yang perlu diperbaiki.'}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {lastResult?.issues.map((issue) => (
              <p key={issue.id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
                <span className="font-semibold">{issue.title ?? issue.entityName}</span>: {issue.resultMessage ?? issue.action}
              </p>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Riwayat Perbaikan — {task.title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {(!history || history.length === 0) && <p className="text-sm text-slate-400">Belum ada riwayat.</p>}
            {history?.map((log) => (
              <div key={log.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
                <div className="flex items-center gap-1.5">
                  {log.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                  <span className="font-medium">{log.dryRun ? 'Cek Masalah Teknis' : 'Perbaiki Config Teknis'}</span>
                  <span className="text-slate-400">— {formatDateTime(log.finishedAt) ?? formatDateTime(log.startedAt)}</span>
                </div>
                <p className="mt-1 text-slate-500">
                  {log.totalChecked} dicek · {log.totalIssues} masalah · {log.totalFixed} diperbaiki · oleh {log.executedByName ?? '-'}
                </p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const NOT_TOUCHED_ITEMS = [
  'Nama karyawan', 'Email karyawan', 'Status kandidat', 'Hasil interview',
  'Approval cuti/izin/lembur/dinas', 'Payroll', 'Kontrak', 'Dokumen HRD', 'Keputusan SDM',
];

const WHEN_TO_USE_ITEMS = [
  'Menu/sidebar tidak sinkron',
  'Feature Control belum terkonfigurasi',
  'Maintenance config tidak lengkap',
  'Analytics user online tidak akurat',
  'Sesi lama masih terbaca online',
  'Config sistem hilang',
  'Backup/export setting belum tersedia',
];

const WHEN_NOT_TO_USE_ITEMS = [
  'Membetulkan data karyawan',
  'Mengganti status kandidat',
  'Mengubah approval',
  'Mengubah keputusan HRD',
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
    <DashboardLayout pageTitle="Technical Sync Center" menuConfig={menuConfig}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
            <RefreshCw className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Technical Sync Center</h1>
              <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 text-[10px] font-semibold uppercase tracking-wide">
                Super Admin Only
              </Badge>
            </div>
            <p className="text-sm text-slate-500">
              Alat bantu Super Admin untuk mengecek dan memperbaiki konfigurasi teknis website. Tidak digunakan untuk
              mengubah data HRD/SDM.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm font-medium text-red-700">
            Technical Sync Center hanya untuk perbaikan teknis website. Data karyawan, kandidat, approval, payroll,
            kontrak, dan keputusan SDM tetap menjadi kewenangan HRD.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-700">
            Klik <strong>Cek Masalah Teknis</strong> dulu untuk melihat masalah yang ditemukan — belum ada yang
            diubah. Setelah itu <strong>Perbaiki Config Teknis</strong> baru bisa diklik. Maksimal 400 dokumen
            diproses per klik untuk menjaga kuota Firestore.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SYNC_TASKS.map((task) => <SyncTaskCard key={task.key} task={task} />)}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card className="border-red-100">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <ShieldOff className="h-4 w-4 text-red-500" />
                <p className="text-sm font-semibold text-slate-800">Apa yang tidak disentuh oleh fitur ini</p>
              </div>
              <p className="mt-1 text-xs text-slate-500">Technical Sync Center tidak mengubah:</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {NOT_TOUCHED_ITEMS.map((item) => (
                  <li key={item} className="flex items-start gap-1.5"><span className="text-red-400">✕</span> {item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-emerald-100">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-emerald-500" />
                <p className="text-sm font-semibold text-slate-800">Kapan fitur ini digunakan?</p>
              </div>
              <p className="mt-2 text-xs font-medium text-slate-500">Gunakan Technical Sync Center jika:</p>
              <ul className="mt-1 space-y-1 text-xs text-slate-600">
                {WHEN_TO_USE_ITEMS.map((item) => (
                  <li key={item} className="flex items-start gap-1.5"><span className="text-emerald-500">✓</span> {item}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs font-medium text-slate-500">Jangan gunakan untuk:</p>
              <ul className="mt-1 space-y-1 text-xs text-slate-600">
                {WHEN_NOT_TO_USE_ITEMS.map((item) => (
                  <li key={item} className="flex items-start gap-1.5"><span className="text-red-400">✕</span> {item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-sm text-slate-600">
            Ditemukan indikasi data HRD tidak sinkron? Technical Sync Center tidak menyediakan tombol perbaikan untuk
            data karyawan, kandidat, approval, atau keputusan SDM. Minta HRD melakukan validasi melalui menu HRD.
          </p>
        </div>

        <p className="text-center text-xs text-slate-400">
          Perbaikan berjalan via API route server-side — tidak ada operasi langsung dari client ke Firestore Admin SDK.
        </p>
      </div>
    </DashboardLayout>
  );
}
