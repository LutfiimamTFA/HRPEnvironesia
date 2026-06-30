'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { serverTimestamp } from 'firebase/firestore';

// ── shadcn/ui ────────────────────────────────────────────────────────────────
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Activity,
  Users,
  ShieldAlert,
  Key,
  Building2,
  Database,
  Search,
  X,
  Eye,
  History,
  Calendar,
  Filter,
  UserCog,
  Fingerprint,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'archive'
  | 'reset_password'
  | 'change_role'
  | 'change_access'
  | 'force_logout'
  | 'force_logout_all'
  | 'login'
  | 'logout'
  | 'approve'
  | 'reject'
  | 'request_revision';

export type AuditCategory =
  | 'User Management'
  | 'Access & Roles'
  | 'Session & Security'
  | 'Organisasi Perusahaan'
  | 'Master Data'
  | 'Approval'
  | 'Recruitment'
  | 'System';

export interface AuditLogEntry {
  id: string;
  actorUid?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: AuditAction;
  category: AuditCategory;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  targetEmail?: string | null;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  reason?: string | null;
  createdAt?: any;
  userAgent?: string | null;
  deviceInfo?: Record<string, any> | null;
  ipAddress?: string | null;
}

export const AUDIT_LOGS_COLLECTION = 'audit_logs';

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDateTime(value: any): string {
  if (!value) return '—';
  try {
    const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return '—';
  }
}

