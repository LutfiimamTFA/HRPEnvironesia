'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  getDocs,
  setDoc,
  doc,
  serverTimestamp,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

// ── shadcn/ui ────────────────────────────────────────────────────────────────
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ── icons ────────────────────────────────────────────────────────────────────
import { Switch } from '@/components/ui/switch';
import {
  Users,
  Calendar,
  CalendarOff,
  Timer,
  Briefcase,
  Shield,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  MapPin,
  HardDrive,
  CloudUpload,
  FolderOpen,
  XCircle,
  RefreshCw,
  Settings,
  Zap,
  AlertCircle,
  Info,
  Link,
  LinkOff,
  CheckCircle,
  WifiOff,
  TestTube2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type ExportFormat = 'all' | 'json' | 'csv' | 'xlsx';

interface ExportFilters {
  dateFrom: string;
  dateTo: string;
  brand: string;
  division: string;
  status: string;
  format: ExportFormat;
}

interface ExportItem {
  id: string;
  label: string;
  description: string;
  collection: string;
  filterSpec?: Record<string, any>; // extra filters sent to the server export endpoint
}

interface ExportCategory {
  id: string;
  title: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  items: ExportItem[];
}

interface ExportLog {
  id: string;
  exportedByUid?: string;
  exportedByName?: string;
  exportedByEmail?: string;
  exportType?: string;
  collectionName?: string;
  filters?: Record<string, any>;
  format?: string;
  status?: 'success' | 'failed';
  fileName?: string;
  rowCount?: number;
  createdAt?: any;
}

interface BackupLog {
  id: string;
  backupId?: string;
  backupType?: 'manual' | 'scheduled_daily' | 'scheduled_weekly' | 'scheduled_monthly';
  frequency?: 'daily' | 'weekly' | 'monthly';
  status?: 'success' | 'partial_success' | 'failed' | 'running';
  startedAt?: any;
  finishedAt?: any;
  durationSeconds?: number;
  requestedByUid?: string;
  requestedByName?: string;
  requestedByEmail?: string;
  reason?: string;
  formats?: string[];
  totalCollections?: number;
  totalDocuments?: number;
  totalFiles?: number;
  totalJsonFiles?: number;
  totalCsvFiles?: number;
  totalXlsxFiles?: number;
  googleDriveBackupFolderLink?: string;
  manifestWebViewLink?: string;
  summaryWebViewLink?: string;
  errors?: string[];
  createdAt?: any;
}

interface BackupProgress {
  backupId?: string;
  status?: 'running' | 'success' | 'failed' | 'partial_success';
  step?: 'prepare' | 'read' | 'generate' | 'upload' | 'log' | 'done' | 'failed';
  stepLabel?: string;
  progressPercent?: number;
  currentCategoryKey?: string | null;
  currentCategoryLabel?: string | null;
  completedCategories?: number;
  totalCategories?: number;
  totalDocumentsProcessed?: number;
  totalFilesUploaded?: number;
  totalCollections?: number;
  failedCategories?: string[];
  activityLog?: string[];
  error?: string | null;
  googleDriveBackupFolderLink?: string;
  startedAt?: any;
  updatedAt?: any;
  finishedAt?: string;
}

interface BackupSettings {
  autoBackupEnabled: boolean;
  dailyBackupEnabled: boolean;
  weeklyBackupEnabled: boolean;
  monthlyBackupEnabled: boolean;
  backupFormats: ('json' | 'csv' | 'xlsx')[];
  retentionDays: number;
  googleDriveBackupFolderId: string;
  dailyBackupTime: string;
  weeklyBackupDay: string;
  weeklyBackupTime: string;
  monthlyBackupDate: number;
  monthlyBackupTime: string;
  cloudRunServiceUrl?: string;
  // Google Drive OAuth fields
  driveAuthMode?: 'service_account' | 'oauth_user';
  driveConnected?: boolean;
  driveAccountEmail?: string;
  driveConnectedAt?: any;
  driveConnectedByUid?: string;
  updatedAt?: any;
  updatedByUid?: string;
  updatedByName?: string;
}

const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  autoBackupEnabled: true,
  dailyBackupEnabled: true,
  weeklyBackupEnabled: true,
  monthlyBackupEnabled: true,
  backupFormats: ['json', 'csv', 'xlsx'],
  retentionDays: 90,
  googleDriveBackupFolderId: '16bMATK_p7d0bd82JgUySQe6bhtJKPXgx',
  dailyBackupTime: '23:55',
  weeklyBackupDay: 'sunday',
  weeklyBackupTime: '23:00',
  monthlyBackupDate: 1,
  monthlyBackupTime: '00:30',
};

