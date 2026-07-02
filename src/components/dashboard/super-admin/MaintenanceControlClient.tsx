'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, orderBy, query, limit as fbLimit } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { usePreviewRole, PREVIEWABLE_ROLES } from '@/providers/preview-role-provider';
import { useToast } from '@/hooks/use-toast';
import { useOverdueMaintenanceCount } from '@/hooks/useMaintenance';
import { useFeatureFlags } from '@/lib/feature-flags';
import {
  MAINTENANCE_COLLECTION,
  MAINTENANCE_HISTORY_COLLECTION,
  MAINTAINABLE_ROLES,
  maintenanceDocId,
  upsertMaintenanceRule,
  completeMaintenance,
  extendMaintenance,
  computeMaintenanceStatus,
  toMillis,
  type MaintenanceRule,
  type MaintenanceStatus,
} from '@/lib/maintenance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Eye, X, History, Wrench, CheckCircle2, Save, UserPlus, Info, AlertTriangle, Clock, TimerReset, Lock } from 'lucide-react';

const STATUS_META: Record<MaintenanceStatus, { label: string; badgeClass: string }> = {
  scheduled: { label: 'TERJADWAL', badgeClass: 'bg-blue-500 text-white' },
  active: { label: 'MAINTENANCE AKTIF', badgeClass: 'bg-amber-500 text-white' },
  overdue: { label: 'MELEWATI ESTIMASI', badgeClass: 'bg-red-600 text-white' },
  completed: { label: 'Aktif Normal', badgeClass: '' },
};

/** Ticks every 30s so status/countdown stay live without a full data refetch. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatCountdown(estimateMs: number, nowMs: number): string {
  const diffMinutes = Math.round(Math.abs(estimateMs - nowMs) / 60000);
  const label = diffMinutes < 1 ? 'kurang dari 1 menit' : `${diffMinutes} menit`;
  return estimateMs > nowMs ? `Sisa waktu estimasi: ${label}` : `Melewati estimasi: ${label}`;
}

const ROLE_LABELS: Record<string, string> = {
  karyawan: 'Karyawan',
  hrd: 'HRD',
  kandidat: 'Kandidat',
  manager: 'Manager',
  'super-admin': 'Super Admin',
};

type MinimalUser = { id: string; fullName?: string; email?: string; role?: string };

/**
 * User picker for Allowed Tester: search by name/email/role, add by click.
 * Stores uid in allowedUserIds but always displays name + email in the UI.
 */
