'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
  addDoc,
  setDoc,
  doc,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { AuditCategory } from '@/components/dashboard/AuditLogClient';
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
  filterSpec?: Record<string, any>; // extra where clauses applied at export time
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDateTime(value: any): string {
  if (!value) return '—';
  try {
    const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch { return '—'; }
}

function flattenObject(obj: Record<string, any>, prefix = ''): Record<string, string> {
  return Object.entries(obj).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.toDate !== 'function') {
      Object.assign(acc, flattenObject(v, key));
    } else if (v && typeof v.toDate === 'function') {
      acc[key] = (v as Timestamp).toDate().toISOString();
    } else if (Array.isArray(v)) {
      acc[key] = JSON.stringify(v);
    } else {
      acc[key] = v == null ? '' : String(v);
    }
    return acc;
  }, {} as Record<string, string>);
}

function toCSV(rows: Record<string, any>[]): string {
  if (!rows.length) return '';
  const flattened = rows.map(r => flattenObject(r));
  const headers = Array.from(new Set(flattened.flatMap(r => Object.keys(r))));
  const escape = (val: string) => `"${(val ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escape).join(','),
    ...flattened.map(row => headers.map(h => escape(row[h] ?? '')).join(',')),
  ];
  return lines.join('\n');
}

function downloadFile(content: string | Uint8Array | ArrayBuffer, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Serialize client-side Firestore doc (handle Timestamps, nested objects)
function serializeDocClient(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) { out[k] = null; continue; }
    if (v && typeof v.toDate === 'function') { out[k] = (v as any).toDate().toISOString(); continue; }
    if (Array.isArray(v)) { out[k] = v.map(x => (x && typeof x.toDate === 'function' ? x.toDate().toISOString() : x)); continue; }
    if (typeof v === 'object') { out[k] = serializeDocClient(v); continue; }
    out[k] = v;
  }
  return out;
}

function buildDateFilter(dateFrom: string, dateTo: string) {
  const constraints: any[] = [];
  if (dateFrom) {
    const from = new Date(dateFrom);
    from.setHours(0, 0, 0, 0);
    constraints.push(where('createdAt', '>=', Timestamp.fromDate(from)));
  }
  if (dateTo) {
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    constraints.push(where('createdAt', '<=', Timestamp.fromDate(to)));
  }
  return constraints;
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
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', category.iconBg)}>
            <Icon className={cn('h-4 w-4', category.iconColor)} />
          </div>
          <CardTitle className="text-sm font-semibold">{category.title}</CardTitle>
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

  const handleExport = useCallback(async (item: ExportItem, format: 'json' | 'csv' | 'xlsx') => {
    if (!firebaseUser || !userProfile) return;
    const loadKey = `${item.id}_${format}`;
    setLoadingId(loadKey);

    const actorName = userProfile.fullName || firebaseUser.email || firebaseUser.uid;
    const activeFilters: Record<string, any> = { ...(item.filterSpec ?? {}) };
    if (filters.dateFrom) activeFilters.dateFrom = filters.dateFrom;
    if (filters.dateTo)   activeFilters.dateTo   = filters.dateTo;
    if (filters.brand)    activeFilters.brand     = filters.brand;
    if (filters.division) activeFilters.division  = filters.division;
    if (filters.status)   activeFilters.status    = filters.status;

    const dateTag = new Date().toISOString().slice(0, 10);
    const exportedAt = new Date().toISOString();
    let rows: Record<string, any>[] = [];
    let rowCount = 0;
    let exportStatus: 'success' | 'partial' | 'failed' = 'success';
    let toastResult: 'success' | 'empty' | 'not_found' = 'success';
    let fileName = '';

    try {
      // ── Build Firestore query ──────────────────────────────────────────────
      const colRef = collection(firestore, item.collection);
      const constraints: any[] = [];

      // Date filter (skip for collections without createdAt)
      const noDateFilter = ['users', 'brands', 'divisions', 'positions', 'departments',
        'company_holidays', 'system_settings', 'menu_visibility', 'access_roles'];
      const dateConstraints = buildDateFilter(filters.dateFrom, filters.dateTo);
      if (dateConstraints.length > 0 && !noDateFilter.includes(item.collection)) {
        constraints.push(...dateConstraints, orderBy('createdAt', 'desc'));
      }

      // Apply filterSpec (from item config)
      if (item.filterSpec) {
        for (const [k, v] of Object.entries(item.filterSpec)) {
          if (k.endsWith('__in')) {
            constraints.push(where(k.replace('__in', ''), 'in', v));
          } else {
            constraints.push(where(k, '==', v));
          }
        }
      }

      // Additional UI-level filters
      if (filters.status && !item.filterSpec?.status) {
        constraints.push(where('status', '==', filters.status));
      }

      const q = constraints.length > 0 ? query(colRef, ...constraints) : query(colRef);
      const snap = await getDocs(q);
      rowCount = snap.size;

      if (rowCount === 0) {
        // Empty — produce minimal fallback file
        rows = [{ _status: 'empty', collectionName: item.collection, exportedAt, appliedFilters: JSON.stringify(activeFilters) }];
        toastResult = 'empty';
        exportStatus = 'partial';
      } else {
        rows = snap.docs.map(d => ({ _id: d.id, _path: `${item.collection}/${d.id}`, ...d.data() }));
      }
    } catch (err: any) {
      // Permission denied or collection inaccessible — show toast, do NOT download error file
      const errMsg = String(err.message ?? err);
      const isPermission = errMsg.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('insufficient');
      toast({
        variant: 'destructive',
        title: 'Export Gagal',
        description: isPermission
          ? `Akses ke collection "${item.collection}" ditolak. Hubungi Super Admin untuk verifikasi Firestore Rules.`
          : `Gagal membaca ${item.collection}: ${errMsg}`,
      });
      setLoadingId(null);
      return;
    }

    // ── Generate and download file ─────────────────────────────────────────
    try {
      if (format === 'json') {
        const serialized = rows.map(r => serializeDocClient(r));
        fileName = `hrp_${item.collection}_${dateTag}.json`;
        downloadFile(JSON.stringify(serialized, null, 2), fileName, 'application/json;charset=utf-8;');
      } else if (format === 'csv') {
        fileName = `hrp_${item.collection}_${dateTag}.csv`;
        downloadFile(toCSV(rows), fileName, 'text/csv;charset=utf-8;');
      } else if (format === 'xlsx') {
        const XLSX = await import('xlsx');
        const flat = rows.map(r => flattenObject(r as Record<string, any>));
        const headers = Array.from(new Set(flat.flatMap(r => Object.keys(r))));
        const aoa = [headers, ...flat.map(r => headers.map(h => r[h] ?? ''))];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
        ws['!cols'] = headers.map(h => ({ wch: Math.min(Math.max(h.length, 10), 50) }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, item.collection.slice(0, 31));
        const xlsxBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
        fileName = `hrp_${item.collection}_${dateTag}.xlsx`;
        downloadFile(xlsxBuf, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }

      // Toast feedback
      if (toastResult === 'success') {
        toast({ title: `Export ${format.toUpperCase()} Berhasil`, description: `${rowCount} baris → ${fileName}` });
      } else if (toastResult === 'empty') {
        toast({ title: 'Data Kosong', description: `Tidak ada data ditemukan. File tetap dibuat: ${fileName}` });
      } else {
        toast({ title: 'Collection Tidak Ditemukan', description: `Dicatat di file export: ${fileName}` });
      }
    } catch (genErr: any) {
      exportStatus = 'failed';
      console.error('Export generate error:', genErr);
      toast({ variant: 'destructive', title: 'Export Gagal', description: genErr.message ?? 'Gagal membuat file.' });
    }

    // ── Write logs (non-blocking) ──────────────────────────────────────────
    const logPayload = {
      exportedByUid: firebaseUser.uid,
      exportedByName: actorName,
      exportedByEmail: firebaseUser.email ?? null,
      exportType: item.label,
      collectionName: item.collection,
      filters: activeFilters,
      format,
      status: exportStatus,
      fileName: fileName || null,
      rowCount,
      createdAt: serverTimestamp(),
    };
    Promise.all([
      addDoc(collection(firestore, 'export_logs'), logPayload).catch(() => null),
      addDoc(collection(firestore, 'audit_logs'), {
        actorUid: firebaseUser.uid,
        actorName: actorName,
        actorEmail: firebaseUser.email ?? null,
        actorRole: userProfile.role ?? null,
        action: 'export_data',
        category: 'System' as AuditCategory,
        targetType: 'collection',
        targetName: item.collection,
        reason: `Export ${item.label} (${format.toUpperCase()}) — ${rowCount} baris`,
        after: { filters: activeFilters, format, rowCount, status: exportStatus },
        createdAt: serverTimestamp(),
      }).catch(() => null),
    ]);

    setLoadingId(null);
  }, [firebaseUser, userProfile, firestore, filters, toast]);

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
  const [selectedFormats, setSelectedFormats] = useState<BackupFormat[]>(ALL_FORMATS);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState<{
    success: boolean;
    backupId?: string;
    formats?: BackupFormat[];
    totalCollections?: number;
    totalDocuments?: number;
    totalFiles?: number;
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

  const handleRunBackup = useCallback(async () => {
    if (!firebaseUser) return;
    setIsBackingUp(true);
    setBackupResult(null);

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) throw new Error('Token tidak tersedia. Silakan login ulang.');

      const res = await fetch('/api/admin/backup/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ type: 'manual', reason: backupReason.trim(), formats: selectedFormats }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setBackupResult(data);
      if (data.success) {
        const finishedDate = data.finishedAt
          ? new Date(data.finishedAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
          : new Date().toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
        toast({ title: 'Backup Berhasil', description: `Backup berhasil disimpan ke Google Drive pada ${finishedDate} WIB.` });
      } else {
        toast({ variant: 'destructive', title: 'Backup Parsial/Gagal', description: `${(data.errors ?? []).length} error terjadi. Lihat detail di dalam modal.` });
      }
    } catch (err: any) {
      setBackupResult({ success: false, errors: [err.message] });
      toast({ variant: 'destructive', title: 'Backup Gagal', description: err.message });
    } finally {
      setIsBackingUp(false);
    }
  }, [firebaseUser, backupReason, selectedFormats, toast]);

  const openBackupModal = useCallback(() => {
    setBackupReason('');
    setSelectedFormats(ALL_FORMATS);
    setBackupResult(null);
    setBackupModalOpen(true);
  }, []);

  const lastBackup = backupLogs[0] ?? null;

  // ── Backup Settings ───────────────────────────────────────────────────────
  const [backupSettings, setBackupSettings] = useState<BackupSettings | null>(null);
  const [editSettings, setEditSettings] = useState<BackupSettings>(DEFAULT_BACKUP_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

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

  // ── Health checks ─────────────────────────────────────────────────────────
  const healthWarnings = useMemo(() => {
    const warns: { level: 'warn' | 'error'; msg: string }[] = [];
    if (!backupSettings?.autoBackupEnabled) {
      warns.push({ level: 'warn', msg: 'Backup otomatis dinonaktifkan. Data tidak akan di-backup secara terjadwal.' });
    }
    if (!backupSettings?.googleDriveBackupFolderId) {
      warns.push({ level: 'error', msg: 'Google Drive Backup Folder belum dikonfigurasi.' });
    }
    if (!backupSettings?.cloudRunServiceUrl) {
      warns.push({ level: 'warn', msg: 'Cloud Run Service URL belum dikonfigurasi. Backup otomatis belum terhubung.' });
    }
    if (!backupLogsLoading) {
      if (!lastBackup) {
        warns.push({ level: 'warn', msg: 'Belum ada riwayat backup. Jalankan backup pertama sekarang.' });
      } else {
        const lastMs = lastBackup.createdAt?.toDate?.()?.getTime() ?? 0;
        const hoursAgo = (Date.now() - lastMs) / 3_600_000;
        if (lastBackup.status === 'failed') {
          warns.push({ level: 'error', msg: `Backup terakhir GAGAL pada ${formatDateTime(lastBackup.createdAt)}.` });
        } else if (hoursAgo > 25) {
          warns.push({ level: 'warn', msg: `Backup terakhir lebih dari 25 jam yang lalu (${Math.round(hoursAgo)} jam).` });
        }
        const failedCols = (lastBackup.errors ?? []).filter(e => e.startsWith('Read ')).length;
        if (failedCols > 0) {
          warns.push({ level: 'warn', msg: `${failedCols} collection gagal dibackup pada backup terakhir.` });
        }
      }
    }
    return warns;
  }, [backupSettings, lastBackup, backupLogsLoading]);

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

      {/* ── Security notice ─────────────────────────────────────────────────── */}
      <Alert className="border-amber-200 bg-amber-50">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 text-sm">
          Setiap export dan backup data akan dicatat ke Audit Log. Data yang diexport bersifat sensitif — jangan bagikan ke pihak yang tidak berwenang.
        </AlertDescription>
      </Alert>

      {/* ── Health Warnings ──────────────────────────────────────────────────── */}
      {healthWarnings.length > 0 && (
        <div className="space-y-2">
          {healthWarnings.map((w, i) => (
            <Alert key={i} className={cn(
              'flex items-start gap-3',
              w.level === 'error' ? 'border-red-200 bg-red-50' : 'border-orange-200 bg-orange-50',
            )}>
              {w.level === 'error'
                ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />}
              <AlertDescription className={cn('text-sm', w.level === 'error' ? 'text-red-800' : 'text-orange-800')}>
                {w.msg}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

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
            <div className="flex items-center gap-2">
              {settingsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : (
                <div className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', editSettings.autoBackupEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                  <Zap className="h-3 w-3" />
                  {editSettings.autoBackupEnabled ? 'Aktif' : 'Nonaktif'}
                </div>
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
                </div>
                <Switch
                  checked={editSettings.autoBackupEnabled}
                  onCheckedChange={v => setEditSettings(p => ({ ...p, autoBackupEnabled: v }))}
                />
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

      {/* ── Backup Section ──────────────────────────────────────────────────── */}
      <Card className="border-blue-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                <HardDrive className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-base">Backup Otomatis ke Google Drive</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Backup semua koleksi Firestore ke Google Drive secara lengkap dalam format JSON.
                </CardDescription>
              </div>
            </div>
            <Button onClick={openBackupModal} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm">
              <CloudUpload className="h-4 w-4" />
              Backup Semua Data Sekarang
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

          {/* Riwayat Backup table */}
          <div>
            <p className="mb-3 text-sm font-semibold text-slate-700">Riwayat Backup</p>
            {backupLogsLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : backupLogs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <HardDrive className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-600">Belum ada riwayat backup</p>
                <p className="text-xs text-slate-400">Klik &quot;Backup Semua Data Sekarang&quot; untuk memulai backup pertama.</p>
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
                                  Buka Folder
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

      {/* ── Backup Confirmation Modal ────────────────────────────────────────── */}
      <Dialog open={backupModalOpen} onOpenChange={open => { if (!isBackingUp) setBackupModalOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-blue-600" />
              Backup Semua Data HRP?
            </DialogTitle>
            <DialogDescription>
              Sistem akan membackup seluruh data HRP ke Google Drive. Proses ini berjalan di server dan dapat memakan waktu beberapa saat.
            </DialogDescription>
          </DialogHeader>

          {!backupResult ? (
            <>
              <div className="space-y-4 py-2">
                <Alert className="border-blue-200 bg-blue-50">
                  <AlertTriangle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 text-xs">
                    Backup berjalan di server. Private key tidak pernah dikirim ke client. Proses dapat memakan 1–3 menit.
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
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBackupModalOpen(false)} disabled={isBackingUp}>Batal</Button>
                <Button onClick={handleRunBackup} disabled={isBackingUp || !backupReason.trim()} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                  {isBackingUp ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sedang Membackup...
                    </>
                  ) : (
                    <>
                      <CloudUpload className="h-4 w-4" />
                      Mulai Backup
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="py-2 space-y-4">
                {backupResult.success ? (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                      <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-slate-800">Backup Berhasil!</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {backupResult.totalCollections ?? 0} collection · {(backupResult.totalDocuments ?? 0).toLocaleString('id-ID')} dokumen
                        {backupResult.durationSeconds != null && ` · ${backupResult.durationSeconds}s`}
                      </p>
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
                      {backupResult.summaryWebViewLink && (
                        <a
                          href={backupResult.summaryWebViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                          Lihat Ringkasan
                        </a>
                      )}
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
                      <p className="text-base font-semibold text-slate-800">Backup Gagal</p>
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
                  <Button onClick={() => { setBackupResult(null); }} className="gap-2">
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
        <h2 className="mb-4 text-base font-semibold text-slate-800">Pilih Data yang Ingin Diexport</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {EXPORT_CATEGORIES.map(cat => (
            <ExportCard
              key={cat.id}
              category={cat}
              filters={filters}
              onExport={handleExport}
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
