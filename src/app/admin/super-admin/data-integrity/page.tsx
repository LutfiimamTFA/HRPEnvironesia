'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clipboard,
  Download,
  Eye,
  FileSearch,
  HardDrive,
  History,
  Info,
  Loader2,
  Network,
  Play,
  RefreshCw,
  Route,
  ScanSearch,
  Server,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MENU_CONFIG } from '@/lib/menu-config';
import { cn } from '@/lib/utils';
import { initializeFirebase } from '@/firebase';

type Severity = 'critical' | 'warning' | 'safe';
type ProgressStatus = 'idle' | 'running' | 'completed' | 'failed';

interface CheckItem {
  id: string;
  label: string;
  email?: string;
  uid?: string;
  documentId: string;
  collection: string;
  issue: string;
  impact: string;
  recommendation: string;
  severity: Exclude<Severity, 'safe'>;
  detail?: string;
}

interface CheckResult {
  key: string;
  title: string;
  category: string;
  status: 'ok' | 'warning' | 'error';
  severity: Severity;
  count: number;
  description: string;
  moduleImpact: string;
  recommendation: string;
  items: CheckItem[];
}

interface IntegrityResponse {
  success: boolean;
  reportId?: string;
  checkedAt: string;
  checkedByEmail?: string;
  score: number;
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
  safeCount: number;
  summary: {
    score: number;
    totalIssues: number;
    criticalCount: number;
    warningCount: number;
    safeCount: number;
    total: number;
  };
  checks: CheckResult[];
  status: 'completed';
}

interface ActivityLogItem {
  id: string;
  time: string;
  message: string;
  tone?: 'default' | 'success' | 'warning' | 'error';
}

