'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { collection, doc, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  markForceLogoutSession,
  markForceLogoutAll,
  saveSessionSettings,
  timestampToMillis,
  SYSTEM_SETTINGS_COLLECTION,
  SESSION_SECURITY_DOC,
  SESSION_LOGS_COLLECTION,
  type SessionStatus,
  type SessionLogAction,
  type SessionLogEntry,
} from '@/lib/session-tracking';
import type { UserProfile } from '@/lib/types';

// ── shadcn/ui ────────────────────────────────────────────────────────────────
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ── icons ────────────────────────────────────────────────────────────────────
import {
  Users,
  ShieldAlert,
  LogOut,
  Clock,
  Activity,
  Search,
  MoreHorizontal,
  Eye,
  Power,
  Settings2,
  Save,
  RefreshCw,
  History,
  Wifi,
  WifiOff,
  AlertTriangle,
  UserX,
  X,
  Timer,
  BellRing,
  ToggleRight,
  MonitorSmartphone,
  CheckCircle2,
  Loader2,
  FileText,
  Info,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
type SessionFilter = 'all' | SessionStatus | 'auto_logged_out';
type RoleFilter = 'all' | string;

interface SessionSettings {
  idleTimeoutMinutes: number;
  warningBeforeLogoutMinutes: number;
  autoLogoutEnabled: boolean;
  crossTabLogoutEnabled: boolean;
  updatedAt?: any;
  updatedByName?: string;
  forceLogoutAllAt?: any;
  forceLogoutAllByName?: string;
  forceLogoutAllReason?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getTimestampValue(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDateTime(value: any) {
  const date = getTimestampValue(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatRelative(value: any): string | null {
  const millis = timestampToMillis(value);
  if (!millis) return null;
  const diff = Math.max(0, Date.now() - millis);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} mnt lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  return `${Math.floor(hrs / 24)} hari lalu`;
}

const IDLE_FALLBACK_MS = 15 * 60 * 1000;
const WARN_FALLBACK_MS = 13 * 60 * 1000;

const SESSION_BADGE: Record<SessionStatus, { label: string; className: string; dot: string }> = {
  online: {
    label: 'Online',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500 animate-pulse',
  },
  idle: {
    label: 'Idle',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-400',
  },
  offline: {
    label: 'Offline',
    className: 'border-slate-200 bg-slate-50 text-slate-500',
    dot: 'bg-slate-300',
  },
  auto_logged_out: {
    label: 'Auto Logout',
    className: 'border-red-200 bg-red-50 text-red-600',
    dot: 'bg-red-400',
  },
  never_logged_in: {
    label: 'Belum Login',
    className: 'border-slate-100 bg-slate-50 text-slate-400',
    dot: 'bg-slate-200',
  },
};

const LOG_ACTION_BADGE: Record<SessionLogAction, { label: string; className: string }> = {
  login: { label: 'Login', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  manual_logout: { label: 'Logout Manual', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  idle_timeout: { label: 'Auto Logout', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  force_logout: { label: 'Force Logout', className: 'border-red-200 bg-red-50 text-red-700' },
  force_logout_all: { label: 'Force Logout Semua', className: 'border-red-200 bg-red-50 text-red-700' },
};

function getSessionKey(user: any, settings?: SessionSettings): SessionStatus {
  const raw = user as any;
  const hasLoggedIn = Boolean(raw.lastLoginAt || raw.lastLogin || raw.lastSignInAt);
  if (!hasLoggedIn) return 'never_logged_in';
  const stored = raw.sessionStatus as SessionStatus | undefined;
  if (stored && SESSION_BADGE[stored]) {
    const lastActiveMs = timestampToMillis(raw.lastActiveAt);
    const idleMs = (settings?.idleTimeoutMinutes ?? 15) * 60 * 1000;
    if ((stored === 'online' || stored === 'idle') && lastActiveMs && Date.now() - lastActiveMs >= idleMs) {
      return 'offline';
    }
    return stored;
  }
  const lastActiveMs = timestampToMillis(raw.lastActiveAt);
  if (!lastActiveMs) return 'offline';
  const diff = Date.now() - lastActiveMs;
  if (diff >= IDLE_FALLBACK_MS) return 'offline';
  if (diff >= WARN_FALLBACK_MS) return 'idle';
  return 'online';
}

function prettifyRole(role?: string | null) {
  return (role || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

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
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
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

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all',
        active
          ? 'border-teal-500 bg-teal-600 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      {label}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function SessionSecurityClient() {
  const firestore = useFirestore();
  const { firebaseUser, userProfile } = useAuth();
  const { toast } = useToast();

  // ── Data: all users ──────────────────────────────────────────────────────
  const usersRef = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersRef);

  // ── Data: session settings ────────────────────────────────────────────────
  const settingsDocRef = useMemoFirebase(
    () => doc(firestore, SYSTEM_SETTINGS_COLLECTION, SESSION_SECURITY_DOC),
    [firestore],
  );
  const { data: rawSettings } = useDoc<SessionSettings>(settingsDocRef);
  const settings: SessionSettings = rawSettings ?? {
    idleTimeoutMinutes: 15,
    warningBeforeLogoutMinutes: 2,
    autoLogoutEnabled: true,
    crossTabLogoutEnabled: true,
  };

  // ── Data: session logs (latest 100) ──────────────────────────────────────
  const [sessionLogs, setSessionLogs] = useState<(SessionLogEntry & { id: string })[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const logsRef = collection(firestore, SESSION_LOGS_COLLECTION);
    const q = query(logsRef, orderBy('createdAt', 'desc'), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSessionLogs(snap.docs.map(d => ({ id: d.id, ...(d.data() as SessionLogEntry) })));
        setIsLoadingLogs(false);
      },
      (err) => {
        console.warn('session_logs snapshot error:', err.code);
        setIsLoadingLogs(false);
      },
    );
    return () => unsub();
  }, [firestore, firebaseUser?.uid]);

  // ── State: settings form ─────────────────────────────────────────────────
  const [formIdleMinutes, setFormIdleMinutes] = useState(15);
  const [formWarnMinutes, setFormWarnMinutes] = useState(2);
  const [formAutoLogout, setFormAutoLogout] = useState(true);
  const [formCrossTab, setFormCrossTab] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSavedAt, setSettingsSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (rawSettings) {
      setFormIdleMinutes(rawSettings.idleTimeoutMinutes ?? 15);
      setFormWarnMinutes(rawSettings.warningBeforeLogoutMinutes ?? 2);
      setFormAutoLogout(rawSettings.autoLogoutEnabled ?? true);
      setFormCrossTab(rawSettings.crossTabLogoutEnabled ?? true);
    }
  }, [rawSettings]);

  const settingsHasChanged =
    formIdleMinutes !== (rawSettings?.idleTimeoutMinutes ?? 15) ||
    formWarnMinutes !== (rawSettings?.warningBeforeLogoutMinutes ?? 2) ||
    formAutoLogout !== (rawSettings?.autoLogoutEnabled ?? true) ||
    formCrossTab !== (rawSettings?.crossTabLogoutEnabled ?? true);

  // ── State: filter ────────────────────────────────────────────────────────
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [logActionFilter, setLogActionFilter] = useState<SessionLogAction | 'all'>('all');

  const hasActiveFilter = sessionFilter !== 'all' || roleFilter !== 'all' || searchQuery !== '';

  // ── State: dialogs ────────────────────────────────────────────────────────
  const [detailUser, setDetailUser] = useState<UserProfile | null>(null);
  const [forceLogoutTarget, setForceLogoutTarget] = useState<UserProfile | null>(null);
  const [forceLogoutReason, setForceLogoutReason] = useState('');
  const [isForceLoggingOut, setIsForceLoggingOut] = useState(false);
  const [forceAllOpen, setForceAllOpen] = useState(false);
  const [forceAllConfirmText, setForceAllConfirmText] = useState('');
  const [forceAllReason, setForceAllReason] = useState('');
  const [isForceAllLoggingOut, setIsForceAllLoggingOut] = useState(false);

  // ── Derived: stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!users) return { online: 0, idle: 0, offline: 0, autoLogout: 0, neverLoggedIn: 0, total: 0 };
    let online = 0, idle = 0, offline = 0, autoLogout = 0, neverLoggedIn = 0;
    users.forEach(u => {
      const key = getSessionKey(u, settings);
      if (key === 'online') online++;
      else if (key === 'idle') idle++;
      else if (key === 'offline') offline++;
      else if (key === 'auto_logged_out') autoLogout++;
      else if (key === 'never_logged_in') neverLoggedIn++;
    });
    return { online, idle, offline, autoLogout, neverLoggedIn, total: users.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  const todayCounts = useMemo(() => {
    const todayMs = new Date().setHours(0, 0, 0, 0);
    let autoLogoutToday = 0, forceLogoutToday = 0;
    sessionLogs.forEach(log => {
      const ms = timestampToMillis(log.createdAt);
      if (!ms || ms < todayMs) return;
      if (log.action === 'idle_timeout') autoLogoutToday++;
      if (log.action === 'force_logout' || log.action === 'force_logout_all') forceLogoutToday++;
    });
    return { autoLogoutToday, forceLogoutToday };
  }, [sessionLogs]);

  const uniqueRoles = useMemo(() => {
    if (!users) return [];
    return [...new Set(users.map(u => u.role).filter(Boolean))].sort();
  }, [users]);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const q = searchQuery.toLowerCase();
    return users.filter(u => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (q && !u.fullName?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
      const key = getSessionKey(u, settings);
      if (sessionFilter === 'all') return true;
      return key === sessionFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, sessionFilter, roleFilter, searchQuery]);

  const filteredLogs = useMemo(() => {
    if (logActionFilter === 'all') return sessionLogs;
    return sessionLogs.filter(l => l.action === logActionFilter);
  }, [sessionLogs, logActionFilter]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSaveSettings = useCallback(async () => {
    if (!firebaseUser || !userProfile) return;
    if (formWarnMinutes >= formIdleMinutes) {
      toast({ variant: 'destructive', title: 'Validasi Gagal', description: 'Warning harus lebih kecil dari idle timeout.' });
      return;
    }
    setIsSavingSettings(true);
    try {
      await saveSessionSettings(
        firestore,
        { idleTimeoutMinutes: formIdleMinutes, warningBeforeLogoutMinutes: formWarnMinutes, autoLogoutEnabled: formAutoLogout, crossTabLogoutEnabled: formCrossTab },
        firebaseUser.uid,
        userProfile.fullName || firebaseUser.email || firebaseUser.uid,
      );
      setSettingsSavedAt(new Date());
      toast({ title: 'Pengaturan Tersimpan', description: 'Konfigurasi idle timeout berhasil diperbarui.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: err.message });
    } finally {
      setIsSavingSettings(false);
    }
  }, [firebaseUser, userProfile, firestore, formIdleMinutes, formWarnMinutes, formAutoLogout, formCrossTab, toast]);

  const handleForceLogoutConfirm = useCallback(async () => {
    if (!forceLogoutTarget || !firebaseUser || !forceLogoutReason.trim()) return;
    setIsForceLoggingOut(true);
    try {
      await markForceLogoutSession(firestore, forceLogoutTarget.uid, forceLogoutReason.trim(), firebaseUser.uid);
      toast({ title: 'Force Logout Berhasil', description: `${forceLogoutTarget.fullName} diminta login ulang.` });
      setForceLogoutTarget(null);
      setForceLogoutReason('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.message });
    } finally {
      setIsForceLoggingOut(false);
    }
  }, [forceLogoutTarget, firebaseUser, forceLogoutReason, firestore, toast]);

  const handleForceLogoutAll = useCallback(async () => {
    if (!firebaseUser || !userProfile || !forceAllReason.trim() || forceAllConfirmText !== 'LOGOUT SEMUA') return;
    setIsForceAllLoggingOut(true);
    try {
      await markForceLogoutAll(firestore, firebaseUser.uid, userProfile.fullName || firebaseUser.email || 'Super Admin', forceAllReason.trim());
      toast({ title: 'Force Logout Semua Berhasil', description: 'Semua sesi aktif telah diakhiri.' });
      setForceAllOpen(false);
      setForceAllConfirmText('');
      setForceAllReason('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.message });
    } finally {
      setIsForceAllLoggingOut(false);
    }
  }, [firebaseUser, userProfile, firestore, forceAllReason, forceAllConfirmText, toast]);

  const resetFilters = useCallback(() => {
    setSessionFilter('all');
    setRoleFilter('all');
    setSearchQuery('');
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="space-y-8 pb-10">

        {/* ── Page Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Session &amp; Security</h1>
            <p className="mt-1 text-sm text-slate-500">
              Kelola keamanan sesi login, idle timeout, force logout, dan riwayat akses pengguna.
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                className="gap-2 bg-red-600 hover:bg-red-700 shadow-sm"
                onClick={() => setForceAllOpen(true)}
              >
                <ShieldAlert className="h-4 w-4" />
                Force Logout Semua User
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px] text-center text-xs">
              Gunakan hanya untuk kondisi darurat atau maintenance sistem.
            </TooltipContent>
          </Tooltip>
        </div>

        {/* ── Summary Cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            icon={Wifi}
            label="Online"
            value={isLoadingUsers ? '—' : stats.online}
            subtext="sedang aktif"
            colorClass="bg-white border-emerald-100"
            iconBgClass="bg-emerald-50"
            iconTextClass="text-emerald-600"
          />
          <StatCard
            icon={Clock}
            label="Idle"
            value={isLoadingUsers ? '—' : stats.idle}
            subtext="tidak aktif"
            colorClass="bg-white border-amber-100"
            iconBgClass="bg-amber-50"
            iconTextClass="text-amber-600"
          />
          <StatCard
            icon={WifiOff}
            label="Offline"
            value={isLoadingUsers ? '—' : stats.offline + stats.autoLogout}
            subtext="sudah logout"
            colorClass="bg-white border-slate-100"
            iconBgClass="bg-slate-50"
            iconTextClass="text-slate-500"
          />
          <StatCard
            icon={LogOut}
            label="Auto Logout"
            value={todayCounts.autoLogoutToday}
            subtext="hari ini"
            colorClass="bg-white border-red-100"
            iconBgClass="bg-red-50"
            iconTextClass="text-red-500"
          />
          <StatCard
            icon={ShieldAlert}
            label="Force Logout"
            value={todayCounts.forceLogoutToday}
            subtext="hari ini"
            colorClass="bg-white border-orange-100"
            iconBgClass="bg-orange-50"
            iconTextClass="text-orange-500"
          />
        </div>

        {/* ── Settings Card ─────────────────────────────────────────────────── */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
                <Settings2 className="h-4 w-4 text-teal-600" />
              </div>
              <div>
                <CardTitle className="text-base">Pengaturan Sesi Global</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Berlaku untuk semua user di semua role
                  {rawSettings?.updatedByName && (
                    <span className="ml-1.5">
                      · Diperbarui oleh <span className="font-medium text-slate-700">{rawSettings.updatedByName}</span>{' '}
                      {formatRelative(rawSettings.updatedAt)}
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-5">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Left: duration fields */}
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5 text-slate-500" />
                    <Label htmlFor="idle-timeout" className="text-sm font-medium">
                      Idle Timeout
                    </Label>
                  </div>
                  <p className="text-xs text-slate-500">
                    User dianggap tidak aktif setelah durasi ini tanpa aktivitas apapun.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      id="idle-timeout"
                      type="number"
                      min={1}
                      max={120}
                      value={formIdleMinutes}
                      onChange={e => setFormIdleMinutes(Number(e.target.value))}
                      className="w-24 text-center font-mono"
                    />
                    <span className="text-sm text-slate-500">menit</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <BellRing className="h-3.5 w-3.5 text-slate-500" />
                    <Label htmlFor="warn-before" className="text-sm font-medium">
                      Warning Sebelum Logout
                    </Label>
                  </div>
                  <p className="text-xs text-slate-500">
                    Modal peringatan muncul sebelum user otomatis dilogout.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      id="warn-before"
                      type="number"
                      min={1}
                      max={formIdleMinutes - 1}
                      value={formWarnMinutes}
                      onChange={e => setFormWarnMinutes(Number(e.target.value))}
                      className="w-24 text-center font-mono"
                    />
                    <span className="text-sm text-slate-500">menit</span>
                  </div>
                </div>

                {formWarnMinutes >= formIdleMinutes && (
                  <Alert className="border-amber-200 bg-amber-50 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    <AlertDescription className="text-xs text-amber-700">
                      Warning harus lebih kecil dari idle timeout.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Right: toggle fields */}
              <div className="space-y-5">
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 divide-y divide-slate-100">
                  {/* Auto Logout Toggle */}
                  <div className="flex items-start justify-between gap-4 p-4">
                    <div className="flex items-start gap-2.5">
                      <ToggleRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div>
                        <Label htmlFor="auto-logout" className="cursor-pointer text-sm font-medium">
                          Auto Logout Aktif
                        </Label>
                        <p className="mt-0.5 text-xs text-slate-500">
                          User logout otomatis saat idle timeout tercapai.
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="auto-logout"
                      checked={formAutoLogout}
                      onCheckedChange={setFormAutoLogout}
                      className="shrink-0 mt-0.5 data-[state=checked]:bg-teal-600"
                    />
                  </div>

                  {/* Cross-Tab Toggle */}
                  <div className="flex items-start justify-between gap-4 p-4">
                    <div className="flex items-start gap-2.5">
                      <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div>
                        <Label htmlFor="cross-tab" className="cursor-pointer text-sm font-medium">
                          Cross-Tab Logout
                        </Label>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Logout di satu tab berlaku untuk semua tab yang terbuka.
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="cross-tab"
                      checked={formCrossTab}
                      onCheckedChange={setFormCrossTab}
                      className="shrink-0 mt-0.5 data-[state=checked]:bg-teal-600"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Save button row */}
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
              <div className="text-xs text-slate-400">
                {settingsSavedAt ? (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Tersimpan {formatRelative(settingsSavedAt)}
                  </span>
                ) : settingsHasChanged ? (
                  <span className="text-amber-600">Ada perubahan belum disimpan</span>
                ) : rawSettings ? (
                  <span>Menggunakan konfigurasi tersimpan</span>
                ) : (
                  <span>Menggunakan nilai default</span>
                )}
              </div>
              <Button
                onClick={handleSaveSettings}
                disabled={isSavingSettings || formWarnMinutes >= formIdleMinutes || !settingsHasChanged}
                className="gap-2 bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
              >
                {isSavingSettings ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSavingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Active Sessions ────────────────────────────────────────────────── */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
                  <Activity className="h-4 w-4 text-teal-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Monitoring Sesi User</CardTitle>
                  <CardDescription className="mt-0.5 text-xs">
                    Pantau status login, aktivitas terakhir, dan sesi pengguna
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                {isLoadingUsers ? '—' : `${filteredUsers.length} dari ${stats.total} user`}
              </Badge>
            </div>
          </CardHeader>
          <Separator />

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 px-6 py-4 bg-slate-50/50">
            {/* Search */}
            <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama atau email..."
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

            {/* Session filter pills */}
            <div className="flex flex-wrap gap-1.5">
              {([
                ['all', 'Semua'],
                ['online', 'Online'],
                ['idle', 'Idle'],
                ['offline', 'Offline'],
                ['auto_logged_out', 'Auto Logout'],
                ['never_logged_in', 'Belum Login'],
              ] as [SessionFilter, string][]).map(([key, label]) => (
                <FilterPill
                  key={key}
                  label={label}
                  active={sessionFilter === key}
                  onClick={() => setSessionFilter(key)}
                />
              ))}
            </div>

            {/* Role filter */}
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9 w-[150px] border-slate-200 bg-white text-xs shadow-sm">
                <SelectValue placeholder="Semua Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Role</SelectItem>
                {uniqueRoles.map(r => (
                  <SelectItem key={r} value={r ?? ''}>{prettifyRole(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Reset filter */}
            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-9 gap-1.5 text-xs text-slate-500 hover:text-slate-900"
              >
                <X className="h-3 w-3" />
                Reset Filter
              </Button>
            )}
          </div>

          <CardContent className="p-0">
            {isLoadingUsers ? (
              <div className="space-y-3 p-6">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <Users className="h-5 w-5 text-slate-400" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-600">Tidak ada user ditemukan</p>
                <p className="mt-1 text-xs text-slate-400">Coba ubah atau reset filter pencarian.</p>
                {hasActiveFilter && (
                  <Button variant="ghost" size="sm" onClick={resetFilters} className="mt-3 text-xs text-teal-600">
                    Reset Filter
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead className="min-w-[220px] pl-6 font-semibold text-slate-600">User</TableHead>
                      <TableHead className="min-w-[110px] font-semibold text-slate-600">Role</TableHead>
                      <TableHead className="min-w-[160px] font-semibold text-slate-600">Status Sesi</TableHead>
                      <TableHead className="hidden min-w-[150px] lg:table-cell font-semibold text-slate-600">Terakhir Login</TableHead>
                      <TableHead className="hidden min-w-[150px] xl:table-cell font-semibold text-slate-600">Terakhir Aktif</TableHead>
                      <TableHead className="hidden min-w-[150px] xl:table-cell font-semibold text-slate-600">Terakhir Logout</TableHead>
                      <TableHead className="hidden min-w-[120px] 2xl:table-cell font-semibold text-slate-600">Alasan Logout</TableHead>
                      <TableHead className="pr-6 text-right font-semibold text-slate-600">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map(user => {
                      const raw = user as any;
                      const key = getSessionKey(user, settings);
                      const badge = SESSION_BADGE[key];
                      const lastLoginAt = raw.lastLoginAt || raw.lastLogin || raw.lastSignInAt;
                      const isSelf = user.uid === firebaseUser?.uid;

                      return (
                        <TableRow key={user.uid} className="hover:bg-slate-50/60 transition-colors">
                          <TableCell className="pl-6">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-sm font-semibold text-white shadow-sm">
                                {user.fullName?.charAt(0).toUpperCase() ?? '?'}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="truncate text-sm font-medium text-slate-800">{user.fullName}</span>
                                  {isSelf && (
                                    <Badge variant="outline" className="shrink-0 px-1 py-0 text-[10px] border-teal-200 text-teal-600">
                                      Anda
                                    </Badge>
                                  )}
                                </div>
                                <p className="truncate text-xs text-slate-400">{user.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs border-slate-200 text-slate-600">
                              {prettifyRole(user.role)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <Badge variant="outline" className={cn('gap-1.5 text-xs font-medium', badge.className)}>
                                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', badge.dot)} />
                                {badge.label}
                              </Badge>
                              {(key === 'online' || key === 'idle') && raw.lastActiveAt && (
                                <p className="text-[11px] text-slate-400 pl-0.5">{formatRelative(raw.lastActiveAt)}</p>
                              )}
                              {key === 'never_logged_in' && (
                                <p className="text-[11px] text-slate-400 pl-0.5">belum ada aktivitas</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-xs text-slate-500 lg:table-cell">
                            {formatDateTime(lastLoginAt)}
                          </TableCell>
                          <TableCell className="hidden text-xs text-slate-500 xl:table-cell">
                            {formatDateTime(raw.lastActiveAt)}
                          </TableCell>
                          <TableCell className="hidden text-xs text-slate-500 xl:table-cell">
                            {formatDateTime(raw.lastLogoutAt)}
                          </TableCell>
                          <TableCell className="hidden text-xs text-slate-500 2xl:table-cell capitalize">
                            {raw.logoutReason?.replace(/_/g, ' ') ?? '—'}
                          </TableCell>
                          <TableCell className="pr-4 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-slate-400 hover:text-slate-700"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem
                                  onClick={() => setDetailUser(user)}
                                  className="gap-2 text-sm"
                                >
                                  <Eye className="h-4 w-4 text-slate-500" />
                                  Lihat Detail Sesi
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="gap-2 text-sm"
                                  onClick={() => {
                                    setDetailUser(null);
                                    setTimeout(() => {
                                      const el = document.getElementById('log-section');
                                      el?.scrollIntoView({ behavior: 'smooth' });
                                    }, 100);
                                  }}
                                >
                                  <FileText className="h-4 w-4 text-slate-500" />
                                  Lihat Riwayat Login
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => { setForceLogoutTarget(user); setForceLogoutReason(''); }}
                                  disabled={isSelf}
                                  className="gap-2 text-sm text-red-600 focus:text-red-600 focus:bg-red-50"
                                >
                                  <Power className="h-4 w-4" />
                                  Force Logout
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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

        {/* ── Session History ────────────────────────────────────────────────── */}
        <Card id="log-section" className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
                  <History className="h-4 w-4 text-slate-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Riwayat Login &amp; Logout</CardTitle>
                  <CardDescription className="mt-0.5 text-xs">Catatan aktivitas sesi pengguna — 100 terakhir</CardDescription>
                </div>
              </div>
              {/* Log action filter pills */}
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['all', 'Semua'],
                  ['login', 'Login'],
                  ['manual_logout', 'Logout Manual'],
                  ['idle_timeout', 'Auto Logout'],
                  ['force_logout', 'Force Logout'],
                ] as [SessionLogAction | 'all', string][]).map(([key, label]) => (
                  <FilterPill
                    key={key}
                    label={label}
                    active={logActionFilter === key}
                    onClick={() => setLogActionFilter(key)}
                  />
                ))}
              </div>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {isLoadingLogs ? (
              <div className="space-y-2 p-6">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <History className="h-5 w-5 text-slate-400" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-600">Belum ada riwayat sesi</p>
                <p className="mt-1 text-xs text-slate-400 max-w-xs">
                  Riwayat login, logout manual, auto logout, dan force logout akan muncul di sini setelah ada aktivitas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead className="min-w-[170px] pl-6 font-semibold text-slate-600">Waktu</TableHead>
                      <TableHead className="min-w-[200px] font-semibold text-slate-600">User</TableHead>
                      <TableHead className="hidden min-w-[110px] md:table-cell font-semibold text-slate-600">Role</TableHead>
                      <TableHead className="min-w-[170px] font-semibold text-slate-600">Aksi</TableHead>
                      <TableHead className="hidden min-w-[180px] lg:table-cell font-semibold text-slate-600">Alasan / Aktor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map(log => {
                      const ab = LOG_ACTION_BADGE[log.action];
                      return (
                        <TableRow key={log.id} className="hover:bg-slate-50/60 transition-colors">
                          <TableCell className="pl-6 text-xs text-slate-500">
                            {formatDateTime(log.createdAt)}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium text-slate-800">{log.displayName ?? '—'}</p>
                            <p className="text-xs text-slate-400">{log.email ?? '—'}</p>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="outline" className="text-xs capitalize border-slate-200 text-slate-500">
                              {prettifyRole(log.role)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('text-xs font-medium', ab.className)}>
                              {ab.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden text-xs text-slate-500 lg:table-cell">
                            {log.actorName
                              ? <span>oleh <span className="font-medium text-slate-700">{log.actorName}</span></span>
                              : log.reason
                              ? <span>{log.reason}</span>
                              : '—'}
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

        {/* ── Detail Sesi Dialog ─────────────────────────────────────────────── */}
        <Dialog open={!!detailUser} onOpenChange={open => !open && setDetailUser(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Detail Sesi User</DialogTitle>
              <DialogDescription>Informasi lengkap sesi dan aktivitas login user ini.</DialogDescription>
            </DialogHeader>
            {detailUser && (() => {
              const raw = detailUser as any;
              const key = getSessionKey(detailUser, settings);
              const badge = SESSION_BADGE[key];
              const lastLoginAt = raw.lastLoginAt || raw.lastLogin || raw.lastSignInAt;
              return (
                <div className="space-y-4 py-1">
                  {/* User card */}
                  <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-base font-bold text-white shadow-sm">
                      {detailUser.fullName?.charAt(0).toUpperCase() ?? '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800">{detailUser.fullName}</p>
                      <p className="text-xs text-slate-500">{detailUser.email}</p>
                    </div>
                    <Badge variant="outline" className={cn('gap-1.5 shrink-0', badge.className)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', badge.dot)} />
                      {badge.label}
                    </Badge>
                  </div>

                  {/* Detail grid */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { label: 'Role', value: prettifyRole(detailUser.role) },
                      { label: 'Terakhir Login', value: formatDateTime(lastLoginAt) },
                      { label: 'Terakhir Aktif', value: formatDateTime(raw.lastActiveAt) },
                      { label: 'Terakhir Logout', value: formatDateTime(raw.lastLogoutAt) },
                      { label: 'Alasan Logout', value: raw.logoutReason?.replace(/_/g, ' ') ?? '—' },
                      { label: 'Device', value: raw.currentDeviceInfo?.platform ?? '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
                        <p className="mt-0.5 text-sm font-medium text-slate-700 capitalize">{value}</p>
                      </div>
                    ))}
                  </div>

                  {raw.forceLogoutAt && (
                    <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-red-400">Force Logout Terakhir</p>
                      <p className="mt-0.5 text-sm text-red-700">{formatDateTime(raw.forceLogoutAt)}</p>
                      {raw.forceLogoutReason && (
                        <p className="mt-0.5 text-xs text-red-600">Alasan: {raw.forceLogoutReason}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDetailUser(null)}>Tutup</Button>
              {detailUser && detailUser.uid !== firebaseUser?.uid && (
                <Button
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => {
                    setForceLogoutTarget(detailUser);
                    setForceLogoutReason('');
                    setDetailUser(null);
                  }}
                >
                  <Power className="mr-2 h-3.5 w-3.5" />
                  Force Logout
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Force Logout Individual Dialog ────────────────────────────────── */}
        <Dialog open={!!forceLogoutTarget} onOpenChange={open => !open && setForceLogoutTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Power className="h-5 w-5 text-red-600" />
                Paksa Logout User Ini?
              </DialogTitle>
              <DialogDescription>
                User akan keluar dari semua sesi aktif dan harus login ulang.
              </DialogDescription>
            </DialogHeader>
            {forceLogoutTarget && (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-sm font-bold text-white">
                    {forceLogoutTarget.fullName?.charAt(0).toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{forceLogoutTarget.fullName}</p>
                    <p className="text-xs text-slate-500">{forceLogoutTarget.email}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fl-reason" className="text-sm font-medium">
                    Alasan force logout <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="fl-reason"
                    value={forceLogoutReason}
                    onChange={e => setForceLogoutReason(e.target.value)}
                    placeholder="Contoh: sesi mencurigakan / perangkat hilang"
                  />
                  <p className="text-xs text-slate-400">Alasan ini tersimpan sebagai catatan keamanan.</p>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setForceLogoutTarget(null)} disabled={isForceLoggingOut}>
                Batal
              </Button>
              <Button
                variant="destructive"
                className="bg-red-600 hover:bg-red-700"
                onClick={handleForceLogoutConfirm}
                disabled={isForceLoggingOut || !forceLogoutReason.trim()}
              >
                {isForceLoggingOut ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memproses…</>
                ) : (
                  <><Power className="mr-2 h-4 w-4" />Force Logout</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Force Logout ALL Dialog ────────────────────────────────────────── */}
        <Dialog
          open={forceAllOpen}
          onOpenChange={open => {
            setForceAllOpen(open);
            if (!open) { setForceAllConfirmText(''); setForceAllReason(''); }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5 text-red-700">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                  <ShieldAlert className="h-4 w-4 text-red-600" />
                </div>
                Force Logout Semua User
              </DialogTitle>
              <DialogDescription className="text-slate-600">
                Tindakan darurat untuk mengakhiri semua sesi aktif di seluruh HRP.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              {/* Impact warning */}
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-sm font-semibold text-red-700">Dampak Tindakan Ini</p>
                </div>
                <ul className="list-disc pl-6 space-y-1 text-xs text-red-700">
                  <li>Semua user yang sedang login akan diminta login ulang secara bersamaan</li>
                  <li>Pekerjaan yang belum disimpan user mungkin hilang</li>
                  <li>Tindakan ini tidak dapat dibatalkan</li>
                  <li className="font-medium">Akun Anda sendiri tidak akan ikut logout</li>
                </ul>
              </div>

              {/* Reason input */}
              <div className="space-y-1.5">
                <Label htmlFor="fa-reason" className="text-sm font-medium">
                  Alasan tindakan darurat <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="fa-reason"
                  value={forceAllReason}
                  onChange={e => setForceAllReason(e.target.value)}
                  placeholder="Contoh: pelanggaran keamanan / pemeliharaan sistem"
                />
              </div>

              {/* Confirmation */}
              <div className="space-y-1.5">
                <Label htmlFor="fa-confirm" className="text-sm font-medium">
                  Ketik <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-red-700">LOGOUT SEMUA</span> untuk konfirmasi
                </Label>
                <Input
                  id="fa-confirm"
                  value={forceAllConfirmText}
                  onChange={e => setForceAllConfirmText(e.target.value)}
                  placeholder="LOGOUT SEMUA"
                  className={cn(
                    'font-mono',
                    forceAllConfirmText === 'LOGOUT SEMUA' && 'border-red-400 ring-1 ring-red-300',
                  )}
                />
                {forceAllConfirmText === 'LOGOUT SEMUA' && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Konfirmasi valid — Anda dapat melanjutkan
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => { setForceAllOpen(false); setForceAllConfirmText(''); setForceAllReason(''); }}
                disabled={isForceAllLoggingOut}
              >
                Batal
              </Button>
              <Button
                variant="destructive"
                className="bg-red-600 hover:bg-red-700"
                onClick={handleForceLogoutAll}
                disabled={isForceAllLoggingOut || forceAllConfirmText !== 'LOGOUT SEMUA' || !forceAllReason.trim()}
              >
                {isForceAllLoggingOut ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memproses…</>
                ) : (
                  <><ShieldAlert className="mr-2 h-4 w-4" />Force Logout Semua</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
  );
}