function formatRelative(value: any): string | null {
  if (!value) return null;
  try {
    const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    const diff = Math.max(0, Date.now() - d.getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'baru saja';
    if (mins < 60) return `${mins} mnt lalu`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} jam lalu`;
    return `${Math.floor(hrs / 24)} hari lalu`;
  } catch {
    return null;
  }
}

function isSameDay(value: any, dateStr: string): boolean {
  if (!value || !dateStr) return false;
  try {
    const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return d.toISOString().slice(0, 10) === dateStr;
  } catch {
    return false;
  }
}

function isToday(value: any): boolean {
  if (!value) return false;
  try {
    const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  } catch {
    return false;
  }
}

function prettifyRole(role?: string | null) {
  return (role || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Action badge config ───────────────────────────────────────────────────────
const ACTION_BADGE: Record<AuditAction, { label: string; className: string }> = {
  create:           { label: 'Buat', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  update:           { label: 'Update', className: 'border-teal-200 bg-teal-50 text-teal-700' },
  delete:           { label: 'Hapus', className: 'border-red-200 bg-red-50 text-red-700' },
  archive:          { label: 'Arsip', className: 'border-orange-200 bg-orange-50 text-orange-700' },
  reset_password:   { label: 'Reset Password', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  change_role:      { label: 'Ubah Role', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  change_access:    { label: 'Ubah Akses', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  force_logout:     { label: 'Force Logout', className: 'border-red-200 bg-red-50 text-red-700' },
  force_logout_all: { label: 'Force Logout Semua', className: 'border-red-300 bg-red-100 text-red-800' },
  login:            { label: 'Login', className: 'border-emerald-200 bg-emerald-50 text-emerald-600' },
  logout:           { label: 'Logout', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  approve:          { label: 'Setujui', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  reject:           { label: 'Tolak', className: 'border-red-200 bg-red-50 text-red-700' },
  request_revision: { label: 'Minta Revisi', className: 'border-amber-200 bg-amber-50 text-amber-700' },
};

const CATEGORY_BADGE: Record<AuditCategory, string> = {
  'User Management':      'border-teal-200 text-teal-700',
  'Access & Roles':       'border-indigo-200 text-indigo-700',
  'Session & Security':   'border-red-200 text-red-700',
  'Organisasi Perusahaan':'border-blue-200 text-blue-700',
  'Master Data':          'border-slate-200 text-slate-600',
  'Approval':             'border-emerald-200 text-emerald-700',
  'Recruitment':          'border-violet-200 text-violet-700',
  'System':               'border-orange-200 text-orange-700',
};

const CATEGORIES: AuditCategory[] = [
  'User Management',
  'Access & Roles',
  'Session & Security',
  'Organisasi Perusahaan',
  'Master Data',
  'Approval',
  'Recruitment',
  'System',
];

const ACTIONS: { value: AuditAction; label: string }[] = [
  { value: 'create', label: 'Buat' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Hapus' },
  { value: 'archive', label: 'Arsip' },
  { value: 'reset_password', label: 'Reset Password' },
  { value: 'change_role', label: 'Ubah Role' },
  { value: 'change_access', label: 'Ubah Akses' },
  { value: 'force_logout', label: 'Force Logout' },
  { value: 'force_logout_all', label: 'Force Logout Semua' },
  { value: 'approve', label: 'Setujui' },
  { value: 'reject', label: 'Tolak' },
  { value: 'request_revision', label: 'Minta Revisi' },
];

// ── Sub-components ────────────────────────────────────────────────────────────
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

// ── Diff viewer ───────────────────────────────────────────────────────────────
function DiffView({ before, after }: { before?: Record<string, any> | null; after?: Record<string, any> | null }) {
  const hasData = before || after;
  if (!hasData) {
    return <p className="text-xs text-slate-400 italic">Tidak ada data perubahan detail.</p>;
  }

  const allKeys = Array.from(new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]));

  if (allKeys.length === 0) {
    return <p className="text-xs text-slate-400 italic">Tidak ada data perubahan detail.</p>;
  }

  const changedKeys = allKeys.filter(k => {
    const bVal = JSON.stringify((before ?? {})[k] ?? null);
    const aVal = JSON.stringify((after ?? {})[k] ?? null);
    return bVal !== aVal;
  });

  const keysToShow = changedKeys.length > 0 ? changedKeys : allKeys;

  return (
    <div className="space-y-2">
      {keysToShow.map(key => {
        const bVal = (before ?? {})[key];
        const aVal = (after ?? {})[key];
        const changed = JSON.stringify(bVal ?? null) !== JSON.stringify(aVal ?? null);
        return (
          <div key={key} className="rounded-lg border border-slate-100 overflow-hidden text-xs">
            <div className="bg-slate-50 px-3 py-1.5 font-medium text-slate-500 border-b border-slate-100">
              {key}
            </div>
            {before && (
              <div className={cn('flex items-start gap-2 px-3 py-2', changed && 'bg-red-50/60')}>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-red-400 w-14 pt-0.5">Sebelum</span>
                <span className={cn('text-slate-700 break-all', changed && 'text-red-700 line-through decoration-red-300')}>
                  {bVal !== undefined && bVal !== null ? String(bVal) : <span className="italic text-slate-400">kosong</span>}
                </span>
              </div>
            )}
            {after && (
              <div className={cn('flex items-start gap-2 px-3 py-2', changed && 'bg-emerald-50/60')}>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-500 w-14 pt-0.5">Sesudah</span>
                <span className={cn('text-slate-700 break-all', changed && 'text-emerald-700 font-medium')}>
                  {aVal !== undefined && aVal !== null ? String(aVal) : <span className="italic text-slate-400">kosong</span>}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function AuditLogClient() {
  const firestore = useFirestore();
  const { firebaseUser } = useAuth();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterCategory, setFilterCategory] = useState<AuditCategory | 'all'>('all');
  const [filterAction, setFilterAction] = useState<AuditAction | 'all'>('all');
  const [filterRole, setFilterRole] = useState('all');

  // ── Load logs ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const logsRef = collection(firestore, AUDIT_LOGS_COLLECTION);
    const q = query(logsRef, orderBy('createdAt', 'desc'), limit(200));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLogs(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AuditLogEntry, 'id'>) })));
        setIsLoading(false);
      },
      (err) => {
        console.warn('audit_logs snapshot error:', err.code);
        setIsLoading(false);
      },
    );
    return () => unsub();
  }, [firestore, firebaseUser?.uid]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let today = 0, userChanges = 0, roleChanges = 0, passwordResets = 0, securityActions = 0, orgChanges = 0;
    logs.forEach(log => {
      if (isToday(log.createdAt)) today++;
      if (log.category === 'User Management') userChanges++;
      if (log.category === 'Access & Roles') roleChanges++;
      if (log.action === 'reset_password') passwordResets++;
      if (log.category === 'Session & Security' || log.action === 'force_logout' || log.action === 'force_logout_all') securityActions++;
      if (log.category === 'Organisasi Perusahaan') orgChanges++;
    });
    return { today, userChanges, roleChanges, passwordResets, securityActions, orgChanges };
  }, [logs]);

  // ── Unique roles from logs ──────────────────────────────────────────────────
  const uniqueRoles = useMemo(() => {
    return [...new Set(logs.map(l => l.actorRole).filter(Boolean))].sort() as string[];
  }, [logs]);

  // ── Filtered logs ──────────────────────────────────────────────────────────
  const filteredLogs = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return logs.filter(log => {
      if (filterCategory !== 'all' && log.category !== filterCategory) return false;
      if (filterAction !== 'all' && log.action !== filterAction) return false;
      if (filterRole !== 'all' && log.actorRole !== filterRole) return false;
      if (filterDate && !isSameDay(log.createdAt, filterDate)) return false;
      if (q && !(
        log.actorName?.toLowerCase().includes(q) ||
        log.actorEmail?.toLowerCase().includes(q) ||
        log.targetName?.toLowerCase().includes(q) ||
        log.targetEmail?.toLowerCase().includes(q) ||
        log.action?.toLowerCase().includes(q) ||
        log.category?.toLowerCase().includes(q) ||
        log.reason?.toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [logs, searchQuery, filterDate, filterCategory, filterAction, filterRole]);

  const hasActiveFilter = searchQuery || filterDate || filterCategory !== 'all' || filterAction !== 'all' || filterRole !== 'all';

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setFilterDate('');
    setFilterCategory('all');
    setFilterAction('all');
    setFilterRole('all');
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 pb-10">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pantau riwayat aktivitas penting, perubahan data, dan aksi sensitif dalam sistem HRP.
        </p>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={Activity}
          label="Aktivitas Hari Ini"
          value={isLoading ? '—' : stats.today}
          colorClass="bg-white border-teal-100"
          iconBgClass="bg-teal-50"
          iconTextClass="text-teal-600"
        />
        <StatCard
          icon={Users}
          label="Perubahan User"
          value={isLoading ? '—' : stats.userChanges}
          colorClass="bg-white border-blue-100"
          iconBgClass="bg-blue-50"
          iconTextClass="text-blue-600"
        />
        <StatCard
          icon={Fingerprint}
          label="Role & Akses"
          value={isLoading ? '—' : stats.roleChanges}
          colorClass="bg-white border-indigo-100"
          iconBgClass="bg-indigo-50"
          iconTextClass="text-indigo-600"
        />
        <StatCard
          icon={Key}
          label="Reset Password"
          value={isLoading ? '—' : stats.passwordResets}
          colorClass="bg-white border-amber-100"
          iconBgClass="bg-amber-50"
          iconTextClass="text-amber-600"
        />
        <StatCard
          icon={ShieldAlert}
          label="Aksi Keamanan"
          value={isLoading ? '—' : stats.securityActions}
          colorClass="bg-white border-red-100"
          iconBgClass="bg-red-50"
          iconTextClass="text-red-500"
        />
        <StatCard
          icon={Building2}
          label="Perubahan Org"
          value={isLoading ? '—' : stats.orgChanges}
          colorClass="bg-white border-slate-100"
          iconBgClass="bg-slate-50"
          iconTextClass="text-slate-500"
        />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
              <Filter className="h-4 w-4 text-slate-500" />
            </div>
            <div>
              <CardTitle className="text-base">Filter</CardTitle>
              <CardDescription className="mt-0.5 text-xs">Saring log berdasarkan aktor, aksi, kategori, atau tanggal</CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {/* Search */}
            <div className="xl:col-span-2 space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Cari</Label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <input
                  type="text"
                  placeholder="Nama, email, aksi, atau alasan..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Tanggal</Label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <input
                  type="date"
                  value={filterDate}
                  onChange={e => setFilterDate(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none text-slate-700"
                />
                {filterDate && (
                  <button onClick={() => setFilterDate('')} className="text-slate-400 hover:text-slate-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Kategori</Label>
              <Select value={filterCategory} onValueChange={v => setFilterCategory(v as AuditCategory | 'all')}>
                <SelectTrigger className="border-slate-200 bg-white text-sm">
                  <SelectValue placeholder="Semua Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Action */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Jenis Aksi</Label>
              <Select value={filterAction} onValueChange={v => setFilterAction(v as AuditAction | 'all')}>
                <SelectTrigger className="border-slate-200 bg-white text-sm">
                  <SelectValue placeholder="Semua Aksi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Aksi</SelectItem>
                  {ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Role Aktor</Label>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="border-slate-200 bg-white text-sm">
                  <SelectValue placeholder="Semua Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Role</SelectItem>
                  {uniqueRoles.map(r => <SelectItem key={r} value={r}>{prettifyRole(r)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasActiveFilter && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500">
                Menampilkan <span className="font-semibold text-slate-800">{filteredLogs.length}</span> dari{' '}
                <span className="font-semibold">{logs.length}</span> log
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-8 gap-1.5 text-xs text-slate-500 hover:text-slate-900"
              >
                <X className="h-3 w-3" />
                Reset Filter
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Log Table ─────────────────────────────────────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
                <History className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <CardTitle className="text-base">Riwayat Aktivitas</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  200 aktivitas terbaru — real-time
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
              {isLoading ? '—' : `${filteredLogs.length} entri`}
            </Badge>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                <History className="h-6 w-6 text-slate-400" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-600">
                {hasActiveFilter ? 'Tidak ada log yang cocok' : 'Belum ada audit log'}
              </p>
              <p className="mt-1.5 max-w-sm text-xs text-slate-400 leading-relaxed">
                {hasActiveFilter
                  ? 'Coba ubah atau reset filter pencarian.'
                  : 'Aktivitas sensitif seperti reset password, ubah role, force logout, perubahan organisasi, dan perubahan akses akan tercatat di sini.'}
              </p>
              {hasActiveFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="mt-4 text-xs text-teal-600"
                >
                  Reset Filter
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead className="min-w-[160px] pl-6 font-semibold text-slate-600">Waktu</TableHead>
                    <TableHead className="min-w-[200px] font-semibold text-slate-600">Aktor</TableHead>
                    <TableHead className="min-w-[160px] font-semibold text-slate-600">Aksi</TableHead>
                    <TableHead className="hidden min-w-[180px] md:table-cell font-semibold text-slate-600">Target</TableHead>
                    <TableHead className="hidden min-w-[150px] lg:table-cell font-semibold text-slate-600">Kategori</TableHead>
                    <TableHead className="hidden min-w-[160px] xl:table-cell font-semibold text-slate-600">Alasan</TableHead>
                    <TableHead className="pr-6 text-center font-semibold text-slate-600">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map(log => {
                    const ab = ACTION_BADGE[log.action] ?? { label: log.action, className: 'border-slate-200 bg-slate-50 text-slate-600' };
                    const catClass = CATEGORY_BADGE[log.category] ?? 'border-slate-200 text-slate-600';
                    return (
                      <TableRow key={log.id} className="hover:bg-slate-50/60 transition-colors">
                        <TableCell className="pl-6">
                          <p className="text-xs font-medium text-slate-700">{formatDateTime(log.createdAt)}</p>
                          <p className="text-[11px] text-slate-400">{formatRelative(log.createdAt)}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-xs font-bold text-white shadow-sm">
                              {log.actorName?.charAt(0).toUpperCase() ?? '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">{log.actorName ?? '—'}</p>
                              <p className="truncate text-[11px] text-slate-400">{log.actorEmail ?? log.actorUid?.slice(0, 12) ?? '—'}</p>
                              {log.actorRole && (
                                <Badge variant="outline" className="mt-0.5 px-1 py-0 text-[10px] border-slate-200 text-slate-500">
                                  {prettifyRole(log.actorRole)}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-xs font-medium', ab.className)}>
                            {ab.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {log.targetName || log.targetEmail ? (
                            <div>
                              <p className="text-sm text-slate-700">{log.targetName ?? '—'}</p>
                              {log.targetEmail && (
                                <p className="text-[11px] text-slate-400">{log.targetEmail}</p>
                              )}
                              {log.targetType && (
                                <p className="text-[10px] text-slate-300 uppercase tracking-wide">{log.targetType}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Badge variant="outline" className={cn('text-xs', catClass)}>
                            {log.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell max-w-[200px]">
                          <p className="truncate text-xs text-slate-500">{log.reason ?? '—'}</p>
                        </TableCell>
                        <TableCell className="pr-4 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 text-xs text-teal-600 hover:text-teal-800 hover:bg-teal-50"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Detail Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={!!selectedLog} onOpenChange={open => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-teal-600" />
              Detail Audit Log
            </DialogTitle>
            <DialogDescription>
              Informasi lengkap aktivitas dan perubahan data.
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (() => {
            const log = selectedLog;
            const ab = ACTION_BADGE[log.action] ?? { label: log.action, className: 'border-slate-200 bg-slate-50 text-slate-600' };
            const catClass = CATEGORY_BADGE[log.category] ?? 'border-slate-200 text-slate-600';

            return (
              <div className="space-y-5 py-1">
                {/* Action + Category badges */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={cn('text-xs font-medium', ab.className)}>{ab.label}</Badge>
                  <Badge variant="outline" className={cn('text-xs', catClass)}>{log.category}</Badge>
                </div>

                {/* Actor */}
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Aktor</p>
                  <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-sm font-bold text-white shadow-sm">
                      {log.actorName?.charAt(0).toUpperCase() ?? '?'}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{log.actorName ?? '—'}</p>
                      <p className="text-xs text-slate-500">{log.actorEmail ?? '—'}</p>
                      {log.actorRole && (
                        <Badge variant="outline" className="mt-0.5 text-[10px] border-slate-200 text-slate-500">
                          {prettifyRole(log.actorRole)}
                        </Badge>
                      )}
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-xs font-medium text-slate-700">{formatDateTime(log.createdAt)}</p>
                      <p className="text-[11px] text-slate-400">{formatRelative(log.createdAt)}</p>
                    </div>
                  </div>
                </div>

                {/* Info grid */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: 'Target', value: log.targetName ?? log.targetId ?? '—' },
                    { label: 'Target Email', value: log.targetEmail ?? '—' },
                    { label: 'Tipe Target', value: log.targetType ?? '—' },
                    { label: 'Alasan', value: log.reason ?? '—' },
                    { label: 'Device', value: log.deviceInfo?.['platform'] ?? log.userAgent?.slice(0, 40) ?? '—' },
                    { label: 'IP Address', value: log.ipAddress ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="mt-0.5 text-sm text-slate-700 break-all">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Before / After */}
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Perubahan Data
                  </p>
                  <DiffView before={log.before} after={log.after} />
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLog(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