const CHECK_META: Record<string, { icon: any; color: string; bg: string; border: string }> = {
  auth_role: { icon: ShieldAlert, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
  sidebar_access: { icon: Route, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
  organization_approval: { icon: Network, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
  recruitment: { icon: Users, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
  attendance_payroll: { icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  storage_file: { icon: HardDrive, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-100' },
  backup_export: { icon: Archive, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  environment_system: { icon: Server, color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
};

const CHECK_STEPS = [
  { key: 'auth_role', title: 'Auth & Role' },
  { key: 'sidebar_access', title: 'Sidebar Access' },
  { key: 'organization_approval', title: 'Organization Approval' },
  { key: 'recruitment', title: 'Recruitment' },
  { key: 'attendance_payroll', title: 'Absensi & Payroll' },
  { key: 'storage_file', title: 'Storage & File' },
  { key: 'backup_export', title: 'Backup & Export' },
  { key: 'environment_system', title: 'Environment & System' },
];

const EMPTY_SUMMARY = {
  score: 100,
  totalIssues: 0,
  criticalCount: 0,
  warningCount: 0,
  safeCount: 0,
  total: 8,
};

function formatClock(date = new Date()) {
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds} detik`;
  return `${minutes}m ${seconds}s`;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value === 'string') return new Date(value);
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

function formatDateTime(value: any) {
  const date = toDate(value);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function severityLabel(severity: Severity) {
  if (severity === 'critical') return 'Critical';
  if (severity === 'warning') return 'Warning';
  return 'Aman';
}

function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === 'safe') {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700">
        <ShieldCheck className="h-3 w-3" /> Aman
      </Badge>
    );
  }

  if (severity === 'warning') {
    return (
      <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-[10px] font-semibold text-amber-700">
        <AlertTriangle className="h-3 w-3" /> Warning
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-[10px] font-semibold text-red-700">
      <XCircle className="h-3 w-3" /> Critical
    </Badge>
  );
}

function downloadReport(report: IntegrityResponse | null) {
  if (!report || typeof window === 'undefined') return;
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `data-integrity-report-${report.reportId ?? report.checkedAt.replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function SummaryMetric({ label, value, tone }: { label: string; value: string | number; tone?: 'red' | 'amber' | 'emerald' | 'blue' }) {
  const toneClass = {
    red: 'text-red-700 bg-red-50 border-red-100',
    amber: 'text-amber-700 bg-amber-50 border-amber-100',
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    blue: 'text-blue-700 bg-blue-50 border-blue-100',
  }[tone ?? 'blue'];

  return (
    <div className={cn('rounded-lg border px-3 py-2', toneClass)}>
      <p className="text-[11px] font-medium opacity-80">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function CheckStatusBadge({
  status,
}: {
  status: 'waiting' | 'running' | 'done' | 'problem' | 'safe';
}) {
  if (status === 'running') {
    return (
      <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-[10px] font-semibold text-blue-700">
        <Loader2 className="h-3 w-3 animate-spin" /> Sedang Dicek
      </Badge>
    );
  }
  if (status === 'done') {
    return (
      <Badge variant="outline" className="gap-1 border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600">
        <CheckCircle2 className="h-3 w-3" /> Selesai
      </Badge>
    );
  }
  if (status === 'problem') {
    return (
      <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-[10px] font-semibold text-red-700">
        <XCircle className="h-3 w-3" /> Bermasalah
      </Badge>
    );
  }
  if (status === 'safe') {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700">
        <ShieldCheck className="h-3 w-3" /> Aman
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-slate-200 bg-white text-[10px] font-semibold text-slate-500">
      Menunggu
    </Badge>
  );
}

function ProgressPanel({
  status,
  progress,
  activeStep,
  completedCount,
  elapsedSeconds,
  logs,
  results,
  error,
}: {
  status: ProgressStatus;
  progress: number;
  activeStep: string;
  completedCount: number;
  elapsedSeconds: number;
  logs: ActivityLogItem[];
  results: IntegrityResponse | null;
  error: string | null;
}) {
  if (status === 'idle') return null;

  const title = status === 'completed'
    ? 'Pemeriksaan selesai'
    : status === 'failed'
      ? 'Pemeriksaan gagal'
      : 'Pemeriksaan sedang berjalan';
  const estimate = status === 'running'
    ? progress < 8
      ? 'Mengestimasi durasi...'
      : `Estimasi tersisa sekitar ${formatDuration(Math.max(3, Math.round((elapsedSeconds / Math.max(progress, 1)) * (100 - progress))))}`
    : status === 'completed'
      ? `Selesai dalam ${formatDuration(elapsedSeconds)}`
      : 'Proses dihentikan sebelum selesai';

  return (
    <Card className={cn(
      'border shadow-sm',
      status === 'failed' ? 'border-red-100' : status === 'completed' ? 'border-emerald-100' : 'border-blue-100',
    )}>
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">{title}</h2>
              {status === 'running' && (
                <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-blue-700">
                  <Loader2 className="h-3 w-3 animate-spin" /> Aktif
                </Badge>
              )}
              {status === 'completed' && (
                <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
                  <ShieldCheck className="h-3 w-3" /> 100%
                </Badge>
              )}
              {status === 'failed' && (
                <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700">
                  <XCircle className="h-3 w-3" /> Gagal
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Step aktif: <span className="font-semibold text-slate-800">{activeStep}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-3 lg:min-w-[360px]">
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">Progress</p>
              <p className="text-lg font-bold text-slate-900">{progress}%</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">Kategori</p>
              <p className="text-lg font-bold text-slate-900">{completedCount} dari {CHECK_STEPS.length}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">Durasi</p>
              <p className="text-lg font-bold text-slate-900">{formatDuration(elapsedSeconds)}</p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>{estimate}</span>
            <span>{completedCount}/{CHECK_STEPS.length} kategori selesai</span>
          </div>
          <Progress value={progress} className="h-2 bg-slate-100" />
        </div>

        {status === 'failed' && error && (
          <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {status === 'completed' && results && (
          <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryMetric label="Skor Integritas" value={`${results.summary.score}/100`} tone="blue" />
            <SummaryMetric label="Total Masalah" value={results.summary.totalIssues} tone="blue" />
            <SummaryMetric label="Critical" value={results.summary.criticalCount} tone="red" />
            <SummaryMetric label="Warning" value={results.summary.warningCount} tone="amber" />
            <SummaryMetric label="Aman" value={results.summary.safeCount} tone="emerald" />
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 sm:col-span-2 lg:col-span-5">
              <p className="text-[11px] font-medium text-slate-500">Waktu pemeriksaan</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{formatDateTime(results.checkedAt)}</p>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Activity Log</p>
          <div className="max-h-36 space-y-1 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-xs text-slate-400">Belum ada aktivitas.</p>
            ) : logs.slice(-8).map(log => (
              <div key={log.id} className="flex gap-2 text-xs">
                <span className="shrink-0 font-mono text-slate-400">{log.time}</span>
                <span className={cn(
                  log.tone === 'error' && 'text-red-700',
                  log.tone === 'warning' && 'text-amber-700',
                  log.tone === 'success' && 'text-emerald-700',
                  !log.tone && 'text-slate-600',
                )}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailSheet({
  check,
  open,
  onClose,
  onCopy,
  onOpenData,
  onSendSync,
}: {
  check: CheckResult | null;
  open: boolean;
  onClose: () => void;
  onCopy: (text: string) => void;
  onOpenData: (item: CheckItem) => void;
  onSendSync: (check?: CheckResult, item?: CheckItem) => void;
}) {
  if (!check) return null;

  return (
    <Sheet open={open} onOpenChange={value => !value && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-5xl">
        <SheetHeader className="pr-8">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FileSearch className="h-4 w-4 text-blue-600" />
            Detail Laporan - {check.title}
          </SheetTitle>
          <SheetDescription>
            {check.count} masalah. Dampak: {check.moduleImpact}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Dampak ke Modul Website</p>
            <p className="mt-1 text-sm text-slate-700">{check.moduleImpact}</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rekomendasi Tindakan</p>
            <p className="mt-1 text-sm text-slate-700">{check.recommendation}</p>
          </div>
        </div>

        {check.items.length === 0 ? (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Tidak ada masalah yang terdeteksi untuk kategori ini.
          </div>
        ) : (
          <div className="mt-6 rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="min-w-[180px]">Nama / Email</TableHead>
                  <TableHead className="min-w-[150px]">UID / Document ID</TableHead>
                  <TableHead>Collection</TableHead>
                  <TableHead className="min-w-[220px]">Masalah</TableHead>
                  <TableHead className="min-w-[220px]">Dampak</TableHead>
                  <TableHead className="min-w-[220px]">Rekomendasi</TableHead>
                  <TableHead className="min-w-[180px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {check.items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="max-w-[220px]">
                        <p className="truncate text-sm font-medium text-slate-800">{item.label || '-'}</p>
                        <p className="truncate text-xs text-slate-500">{item.email || '-'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="block max-w-[180px] truncate rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                        {item.uid || item.documentId}
                      </code>
                    </TableCell>
                    <TableCell className="text-xs font-medium text-slate-600">{item.collection}</TableCell>
                    <TableCell className="text-xs text-slate-700">{item.issue}</TableCell>
                    <TableCell className="text-xs text-slate-600">{item.impact}</TableCell>
                    <TableCell className="text-xs text-slate-600">{item.recommendation}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={() => onCopy(item.uid || item.documentId)}>
                          <Clipboard className="mr-1 h-3 w-3" /> Salin ID
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={() => onOpenData(item)}>
                          <Eye className="mr-1 h-3 w-3" /> Buka Data
                        </Button>
                        <Button size="sm" className="h-8 bg-emerald-600 px-2 text-[11px] text-white hover:bg-emerald-700" onClick={() => onSendSync(check, item)}>
                          <RefreshCw className="mr-1 h-3 w-3" /> Sync Center
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function DataIntegrityPage() {
  const hasAccess = useRoleGuard('super-admin');
  const { firebaseUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const menuConfig = useMemo(() => MENU_CONFIG['super-admin'] || [], []);
  const reportRef = useRef<HTMLDivElement | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const lastLoggedStepRef = useRef<number>(-1);

  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<IntegrityResponse | null>(null);
  const [detailCheck, setDetailCheck] = useState<CheckResult | null>(null);
  const [history, setHistory] = useState<IntegrityResponse[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [progressStatus, setProgressStatus] = useState<ProgressStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [progressError, setProgressError] = useState<string | null>(null);

  const summary = results?.summary ?? EMPTY_SUMMARY;
  const allSafe = summary.totalIssues === 0;
  const activeStepTitle = CHECK_STEPS[activeStepIndex]?.title ?? CHECK_STEPS[0].title;

  const pushActivityLog = useCallback((message: string, tone?: ActivityLogItem['tone']) => {
    setActivityLogs(prev => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        time: formatClock(),
        message,
        tone,
      },
    ].slice(-20));
  }, []);

  const stopProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { firestore } = initializeFirebase();
      const snap = await getDocs(query(collection(firestore, 'data_integrity_reports'), orderBy('checkedAt', 'desc'), limit(5)));
      setHistory(snap.docs.map(doc => {
        const data = doc.data() as any;
        const checkedAt = toDate(data.checkedAt)?.toISOString() ?? data.checkedAt ?? '';
        return {
          success: true,
          reportId: doc.id,
          checkedAt,
          checkedByEmail: data.checkedByEmail ?? '',
          score: data.score ?? 0,
          totalIssues: data.totalIssues ?? 0,
          criticalCount: data.criticalCount ?? 0,
          warningCount: data.warningCount ?? 0,
          safeCount: data.safeCount ?? 0,
          summary: {
            score: data.score ?? 0,
            totalIssues: data.totalIssues ?? 0,
            criticalCount: data.criticalCount ?? 0,
            warningCount: data.warningCount ?? 0,
            safeCount: data.safeCount ?? 0,
            total: Array.isArray(data.checks) ? data.checks.length : 0,
          },
          checks: data.checks ?? [],
          status: data.status ?? 'completed',
        };
      }));
    } catch (err: any) {
      console.warn('data_integrity_reports snapshot error:', err?.code ?? err?.message);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasAccess) loadHistory();
  }, [hasAccess, loadHistory]);

  useEffect(() => {
    return () => stopProgressTimer();
  }, [stopProgressTimer]);

  const sendToSyncCenter = useCallback((check?: CheckResult, item?: CheckItem) => {
    const params = new URLSearchParams();
    if (check?.key) params.set('source', check.key);
    if (item?.collection) params.set('collection', item.collection);
    if (item?.documentId) params.set('documentId', item.documentId);
    router.push(`/admin/super-admin/sync-center?${params.toString()}`);
  }, [router]);

  const copyId = useCallback((text: string) => {
    navigator.clipboard?.writeText(text);
    toast({ title: 'ID disalin', description: text });
  }, [toast]);

  const openData = useCallback((item: CheckItem) => {
    copyId(`${item.collection}/${item.documentId}`);
    toast({
      title: 'Referensi data siap dibuka',
      description: 'Path collection/document sudah disalin. Gunakan di modul terkait atau Sync Center.',
    });
  }, [copyId, toast]);

  const runCheck = useCallback(async () => {
    if (!firebaseUser) return;
    stopProgressTimer();
    startedAtRef.current = Date.now();
    lastLoggedStepRef.current = -1;
    setChecking(true);
    setResults(null);
    setProgressStatus('running');
    setProgress(0);
    setActiveStepIndex(0);
    setCompletedSteps(0);
    setElapsedSeconds(0);
    setProgressError(null);
    setActivityLogs([{
      id: `${Date.now()}-start`,
      time: formatClock(),
      message: 'Memulai pemeriksaan',
    }]);

    progressTimerRef.current = window.setInterval(() => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000));
      setElapsedSeconds(elapsed);
      setProgress(prev => {
        const increment = prev < 30 ? 5 : prev < 65 ? 3 : 1.5;
        const next = Math.min(90, Math.round((prev + increment) * 10) / 10);
        const nextIndex = Math.min(CHECK_STEPS.length - 1, Math.floor((next / 90) * CHECK_STEPS.length));
        const doneCount = Math.min(nextIndex, CHECK_STEPS.length - 1);

        setActiveStepIndex(nextIndex);
        setCompletedSteps(doneCount);

        while (lastLoggedStepRef.current < doneCount - 1) {
          lastLoggedStepRef.current += 1;
          const finishedStep = CHECK_STEPS[lastLoggedStepRef.current];
          setActivityLogs(logs => [
            ...logs,
            {
              id: `${Date.now()}-${finishedStep.key}`,
              time: formatClock(),
              message: `${finishedStep.title} selesai`,
              tone: 'success' as const,
            },
          ].slice(-20));
        }

        return next;
      });
    }, 900);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/data-integrity/check', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Pemeriksaan gagal.');

      const report = data as IntegrityResponse;
      stopProgressTimer();
      const finalElapsed = Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000));
      setElapsedSeconds(finalElapsed);
      setProgress(100);
      setActiveStepIndex(CHECK_STEPS.length - 1);
      setCompletedSteps(CHECK_STEPS.length);
      setProgressStatus('completed');
      setResults(report);
      setActivityLogs(logs => [
        ...logs,
        ...report.checks.map(check => ({
          id: `${Date.now()}-${check.key}-final`,
          time: formatClock(),
          message: check.count > 0
            ? `${check.title} menemukan ${check.count} ${check.severity === 'critical' ? 'critical' : 'warning'}`
            : `${check.title} aman`,
          tone: check.severity === 'critical' ? 'error' as const : check.severity === 'warning' ? 'warning' as const : 'success' as const,
        })),
        {
          id: `${Date.now()}-done`,
          time: formatClock(),
          message: `Pemeriksaan selesai - ${report.summary.totalIssues} masalah ditemukan`,
          tone: report.summary.totalIssues > 0 ? 'warning' as const : 'success' as const,
        },
      ].slice(-20));
      await loadHistory();

      toast({
        title: `Pemeriksaan selesai - ${report.summary.totalIssues} masalah ditemukan`,
        description: (
          <div className="mt-2 space-y-3">
            <p className="text-xs">
              Skor {report.summary.score}/100. Critical {report.summary.criticalCount}, Warning {report.summary.warningCount}, Aman {report.summary.safeCount}.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                <Eye className="mr-1 h-3 w-3" /> Lihat Laporan
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => downloadReport(report)}>
                <Download className="mr-1 h-3 w-3" /> Export Laporan
              </Button>
              <Button size="sm" className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-700" onClick={() => sendToSyncCenter()}>
                <RefreshCw className="mr-1 h-3 w-3" /> Kirim ke Sync Center
              </Button>
            </div>
          </div>
        ),
      });
    } catch (err: any) {
      stopProgressTimer();
      const message = err?.message ?? 'Pemeriksaan gagal. Coba ulang beberapa saat lagi.';
      setProgressStatus('failed');
      setProgressError(message);
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
      pushActivityLog(`Pemeriksaan gagal - ${message}`, 'error');
      toast({ title: 'Pemeriksaan gagal', description: message, variant: 'destructive' });
    } finally {
      setChecking(false);
    }
  }, [firebaseUser, loadHistory, pushActivityLog, sendToSyncCenter, stopProgressTimer, toast]);

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  const displayChecks: CheckResult[] = results?.checks ?? CHECK_STEPS.map(step => ({
    key: step.key,
    title: step.title,
    category: step.title,
    severity: 'safe' as Severity,
    status: 'ok' as const,
    count: 0,
    description: checking ? 'Pemeriksaan sedang berjalan.' : 'Menunggu pemeriksaan.',
    moduleImpact: 'Belum tersedia sebelum pemeriksaan selesai.',
    recommendation: 'Jalankan pemeriksaan untuk melihat rekomendasi.',
    items: [],
  }));

  const getCardStatus = (check: CheckResult, index: number): 'waiting' | 'running' | 'done' | 'problem' | 'safe' => {
    if (checking || progressStatus === 'running') {
      if (index < completedSteps) return 'done';
      if (index === activeStepIndex) return 'running';
      return 'waiting';
    }
    if (results) return check.count > 0 ? 'problem' : 'safe';
    return 'waiting';
  };

  return (
    <DashboardLayout pageTitle="Data Integrity" menuConfig={menuConfig}>
      <div className="space-y-6" ref={reportRef}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <ScanSearch className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Data Integrity</h1>
                <Badge variant="outline" className="border-purple-200 bg-purple-50 text-[10px] font-semibold uppercase tracking-wide text-purple-700">
                  Super Admin Only
                </Badge>
              </div>
              <p className="text-sm text-slate-500">
                Pusat laporan konsistensi data website dan sistem HRP.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {results && (
              <Button variant="outline" onClick={() => downloadReport(results)} className="gap-2 border-slate-200">
                <Download className="h-4 w-4" /> Export Laporan
              </Button>
            )}
            <Button onClick={runCheck} disabled={checking} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
              {checking
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Memeriksa...</>
                : progressStatus === 'failed'
                  ? <><RefreshCw className="h-4 w-4" /> Coba Lagi</>
                  : results
                    ? <><RefreshCw className="h-4 w-4" /> Jalankan Pemeriksaan Ulang</>
                    : <><Play className="h-4 w-4" /> Jalankan Pemeriksaan</>
              }
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-sm text-slate-600">
            Pemeriksaan bersifat <strong>read-only</strong>. Laporan disimpan ke <strong>data_integrity_reports</strong> dan aktivitas dicatat di <strong>audit_logs</strong>.
          </p>
        </div>

        <ProgressPanel
          status={progressStatus}
          progress={Math.round(progress)}
          activeStep={activeStepTitle}
          completedCount={completedSteps}
          elapsedSeconds={elapsedSeconds}
          logs={activityLogs}
          results={results}
          error={progressError}
        />

        <Card className={cn('border shadow-sm', allSafe ? 'border-emerald-100' : summary.criticalCount > 0 ? 'border-red-100' : 'border-amber-100')}>
          <CardContent className="p-5">
            <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Skor Integritas Sistem</p>
                  {results ? <SeverityBadge severity={summary.criticalCount > 0 ? 'critical' : summary.warningCount > 0 ? 'warning' : 'safe'} /> : <Badge variant="outline">Belum Dicek</Badge>}
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-5xl font-bold text-slate-900">{results ? summary.score : '-'}</span>
                  <span className="pb-2 text-sm text-slate-400">/100</span>
                </div>
                <Progress value={results ? summary.score : 0} className="mt-4 h-2 bg-slate-100" />
                <p className="mt-3 text-xs text-slate-500">
                  Terakhir dicek: {results ? formatDateTime(results.checkedAt) : history[0] ? formatDateTime(history[0].checkedAt) : '-'}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryMetric label="Total Masalah" value={results ? summary.totalIssues : '-'} tone="blue" />
                <SummaryMetric label="Critical" value={results ? summary.criticalCount : '-'} tone="red" />
                <SummaryMetric label="Warning" value={results ? summary.warningCount : '-'} tone="amber" />
                <SummaryMetric label="Aman" value={results ? summary.safeCount : '-'} tone="emerald" />
              </div>
            </div>

            {results && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <Button variant="outline" size="sm" className="gap-2 border-slate-200" onClick={() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  <Eye className="h-4 w-4" /> Lihat Laporan
                </Button>
                <Button variant="outline" size="sm" className="gap-2 border-slate-200" onClick={() => downloadReport(results)}>
                  <Download className="h-4 w-4" /> Export Laporan
                </Button>
                <Button size="sm" className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => sendToSyncCenter()}>
                  <RefreshCw className="h-4 w-4" /> Kirim ke Sync Center
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {displayChecks.map((check, index) => {
            const meta = CHECK_META[check.key] ?? CHECK_META.environment_system;
            const Icon = meta.icon;
            const cardStatus = getCardStatus(check, index);
            const isActive = cardStatus === 'running';
            return (
              <Card key={check.key} className={cn(
                'border shadow-sm transition-colors',
                isActive ? 'border-blue-300 ring-1 ring-blue-100' : meta.border,
              )}>
                <CardContent className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', isActive ? 'bg-blue-50' : meta.bg)}>
                      {isActive ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : <Icon className={cn('h-4 w-4', meta.color)} />}
                    </div>
                    {results ? <SeverityBadge severity={check.severity} /> : <CheckStatusBadge status={cardStatus} />}
                  </div>

                  <p className="mt-3 text-sm font-semibold capitalize text-slate-800">{check.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{check.description}</p>

                  <div className="mt-4 grid gap-2 text-xs">
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="font-semibold text-slate-600">Jumlah masalah</p>
                      <p className={cn('mt-0.5 font-bold', check.count > 0 ? 'text-red-600' : 'text-emerald-600')}>
                        {results ? check.count : cardStatus === 'done' ? 'Selesai' : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Dampak ke modul</p>
                      <p className="mt-1 leading-relaxed text-slate-600">{check.moduleImpact}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rekomendasi</p>
                      <p className="mt-1 leading-relaxed text-slate-600">{check.recommendation}</p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!results || checking}
                    onClick={() => setDetailCheck(check)}
                    className="mt-auto w-full border-slate-200 text-xs"
                  >
                    <FileSearch className="mr-2 h-3.5 w-3.5" /> Lihat Detail
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {!results && !checking && (
          <p className="text-center text-sm text-slate-400">
            Klik Jalankan Pemeriksaan untuk membuat laporan integritas sistem terbaru.
          </p>
        )}

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-slate-500" />
                <p className="text-sm font-semibold text-slate-800">Riwayat Pemeriksaan Terakhir</p>
              </div>
              <Button size="sm" variant="outline" className="h-8 border-slate-200 text-xs" onClick={loadHistory}>
                <RefreshCw className="mr-1 h-3 w-3" /> Refresh
              </Button>
            </div>

            {historyLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : history.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
                Belum ada laporan di data_integrity_reports.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Waktu</TableHead>
                      <TableHead>Skor</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Critical</TableHead>
                      <TableHead>Warning</TableHead>
                      <TableHead>Aman</TableHead>
                      <TableHead>Pemeriksa</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map(report => (
                      <TableRow key={report.reportId}>
                        <TableCell className="text-sm text-slate-700">{formatDateTime(report.checkedAt)}</TableCell>
                        <TableCell className="font-semibold text-slate-900">{report.score}/100</TableCell>
                        <TableCell>{report.totalIssues}</TableCell>
                        <TableCell className="text-red-600">{report.criticalCount}</TableCell>
                        <TableCell className="text-amber-600">{report.warningCount}</TableCell>
                        <TableCell className="text-emerald-600">{report.safeCount}</TableCell>
                        <TableCell className="text-xs text-slate-500">{report.checkedByEmail || '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={() => setResults(report)}>
                              <Eye className="mr-1 h-3 w-3" /> Lihat
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={() => downloadReport(report)}>
                              <Download className="mr-1 h-3 w-3" /> Export
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400">
          Semua perbaikan diarahkan ke Sync Center. Halaman ini tidak mengubah data operasional.
        </p>
      </div>

      <DetailSheet
        check={detailCheck}
        open={!!detailCheck}
        onClose={() => setDetailCheck(null)}
        onCopy={copyId}
        onOpenData={openData}
        onSendSync={sendToSyncCenter}
      />
    </DashboardLayout>
  );
}