const BACKUP_CATEGORY_ACTIONS = [
  { key: 'karyawan_user', title: 'Data Karyawan', icon: Users, className: 'border-teal-200 bg-teal-50 text-teal-700' },
  { key: 'absensi_payroll', title: 'Absensi & Payroll', icon: Calendar, className: 'border-blue-200 bg-blue-50 text-blue-700' },
  { key: 'izin_cuti', title: 'Izin & Cuti', icon: CalendarOff, className: 'border-amber-200 bg-amber-50 text-amber-700' },
  { key: 'lembur', title: 'Lembur', icon: Timer, className: 'border-orange-200 bg-orange-50 text-orange-700' },
  { key: 'perjalanan_dinas', title: 'Perjalanan Dinas', icon: MapPin, className: 'border-violet-200 bg-violet-50 text-violet-700' },
  { key: 'rekrutmen', title: 'Rekrutmen', icon: Briefcase, className: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  { key: 'sistem_keamanan', title: 'Sistem & Keamanan', icon: Shield, className: 'border-red-200 bg-red-50 text-red-700' },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDateTime(value: any): string {
  if (!value) return '—';
  try {
    const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch { return '—'; }
}

function toDateSafe(value: any): Date | null {
  if (!value) return null;
  try {
    if (typeof value.toDate === 'function') return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

function downloadFile(content: string | Uint8Array | ArrayBuffer | Blob, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';

  const parent = document.body ?? document.documentElement;
  parent.appendChild(a);
  a.click();

  window.setTimeout(() => {
    a.parentNode?.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// ── Export categories config ──────────────────────────────────────────────────
const EXPORT_CATEGORIES: ExportCategory[] = [
  {
    id: 'karyawan',
    title: 'Data Karyawan',
    icon: Users,
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-600',
    items: [
      { id: 'users_all',      label: 'Semua Data Karyawan',    description: 'Nama, email, role, status, tanggal bergabung', collection: 'users' },
      { id: 'users_fulltime', label: 'Karyawan Tetap',         description: 'Filter role = karyawan', collection: 'users', filterSpec: { role: 'karyawan' } },
      { id: 'users_intern',   label: 'Karyawan Magang / Kontrak', description: 'Filter role magang dan training', collection: 'users', filterSpec: { role__in: ['karyawan-magang', 'karyawan-training'] } },
      { id: 'employee_profiles',  label: 'Profil Karyawan',   description: 'Data profil detail karyawan', collection: 'employee_profiles' },
      { id: 'employee_invites',   label: 'Undangan Karyawan',  description: 'Riwayat undangan bergabung sistem', collection: 'employee_invites' },
      { id: 'brands',             label: 'Data Brand',          description: 'Daftar brand perusahaan', collection: 'brands' },
      { id: 'divisions',          label: 'Data Divisi',         description: 'Daftar divisi perusahaan', collection: 'divisions' },
      { id: 'positions',          label: 'Data Jabatan',        description: 'Daftar jabatan / posisi', collection: 'positions' },
      { id: 'departments',        label: 'Data Departemen',     description: 'Daftar departemen perusahaan', collection: 'departments' },
    ],
  },
  {
    id: 'absensi',
    title: 'Absensi & Payroll',
    icon: Calendar,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    items: [
      { id: 'attendance_records',  label: 'Rekap Absensi',           description: 'Riwayat check-in, check-out harian', collection: 'attendance_records' },
      { id: 'attendance_sessions', label: 'Sesi Absensi',            description: 'Data sesi absensi aktif & selesai', collection: 'attendance_sessions' },
      { id: 'permission_requests', label: 'Pengajuan Izin',          description: 'Semua pengajuan izin beserta status', collection: 'permission_requests' },
      { id: 'overtime_payroll_recaps', label: 'Rekap Lembur Payroll', description: 'Rekap lembur terverifikasi untuk payroll', collection: 'overtime_payroll_recaps' },
      { id: 'payroll_periods',     label: 'Periode Payroll',         description: 'Data periode penggajian', collection: 'payroll_periods' },
      { id: 'payroll_reports',     label: 'Laporan Payroll',         description: 'Laporan payroll per periode', collection: 'payroll_reports' },
    ],
  },
  {
    id: 'izin_cuti',
    title: 'Izin & Cuti',
    icon: CalendarOff,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    items: [
      { id: 'leave_requests',  label: 'Pengajuan Cuti',        description: 'Semua pengajuan cuti beserta status & alasan', collection: 'leave_requests' },
      { id: 'leave_balances',  label: 'Saldo & Riwayat Cuti',  description: 'Saldo cuti per karyawan', collection: 'leave_balances' },
      { id: 'company_holidays', label: 'Hari Libur Perusahaan', description: 'Daftar hari libur nasional dan perusahaan', collection: 'company_holidays' },
    ],
  },
  {
    id: 'lembur',
    title: 'Lembur',
    icon: Timer,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
    items: [
      { id: 'overtime_submissions', label: 'Pengajuan Lembur',    description: 'Semua pengajuan lembur karyawan', collection: 'overtime_submissions' },
      { id: 'overtime_approved',    label: 'Lembur Disetujui',    description: 'Filter status = approved', collection: 'overtime_submissions', filterSpec: { status: 'approved' } },
      { id: 'approval_requests',    label: 'Approval Lembur',     description: 'Riwayat approval pengajuan lembur', collection: 'approval_requests' },
    ],
  },
  {
    id: 'dinas',
    title: 'Perjalanan Dinas',
    icon: MapPin,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    items: [
      { id: 'business_trips',        label: 'Data Perjalanan Dinas', description: 'Riwayat perjalanan dinas karyawan', collection: 'business_trips' },
      { id: 'travel_orders',         label: 'Surat Perintah Dinas',  description: 'Dokumen surat perintah perjalanan', collection: 'travel_orders' },
      { id: 'business_trip_reports', label: 'Laporan Dinas',         description: 'Laporan hasil perjalanan dinas', collection: 'business_trip_reports' },
      { id: 'travel_tracking',       label: 'Tracking Dinas',        description: 'Data tracking lokasi perjalanan dinas', collection: 'travel_tracking' },
    ],
  },
  {
    id: 'rekrutmen',
    title: 'Rekrutmen',
    icon: Briefcase,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    items: [
      { id: 'job_postings',       label: 'Data Lowongan',         description: 'Semua job posting yang pernah dibuat', collection: 'job_postings' },
      { id: 'candidates',         label: 'Data Pelamar',          description: 'Data profil kandidat pelamar', collection: 'candidates' },
      { id: 'applications',       label: 'Lamaran Kandidat',      description: 'Semua lamaran yang masuk per lowongan', collection: 'applications' },
      { id: 'assessments',        label: 'Assessment',            description: 'Data hasil assessment kandidat', collection: 'assessments' },
      { id: 'interviews',         label: 'Wawancara',             description: 'Jadwal dan hasil wawancara', collection: 'interviews' },
      { id: 'offerings',          label: 'Offering',              description: 'Data penawaran kepada kandidat', collection: 'offerings' },
      { id: 'candidate_documents', label: 'Dokumen Kandidat',     description: 'Metadata dokumen yang diunggah kandidat', collection: 'candidate_documents' },
    ],
  },
  {
    id: 'sistem',
    title: 'Sistem & Keamanan',
    icon: Shield,
    iconBg: 'bg-red-50',
    iconColor: 'text-red-500',
    items: [
      { id: 'audit_logs',     label: 'Audit Log',        description: 'Riwayat perubahan data dan aksi sensitif', collection: 'audit_logs' },
      { id: 'session_logs',   label: 'Session Logs',     description: 'Riwayat login, logout, dan force logout', collection: 'session_logs' },
      { id: 'export_logs',    label: 'Export Logs',      description: 'Riwayat semua aktivitas export data', collection: 'export_logs' },
      { id: 'backup_logs',    label: 'Backup Logs',      description: 'Riwayat backup otomatis dan manual', collection: 'backup_logs' },
      { id: 'access_roles',   label: 'Access & Roles',   description: 'Konfigurasi hak akses dan peran', collection: 'access_roles' },
      { id: 'system_settings', label: 'System Settings', description: 'Pengaturan sistem HRP', collection: 'system_settings' },
      { id: 'menu_visibility', label: 'Menu Visibility',  description: 'Konfigurasi visibilitas menu per role', collection: 'menu_visibility' },
    ],
  },
];

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  colorClass,
  iconBgClass,
  iconTextClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  subtext?: string;
  colorClass?: string;
  iconBgClass?: string;
  iconTextClass?: string;
}) {
  return (
    <Card className={cn('border overflow-hidden', colorClass)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1.5 text-3xl font-bold tracking-tight">{value}</p>
            {subtext && <p className="mt-1 text-[11px] text-muted-foreground">{subtext}</p>}
          </div>
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', iconBgClass)}>
            <Icon className={cn('h-5 w-5', iconTextClass)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── ExportCard ────────────────────────────────────────────────────────────────
const FORMAT_META = {
  json: { label: 'JSON', icon: Database,       cls: 'border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300' },
  csv:  { label: 'CSV',  icon: FileText,        cls: 'border-teal-200 text-teal-700 hover:bg-teal-50 hover:border-teal-300' },
  xlsx: { label: 'XLSX', icon: FileSpreadsheet, cls: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300' },
} as const;

function ExportCard({
  category,
  filters,
  onExport,
  loadingId,
}: {
  category: ExportCategory;
  filters: ExportFilters;
  onExport: (item: ExportItem, format: 'json' | 'csv' | 'xlsx') => void;
  loadingId: string | null;
}) {
  const Icon = category.icon;
  // Determine which format buttons to show
  const visibleFormats: ('json' | 'csv' | 'xlsx')[] =
    filters.format === 'all' ? ['json', 'csv', 'xlsx'] : [filters.format as 'json' | 'csv' | 'xlsx'];

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', category.iconBg)}>
              <Icon className={cn('h-4 w-4', category.iconColor)} />
            </div>
            <CardTitle className="text-sm font-semibold">{category.title}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4 space-y-3">
        {category.items.map(item => {
          const isAnyLoading = visibleFormats.some(f => loadingId === `${item.id}_${f}`);
          return (
            <div
              key={item.id}
              className="rounded-lg border border-slate-100 bg-white p-3 transition-colors hover:bg-slate-50/60"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700">{item.label}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{item.description}</p>
              </div>
              {/* Format buttons */}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {visibleFormats.map(fmt => {
                  const meta = FORMAT_META[fmt];
                  const FmtIcon = meta.icon;
                  const isLoading = loadingId === `${item.id}_${fmt}`;
                  return (
                    <Button
                      key={fmt}
                      size="sm"
                      variant="outline"
                      disabled={isAnyLoading}
                      onClick={() => onExport(item, fmt)}
                      className={cn('h-7 gap-1.5 text-xs disabled:opacity-50', meta.cls)}
                    >
                      {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FmtIcon className="h-3 w-3" />}
                      {meta.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ReadinessCheckItem({
  label,
  status,
  description,
  tone,
}: {
  label: string;
  status: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'muted';
}) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? XCircle : tone === 'warning' ? AlertTriangle : Info;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
      <span className={cn(
        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
        tone === 'success' ? 'bg-emerald-100 text-emerald-700'
        : tone === 'danger' ? 'bg-red-100 text-red-700'
        : tone === 'warning' ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-500',
      )}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-slate-800">{label}</p>
          <Badge
            variant="outline"
            className={cn(
              'text-[11px]',
              tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : tone === 'danger' ? 'border-red-200 bg-red-50 text-red-700'
              : tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-slate-200 bg-slate-50 text-slate-500',
            )}
          >
            {status}
          </Badge>
        </div>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function BackupExportClient() {
  const firestore = useFirestore();
  const { firebaseUser, userProfile } = useAuth();
  const { toast } = useToast();

  // ── Stats (counts from collections) ─────────────────────────────────────
  const [stats, setStats] = useState({ users: 0, attendance: 0, leave: 0, overtime: 0, jobs: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    let cancelled = false;
    const run = async () => {
      try {
        const [usersSnap, attendanceSnap, leaveSnap, overtimeSnap, jobsSnap] = await Promise.all([
          getDocs(collection(firestore, 'users')),
          getDocs(query(collection(firestore, 'attendance_events'), limit(1))),
          getDocs(collection(firestore, 'leave_requests')),
          getDocs(collection(firestore, 'overtime_submissions')),
          getDocs(collection(firestore, 'jobs')),
        ]);
        if (!cancelled) {
          setStats({
            users: usersSnap.size,
            attendance: attendanceSnap.size > 0 ? -1 : 0, // -1 = has data but uncounted for perf
            leave: leaveSnap.size,
            overtime: overtimeSnap.size,
            jobs: jobsSnap.size,
          });
          setStatsLoading(false);
        }
      } catch {
        if (!cancelled) setStatsLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [firestore, firebaseUser?.uid]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<ExportFilters>({
    dateFrom: '',
    dateTo: '',
    brand: '',
    division: '',
    status: '',
    format: 'all',
  });
  const setFilter = useCallback((key: keyof ExportFilters, val: string) => {
    setFilters(prev => ({ ...prev, [key]: val }));
  }, []);

  // ── Export logs (live) ────────────────────────────────────────────────────
  const [exportLogs, setExportLogs] = useState<ExportLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const q = query(collection(firestore, 'export_logs'), orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(
      q,
      snap => {
        setExportLogs(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ExportLog, 'id'>) })));
        setLogsLoading(false);
      },
      err => {
        console.warn('export_logs snapshot error:', err.code);
        setLogsLoading(false);
      },
    );
    return () => unsub();
  }, [firestore, firebaseUser?.uid]);

  // ── Last export info ──────────────────────────────────────────────────────
  const lastExport = exportLogs[0] ?? null;

  // ── Export handler ────────────────────────────────────────────────────────
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleServerExport = useCallback(async (item: ExportItem, format: 'json' | 'csv' | 'xlsx') => {
    if (!firebaseUser || !userProfile) return;

    const loadKey = `${item.id}_${format}`;
    setLoadingId(loadKey);

    const activeFilters: Record<string, any> = { ...(item.filterSpec ?? {}) };
    if (filters.dateFrom) activeFilters.dateFrom = filters.dateFrom;
    if (filters.dateTo) activeFilters.dateTo = filters.dateTo;
    if (filters.brand) activeFilters.brand = filters.brand;
    if (filters.division) activeFilters.division = filters.division;
    if (filters.status) activeFilters.status = filters.status;

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) throw new Error('Token tidak tersedia. Silakan login ulang.');

      const res = await fetch('/api/admin/export/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          mode: 'download',
          exportKey: item.id,
          collectionName: item.collection,
          format,
          filters: {
            ...activeFilters,
            startDate: filters.dateFrom || null,
            endDate: filters.dateTo || null,
            status: filters.status || activeFilters.status || null,
          },
        }),
      });

      if (!res.ok) {
        let message = 'Export gagal. Silakan coba lagi.';
        try {
          const errorJson = await res.json();
          message = errorJson.message ?? errorJson.error ?? message;
        } catch {
          // Keep the friendly fallback message.
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const fallbackFileName = `hrp_${item.collection}_${new Date().toISOString().slice(0, 10)}.${format}`;
      const fileName = res.headers.get('X-Export-File-Name') ?? fallbackFileName;
      const totalDocuments = Number(res.headers.get('X-Total-Documents') ?? '0');
      const dataStatus = res.headers.get('X-Export-Data-Status');

      downloadFile(blob, fileName, blob.type || 'application/octet-stream');
      const emptyDescription = dataStatus === 'not_found'
        ? 'Collection belum memiliki data.'
        : dataStatus === 'empty'
          ? `Export ${format.toUpperCase()} berhasil diunduh ke laptop, tetapi data kosong.`
          : `Export ${format.toUpperCase()} berhasil diunduh ke laptop${Number.isFinite(totalDocuments) ? `: ${totalDocuments.toLocaleString('id-ID')} dokumen` : ''}.`;
      toast({
        title: 'Export berhasil diunduh ke laptop.',
        description: emptyDescription,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Export Gagal',
        description: err.message ?? 'Export gagal diproses server.',
      });
    } finally {
      setLoadingId(null);
    }
  }, [firebaseUser, userProfile, filters, toast]);

  // ── Backup logs (live) ────────────────────────────────────────────────────
  const [backupLogs, setBackupLogs] = useState<BackupLog[]>([]);
  const [backupLogsLoading, setBackupLogsLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const q = query(collection(firestore, 'backup_logs'), orderBy('createdAt', 'desc'), limit(20));
    const unsub = onSnapshot(
      q,
      snap => {
        setBackupLogs(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<BackupLog, 'id'>) })));
        setBackupLogsLoading(false);
      },
      err => {
        console.warn('backup_logs snapshot error:', err.code);
        setBackupLogsLoading(false);
      },
    );
    return () => unsub();
  }, [firestore, firebaseUser?.uid]);

  // ── Backup modal state & handler ──────────────────────────────────────────
  type BackupFormat = 'json' | 'csv' | 'xlsx';
  const ALL_FORMATS: BackupFormat[] = ['json', 'csv', 'xlsx'];

  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [backupReason, setBackupReason] = useState('');
  const [backupScope, setBackupScope] = useState<{ scope: 'all' | 'category'; categoryKey?: string; title: string }>({
    scope: 'all',
    title: 'Semua Data HRP',
  });
  const [selectedFormats, setSelectedFormats] = useState<BackupFormat[]>(ALL_FORMATS);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupRunId, setBackupRunId] = useState<string | null>(null);
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null);
  const [progressTick, setProgressTick] = useState(Date.now());
  const [backupResult, setBackupResult] = useState<{
    success: boolean;
    backupId?: string;
    scope?: 'all' | 'category';
    categoryKey?: string;
    formats?: BackupFormat[];
    totalCollections?: number;
    totalDocuments?: number;
    totalFiles?: number;
    totalUploadedFiles?: number;
    totalJsonFiles?: number;
    totalCsvFiles?: number;
    totalXlsxFiles?: number;
    durationSeconds?: number;
    finishedAt?: string;
    googleDriveBackupFolderLink?: string;
    manifestWebViewLink?: string;
    summaryWebViewLink?: string;
    errors?: string[];
  } | null>(null);

  const toggleFormat = useCallback((fmt: BackupFormat) => {
    setSelectedFormats(prev =>
      prev.includes(fmt)
        ? prev.length > 1 ? prev.filter(f => f !== fmt) : prev  // jaga minimal 1
        : [...prev, fmt],
    );
  }, []);

  useEffect(() => {
    if (!backupRunId) return;
    const unsub = onSnapshot(
      doc(firestore, 'backup_progress', backupRunId),
      snap => {
        if (snap.exists()) setBackupProgress(snap.data() as BackupProgress);
      },
      err => {
        console.warn('backup_progress snapshot error:', err.code);
      },
    );
    return () => unsub();
  }, [firestore, backupRunId]);

  useEffect(() => {
    if (!isBackingUp) return;
    const timer = window.setInterval(() => setProgressTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isBackingUp]);

  const backupProgressView = useMemo(() => {
    const percent = Math.max(0, Math.min(100, Math.round(backupProgress?.progressPercent ?? 0)));
    const startedAt = toDateSafe(backupProgress?.startedAt);
    const elapsedSeconds = startedAt ? Math.max(0, Math.round((progressTick - startedAt.getTime()) / 1000)) : 0;
    const etaSeconds = percent > 5 && percent < 100 && elapsedSeconds > 0
      ? Math.round((elapsedSeconds / percent) * (100 - percent))
      : null;
    const activity = (backupProgress?.activityLog ?? [])
      .slice(-8)
      .reverse()
      .map(entry => {
        const [, message = entry] = entry.split('|');
        return message;
      });
    return { percent, elapsedSeconds, etaSeconds, activity };
  }, [backupProgress, progressTick]);

  const handleRunBackup = useCallback(async (override?: {
    reason?: string;
    scope?: 'all' | 'category';
    categoryKey?: string;
    formats?: ('json' | 'csv' | 'xlsx')[];
  }) => {
    if (!firebaseUser) return;
    const runReason = override?.reason ?? backupReason.trim();
    const runScope = override?.scope ?? backupScope.scope;
    const runCategoryKey = override?.categoryKey ?? backupScope.categoryKey;
    const runFormats = override?.formats ?? selectedFormats;
    const runId = `backup_${Date.now()}_${firebaseUser.uid.slice(0, 8)}`;

    setBackupRunId(runId);
    setBackupProgress({
      backupId: runId,
      status: 'running',
      step: 'prepare',
      stepLabel: 'Menyiapkan data',
      progressPercent: 0,
      completedCategories: 0,
      totalCategories: runScope === 'category' ? 1 : 9,
      totalDocumentsProcessed: 0,
      totalFilesUploaded: 0,
      activityLog: ['Menyiapkan request backup'],
      startedAt: new Date().toISOString(),
    });
    setProgressTick(Date.now());
    setBackupModalOpen(true);
    setIsBackingUp(true);
    setBackupResult(null);

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) throw new Error('Token tidak tersedia. Silakan login ulang.');

      const res = await fetch('/api/admin/backup/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          backupId: runId,
          mode: 'backup_to_drive',
          type: 'manual',
          scope: runScope,
          categoryKey: runCategoryKey,
          reason: runReason,
          formats: runFormats,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);

      setBackupResult(data);
      if (data.success) {
        const finishedDate = data.finishedAt
          ? new Date(data.finishedAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
          : new Date().toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
        toast({ title: 'Backup berhasil disimpan ke Google Drive.', description: `Backup selesai pada ${finishedDate} WIB.` });
      } else {
        toast({ variant: 'destructive', title: 'Backup ke Google Drive gagal.', description: 'Periksa akses service account atau konfigurasi folder backup.' });
      }
    } catch (err: any) {
      setBackupProgress(prev => ({
        ...(prev ?? { backupId: runId }),
        status: 'failed',
        step: 'failed',
        stepLabel: 'Backup gagal',
        error: err.message,
        activityLog: [...(prev?.activityLog ?? []), `Backup gagal: ${err.message}`],
      }));
      setBackupResult({ success: false, errors: [err.message] });
      toast({ variant: 'destructive', title: 'Backup ke Google Drive gagal.', description: 'Periksa akses service account atau konfigurasi folder backup.' });
    } finally {
      setIsBackingUp(false);
    }
  }, [firebaseUser, backupReason, selectedFormats, backupScope, toast]);

  const openBackupModal = useCallback((scope: 'all' | 'category' = 'all', categoryKey?: string, title = 'Semua Data HRP') => {
    setBackupReason('');
    setBackupScope({ scope, categoryKey, title });
    setSelectedFormats(ALL_FORMATS);
    setBackupResult(null);
    setBackupRunId(null);
    setBackupProgress(null);
    setBackupModalOpen(true);
  }, []);

  const lastBackup = backupLogs[0] ?? null;

  // ── Backup Settings ───────────────────────────────────────────────────────
  const [backupSettings, setBackupSettings] = useState<BackupSettings | null>(null);
  const [editSettings, setEditSettings] = useState<BackupSettings>(DEFAULT_BACKUP_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [schedulerGuideOpen, setSchedulerGuideOpen] = useState(false);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const unsub = onSnapshot(
      doc(firestore, 'system_settings', 'backup_export'),
      snap => {
        const data = snap.exists() ? (snap.data() as BackupSettings) : DEFAULT_BACKUP_SETTINGS;
        setBackupSettings(data);
        setEditSettings(data);
        setSettingsLoading(false);
      },
      err => { console.warn('backup settings snapshot error:', err.code); setSettingsLoading(false); },
    );
    return () => unsub();
  }, [firestore, firebaseUser?.uid]);

  const handleSaveSettings = useCallback(async () => {
    if (!firebaseUser || !userProfile) return;
    setSavingSettings(true);
    try {
      await setDoc(
        doc(firestore, 'system_settings', 'backup_export'),
        {
          ...editSettings,
          updatedAt: serverTimestamp(),
          updatedByUid: firebaseUser.uid,
          updatedByName: userProfile.fullName || firebaseUser.email || firebaseUser.uid,
        },
        { merge: true },
      );
      toast({ title: 'Pengaturan Disimpan', description: 'Konfigurasi backup otomatis berhasil diperbarui.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: err.message });
    } finally {
      setSavingSettings(false);
    }
  }, [firestore, firebaseUser, userProfile, editSettings, toast]);

  const toggleSettingsFormat = useCallback((fmt: 'json' | 'csv' | 'xlsx') => {
    setEditSettings(prev => {
      const fmts = prev.backupFormats ?? [];
      const next = fmts.includes(fmt)
        ? fmts.length > 1 ? fmts.filter(f => f !== fmt) : fmts
        : [...fmts, fmt];
      return { ...prev, backupFormats: next };
    });
  }, []);

  // ── Google Drive OAuth connection ─────────────────────────────────────────
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveDisconnecting, setDriveDisconnecting] = useState(false);
  const [driveTesting, setDriveTesting] = useState(false);
  const [driveTestResult, setDriveTestResult] = useState<{ success: boolean; message: string; fileLink?: string } | null>(null);
  const [driveApiStatus, setDriveApiStatus] = useState<{
    oauthConfigured: boolean;
    driveConnected: boolean;
    driveAccountEmail?: string | null;
    tokenValid?: boolean | null;
    folderAccessible?: boolean | null;
    folderId?: string;
  } | null>(null);
  const [driveStatusLoading, setDriveStatusLoading] = useState(false);
  const [oauthConfigModalOpen, setOauthConfigModalOpen] = useState(false);
  const oauthHandledRef = useRef(false);

  // Fetch drive status dari server (mengetahui apakah ENV OAuth sudah lengkap)
  useEffect(() => {
    if (!firebaseUser) return;
    setDriveStatusLoading(true);
    getAuth().currentUser?.getIdToken()
      .then(token => {
        if (!token) return;
        return fetch('/api/admin/google-drive/status', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then(data => { if (!data.error) setDriveApiStatus(data); });
      })
      .catch(() => {})
      .finally(() => setDriveStatusLoading(false));
  }, [firebaseUser, backupSettings?.driveConnected]);

  // Baca URL params saat mount — menangani redirect balik dari Google OAuth
  useEffect(() => {
    if (oauthHandledRef.current) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('driveConnected');
    const email     = params.get('driveEmail');
    const driveErr  = params.get('driveError');
    if (connected || driveErr) {
      oauthHandledRef.current = true;
      // Bersihkan URL params
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      if (connected === 'true') {
        toast({ title: 'Google Drive Terhubung', description: `Akun ${email ?? ''} berhasil terhubung ke Google Drive Backup.` });
      } else if (driveErr === 'no_refresh_token') {
        toast({ variant: 'destructive', title: 'Koneksi Gagal', description: 'Refresh token tidak diterima. Coba putuskan izin di myaccount.google.com/permissions lalu hubungkan ulang.' });
      } else if (driveErr === 'access_denied') {
        toast({ variant: 'destructive', title: 'Akses Ditolak', description: 'Pengguna tidak memberikan izin akses Google Drive.' });
      } else if (driveErr === 'server_misconfigured') {
        toast({ variant: 'destructive', title: 'Konfigurasi Server Salah', description: 'GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI belum dikonfigurasi di server.' });
      } else if (driveErr) {
        toast({ variant: 'destructive', title: 'Koneksi Google Drive Gagal', description: decodeURIComponent(driveErr) });
      }
    }
  }, [toast]);

  const handleConnectDrive = useCallback(async () => {
    if (!firebaseUser) return;
    // Jika ENV OAuth belum lengkap, tampilkan modal info — jangan redirect
    if (driveApiStatus && !driveApiStatus.oauthConfigured) {
      setOauthConfigModalOpen(true);
      return;
    }
    setDriveConnecting(true);
    try {
      const idToken = await getAuth().currentUser?.getIdToken(true);
      if (!idToken) throw new Error('Token tidak tersedia.');
      const returnUrl = window.location.pathname + window.location.search;
      const res = await fetch(`/api/admin/google-drive/auth-url?returnUrl=${encodeURIComponent(returnUrl)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        // ENV belum lengkap — tampilkan modal bukan toast
        if (data.error?.includes('belum dikonfigurasi')) {
          setOauthConfigModalOpen(true);
          return;
        }
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      window.location.href = data.authUrl;
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal memulai OAuth', description: 'Konfigurasi OAuth belum lengkap.' });
      setDriveConnecting(false);
    }
  }, [firebaseUser, driveApiStatus, toast]);

  const handleDisconnectDrive = useCallback(async () => {
    if (!firebaseUser || !confirm('Yakin ingin memutus koneksi Google Drive? Backup otomatis tidak akan berjalan setelah ini.')) return;
    setDriveDisconnecting(true);
    try {
      const idToken = await getAuth().currentUser?.getIdToken(true);
      if (!idToken) throw new Error('Token tidak tersedia.');
      const res = await fetch('/api/admin/google-drive/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast({ title: 'Google Drive Diputus', description: 'Koneksi Google Drive berhasil diputus.' });
      setDriveTestResult(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal memutus koneksi', description: err.message });
    } finally {
      setDriveDisconnecting(false);
    }
  }, [firebaseUser, toast]);

  const handleTestDrive = useCallback(async () => {
    if (!firebaseUser) return;
    setDriveTesting(true);
    setDriveTestResult(null);
    try {
      const idToken = await getAuth().currentUser?.getIdToken(true);
      if (!idToken) throw new Error('Token tidak tersedia.');
      const res = await fetch('/api/admin/google-drive/status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDriveTestResult({ success: true, message: data.message ?? 'Upload berhasil!', fileLink: data.webViewLink });
      toast({ title: 'Test Upload Berhasil', description: 'File test berhasil diupload ke folder backup Google Drive.' });
    } catch (err: any) {
      setDriveTestResult({ success: false, message: err.message });
      toast({ variant: 'destructive', title: 'Test Upload Gagal', description: err.message });
    } finally {
      setDriveTesting(false);
    }
  }, [firebaseUser, toast]);

  // ── Critical errors only (block action) ──────────────────────────────────
  const criticalErrors = useMemo(() => {
    const errs: string[] = [];
    if (!backupSettings?.googleDriveBackupFolderId) {
      errs.push('Folder backup Google Drive belum dikonfigurasi (GOOGLE_DRIVE_BACKUP_FOLDER_ID).');
    }
    if (backupSettings?.driveAuthMode === 'oauth_user' && !backupSettings?.driveConnected) {
      errs.push('Google Drive OAuth belum terhubung. Backup tidak akan berjalan.');
    }
    if (lastBackup?.status === 'failed') {
      errs.push(`Backup terakhir GAGAL pada ${formatDateTime(lastBackup.createdAt)}.`);
    }
    return errs;
  }, [backupSettings, lastBackup]);

  // ── Status checklist items ─────────────────────────────────────────────────
  const statusItems = useMemo(() => {
    const driveMode = backupSettings?.driveAuthMode;
    const driveOk = driveMode === 'oauth_user'
      ? backupSettings?.driveConnected === true
      : driveMode === 'service_account'; // service account selalu "configured" jika ENV ada

    const lastMs = lastBackup?.createdAt?.toDate?.()?.getTime() ?? 0;
    const hoursAgo = lastBackup ? (Date.now() - lastMs) / 3_600_000 : null;
    const backupStatus = !lastBackup
      ? { color: 'gray' as const, label: 'Belum Ada' }
      : lastBackup.status === 'failed'
      ? { color: 'red' as const, label: 'Terakhir Gagal' }
      : hoursAgo != null && hoursAgo > 25
      ? { color: 'yellow' as const, label: `${Math.round(hoursAgo)} jam lalu` }
      : { color: 'green' as const, label: formatDateTime(lastBackup.createdAt) };

    return [
      {
        label: 'Audit Log',
        status: 'green' as const,
        value: 'Aktif',
        note: 'Semua backup & export dicatat otomatis.',
      },
      {
        label: 'Google Drive',
        status: driveOk ? 'green' as const : 'yellow' as const,
        value: driveOk
          ? (driveMode === 'oauth_user' ? `OAuth — ${backupSettings?.driveAccountEmail ?? '—'}` : 'Service Account')
          : 'Belum Terhubung',
        note: driveMode === 'service_account' ? 'Gunakan OAuth User jika folder di My Drive.' : undefined,
      },
      {
        label: 'Folder Backup',
        status: backupSettings?.googleDriveBackupFolderId ? 'green' as const : 'red' as const,
        value: backupSettings?.googleDriveBackupFolderId ? 'Terkonfigurasi' : 'Belum Dikonfigurasi',
      },
      {
        label: 'Riwayat Backup',
        status: backupStatus.color,
        value: backupStatus.label,
      },
      {
        label: 'Mode Upload',
        status: driveMode === 'oauth_user' ? 'green' as const : driveMode === 'service_account' ? 'yellow' as const : 'gray' as const,
        value: driveMode === 'oauth_user' ? 'OAuth User (My Drive)' : driveMode === 'service_account' ? 'Service Account (Shared Drive)' : 'Belum Dipilih',
      },
    ];
  }, [backupSettings, lastBackup]);

  const autoBackupReadiness = useMemo(() => {
    const autoEnabled = Boolean(editSettings.autoBackupEnabled);
    const scheduleEnabled = Boolean(editSettings.dailyBackupEnabled || editSettings.weeklyBackupEnabled || editSettings.monthlyBackupEnabled);
    const cloudRunConfigured = Boolean(editSettings.cloudRunServiceUrl?.trim());
    const driveFolderConfigured = Boolean(editSettings.googleDriveBackupFolderId?.trim());
    const lastStatus = lastBackup?.status;
    const readyForSchedule = autoEnabled && scheduleEnabled && cloudRunConfigured;

    const badge = !autoEnabled
      ? { label: 'Nonaktif', className: 'bg-slate-100 text-slate-500' }
      : readyForSchedule
        ? { label: 'Siap Dijadwalkan', className: 'bg-emerald-100 text-emerald-700' }
        : { label: 'Perlu Konfigurasi', className: 'bg-amber-100 text-amber-700' };

    const warnings: string[] = [];
    if (autoEnabled && !scheduleEnabled) warnings.push('Backup otomatis aktif, tetapi belum ada jadwal yang dinyalakan.');
    if (autoEnabled && !cloudRunConfigured) warnings.push('Backup otomatis aktif, tetapi Cloud Function/Cloud Run belum terhubung.');
    if (autoEnabled && !backupLogsLoading && !lastBackup) warnings.push('Backup otomatis belum pernah berjalan. Jalankan backup manual atau cek Google Cloud Scheduler.');
    if (!driveFolderConfigured) warnings.push('Folder backup Google Drive belum dikonfigurasi.');
    if (lastStatus === 'failed') warnings.push('Backup terakhir gagal. Periksa detail di Riwayat Backup.');

    return {
      autoEnabled,
      scheduleEnabled,
      cloudRunConfigured,
      driveFolderConfigured,
      lastStatus,
      readyForSchedule,
      badge,
      warnings,
    };
  }, [editSettings, lastBackup, backupLogsLoading]);

  const handleTestManualBackup = useCallback(() => {
    const reason = 'Test backup manual dari Pengaturan Backup Otomatis';
    setBackupReason(reason);
    setBackupScope({ scope: 'all', title: 'Test Backup Manual' });
    setSelectedFormats(ALL_FORMATS);
    setBackupResult(null);
    void handleRunBackup({ reason, scope: 'all', formats: ALL_FORMATS });
  }, [handleRunBackup]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 pb-10">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Backup &amp; Export</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kelola export data HRP untuk kebutuhan backup, audit, payroll, dan arsip perusahaan.
        </p>
      </div>

      {/* ── Info bar (satu baris, tidak mencolok) ────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <Shield className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        Data backup bersifat sensitif. Semua aktivitas backup dan export dicatat ke Audit Log.
      </div>

      {/* ── Status Backup & Koneksi ───────────────────────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">Status Backup &amp; Koneksi</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {statusItems.map(item => {
              const dot = item.status === 'green'  ? 'bg-emerald-500'
                        : item.status === 'red'    ? 'bg-red-500'
                        : item.status === 'yellow' ? 'bg-amber-400'
                        :                            'bg-slate-300';
              const valueColor = item.status === 'green'  ? 'text-emerald-700'
                               : item.status === 'red'    ? 'text-red-600'
                               : item.status === 'yellow' ? 'text-amber-700'
                               :                            'text-slate-500';
              return (
                <div key={item.label} className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dot)} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{item.label}</p>
                    <p className={cn('mt-0.5 text-xs font-semibold truncate', valueColor)}>{item.value}</p>
                    {item.note && <p className="mt-0.5 text-[10px] text-slate-400 leading-snug">{item.note}</p>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Critical errors — hanya jika benar-benar menghalangi */}
          {criticalErrors.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {criticalErrors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                  {err}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Google Drive Connection Card ──────────────────────────────────────── */}
      {(() => {
        const isOAuthMode = backupSettings?.driveAuthMode === 'oauth_user';
        const isSAMode    = backupSettings?.driveAuthMode === 'service_account';
        const isConnected = isOAuthMode && backupSettings?.driveConnected;
        const oauthReady  = driveApiStatus?.oauthConfigured ?? false;
        const folderId    = backupSettings?.googleDriveBackupFolderId ?? '';

        const prereqs = [
          { key: 'CLIENT_ID',     label: 'GOOGLE_OAUTH_CLIENT_ID',     ok: oauthReady },
          { key: 'CLIENT_SECRET', label: 'GOOGLE_OAUTH_CLIENT_SECRET',  ok: oauthReady },
          { key: 'REDIRECT_URI',  label: 'GOOGLE_OAUTH_REDIRECT_URI',   ok: oauthReady },
          { key: 'FOLDER_ID',     label: 'GOOGLE_DRIVE_BACKUP_FOLDER_ID', ok: !!folderId },
        ];

        return (
          <Card className="border-blue-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                    <HardDrive className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Koneksi Google Drive Backup</CardTitle>
                    <CardDescription className="mt-0.5 text-xs">
                      Gunakan OAuth User untuk My Drive, atau Service Account untuk Shared Drive.
                    </CardDescription>
                  </div>
                </div>
                {settingsLoading ? (
                  <Skeleton className="h-6 w-24 rounded-full" />
                ) : isConnected ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle className="h-3 w-3" />
                    OAuth Terhubung
                  </div>
                ) : isSAMode ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    <Shield className="h-3 w-3" />
                    Service Account
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                    <WifiOff className="h-3 w-3" />
                    Belum Terhubung
                  </div>
                )}
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="pt-5 space-y-5">
              {settingsLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
              ) : (
                <>
                  {/* ── Mode selector ── */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600">Mode Koneksi Google Drive</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { mode: 'oauth_user'      as const, title: 'OAuth User',      sub: 'Untuk My Drive biasa',   icon: Link },
                        { mode: 'service_account' as const, title: 'Service Account', sub: 'Untuk Shared Drive',     icon: Shield },
                      ]).map(({ mode, title, sub, icon: Icon }) => {
                        const active = backupSettings?.driveAuthMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={async () => {
                              if (!firebaseUser || active) return;
                              const idToken = await getAuth().currentUser?.getIdToken(true);
                              if (!idToken) return;
                              await fetch('/api/admin/google-drive/disconnect', {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${idToken}` },
                              }).catch(() => {});
                              await setDoc(doc(firestore, 'system_settings', 'backup_export'), { driveAuthMode: mode }, { merge: true });
                              toast({ title: 'Mode diubah', description: `Mode backup Drive diganti ke ${title}.` });
                            }}
                            className={cn(
                              'flex items-center gap-2 rounded-lg border p-3 text-left text-xs transition-colors',
                              active
                                ? 'border-blue-300 bg-blue-50 text-blue-800 font-medium'
                                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50',
                            )}
                          >
                            <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-blue-600' : 'text-slate-400')} />
                            <div>
                              <p className="font-semibold">{title}</p>
                              <p className={cn('text-[10px]', active ? 'text-blue-600' : 'text-slate-400')}>{sub}</p>
                            </div>
                            {active && <CheckCircle className="ml-auto h-3.5 w-3.5 text-blue-500" />}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Gunakan OAuth User jika folder backup berada di My Drive biasa. Gunakan Service Account hanya jika folder backup berada di Shared Drive.
                    </p>
                  </div>

                  {/* ── OAuth User section ── */}
                  {isOAuthMode && (
                    <div className="space-y-3">
                      {/* Prereqs checklist */}
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-1.5">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Prasyarat OAuth</p>
                        {driveStatusLoading ? (
                          <div className="space-y-1">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
                        ) : (
                          prereqs.map(p => (
                            <div key={p.key} className="flex items-center gap-2 text-xs">
                              {p.ok
                                ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                              <code className="text-slate-600">{p.label}</code>
                              <span className={cn('ml-auto text-[10px] font-medium', p.ok ? 'text-emerald-600' : 'text-red-500')}>
                                {p.ok ? 'Tersedia' : 'Belum tersedia'}
                              </span>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Connected state */}
                      {isConnected ? (
                        <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold text-emerald-800">Akun Terhubung</p>
                            <p className="text-xs text-emerald-700">{backupSettings.driveAccountEmail}</p>
                            {backupSettings.driveConnectedAt && (
                              <p className="text-[10px] text-emerald-600">Sejak {formatDateTime(backupSettings.driveConnectedAt)}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Button size="sm" variant="outline" onClick={handleTestDrive} disabled={driveTesting}
                              className="h-7 gap-1 text-xs border-blue-200 text-blue-700 hover:bg-blue-50">
                              {driveTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube2 className="h-3 w-3" />}
                              Test
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleConnectDrive} disabled={driveConnecting}
                              className="h-7 gap-1 text-xs border-amber-200 text-amber-700 hover:bg-amber-50">
                              {driveConnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link className="h-3 w-3" />}
                              Ganti
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleDisconnectDrive} disabled={driveDisconnecting}
                              className="h-7 gap-1 text-xs border-red-200 text-red-700 hover:bg-red-50">
                              {driveDisconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <LinkOff className="h-3 w-3" />}
                              Putus
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* Not connected */
                        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-center">
                          <p className="text-xs text-slate-500">
                            Hubungkan akun Google yang memiliki akses ke folder backup.
                          </p>
                          <Button
                            onClick={handleConnectDrive}
                            disabled={driveConnecting || (!oauthReady && !driveStatusLoading)}
                            title={!oauthReady ? 'Lengkapi konfigurasi OAuth di server terlebih dahulu.' : undefined}
                            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                          >
                            {driveConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
                            {driveConnecting ? 'Mengarahkan...' : 'Hubungkan Google Drive'}
                          </Button>
                          {!oauthReady && !driveStatusLoading && (
                            <p className="text-[11px] text-amber-600">
                              Lengkapi prasyarat OAuth di atas terlebih dahulu.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Test result inline */}
                      {driveTestResult && (
                        <div className={cn(
                          'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
                          driveTestResult.success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700',
                        )}>
                          {driveTestResult.success
                            ? <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-500" />
                            : <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" />}
                          <span>
                            {driveTestResult.message}
                            {driveTestResult.fileLink && (
                              <a href={driveTestResult.fileLink} target="_blank" rel="noopener noreferrer" className="ml-1.5 underline">
                                Lihat file
                              </a>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Service Account section ── */}
                  {isSAMode && (
                    <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3 text-xs text-amber-800 space-y-1">
                      <p className="font-semibold">Mode Service Account</p>
                      <p>Service account tidak memiliki storage quota dan hanya dapat upload ke <strong>Shared Drive</strong>. Pastikan folder backup sudah dipindahkan ke Shared Drive dan service account sudah ditambahkan sebagai anggota.</p>
                      <p className="text-[10px] text-amber-600 mt-1">Jika folder backup berada di My Drive, ganti ke mode OAuth User.</p>
                    </div>
                  )}

                  {/* Folder backup ID */}
                  {folderId && (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <FolderOpen className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-400">Folder Backup ID</p>
                        <code className="text-xs text-slate-600 truncate block">{folderId}</code>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Auto Backup Settings ─────────────────────────────────────────────── */}
      <Card className="border-violet-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
                <Settings className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <CardTitle className="text-base">Pengaturan Backup Otomatis</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Dijalankan oleh Google Cloud Scheduler — tidak bergantung pada Vercel.
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {settingsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : (
                <>
                  <div className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', autoBackupReadiness.badge.className)}>
                    <Zap className="h-3 w-3" />
                    {autoBackupReadiness.badge.label}
                  </div>
                  {lastBackup?.status === 'success' && (
                    <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Backup Terakhir Berhasil
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5">
          {settingsLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="space-y-6">

              {/* Global toggle */}
              <div className="flex items-center justify-between rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Backup Otomatis</p>
                  <p className="mt-0.5 text-xs text-slate-500">Aktifkan/nonaktifkan semua jadwal backup otomatis</p>
                  <p className="mt-1 text-xs text-violet-700">
                    Toggle ini hanya mengaktifkan fitur backup otomatis di HRP. Jadwal tetap harus dinyalakan pada Harian/Mingguan/Bulanan dan Cloud Scheduler harus dikonfigurasi.
                  </p>
                </div>
                <Switch
                  checked={editSettings.autoBackupEnabled}
                  onCheckedChange={v => setEditSettings(p => ({ ...p, autoBackupEnabled: v }))}
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Status Kesiapan Backup Otomatis</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Aktif berarti pengaturan HRP menyala. Backup otomatis tetap membutuhkan jadwal, URL Cloud Run/Function, Cloud Scheduler, dan akses Drive.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setSchedulerGuideOpen(true)} className="h-8 gap-1.5 text-xs">
                      <Info className="h-3.5 w-3.5" />
                      Cek Panduan Scheduler
                    </Button>
                    <Button type="button" size="sm" onClick={handleTestManualBackup} disabled={isBackingUp} className="h-8 gap-1.5 bg-blue-600 text-xs text-white hover:bg-blue-700">
                      {isBackingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                      Test Backup Manual
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <ReadinessCheckItem
                    label="Backup Otomatis"
                    status={autoBackupReadiness.autoEnabled ? 'Aktif' : 'Nonaktif'}
                    tone={autoBackupReadiness.autoEnabled ? 'success' : 'muted'}
                    description={autoBackupReadiness.autoEnabled ? 'Pengaturan backup otomatis di HRP sedang aktif.' : 'Backup otomatis tidak akan dijalankan secara terjadwal.'}
                  />
                  <ReadinessCheckItem
                    label="Jadwal Backup"
                    status={autoBackupReadiness.scheduleEnabled ? 'Aktif' : 'Belum aktif'}
                    tone={autoBackupReadiness.scheduleEnabled ? 'success' : 'warning'}
                    description={autoBackupReadiness.scheduleEnabled ? 'Minimal satu jadwal harian/mingguan/bulanan sudah dinyalakan.' : 'Nyalakan minimal satu jadwal backup.'}
                  />
                  <ReadinessCheckItem
                    label="Cloud Function / Cloud Run URL"
                    status={autoBackupReadiness.cloudRunConfigured ? 'Terisi' : 'Belum dikonfigurasi'}
                    tone={autoBackupReadiness.cloudRunConfigured ? 'success' : 'warning'}
                    description={autoBackupReadiness.cloudRunConfigured ? 'URL target scheduler sudah tersimpan di HRP.' : 'Isi URL Cloud Run/Cloud Function untuk target scheduler.'}
                  />
                  <ReadinessCheckItem
                    label="Google Drive Backup Folder"
                    status={autoBackupReadiness.driveFolderConfigured ? 'Terhubung' : 'Belum terhubung'}
                    tone={autoBackupReadiness.driveFolderConfigured ? 'success' : 'danger'}
                    description={autoBackupReadiness.driveFolderConfigured ? 'Folder ID backup tersedia di konfigurasi HRP.' : 'GOOGLE_DRIVE_BACKUP_FOLDER_ID atau folder backup belum tersedia.'}
                  />
                  <ReadinessCheckItem
                    label="Backup Terakhir"
                    status={backupLogsLoading ? 'Memuat' : lastBackup?.status === 'success' ? 'Berhasil' : lastBackup?.status === 'failed' ? 'Gagal' : lastBackup ? 'Belum sukses penuh' : 'Belum pernah berjalan'}
                    tone={backupLogsLoading ? 'muted' : lastBackup?.status === 'success' ? 'success' : lastBackup?.status === 'failed' ? 'danger' : 'warning'}
                    description={backupLogsLoading ? 'Membaca riwayat backup terakhir.' : lastBackup ? `Terakhir tercatat: ${formatDateTime(lastBackup.createdAt)}.` : 'Belum ada backup_logs. Jalankan test backup manual atau cek scheduler.'}
                  />
                  <ReadinessCheckItem
                    label="Scheduler"
                    status="Perlu dicek di Google Cloud Scheduler"
                    tone="warning"
                    description="Pastikan job Google Cloud Scheduler sudah dibuat dan mengarah ke Cloud Function URL ini."
                  />
                </div>

                {autoBackupReadiness.warnings.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {autoBackupReadiness.warnings.map(message => (
                      <Alert key={message} className="border-amber-200 bg-amber-50">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="text-xs text-amber-800">{message}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}

                <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  Catatan: Toggle aktif hanya menyimpan pengaturan di HRP. Backup otomatis benar-benar berjalan jika Google Cloud Scheduler sudah dibuat dan berhasil memanggil Cloud Function/Cloud Run sesuai jadwal.
                </p>
              </div>

              {/* Schedule grid */}
              <div className="grid gap-4 md:grid-cols-3">
                {/* Daily */}
                <div className={cn('rounded-xl border p-4 space-y-3', editSettings.dailyBackupEnabled ? 'border-teal-200 bg-teal-50/30' : 'border-slate-200 bg-slate-50/40')}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-teal-600" />
                      <span className="text-sm font-semibold text-slate-800">Backup Harian</span>
                    </div>
                    <Switch
                      checked={editSettings.dailyBackupEnabled}
                      onCheckedChange={v => setEditSettings(p => ({ ...p, dailyBackupEnabled: v }))}
                      disabled={!editSettings.autoBackupEnabled}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">Jam (WIB)</Label>
                    <Input
                      type="time"
                      value={editSettings.dailyBackupTime}
                      onChange={e => setEditSettings(p => ({ ...p, dailyBackupTime: e.target.value }))}
                      disabled={!editSettings.dailyBackupEnabled}
                      className="h-8 text-xs"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">Jika aktif, backup harian akan berjalan sesuai jadwal Cloud Scheduler harian.</p>
                  <p className="text-[11px] text-slate-400">Default: 23:55 WIB setiap hari</p>
                </div>

                {/* Weekly */}
                <div className={cn('rounded-xl border p-4 space-y-3', editSettings.weeklyBackupEnabled ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-slate-50/40')}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-semibold text-slate-800">Backup Mingguan</span>
                    </div>
                    <Switch
                      checked={editSettings.weeklyBackupEnabled}
                      onCheckedChange={v => setEditSettings(p => ({ ...p, weeklyBackupEnabled: v }))}
                      disabled={!editSettings.autoBackupEnabled}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-500">Hari</Label>
                      <Select value={editSettings.weeklyBackupDay} onValueChange={v => setEditSettings(p => ({ ...p, weeklyBackupDay: v }))} disabled={!editSettings.weeklyBackupEnabled}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d => (
                            <SelectItem key={d} value={d} className="text-xs capitalize">{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-500">Jam (WIB)</Label>
                      <Input type="time" value={editSettings.weeklyBackupTime} onChange={e => setEditSettings(p => ({ ...p, weeklyBackupTime: e.target.value }))} disabled={!editSettings.weeklyBackupEnabled} className="h-8 text-xs" />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">Jika aktif, backup mingguan akan dijalankan oleh scheduler mingguan.</p>
                  <p className="text-[11px] text-slate-400">Default: Minggu 23:00 WIB</p>
                </div>

                {/* Monthly */}
                <div className={cn('rounded-xl border p-4 space-y-3', editSettings.monthlyBackupEnabled ? 'border-purple-200 bg-purple-50/30' : 'border-slate-200 bg-slate-50/40')}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-semibold text-slate-800">Backup Bulanan</span>
                    </div>
                    <Switch
                      checked={editSettings.monthlyBackupEnabled}
                      onCheckedChange={v => setEditSettings(p => ({ ...p, monthlyBackupEnabled: v }))}
                      disabled={!editSettings.autoBackupEnabled}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-500">Tanggal</Label>
                      <Input type="number" min={1} max={28} value={editSettings.monthlyBackupDate} onChange={e => setEditSettings(p => ({ ...p, monthlyBackupDate: Number(e.target.value) }))} disabled={!editSettings.monthlyBackupEnabled} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-500">Jam (WIB)</Label>
                      <Input type="time" value={editSettings.monthlyBackupTime} onChange={e => setEditSettings(p => ({ ...p, monthlyBackupTime: e.target.value }))} disabled={!editSettings.monthlyBackupEnabled} className="h-8 text-xs" />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">Jika aktif, backup bulanan akan dijalankan pada tanggal yang ditentukan.</p>
                  <p className="text-[11px] text-slate-400">Default: Tgl 1 jam 00:30 WIB</p>
                </div>
              </div>

              {/* Format + Retention + Drive folder */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-slate-600">Format Backup</Label>
                  <div className="flex gap-2">
                    {(['json', 'csv', 'xlsx'] as const).map(fmt => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => toggleSettingsFormat(fmt)}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                          editSettings.backupFormats?.includes(fmt)
                            ? fmt === 'json' ? 'border-blue-300 bg-blue-100 text-blue-700'
                            : fmt === 'csv'  ? 'border-teal-300 bg-teal-100 text-teal-700'
                            :                  'border-emerald-300 bg-emerald-100 text-emerald-700'
                            : 'border-slate-200 bg-slate-50 text-slate-400',
                        )}
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-slate-600">Retensi Backup (hari)</Label>
                  <Input
                    type="number"
                    min={7}
                    max={365}
                    value={editSettings.retentionDays}
                    onChange={e => setEditSettings(p => ({ ...p, retentionDays: Number(e.target.value) }))}
                    className="h-8 text-sm"
                  />
                  <p className="text-[11px] text-slate-400">File lama di Drive tidak otomatis dihapus</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-slate-600">Cloud Run Service URL</Label>
                  <Input
                    type="url"
                    placeholder="https://hrp-cloud-backup-xxx.run.app"
                    value={editSettings.cloudRunServiceUrl ?? ''}
                    onChange={e => setEditSettings(p => ({ ...p, cloudRunServiceUrl: e.target.value }))}
                    className="h-8 text-xs"
                  />
                  <p className="text-[11px] text-slate-400">Setelah deploy Cloud Run</p>
                </div>
              </div>

              {/* Drive folder info */}
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <FolderOpen className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-600">Google Drive Backup Folder</p>
                  <p className="truncate text-[11px] font-mono text-slate-400">{editSettings.googleDriveBackupFolderId || '—'}</p>
                </div>
                {editSettings.googleDriveBackupFolderId && (
                  <a
                    href={`https://drive.google.com/drive/folders/${editSettings.googleDriveBackupFolderId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs text-blue-600 hover:underline"
                  >
                    Buka →
                  </a>
                )}
              </div>

              {/* Last updated info */}
              {backupSettings?.updatedAt && (
                <p className="text-[11px] text-slate-400">
                  Terakhir diperbarui: {formatDateTime(backupSettings.updatedAt)} oleh {backupSettings.updatedByName ?? '—'}
                </p>
              )}

              <div className="flex justify-end">
                <Button onClick={handleSaveSettings} disabled={savingSettings} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                  {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Simpan Pengaturan
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={schedulerGuideOpen} onOpenChange={setSchedulerGuideOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-violet-600" />
              Panduan Google Cloud Scheduler
            </DialogTitle>
            <DialogDescription>
              Gunakan langkah ini agar backup otomatis benar-benar dipanggil sesuai jadwal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {[
              'Buka Google Cloud Scheduler.',
              'Buat job harian, mingguan, atau bulanan sesuai jadwal yang diaktifkan di HRP.',
              'Isi Target URL dengan Cloud Run/Cloud Function URL.',
              'Gunakan method POST.',
              'Tambahkan Authorization secret jika endpoint backup scheduler menggunakannya.',
              'Pastikan service account memiliki akses ke Google Drive folder backup.',
            ].map((step, index) => (
              <div key={step} className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">
                  {index + 1}
                </span>
                <p className="text-sm text-slate-700">{step}</p>
              </div>
            ))}
            <Alert className="border-blue-200 bg-blue-50">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-xs text-blue-800">
                Scheduler tidak bisa divalidasi otomatis dari halaman ini. Setelah job dibuat, gunakan Test Backup Manual untuk memastikan API, akses Drive, backup_logs, dan audit_logs berjalan.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button onClick={() => setSchedulerGuideOpen(false)} className="bg-violet-600 text-white hover:bg-violet-700">
              Mengerti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Backup Section ──────────────────────────────────────────────────── */}
      <Card className="border-blue-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                <HardDrive className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-base">Backup ke Google Drive</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Simpan salinan data HRP ke folder Google Drive backup secara otomatis dan terstruktur. File tidak akan didownload ke laptop.
                </CardDescription>
              </div>
            </div>
            <Button onClick={() => openBackupModal()} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm">
              <CloudUpload className="h-4 w-4" />
              Backup Semua Data ke Drive
            </Button>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5">
          {/* Backup stats row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Backup Terakhir</p>
              <p className="mt-1 text-lg font-bold text-slate-800">
                {backupLogsLoading ? '—' : lastBackup ? formatDateTime(lastBackup.createdAt) : 'Belum ada'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status Terakhir</p>
              <div className="mt-1">
                {backupLogsLoading ? (
                  <span className="text-lg font-bold text-slate-800">—</span>
                ) : lastBackup?.status === 'success' ? (
                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Sukses</Badge>
                ) : lastBackup?.status === 'partial_success' ? (
                  <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Parsial</Badge>
                ) : lastBackup?.status === 'failed' ? (
                  <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Gagal</Badge>
                ) : (
                  <span className="text-lg font-bold text-slate-800">—</span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Backup</p>
              <p className="mt-1 text-lg font-bold text-slate-800">
                {backupLogsLoading ? '—' : backupLogs.length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Gagal</p>
              <p className="mt-1 text-lg font-bold text-red-600">
                {backupLogsLoading ? '—' : backupLogs.filter(b => b.status === 'failed').length}
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Backup per Kategori ke Google Drive</p>
                <p className="mt-0.5 text-xs text-slate-500">Backup di sini selalu masuk Drive dan tidak mendownload file ke laptop.</p>
              </div>
              <Badge variant="outline" className="border-blue-200 bg-white text-blue-700">Drive</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {BACKUP_CATEGORY_ACTIONS.map(category => {
                const Icon = category.icon;
                return (
                  <Button
                    key={category.key}
                    type="button"
                    variant="outline"
                    onClick={() => openBackupModal('category', category.key, category.title)}
                    disabled={isBackingUp}
                    className={cn('h-auto justify-start gap-3 rounded-xl border-2 bg-white p-4 text-left text-sm font-semibold shadow-sm hover:bg-white disabled:opacity-50', category.className)}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>Backup {category.title}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Riwayat Backup table */}
          <div id="backup-history">
            <p className="mb-3 text-sm font-semibold text-slate-700">Riwayat Backup</p>
            {backupLogsLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : backupLogs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <HardDrive className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-600">Belum ada riwayat backup</p>
                <p className="text-xs text-slate-400">Klik &quot;Backup Semua Data ke Drive&quot; untuk memulai backup pertama.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 hover:bg-slate-50">
                        <TableHead className="whitespace-nowrap text-xs font-semibold text-slate-600">Waktu</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-600">Status</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-600">Tipe</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-600">Format</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-600">Total Collection</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-600">Total Dokumen</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-600">Dibuat Oleh</TableHead>
                        <TableHead className="max-w-[160px] text-xs font-semibold text-slate-600">Alasan</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-600">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {backupLogs.map(log => (
                        <TableRow key={log.id} className="hover:bg-slate-50/50">
                          <TableCell className="whitespace-nowrap text-xs text-slate-600">
                            {formatDateTime(log.createdAt)}
                          </TableCell>
                          <TableCell>
                            {log.status === 'success' ? (
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">Sukses</Badge>
                            ) : log.status === 'partial_success' ? (
                              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs">Parsial</Badge>
                            ) : log.status === 'failed' ? (
                              <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-xs">Gagal</Badge>
                            ) : (
                              <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 text-xs">{log.status ?? '—'}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const bt = log.backupType;
                              if (!bt) return <span className="text-xs text-slate-400">—</span>;
                              const cfg = {
                                manual:             { label: 'Manual',   cls: 'border-slate-300 text-slate-600 bg-slate-50' },
                                scheduled_daily:    { label: 'Harian',   cls: 'border-teal-300 text-teal-700 bg-teal-50' },
                                scheduled_weekly:   { label: 'Mingguan', cls: 'border-blue-300 text-blue-700 bg-blue-50' },
                                scheduled_monthly:  { label: 'Bulanan',  cls: 'border-purple-300 text-purple-700 bg-purple-50' },
                              }[bt] ?? { label: bt, cls: 'border-slate-200 text-slate-500' };
                              return <Badge variant="outline" className={cn('text-xs', cfg.cls)}>{cfg.label}</Badge>;
                            })()}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(log.formats ?? []).length > 0
                                ? (log.formats as string[]).map(f => (
                                    <span
                                      key={f}
                                      className={cn(
                                        'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                                        f === 'json'  ? 'bg-blue-100 text-blue-700'
                                        : f === 'csv' ? 'bg-amber-100 text-amber-700'
                                        :               'bg-emerald-100 text-emerald-700',
                                      )}
                                    >
                                      {f}
                                    </span>
                                  ))
                                : <span className="text-xs text-slate-400">—</span>
                              }
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-slate-700">
                            {log.totalCollections ?? '—'}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-slate-800">
                            {log.totalDocuments != null ? log.totalDocuments.toLocaleString('id-ID') : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {log.requestedByName ?? log.requestedByEmail ?? '—'}
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate text-xs text-slate-600">
                            {log.reason ?? '—'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {log.googleDriveBackupFolderLink ? (
                                <a
                                  href={log.googleDriveBackupFolderLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-blue-300 hover:text-blue-600"
                                >
                                  <FolderOpen className="h-3 w-3" />
                                  Buka Folder Drive
                                </a>
                              ) : null}
                              {log.manifestWebViewLink ? (
                                <a
                                  href={log.manifestWebViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-teal-300 hover:text-teal-600"
                                >
                                  <FileText className="h-3 w-3" />
                                  Manifest
                                </a>
                              ) : null}
                              {log.summaryWebViewLink ? (
                                <a
                                  href={log.summaryWebViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:border-emerald-300"
                                >
                                  <FileSpreadsheet className="h-3 w-3" />
                                  Ringkasan
                                </a>
                              ) : null}
                              {!log.googleDriveBackupFolderLink && !log.manifestWebViewLink && !log.summaryWebViewLink ? (
                                <span className="text-xs text-slate-400">—</span>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── OAuth Config Error Modal ──────────────────────────────────────────── */}
      <Dialog open={oauthConfigModalOpen} onOpenChange={setOauthConfigModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Konfigurasi OAuth Belum Lengkap
            </DialogTitle>
            <DialogDescription>
              Google Drive OAuth belum bisa dimulai karena beberapa environment variable belum diatur di server.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            {[
              { key: 'GOOGLE_OAUTH_CLIENT_ID',     desc: 'Client ID dari Google Cloud Console' },
              { key: 'GOOGLE_OAUTH_CLIENT_SECRET', desc: 'Client Secret dari Google Cloud Console' },
              { key: 'GOOGLE_OAUTH_REDIRECT_URI',  desc: 'Contoh: https://[domain]/api/admin/google-drive/callback' },
            ].map(item => (
              <div key={item.key} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <code className="text-xs font-semibold text-slate-700">{item.key}</code>
                <p className="mt-0.5 text-[11px] text-slate-500">{item.desc}</p>
              </div>
            ))}
            <p className="text-xs text-slate-500 pt-1">
              Tambahkan environment variable ini ke file <code>.env.local</code> (development) atau ke Vercel Environment Variables (production), lalu restart server.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOauthConfigModalOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Backup Confirmation Modal ────────────────────────────────────────── */}
      <Dialog open={backupModalOpen} onOpenChange={open => { if (!isBackingUp) setBackupModalOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-blue-600" />
              Backup ke Google Drive?
            </DialogTitle>
            <DialogDescription>
              File backup akan disimpan ke folder Google Drive backup dan tidak akan diunduh ke laptop.
            </DialogDescription>
          </DialogHeader>

          {!backupResult ? (
            isBackingUp ? (
              <>
                <div className="space-y-4 py-2">
                  <Alert className="border-blue-200 bg-blue-50">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <AlertDescription className="text-blue-800 text-xs">
                      Backup sedang berjalan di server. Jika modal tertutup atau koneksi browser terputus, proses server tetap berjalan dan hasilnya dicatat di Riwayat Backup.
                    </AlertDescription>
                  </Alert>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{backupProgress?.stepLabel ?? 'Menyiapkan data'}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {backupProgress?.currentCategoryLabel ? `Kategori aktif: ${backupProgress.currentCategoryLabel}` : 'Menunggu progress dari server...'}
                        </p>
                      </div>
                      <span className="text-lg font-bold text-blue-700">{backupProgressView.percent}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all duration-500"
                        style={{ width: `${backupProgressView.percent}%` }}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Kategori</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {backupProgress?.completedCategories ?? 0} dari {backupProgress?.totalCategories ?? (backupScope.scope === 'category' ? 1 : 9)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Dokumen</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {(backupProgress?.totalDocumentsProcessed ?? 0).toLocaleString('id-ID')}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Durasi</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{formatDuration(backupProgressView.elapsedSeconds)}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Estimasi sisa</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {backupProgressView.etaSeconds != null ? formatDuration(backupProgressView.etaSeconds) : 'Menghitung'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-600">File terupload ke Drive</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">{backupProgress?.totalFilesUploaded ?? 0}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-600">Kategori gagal</p>
                      <p className={cn('mt-1 text-xl font-bold', (backupProgress?.failedCategories ?? []).length > 0 ? 'text-red-600' : 'text-slate-900')}>
                        {(backupProgress?.failedCategories ?? []).length}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-xs font-semibold text-slate-600">Activity Log</p>
                    <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                      {backupProgressView.activity.length > 0 ? (
                        backupProgressView.activity.map((item, index) => (
                          <div key={`${item}-${index}`} className="flex items-start gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                            <span>{item}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400">Menunggu aktivitas dari server...</p>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" disabled className="cursor-not-allowed opacity-70">Tutup dinonaktifkan saat backup berjalan</Button>
                  <Button disabled className="gap-2 bg-blue-600 text-white opacity-80">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Backup sedang diproses
                  </Button>
                </DialogFooter>
              </>
            ) : (
            <>
              <div className="space-y-4 py-2">
                <Alert className="border-blue-200 bg-blue-50">
                  <AlertTriangle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 text-xs">
                    Backup berjalan di server dan hasilnya hanya dikirim ke Google Drive. Private key tidak pernah dikirim ke client.
                  </AlertDescription>
                </Alert>

                {/* Format selector */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Format Output</Label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { key: 'json' as const, label: 'JSON', desc: 'Semua collection', color: 'blue' },
                      { key: 'csv'  as const, label: 'CSV',  desc: 'Per collection',  color: 'amber' },
                      { key: 'xlsx' as const, label: 'Excel / XLSX', desc: 'Per kategori (multi-sheet)', color: 'emerald' },
                    ]).map(({ key, label, desc, color }) => {
                      const active = selectedFormats.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleFormat(key)}
                          disabled={isBackingUp}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                            active
                              ? color === 'blue'    ? 'border-blue-300 bg-blue-50 text-blue-700'
                              : color === 'amber'   ? 'border-amber-300 bg-amber-50 text-amber-700'
                              :                       'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300',
                          )}
                        >
                          <span className={cn(
                            'flex h-4 w-4 items-center justify-center rounded border',
                            active
                              ? color === 'blue'  ? 'border-blue-400 bg-blue-500 text-white'
                              : color === 'amber' ? 'border-amber-400 bg-amber-500 text-white'
                              :                     'border-emerald-400 bg-emerald-500 text-white'
                              : 'border-slate-300 bg-white',
                          )}>
                            {active && <CheckCircle2 className="h-3 w-3" />}
                          </span>
                          <div className="text-left">
                            <div>{label}</div>
                            <div className="text-[10px] font-normal opacity-70">{desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400">
                    Format aktif: <span className="font-medium text-slate-600">{selectedFormats.map(f => f.toUpperCase()).join(' + ')}</span>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Alasan Backup <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    value={backupReason}
                    onChange={e => setBackupReason(e.target.value)}
                    placeholder="Wajib diisi. Contoh: Backup mingguan rutin, sebelum update sistem, dll."
                    rows={2}
                    disabled={isBackingUp}
                    className={!backupReason.trim() ? 'border-slate-200' : 'border-emerald-300'}
                  />
                  {!backupReason.trim() && (
                    <p className="text-xs text-slate-400">Alasan wajib diisi sebelum memulai backup.</p>
                  )}
                </div>
                {backupScope.scope === 'all' ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-slate-600">9 kategori yang akan di-backup:</p>
                    <ul className="grid grid-cols-2 gap-1">
                      {['Karyawan & User','Organisasi & Master','Absensi & Payroll','Izin & Cuti','Lembur','Perjalanan Dinas','Rekrutmen','Keamanan Sistem','File Metadata'].map(cat => (
                        <li key={cat} className="flex items-center gap-1.5 text-xs text-slate-600">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                          {cat}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                    Backup hanya untuk kategori <span className="font-semibold">{backupScope.title}</span> dan hasilnya akan diupload ke Google Drive.
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBackupModalOpen(false)} disabled={isBackingUp}>Batal</Button>
                <Button onClick={() => handleRunBackup()} disabled={isBackingUp || !backupReason.trim()} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                  {isBackingUp ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Backup sedang diproses... Jangan tutup halaman ini.
                    </>
                  ) : (
                    <>
                      <CloudUpload className="h-4 w-4" />
                      Jalankan Backup
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
            )
          ) : (
            <>
              <div className="py-2 space-y-4">
                {backupResult.success ? (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                      <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-slate-800">Backup berhasil disimpan ke Google Drive.</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {(backupResult.totalDocuments ?? 0).toLocaleString('id-ID')} dokumen berhasil dibackup ke folder Google Drive.
                      </p>
                      <p className="sr-only">
                        {backupResult.totalCollections ?? 0} collection · {(backupResult.totalDocuments ?? 0).toLocaleString('id-ID')} dokumen
                        {backupResult.durationSeconds != null && ` · ${backupResult.durationSeconds}s`}
                      </p>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 text-left sm:grid-cols-4">
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Kategori selesai</p>
                        <p className="mt-1 text-sm font-bold text-slate-800">{backupProgress?.completedCategories ?? backupResult.totalCollections ?? 0}</p>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Dokumen</p>
                        <p className="mt-1 text-sm font-bold text-slate-800">{(backupResult.totalDocuments ?? 0).toLocaleString('id-ID')}</p>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">File Drive</p>
                        <p className="mt-1 text-sm font-bold text-slate-800">{backupResult.totalUploadedFiles ?? backupResult.totalFiles ?? backupProgress?.totalFilesUploaded ?? 0}</p>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Selesai</p>
                        <p className="mt-1 text-xs font-bold text-slate-800">{backupResult.finishedAt ? formatDateTime(backupResult.finishedAt) : '—'}</p>
                      </div>
                    </div>
                    {/* File breakdown per format */}
                    <div className="flex flex-wrap justify-center gap-2">
                      {(backupResult.formats ?? []).includes('json') && (
                        <span className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                          JSON · {backupResult.totalJsonFiles ?? 0} file
                        </span>
                      )}
                      {(backupResult.formats ?? []).includes('csv') && (
                        <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                          CSV · {backupResult.totalCsvFiles ?? 0} file
                        </span>
                      )}
                      {(backupResult.formats ?? []).includes('xlsx') && (
                        <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                          XLSX · {backupResult.totalXlsxFiles ?? 0} workbook
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {backupResult.googleDriveBackupFolderLink && (
                        <a
                          href={backupResult.googleDriveBackupFolderLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                        >
                          <FolderOpen className="h-4 w-4" />
                          Buka Folder Drive
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setBackupModalOpen(false);
                          window.setTimeout(() => document.getElementById('backup-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        Lihat Riwayat Backup
                      </button>
                      {backupResult.manifestWebViewLink && (
                        <a
                          href={backupResult.manifestWebViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <FileText className="h-4 w-4" />
                          Lihat Manifest
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
                      <XCircle className="h-7 w-7 text-red-600" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-slate-800">Backup ke Google Drive gagal.</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Periksa akses service account atau konfigurasi folder backup.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-left">
                        <div className="rounded-lg border border-red-100 bg-red-50 p-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400">Progress terakhir</p>
                          <p className="mt-1 text-sm font-bold text-red-700">{backupProgress?.progressPercent ?? 0}%</p>
                        </div>
                        <div className="rounded-lg border border-red-100 bg-red-50 p-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400">Kategori gagal</p>
                          <p className="mt-1 text-sm font-bold text-red-700">{(backupProgress?.failedCategories ?? []).length}</p>
                        </div>
                      </div>
                      {(backupProgress?.failedCategories ?? []).length > 0 && (
                        <div className="mt-3 rounded-lg border border-red-100 bg-red-50 p-2 text-left">
                          <p className="text-xs font-semibold text-red-700">Kategori yang gagal</p>
                          <p className="mt-1 text-xs text-red-600">{(backupProgress?.failedCategories ?? []).join(', ')}</p>
                        </div>
                      )}
                      {backupProgress?.error && (
                        <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-2 py-1.5 text-left text-xs text-red-700">
                          {backupProgress.error}
                        </p>
                      )}
                      {backupResult.errors?.length ? (
                        <ul className="mt-2 space-y-1 text-left">
                          {backupResult.errors.slice(0, 5).map((e, i) => (
                            <li key={i} className="text-xs text-red-600">{e}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBackupModalOpen(false)}>Tutup</Button>
                {!backupResult.success && (
                  <Button onClick={() => { setBackupResult(null); setBackupProgress(null); setBackupRunId(null); }} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Coba Lagi
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={Users}
          label="Total Karyawan"
          value={statsLoading ? '—' : stats.users}
          colorClass="bg-white border-teal-100"
          iconBgClass="bg-teal-50"
          iconTextClass="text-teal-600"
        />
        <StatCard
          icon={Calendar}
          label="Data Absensi"
          value={statsLoading ? '—' : stats.attendance > 0 ? 'Ada' : '0'}
          subtext="attendance events"
          colorClass="bg-white border-blue-100"
          iconBgClass="bg-blue-50"
          iconTextClass="text-blue-600"
        />
        <StatCard
          icon={CalendarOff}
          label="Izin & Cuti"
          value={statsLoading ? '—' : stats.leave}
          colorClass="bg-white border-amber-100"
          iconBgClass="bg-amber-50"
          iconTextClass="text-amber-600"
        />
        <StatCard
          icon={Timer}
          label="Lembur"
          value={statsLoading ? '—' : stats.overtime}
          colorClass="bg-white border-orange-100"
          iconBgClass="bg-orange-50"
          iconTextClass="text-orange-600"
        />
        <StatCard
          icon={Briefcase}
          label="Data Lowongan"
          value={statsLoading ? '—' : stats.jobs}
          colorClass="bg-white border-violet-100"
          iconBgClass="bg-violet-50"
          iconTextClass="text-violet-600"
        />
        <StatCard
          icon={Clock}
          label="Export Terakhir"
          value={lastExport ? '✓' : '—'}
          subtext={lastExport ? formatDateTime(lastExport.createdAt) : 'Belum ada'}
          colorClass="bg-white border-slate-100"
          iconBgClass="bg-slate-50"
          iconTextClass="text-slate-500"
        />
      </div>

      {/* ── Filter Section ───────────────────────────────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
              <Database className="h-4 w-4 text-slate-500" />
            </div>
            <div>
              <CardTitle className="text-base">Filter Export</CardTitle>
              <CardDescription className="mt-0.5 text-xs">
                Filter berlaku untuk semua tombol export di bawah. Kosongkan untuk export semua data.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Date range */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Tanggal Mulai</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={e => setFilter('dateFrom', e.target.value)}
                className="border-slate-200 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Tanggal Selesai</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={e => setFilter('dateTo', e.target.value)}
                className="border-slate-200 text-sm"
              />
            </div>

            {/* Status filter */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Status</Label>
              <Select value={filters.status || 'all'} onValueChange={v => setFilter('status', v === 'all' ? '' : v)}>
                <SelectTrigger className="border-slate-200 bg-white text-sm">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Format */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Format File</Label>
              <Select value={filters.format} onValueChange={v => setFilter('format', v as ExportFormat)}>
                <SelectTrigger className="border-slate-200 bg-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">✦ Semua Format</SelectItem>
                  <SelectItem value="json">JSON (.json)</SelectItem>
                  <SelectItem value="csv">CSV (.csv)</SelectItem>
                  <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(filters.dateFrom || filters.dateTo || filters.status) && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Filter aktif:</span>
                {filters.dateFrom && <Badge variant="outline" className="text-[11px]">Dari: {filters.dateFrom}</Badge>}
                {filters.dateTo && <Badge variant="outline" className="text-[11px]">Sampai: {filters.dateTo}</Badge>}
                {filters.status && <Badge variant="outline" className="text-[11px]">Status: {filters.status}</Badge>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters(prev => ({ ...prev, dateFrom: '', dateTo: '', status: '', brand: '', division: '' }))}
                className="h-7 text-xs text-slate-500 hover:text-slate-900"
              >
                Reset Filter
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Export Categories ────────────────────────────────────────────────── */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-800">Export ke Laptop</h2>
          <p className="mt-1 text-sm text-slate-500">Download data tertentu ke laptop dalam format JSON, CSV, atau XLSX.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {EXPORT_CATEGORIES.map(cat => (
            <ExportCard
              key={cat.id}
              category={cat}
              filters={filters}
              onExport={handleServerExport}
              loadingId={loadingId}
            />
          ))}
        </div>
      </div>

      {/* ── Export History ────────────────────────────────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
                <History className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <CardTitle className="text-base">Riwayat Export</CardTitle>
                <CardDescription className="mt-0.5 text-xs">50 aktivitas export terbaru</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
              {logsLoading ? '—' : `${exportLogs.length} entri`}
            </Badge>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="space-y-2 p-6">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : exportLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Download className="h-5 w-5 text-slate-400" />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-600">Belum ada riwayat export</p>
              <p className="mt-1.5 max-w-sm text-xs text-slate-400 leading-relaxed">
                Setiap aktivitas export data oleh Super Admin akan tercatat di sini.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead className="min-w-[160px] pl-6 font-semibold text-slate-600">Waktu</TableHead>
                    <TableHead className="min-w-[160px] font-semibold text-slate-600">Diexport Oleh</TableHead>
                    <TableHead className="min-w-[180px] font-semibold text-slate-600">Jenis Data</TableHead>
                    <TableHead className="hidden min-w-[80px] lg:table-cell font-semibold text-slate-600">Format</TableHead>
                    <TableHead className="hidden min-w-[80px] lg:table-cell font-semibold text-slate-600">Baris</TableHead>
                    <TableHead className="min-w-[100px] font-semibold text-slate-600">Status</TableHead>
                    <TableHead className="hidden min-w-[160px] xl:table-cell pr-6 font-semibold text-slate-600">File</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exportLogs.map(log => (
                    <TableRow key={log.id} className="hover:bg-slate-50/60 transition-colors">
                      <TableCell className="pl-6">
                        <p className="text-xs font-medium text-slate-700">{formatDateTime(log.createdAt)}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-slate-800">{log.exportedByName ?? '—'}</p>
                        <p className="text-[11px] text-slate-400">{log.exportedByEmail ?? '—'}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-slate-700">{log.exportType ?? '—'}</p>
                        <p className="text-[11px] text-slate-400">{log.collectionName ?? '—'}</p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[11px] uppercase',
                            log.format === 'json'  ? 'border-blue-200 text-blue-700 bg-blue-50'
                            : log.format === 'xlsx' ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                            :                        'border-teal-200 text-teal-700 bg-teal-50',
                          )}
                        >
                          {log.format ?? 'csv'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-sm text-slate-600 lg:table-cell">
                        {log.rowCount != null ? log.rowCount.toLocaleString() : '—'}
                      </TableCell>
                      <TableCell>
                        {log.status === 'success' ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Berhasil
                          </span>
                        ) : log.status === 'failed' ? (
                          <span className="flex items-center gap-1 text-xs text-red-600">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Gagal
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell pr-6">
                        <p className="truncate text-xs text-slate-400 max-w-[200px]">{log.fileName ?? '—'}</p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
