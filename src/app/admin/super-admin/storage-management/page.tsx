'use client';

import { useMemo, useState } from 'react';
import {
  HardDrive, FolderOpen, FileText, Mail, Paperclip, Image as ImageIcon,
  Unlink, AlertCircle, Cloud, Database, RefreshCw, Loader2, CheckCircle2,
  XCircle, PlugZap, Info, ScanSearch, Clock, Check,
} from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth as useFirebaseAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MENU_CONFIG } from '@/lib/menu-config';
import { cn } from '@/lib/utils';

type StorageCategoryKey =
  | 'backup_export' | 'candidate_documents' | 'offering_letter'
  | 'submission_attachments' | 'employee_documents' | 'profile_photos';

const CATEGORY_META: Record<StorageCategoryKey, { icon: typeof FolderOpen; color: string; bg: string; border: string }> = {
  backup_export: { icon: FolderOpen, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
  candidate_documents: { icon: FileText, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
  offering_letter: { icon: Mail, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  submission_attachments: { icon: Paperclip, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  employee_documents: { icon: Database, color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
  profile_photos: { icon: ImageIcon, color: 'text-pink-600', bg: 'bg-pink-50', border: 'border-pink-100' },
};

const SCAN_STEPS = [
  'Mengecek provider aktif',
  'Membaca folder Google Drive',
  'Membaca Firebase Storage',
  'Mengelompokkan kategori file',
  'Mengecek file tidak terhubung',
  'Menyimpan hasil scan',
];

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDateTime(value: any): string {
  if (!value) return '-';
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d?.getTime?.())) return '-';
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';
}

interface OverviewData {
  scanned: boolean;
  scanId?: string;
  activeProvider: 'google_drive' | 'firebase_storage';
  activeProviderLabel?: string;
  totalFiles?: number;
  totalSizeBytes?: number;
  orphanFilesCount?: number;
  issuesCount?: number;
  categories?: { key: StorageCategoryKey; label: string; count: number; size: number }[];
  storageStatus?: 'perlu_perhatian' | 'sehat';
  lastSyncedAt?: any;
  syncedByName?: string | null;
  providersScanned?: string[];
  lastScanStatus?: 'berhasil' | 'sebagian_gagal' | null;
  connectionStatus?: 'connected' | 'not_connected' | 'not_tested' | 'error';
  connectionStatusText?: string;
  lastConnectionTestAt?: any;
}

interface HealthIssue {
  id: string;
  title: string;
  explanation: string;
  impact: string;
  severity: 'warning' | 'critical';
}

interface ProviderDetail {
  status: 'connected' | 'not_connected' | 'not_tested' | 'error';
  connectedEmail?: string | null;
  folderId?: string | null;
  folderName?: string | null;
  bucketName?: string | null;
  canRead?: boolean;
  canUpload?: boolean;
  lastTestedAt?: any;
  lastError?: string | null;
}

interface ProviderStatusData {
  activeProvider: 'google_drive' | 'firebase_storage';
  googleDrive: ProviderDetail;
  firebaseStorage: ProviderDetail;
}

interface DetailFile {
  name: string;
  category: string;
  categoryLabel: string;
  provider: string;
  path: string;
  usedFor: string;
  linkedTo: string | null;
  size: number;
  uploadedAt: any;
  referenced: boolean;
  note: string;
}

function useAuthedFetch() {
  const auth = useFirebaseAuth();
  return async (path: string, method: 'GET' | 'POST' = 'GET', body?: any) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Sesi tidak ditemukan, silakan login ulang.');
    const token = await user.getIdToken();
    const res = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message ?? 'Permintaan gagal.');
    return data;
  };
}

const RECONNECT_REASONS = ['Token Google Drive belum tersedia', 'Refresh token tidak valid, hubungkan ulang Google Drive'];

function providerLabel(p: string) {
  return p === 'google_drive' ? 'Google Drive' : 'Firebase Storage';
}

function DetailDialog({ open, onOpenChange, scanId, categoryKey, label, authedFetch }: {
  open: boolean; onOpenChange: (v: boolean) => void; scanId: string; categoryKey: string; label: string;
  authedFetch: (path: string, method?: 'GET' | 'POST', body?: any) => Promise<any>;
}) {
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<DetailFile[]>([]);
  const isOrphan = categoryKey === 'orphan';

  useMemo(() => {
    if (!open) return;
    setLoading(true);
    authedFetch(`/api/admin/storage/health-check?scanId=${encodeURIComponent(scanId)}&category=${encodeURIComponent(categoryKey)}`)
      .then((data) => setFiles(data.files ?? []))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scanId, categoryKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Detail — {label}</DialogTitle></DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto">
          {loading && <p className="text-sm text-slate-400">Memuat...</p>}
          {!loading && files.length === 0 && (
            <p className="text-sm text-slate-400">{isOrphan ? 'Tidak ada file tidak terhubung pada hasil scan ini.' : 'Tidak ada file pada kategori ini.'}</p>
          )}

          {!loading && files.length > 0 && isOrphan && (
            <div className="space-y-3">
              <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-800">File Tidak Terhubung ke Data Sistem</p>
                <p className="mt-1 text-xs text-red-700">File ini ada di storage, tetapi sistem tidak menemukan data yang memakai file ini.</p>
              </div>
              {files.map((f, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 p-3 text-xs">
                  <p className="font-medium text-slate-800">Nama file: {f.name}</p>
                  <p className="mt-1 text-slate-500">Provider: {providerLabel(f.provider)}</p>
                  <p className="mt-0.5 text-slate-500">Path: {f.path}</p>
                  <p className="mt-0.5 text-slate-500">Kategori perkiraan: {f.categoryLabel}</p>
                  <p className="mt-0.5 text-slate-500">Alasan terdeteksi: {f.note}</p>
                  <p className="mt-1.5 font-medium text-amber-700">Saran: Review file ini sebelum dihapus. Tahap ini hanya membaca data, belum ada file yang dihapus.</p>
                </div>
              ))}
            </div>
          )}

          {!loading && files.length > 0 && !isOrphan && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama File</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Lokasi / Path</TableHead>
                  <TableHead>Dipakai Untuk</TableHead>
                  <TableHead>Terhubung ke Data</TableHead>
                  <TableHead>Ukuran</TableHead>
                  <TableHead>Dibuat Pada</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="max-w-[160px] truncate text-xs font-medium">{f.name}</TableCell>
                    <TableCell className="text-xs">{f.categoryLabel}</TableCell>
                    <TableCell className="text-xs">{providerLabel(f.provider)}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-slate-500">{f.path}</TableCell>
                    <TableCell className="text-xs">{f.usedFor}</TableCell>
                    <TableCell className="text-xs text-slate-500">{f.linkedTo ?? '-'}</TableCell>
                    <TableCell className="text-xs">{formatBytes(f.size)}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(f.uploadedAt)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[10px]', f.referenced ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700')}>
                        {f.referenced ? 'Aman' : 'Perlu Dicek'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function StorageManagementPage() {
  const hasAccess = useRoleGuard('super-admin');
  const menuConfig = useMemo(() => MENU_CONFIG['super-admin'] || [], []);
  const authedFetch = useAuthedFetch();
  const { toast } = useToast();

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusData | null>(null);
  const [loadingProviderStatus, setLoadingProviderStatus] = useState(true);
  const [health, setHealth] = useState<{ totalIssues: number; issues: HealthIssue[] } | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStepIdx, setScanStepIdx] = useState(0);
  const [confirmScanOpen, setConfirmScanOpen] = useState(false);
  const [testingProvider, setTestingProvider] = useState<'google_drive' | 'firebase_storage' | null>(null);
  const [settingActiveProvider, setSettingActiveProvider] = useState<'google_drive' | 'firebase_storage' | null>(null);
  const [confirmActivateProvider, setConfirmActivateProvider] = useState<'google_drive' | 'firebase_storage' | null>(null);
  const [detailCategory, setDetailCategory] = useState<{ key: string; label: string } | null>(null);

  const loadOverview = async () => {
    setLoadingOverview(true);
    try {
      const data = await authedFetch('/api/admin/storage/overview');
      setOverview(data);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal memuat overview', description: err?.message });
    } finally {
      setLoadingOverview(false);
    }
  };

  const loadProviderStatus = async () => {
    setLoadingProviderStatus(true);
    try {
      const data = await authedFetch('/api/admin/storage/provider-status');
      setProviderStatus(data);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal memuat status provider', description: err?.message });
    } finally {
      setLoadingProviderStatus(false);
    }
  };

  // One-shot load when the page opens — no realtime listener, no auto health check.
  useMemo(() => {
    if (!hasAccess) return;
    loadOverview();
    loadProviderStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  const loadHealth = async () => {
    setLoadingHealth(true);
    try {
      const data = await authedFetch('/api/admin/storage/health-check');
      setHealth(data);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal menjalankan pemeriksaan file teknis', description: err?.message });
    } finally {
      setLoadingHealth(false);
    }
  };

  const runScan = async () => {
    setConfirmScanOpen(false);
    setScanning(true);
    setScanStepIdx(0);
    const stepTimer = setInterval(() => {
      setScanStepIdx((i) => Math.min(i + 1, SCAN_STEPS.length - 1));
    }, 1200);
    try {
      const data = await authedFetch('/api/admin/storage/scan', 'POST');
      setScanStepIdx(SCAN_STEPS.length - 1);
      toast({ title: `Sinkronisasi selesai. ${data.totalFiles} file diperiksa, ${data.orphanFilesCount} file tidak terhubung.` });
      await loadOverview();
      await loadHealth();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Sinkronisasi gagal', description: err?.message });
    } finally {
      clearInterval(stepTimer);
      setScanning(false);
    }
  };

  const handleTestProvider = async (provider: 'google_drive' | 'firebase_storage') => {
    setTestingProvider(provider);
    try {
      const data = await authedFetch('/api/admin/storage/test-provider', 'POST', { provider });
      toast({
        variant: data.status === 'success' ? 'default' : 'destructive',
        title: data.status === 'success' ? data.message : 'Test Koneksi gagal',
        description: data.status === 'success' ? undefined : data.message,
      });
      await loadProviderStatus();
      await loadOverview();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Test Koneksi gagal', description: err?.message });
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSetActiveProvider = async (provider: 'google_drive' | 'firebase_storage') => {
    setConfirmActivateProvider(null);
    setSettingActiveProvider(provider);
    try {
      await authedFetch('/api/admin/storage/set-active-provider', 'POST', { provider });
      toast({ title: `${providerLabel(provider)} dijadikan provider aktif.` });
      await Promise.all([loadOverview(), loadProviderStatus()]);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal mengubah provider aktif', description: err?.message });
    } finally {
      setSettingActiveProvider(null);
    }
  };

  const handleReconnectDrive = async () => {
    try {
      const data = await authedFetch(`/api/admin/google-drive/auth-url?returnUrl=${encodeURIComponent('/admin/super-admin/storage-management')}`);
      if (!data.authUrl) throw new Error('Server tidak mengembalikan URL OAuth.');
      window.location.href = data.authUrl;
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal memulai koneksi ulang Google Drive', description: err?.message });
    }
  };

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  const statusMeta = {
    perlu_perhatian: { label: 'Perlu Dicek', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    sehat: { label: 'Aman', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  };

  const connectionBadgeCls = overview?.connectionStatus === 'connected'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : overview?.connectionStatus === 'error'
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-slate-100 text-slate-500 border-slate-200';

  return (
    <DashboardLayout pageTitle="Storage Management" menuConfig={menuConfig}>
      <div className="space-y-8">
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
              Pusat kontrol penyimpanan file HRP — teknis saja. Tidak mengubah data karyawan, kandidat, atau keputusan HRD.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-700">
            Hanya satu provider yang aktif dalam satu waktu. Data storage tidak realtime — semua diperbarui manual lewat tombol.
          </p>
        </div>

        {/* 1. Storage Overview */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">1. Storage Overview</h2>
            <Button size="sm" onClick={() => setConfirmScanOpen(true)} disabled={scanning} className="gap-1.5 text-xs bg-emerald-600 text-white hover:bg-emerald-700">
              {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sinkronkan Storage
            </Button>
          </div>
          <p className="text-xs text-slate-500">Sinkronkan Storage akan menghitung ulang file dari provider aktif dan memperbarui ringkasan.</p>

          {scanning && (
            <Card className="border-emerald-100 bg-emerald-50/40">
              <CardContent className="space-y-1.5 p-4">
                {SCAN_STEPS.map((step, idx) => (
                  <div key={step} className="flex items-center gap-2 text-xs">
                    {idx < scanStepIdx ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : idx === scanStepIdx ? <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" /> : <span className="h-3.5 w-3.5" />}
                    <span className={idx <= scanStepIdx ? 'text-slate-700' : 'text-slate-400'}>{step}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {loadingOverview ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
          ) : (
            <>
              <Card className="border-slate-200">
                <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] text-slate-400">Provider Aktif Saat Ini</p>
                    <p className="mt-1 text-base font-bold text-slate-800">{overview?.activeProviderLabel ?? providerLabel(overview?.activeProvider ?? 'firebase_storage')}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Status</p>
                    <Badge variant="outline" className={cn('mt-1 text-[10px] font-semibold', connectionBadgeCls)}>{overview?.connectionStatusText ?? 'Provider Aktif Belum Dites'}</Badge>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Provider yang Discan</p>
                    <p className="mt-1 text-base font-bold text-slate-800">{overview?.activeProviderLabel ?? providerLabel(overview?.activeProvider ?? 'firebase_storage')} saja</p>
                  </div>
                </CardContent>
              </Card>

              {!overview?.scanned ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Belum ada hasil scan. Klik Sinkronkan Storage untuk memuat data storage.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Card><CardContent className="p-4"><p className="text-[11px] text-slate-400">Total Pemakaian</p><p className="mt-1 text-sm font-bold text-slate-800">{formatBytes(overview.totalSizeBytes ?? 0)}</p></CardContent></Card>
                    <Card><CardContent className="p-4"><p className="text-[11px] text-slate-400">Total File</p><p className="mt-1 text-sm font-bold text-slate-800">{(overview.totalFiles ?? 0).toLocaleString('id-ID')}</p></CardContent></Card>
                    <Card><CardContent className="p-4"><p className="text-[11px] text-slate-400">File Tidak Terhubung</p><p className={cn('mt-1 text-sm font-bold', (overview.orphanFilesCount ?? 0) > 0 ? 'text-red-600' : 'text-slate-800')}>{overview.orphanFilesCount ?? 0}</p></CardContent></Card>
                    <Card><CardContent className="p-4"><p className="text-[11px] text-slate-400">Status Scan Terakhir</p><Badge variant="outline" className={cn('mt-1 text-[10px] font-semibold', overview.storageStatus ? statusMeta[overview.storageStatus].cls : '')}>{overview.storageStatus ? statusMeta[overview.storageStatus].label : '-'}</Badge></CardContent></Card>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
                    <span>Terakhir Test Koneksi: <strong className="text-slate-700">{formatDateTime(overview.lastConnectionTestAt)}</strong></span>
                    <span>Terakhir Sinkron Storage: <strong className="text-slate-700">{formatDateTime(overview.lastSyncedAt)}</strong></span>
                    <span>Disinkronkan Oleh: <strong className="text-slate-700">{overview.syncedByName ?? '-'}</strong></span>
                  </div>
                </>
              )}
            </>
          )}
        </section>

        {/* 2. Storage Category */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">2. Storage Category</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {overview?.categories?.map((cat) => {
              const meta = CATEGORY_META[cat.key];
              const Icon = meta.icon;
              return (
                <Card key={cat.key} className={cn('border shadow-sm', meta.border)}>
                  <CardContent className="p-5">
                    <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', meta.bg)}><Icon className={cn('h-4 w-4', meta.color)} /></div>
                    <p className="mt-3 text-sm font-semibold text-slate-800">{cat.label}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>{cat.count} file</span>
                      <span>{formatBytes(cat.size)}</span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">Provider: {overview.activeProviderLabel ?? providerLabel(overview.activeProvider)}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">Terakhir scan: {formatDateTime(overview.lastSyncedAt)}</p>
                    {overview.scanId && (
                      <Button size="sm" variant="outline" className="mt-3 w-full text-xs" onClick={() => setDetailCategory({ key: cat.key, label: cat.label })}>
                        Lihat Detail
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {/* File Tidak Terhubung pseudo-category */}
            {overview?.scanned && (
              <Card className="border-red-100">
                <CardContent className="p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50"><Unlink className="h-4 w-4 text-red-600" /></div>
                  <p className="mt-3 text-sm font-semibold text-slate-800">File Tidak Terhubung</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{overview.orphanFilesCount ?? 0} file</span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">File ada di storage, tetapi tidak ditemukan relasinya dengan data sistem.</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">Terakhir scan: {formatDateTime(overview.lastSyncedAt)}</p>
                  {overview.scanId && (overview.orphanFilesCount ?? 0) > 0 && (
                    <Button size="sm" variant="outline" className="mt-3 w-full text-xs" onClick={() => setDetailCategory({ key: 'orphan', label: 'File Tidak Terhubung' })}>
                      Lihat Detail
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        {/* 3. Storage Provider */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">3. Storage Provider</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(['firebase_storage', 'google_drive'] as const).map((provider) => {
              const detail = providerStatus?.[provider === 'google_drive' ? 'googleDrive' : 'firebaseStorage'];
              const isActive = providerStatus?.activeProvider === provider;
              const isTesting = testingProvider === provider;
              const isActivating = settingActiveProvider === provider;
              const needsReconnect = provider === 'google_drive' && detail?.status === 'error' && RECONNECT_REASONS.some((r) => detail?.lastError?.includes(r));
              return (
                <Card key={provider} className={provider === 'google_drive' ? 'border-blue-100' : 'border-emerald-100'}>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', provider === 'google_drive' ? 'bg-blue-50' : 'bg-emerald-50')}>
                          {provider === 'google_drive' ? <Cloud className="h-4 w-4 text-blue-600" /> : <Database className="h-4 w-4 text-emerald-600" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{providerLabel(provider)}</p>
                          <p className="text-xs text-slate-500">{provider === 'google_drive' ? 'Folder backup & dokumen HRP.' : 'Bucket default untuk upload sistem.'}</p>
                        </div>
                      </div>
                      {isActive ? (
                        <Badge className={cn('text-white text-[10px]', provider === 'google_drive' ? 'bg-blue-500' : 'bg-emerald-500')}>Provider Aktif</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-slate-500 border-slate-300">Tidak digunakan saat ini</Badge>
                      )}
                    </div>

                    {loadingProviderStatus ? (
                      <Skeleton className="h-16 w-full" />
                    ) : !detail || (provider === 'firebase_storage' ? detail.status === 'not_tested' : detail.status === 'not_connected' && !detail.lastTestedAt) ? (
                      <p className="text-xs text-slate-400">Belum pernah dites. Klik Test Koneksi untuk memeriksa akses.</p>
                    ) : detail.status === 'connected' ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                        <p className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="h-3.5 w-3.5" /> {providerLabel(provider)} berhasil diakses</p>
                        <div className="mt-2 space-y-0.5 text-emerald-700">
                          {provider === 'google_drive' && detail.connectedEmail && <p>Akun Drive: {detail.connectedEmail}</p>}
                          {provider === 'google_drive' && detail.folderName && <p>Folder: {detail.folderName}</p>}
                          {provider === 'google_drive' && detail.folderId && <p>Folder ID: {detail.folderId}</p>}
                          {provider === 'firebase_storage' && detail.bucketName && <p>Bucket: {detail.bucketName}</p>}
                          <p>Izin baca: {detail.canRead ? 'Aktif' : 'Tidak aktif'}</p>
                          <p>Izin upload: {detail.canUpload ? 'Aktif' : 'Tidak aktif'}</p>
                          <p>Terakhir dites: {formatDateTime(detail.lastTestedAt)}</p>
                          <p className="font-medium">Status: Siap digunakan</p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                        <p className="flex items-center gap-1.5 font-semibold"><XCircle className="h-3.5 w-3.5" /> {detail.lastError ?? (provider === 'google_drive' ? 'Google Drive Belum Dihubungkan' : 'Koneksi gagal')}</p>
                        {detail.lastTestedAt && <p className="mt-1 text-red-600">Terakhir dites: {formatDateTime(detail.lastTestedAt)}</p>}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleTestProvider(provider)} disabled={isTesting} className="gap-1.5 text-xs">
                        {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />} Test Koneksi
                      </Button>
                      {!isActive && (
                        <Button size="sm" variant="outline" onClick={() => setConfirmActivateProvider(provider)} disabled={isActivating} className="gap-1.5 text-xs">
                          {isActivating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Jadikan Provider Aktif
                        </Button>
                      )}
                      {needsReconnect && (
                        <Button size="sm" onClick={handleReconnectDrive} className="gap-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700">
                          Hubungkan Ulang Google Drive
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            <Card className="border-slate-200 opacity-70">
              <CardContent className="p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100"><HardDrive className="h-4 w-4 text-slate-500" /></div>
                <p className="mt-3 text-sm font-semibold text-slate-700">S3 / Cloudflare R2</p>
                <p className="mt-1 text-xs text-slate-400">Belum didukung.</p>
                <Badge variant="outline" className="mt-2 text-[10px] text-slate-500 border-slate-300">Coming Soon</Badge>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* 4. Pemeriksaan File Teknis */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">4. Pemeriksaan File Teknis</h2>
            <Button size="sm" variant="outline" onClick={loadHealth} disabled={loadingHealth || scanning} className="gap-1.5 text-xs">
              {loadingHealth ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />} Cek File Teknis
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Cek File Teknis hanya mencari file bermasalah. Tidak ada file yang dihapus.
          </p>

          {loadingHealth ? (
            <Skeleton className="h-32 w-full" />
          ) : !health ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Belum ada hasil pemeriksaan. Klik Sinkronkan Storage atau Cek File Teknis.
            </div>
          ) : health.issues.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Tidak ada masalah teknis storage yang ditemukan.
            </div>
          ) : (
            <div className="space-y-2">
              {health.issues.map((issue) => (
                <Card key={issue.id} className={issue.severity === 'critical' ? 'border-red-200' : 'border-amber-200'}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      {issue.severity === 'critical' ? <XCircle className="h-4 w-4 text-red-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
                      <p className="text-sm font-semibold text-slate-800">{issue.title}</p>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600">{issue.explanation}</p>
                    <p className="mt-1 text-xs"><span className="font-medium text-slate-500">Dampak: </span><span className="text-slate-700">{issue.impact}</span></p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
          <Clock className="h-3 w-3" /> Data storage dimuat via API route server-side — tidak ada akses Firebase Admin SDK dari browser.
        </p>
      </div>

      <AlertDialog open={confirmScanOpen} onOpenChange={setConfirmScanOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sinkronkan Storage sekarang?</AlertDialogTitle>
            <AlertDialogDescription>
              Sistem akan memindai file HRP di provider storage dan memperbarui ringkasan. Tidak ada file yang dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={runScan}>Sinkronkan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmActivateProvider} onOpenChange={(v) => !v && setConfirmActivateProvider(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Jadikan {confirmActivateProvider ? providerLabel(confirmActivateProvider) : ''} sebagai provider aktif?</AlertDialogTitle>
            <AlertDialogDescription>
              Mulai sekarang file baru akan disimpan ke {confirmActivateProvider ? providerLabel(confirmActivateProvider) : 'provider ini'}. File lama tetap berada di provider sebelumnya.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmActivateProvider && handleSetActiveProvider(confirmActivateProvider)}>Jadikan Aktif</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {detailCategory && overview?.scanId && (
        <DetailDialog
          open={!!detailCategory}
          onOpenChange={(v) => !v && setDetailCategory(null)}
          scanId={overview.scanId}
          categoryKey={detailCategory.key}
          label={detailCategory.label}
          authedFetch={authedFetch}
        />
      )}
    </DashboardLayout>
  );
}