function AllowedTesterPicker({
  value,
  onChange,
  users,
}: {
  value: string[];
  onChange: (uids: string[]) => void;
  users: MinimalUser[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const usersById = useMemo(() => {
    const map = new Map<string, MinimalUser>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => !value.includes(u.id) && u.role !== 'super-admin' && u.role !== 'super_admin')
      .filter((u) => {
        if (!q) return true;
        return (
          u.fullName?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.role?.toLowerCase().includes(q)
        );
      })
      .slice(0, 20);
  }, [users, value, search]);

  const addUser = (uid: string) => {
    onChange(Array.from(new Set([...value, uid])));
    setSearch('');
    setOpen(false);
  };

  const removeUser = (uid: string) => onChange(value.filter((id) => id !== uid));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((uid) => {
          const u = usersById.get(uid);
          return (
            <Badge key={uid} variant="secondary" className="gap-1.5 text-[11px] py-1">
              <span className="font-medium">{u?.fullName ?? 'User tidak ditemukan'}</span>
              {u?.email && <span className="text-slate-400">{u.email}</span>}
              <button type="button" onClick={() => removeUser(uid)} className="ml-0.5">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
        {value.length === 0 && <span className="text-xs text-slate-400">Belum ada tester.</span>}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
            <UserPlus className="h-3.5 w-3.5" /> Tambah Tester
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Cari nama, email, atau role..." value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>Tidak ada user ditemukan.</CommandEmpty>
              <CommandGroup>
                {candidates.map((u) => (
                  <CommandItem key={u.id} value={u.id} onSelect={() => addUser(u.id)}>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{u.fullName ?? '(tanpa nama)'}</span>
                      <span className="text-xs text-slate-400">{u.email} · {ROLE_LABELS[u.role ?? ''] ?? u.role}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function toDatetimeLocalValue(ts: any): string {
  if (!ts) return '';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function RoleMaintenanceCard({ role, rule, users, maintenanceLockEnabled }: { role: string; rule: MaintenanceRule | undefined; users: MinimalUser[]; maintenanceLockEnabled: boolean }) {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const now = useNow();

  const [title, setTitle] = useState(rule?.title ?? `Maintenance ${ROLE_LABELS[role]}`);
  const [message, setMessage] = useState(rule?.message ?? 'Saat ini fitur ini sedang diperbarui. Mohon coba kembali beberapa saat lagi.');
  const [startedAt, setStartedAt] = useState(toDatetimeLocalValue(rule?.startedAt));
  const [estimate, setEstimate] = useState(toDatetimeLocalValue(rule?.estimatedEndAt));
  const [allowedTesters, setAllowedTesters] = useState<string[]>(rule?.allowedUserIds ?? []);
  const [autoUnlock, setAutoUnlock] = useState(rule?.autoUnlock ?? false);
  const [saving, setSaving] = useState(false);

  const isActive = rule?.enabled === true;
  const status: MaintenanceStatus = rule ? computeMaintenanceStatus(rule, now) : 'completed';
  const isOverdue = status === 'overdue';
  const ruleId = maintenanceDocId('role', role);
  const actorUid = userProfile?.uid ?? '';
  const actorName = userProfile?.fullName ?? userProfile?.email ?? 'Super Admin';

  const persist = async (enabled: boolean) => {
    setSaving(true);
    try {
      await upsertMaintenanceRule(
        firestore,
        {
          targetType: 'role',
          targetKey: role,
          enabled,
          title,
          message,
          startedAt: startedAt ? new Date(startedAt) : null,
          estimatedEndAt: estimate ? new Date(estimate) : null,
          autoUnlock,
          allowedUserIds: allowedTesters,
          allowSuperAdminBypass: true,
        },
        actorUid,
        actorName,
      );
      toast({
        title: `Maintenance ${ROLE_LABELS[role]} diaktifkan`,
        description: `User role ${ROLE_LABELS[role]} akan diarahkan ke /maintenance. Estimasi selesai TIDAK membuka akses otomatis kecuali Auto Unlock diaktifkan.`,
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan', description: err?.message ?? 'Terjadi kesalahan.' });
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      await completeMaintenance(firestore, ruleId, actorUid, actorName, title);
      toast({ title: `Maintenance ${ROLE_LABELS[role]} selesai`, description: `User role ${ROLE_LABELS[role]} bisa akses lagi.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal menyelesaikan maintenance', description: err?.message ?? 'Terjadi kesalahan.' });
    } finally {
      setSaving(false);
    }
  };

  // Switch OFF must run the exact same Firestore update as "Selesaikan Maintenance" —
  // never just flip a local/UI flag while leaving the document stale.
  const handleToggle = (checked: boolean) => {
    if (checked) {
      // Feature Control gate: maintenance_lock OFF must not allow creating a NEW lock.
      // Existing active locks are left alone (never force-opened) — that's why this
      // check only fires on the ON transition, not the OFF/complete path.
      if (!maintenanceLockEnabled) {
        toast({
          variant: 'destructive',
          title: 'Maintenance Lock dinonaktifkan',
          description: 'Fitur Maintenance Lock sedang OFF di Feature Control. Aktifkan dulu di Feature Control sebelum membuat maintenance baru.',
        });
        return;
      }
      persist(true);
    } else {
      handleComplete();
    }
  };
  const handleSave = () => {
    if (!isActive && !maintenanceLockEnabled) {
      toast({
        variant: 'destructive',
        title: 'Maintenance Lock dinonaktifkan',
        description: 'Fitur Maintenance Lock sedang OFF di Feature Control. Aktifkan dulu di Feature Control sebelum membuat maintenance baru.',
      });
      return;
    }
    persist(isActive);
  };

  const handleExtend = async () => {
    if (!estimate) {
      toast({ variant: 'destructive', title: 'Pilih estimasi selesai baru dulu', description: 'Isi tanggal & jam di field Estimasi Selesai, lalu klik Perpanjang Waktu.' });
      return;
    }
    setSaving(true);
    try {
      await extendMaintenance(firestore, ruleId, new Date(estimate), actorUid, actorName, title);
      toast({ title: `Waktu maintenance ${ROLE_LABELS[role]} diperpanjang` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal memperpanjang waktu', description: err?.message ?? 'Terjadi kesalahan.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAutoUnlockChange = (checked: boolean) => {
    setAutoUnlock(checked);
    if (checked) {
      toast({
        title: 'Auto Unlock diaktifkan',
        description: 'Auto Unlock akan membuka akses user otomatis saat waktu selesai. Gunakan hanya jika yakin maintenance tidak berisiko.',
      });
    }
  };

  const statusMeta = STATUS_META[status];

  return (
    <Card className={isOverdue ? 'border-red-300 bg-red-50/50' : isActive ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <p className="text-sm font-semibold text-slate-800">{ROLE_LABELS[role]}</p>
            {isActive
              ? <Badge className={`text-[10px] ${statusMeta.badgeClass}`}>{statusMeta.label}</Badge>
              : <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300">Aktif Normal</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`switch-${role}`} className="text-xs text-slate-500">Maintenance</Label>
            <Switch
              id={`switch-${role}`}
              checked={isActive}
              disabled={saving || (!isActive && !maintenanceLockEnabled)}
              onCheckedChange={handleToggle}
            />
          </div>
        </div>

        {!maintenanceLockEnabled && !isActive && (
          <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-700">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            Maintenance Lock sedang dinonaktifkan di Feature Control. Aktifkan dulu sebelum membuat maintenance baru.
          </p>
        )}

        {status === 'scheduled' && rule?.startedAt && toMillis(rule.startedAt) && (
          <p className="flex items-start gap-1.5 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Maintenance akan mulai pada {formatDateTime(toMillis(rule.startedAt)!)}. User masih bisa mengakses sistem
            sampai waktu mulai.
          </p>
        )}

        {status === 'active' && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs font-medium text-amber-800">
            MAINTENANCE AKTIF — user sedang dikunci.
          </p>
        )}

        {isOverdue && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div className="space-y-2">
              <p className="text-xs font-medium text-red-800">
                MELEWATI ESTIMASI — user masih dikunci. Pilih Perpanjang Waktu atau Selesaikan Maintenance.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={handleExtend} disabled={saving} className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100">
                  <TimerReset className="h-3.5 w-3.5" /> Perpanjang Waktu
                </Button>
                <Button size="sm" onClick={handleComplete} disabled={saving} className="gap-1.5 bg-red-600 text-white hover:bg-red-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Selesaikan Maintenance
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">Judul Pesan</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-sm" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">Pesan Maintenance</Label>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="text-sm" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">Waktu Mulai Maintenance</Label>
          <Input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} className="h-9 text-sm" />
          {isActive && rule?.startedAt && toMillis(rule.startedAt) && (
            <p className="text-[11px] text-slate-400">Waktu Mulai Maintenance: {formatDateTime(toMillis(rule.startedAt)!)}</p>
          )}
          <p className="text-[11px] text-slate-400">Kosongkan untuk mulai sekarang saat Anda mengaktifkan maintenance.</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">Estimasi Selesai Maintenance</Label>
          <Input type="datetime-local" value={estimate} onChange={(e) => setEstimate(e.target.value)} className="h-9 text-sm" />
          {isActive && rule?.estimatedEndAt && toMillis(rule.estimatedEndAt) && (
            <p className={`flex items-center gap-1 text-[11px] ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
              <Clock className="h-3 w-3" /> {formatCountdown(toMillis(rule.estimatedEndAt)!, now)}
            </p>
          )}
          <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Estimasi selesai bukan auto unlock. User tetap terkunci sampai Super Admin klik &quot;Selesaikan
            Maintenance&quot;.
          </p>
        </div>

        <div className="space-y-1.5 rounded-lg border border-slate-200 p-2.5">
          <div className="flex items-center justify-between">
            <Label htmlFor={`autounlock-${role}`} className="text-xs text-slate-600">Auto Unlock (lanjutan)</Label>
            <Switch id={`autounlock-${role}`} checked={autoUnlock} disabled={saving} onCheckedChange={handleAutoUnlockChange} />
          </div>
          {autoUnlock && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              Auto Unlock akan membuka akses user otomatis saat waktu selesai. Gunakan hanya jika yakin maintenance
              tidak berisiko.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">Allowed Tester</Label>
          <AllowedTesterPicker value={allowedTesters} onChange={setAllowedTesters} users={users} />
          <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Allowed Tester digunakan untuk akun dummy/tester yang tetap boleh akses saat maintenance. Super Admin
            otomatis bypass dan tidak perlu ditambahkan.
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={handleSave} disabled={saving || (!isActive && !maintenanceLockEnabled)} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> Simpan
          </Button>
          <Button size="sm" variant="outline" onClick={handleComplete} disabled={saving || !isActive} className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Selesaikan Maintenance
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleMaintenanceTab() {
  const firestore = useFirestore();
  const rulesQuery = useMemoFirebase(() => collection(firestore, MAINTENANCE_COLLECTION), [firestore]);
  const { data: rules, isLoading } = useCollection<MaintenanceRule>(rulesQuery);
  const now = useNow();
  const { isEnabled: isFeatureFlagEnabled } = useFeatureFlags(firestore);
  const maintenanceLockEnabled = isFeatureFlagEnabled('maintenance_lock');

  const usersQuery = useMemoFirebase(() => query(collection(firestore, 'users'), fbLimit(500)), [firestore]);
  const { data: users } = useCollection<MinimalUser>(usersQuery);

  const rulesByRole = useMemo(() => {
    const map: Record<string, MaintenanceRule> = {};
    (rules ?? []).forEach((r) => {
      if (r.targetType === 'role') map[r.targetKey] = r;
    });
    return map;
  }, [rules]);

  const overdueRoles = useMemo(
    () => Object.values(rulesByRole).filter((r) => r.enabled && computeMaintenanceStatus(r, now) === 'overdue'),
    [rulesByRole, now],
  );

  if (isLoading) return <p className="text-sm text-slate-400">Memuat...</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Digunakan untuk mengunci akses role/modul yang sedang bermasalah. Ini bukan Pengumuman Sistem — user yang
        terkena maintenance tidak bisa membuka dashboard sama sekali dan diarahkan ke halaman <code>/maintenance</code>.
      </p>

      {!maintenanceLockEnabled && (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">
            Fitur <span className="font-semibold">Maintenance Lock</span> sedang OFF di Feature Control. Maintenance
            baru tidak bisa dibuat, tapi maintenance yang sudah aktif tetap berjalan (tidak dibuka paksa). Aktifkan
            di menu Feature Control untuk membuat lock baru.
          </p>
        </div>
      )}

      {overdueRoles.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              {overdueRoles.length} maintenance melewati estimasi selesai
            </p>
            <p className="mt-0.5 text-xs text-red-700">
              {overdueRoles.map((r) => ROLE_LABELS[r.targetKey] ?? r.targetKey).join(', ')} — User masih dikunci.
              Pilih Perpanjang Waktu atau Selesaikan Maintenance pada card di bawah.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {MAINTAINABLE_ROLES.map((role) => (
          <RoleMaintenanceCard key={role} role={role} rule={rulesByRole[role]} users={users ?? []} maintenanceLockEnabled={maintenanceLockEnabled} />
        ))}
      </div>
    </div>
  );
}

function PreviewAsRoleTab() {
  const { previewRole, isPreviewMode, setPreviewRole, exitPreview } = usePreviewRole();

  return (
    <Card className="border-slate-200">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-amber-600" />
          <p className="text-sm font-semibold text-slate-800">Preview sebagai Role</p>
        </div>
        <p className="text-xs text-slate-500">
          Menyimulasikan tampilan &amp; menu role lain untuk akun Super Admin Anda. Role asli akun (actualRole) tidak
          pernah berubah di Firestore — hanya effectiveRole di UI yang berubah. Gunakan ini untuk mengecek/memperbaiki
          modul yang sedang maintenance tanpa memakai akun user asli.
        </p>
        <div className="flex flex-wrap gap-2">
          {PREVIEWABLE_ROLES.map((role) => (
            <Button
              key={role}
              size="sm"
              variant={previewRole === role ? 'default' : 'outline'}
              onClick={() => setPreviewRole(role)}
            >
              Preview sebagai {ROLE_LABELS[role] ?? role}
            </Button>
          ))}
        </div>
        {isPreviewMode && (
          <Button size="sm" variant="ghost" onClick={exitPreview} className="gap-1.5 text-red-600">
            <X className="h-3.5 w-3.5" /> Keluar dari Preview Mode
          </Button>
        )}
        {previewRole === 'kandidat' && (
          <p className="text-[11px] text-amber-700">
            Catatan: preview Kandidat hanya menampilkan shell portal karir. Untuk data kandidat realistis, gunakan
            dummy candidate account via Allowed Tester di tab Role Maintenance.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RiwayatMaintenanceTab() {
  const firestore = useFirestore();
  const historyQuery = useMemoFirebase(
    () => query(collection(firestore, MAINTENANCE_HISTORY_COLLECTION), orderBy('createdAt', 'desc'), fbLimit(50)),
    [firestore],
  );
  const { data: history, isLoading } = useCollection<any>(historyQuery);

  if (isLoading) return <p className="text-sm text-slate-400">Memuat riwayat...</p>;
  if (!history || history.length === 0) return <p className="text-sm text-slate-400">Belum ada riwayat perubahan.</p>;

  const actionLabel = (h: any): string => {
    if (h.action === 'extend') return 'Diperpanjang';
    if (h.action === 'complete') return 'Diselesaikan';
    if (h.action === 'enable') return 'Diaktifkan';
    if (h.action === 'update' || !h.enabled) return h.enabled ? 'Diperbarui' : 'Diselesaikan';
    return 'Diperbarui';
  };

  return (
    <div className="space-y-2">
      {history.map((h) => {
        const roleLabel = ROLE_LABELS[h.targetKey] ?? h.targetKey ?? '-';
        const displayTitle = h.title || `Maintenance ${roleLabel}`;
        const startedAtMs = toMillis(h.startedAt);
        const estimatedEndMs = toMillis(h.estimatedEndAt);
        const completedAtMs = toMillis(h.completedAt);

        return (
          <Card key={h.id} className="border-slate-200">
            <CardContent className="p-3 text-sm space-y-1">
              <div className="flex items-center flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px]">{h.targetType === 'global' ? 'Global' : roleLabel}</Badge>
                <span className="font-medium">{displayTitle}</span>
                <span className="text-slate-400">—</span>
                <span className="text-slate-500">{actionLabel(h)}</span>
                <span>→</span>
                <span className={h.enabled ? 'text-amber-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                  {h.enabled ? (STATUS_META[h.status as MaintenanceStatus]?.label ?? 'MAINTENANCE AKTIF') : 'Aktif Normal'}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                {startedAtMs && <span>Mulai: {formatDateTime(startedAtMs)}</span>}
                {estimatedEndMs && <span>Estimasi selesai: {formatDateTime(estimatedEndMs)}</span>}
                {completedAtMs && <span>Selesai: {formatDateTime(completedAtMs)}</span>}
              </div>
              <p className="text-xs text-slate-400">oleh {h.actorName ?? h.actorUid ?? '-'}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function MaintenanceControlClient() {
  const overdueCount = useOverdueMaintenanceCount();

  return (
    <Tabs defaultValue="role" className="w-full">
      <TabsList className="grid w-full grid-cols-3 max-w-xl">
        <TabsTrigger value="role" className="text-xs gap-1">
          <Wrench className="h-3 w-3" />Role Maintenance
          {overdueCount > 0 && <Badge className="ml-1 bg-red-600 text-white text-[9px] px-1.5">{overdueCount}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="preview" className="text-xs gap-1"><Eye className="h-3 w-3" />Preview as Role</TabsTrigger>
        <TabsTrigger value="history" className="text-xs gap-1"><History className="h-3 w-3" />Riwayat Maintenance</TabsTrigger>
      </TabsList>

      <TabsContent value="role" className="mt-4">
        <RoleMaintenanceTab />
      </TabsContent>

      <TabsContent value="preview" className="mt-4">
        <PreviewAsRoleTab />
      </TabsContent>

      <TabsContent value="history" className="mt-4">
        <RiwayatMaintenanceTab />
      </TabsContent>
    </Tabs>
  );
}
