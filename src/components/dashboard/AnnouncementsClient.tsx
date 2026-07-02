'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Megaphone, Plus, Search, Eye, Edit2, Trash2, Archive, Send,
  Bell, AlertTriangle, AlertCircle, Info, CheckCircle2, Clock,
  Lock, ShieldAlert, Wrench, X, Loader2, MoreHorizontal, Shield,
  Monitor, Database, KeyRound, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// ── Types ─────────────────────────────────────────────────────────────────────

type AnnouncementCategory =
  | 'info_sistem'
  | 'update_fitur'
  | 'maintenance'
  | 'gangguan_sistem'
  | 'keamanan'
  | 'backup_data'
  | 'akses_menu'
  | 'migrasi_database'
  | 'darurat';

type AnnouncementLevel =
  | 'info'           // Banner biru, user bisa akses normal
  | 'warning'        // Banner kuning, user bisa akses tapi ada peringatan
  | 'maintenance'    // Notif jadwal maintenance, sistem belum dikunci
  | 'maintenance_lock'; // Sistem dikunci untuk target role, redirect ke halaman maintenance

type AnnouncementStatus = 'draft' | 'active' | 'archived';
type TargetRole = 'super-admin' | 'hrd' | 'manager' | 'karyawan' | 'kandidat';

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  announcementLevel: AnnouncementLevel;
  status: AnnouncementStatus;
  targetRoles: TargetRole[];
  targetAllUsers: boolean;
  showAsBanner: boolean;
  showAsModal: boolean;
  requireAcknowledgement?: boolean;
  startAt: Timestamp | null;
  endAt: Timestamp | null;
  createdByUid: string;
  createdByName: string;
  createdByEmail: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp | null;
  archivedByUid?: string | null;
}

interface FormData {
  title: string;
  content: string;
  category: AnnouncementCategory;
  announcementLevel: AnnouncementLevel;
  status: 'draft' | 'active';
  targetAllUsers: boolean;
  targetRoles: TargetRole[];
  showAsBanner: boolean;
  showAsModal: boolean;
  startAt: string;
  endAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { value: AnnouncementCategory; label: string; icon: typeof Monitor }[] = [
  { value: 'info_sistem',       label: 'Info Sistem',        icon: Monitor },
  { value: 'update_fitur',      label: 'Update Fitur',       icon: RefreshCw },
  { value: 'maintenance',       label: 'Maintenance',        icon: Wrench },
  { value: 'gangguan_sistem',   label: 'Gangguan Sistem',    icon: AlertCircle },
  { value: 'keamanan',          label: 'Keamanan Login',     icon: Shield },
  { value: 'backup_data',       label: 'Backup & Data',      icon: Database },
  { value: 'akses_menu',        label: 'Akses Menu',         icon: KeyRound },
  { value: 'migrasi_database',  label: 'Migrasi Database',   icon: Database },
  { value: 'darurat',           label: 'Darurat',            icon: AlertTriangle },
];

const LEVELS: {
  value: AnnouncementLevel;
  label: string;
  desc: string;
  userEffect: string;
  icon: typeof Info;
  headerCls: string;
  badgeCls: string;
}[] = [
  {
    value: 'info',
    label: 'Info Sistem',
    desc: 'Informasi teknis, update, atau pengumuman umum sistem.',
    userEffect: 'Banner biru di dashboard. User tetap bisa mengakses semua fitur secara normal.',
    icon: Info,
    headerCls: 'border-blue-200 bg-blue-50',
    badgeCls: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    value: 'warning',
    label: 'Warning Sistem',
    desc: 'Peringatan teknis — gangguan, slowness, atau potensi masalah.',
    userEffect: 'Banner kuning di dashboard. User bisa akses tapi melihat peringatan aktif.',
    icon: AlertTriangle,
    headerCls: 'border-amber-200 bg-amber-50',
    badgeCls: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    value: 'maintenance',
    label: 'Maintenance Terjadwal',
    desc: 'Pemberitahuan jadwal maintenance mendatang. Sistem belum dikunci.',
    userEffect: 'Banner oranye di dashboard memberitahukan jadwal. Sistem masih bisa diakses penuh.',
    icon: Wrench,
    headerCls: 'border-orange-200 bg-orange-50',
    badgeCls: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  {
    value: 'maintenance_lock',
    label: 'Maintenance Lock',
    desc: 'Sistem dikunci — user tidak bisa akses dashboard selama maintenance.',
    userEffect: 'User yang ditarget diarahkan ke halaman maintenance. Super Admin tetap bisa masuk.',
    icon: Lock,
    headerCls: 'border-red-200 bg-red-50',
    badgeCls: 'bg-red-50 text-red-700 border-red-200',
  },
];

const TARGET_ROLES: { value: TargetRole; label: string }[] = [
  { value: 'super-admin', label: 'Super Admin' },
  { value: 'hrd',         label: 'HRD' },
  { value: 'manager',     label: 'Manager' },
  { value: 'karyawan',    label: 'Karyawan' },
  { value: 'kandidat',    label: 'Kandidat' },
];

const EMPTY_FORM: FormData = {
  title: '',
  content: '',
  category: 'info_sistem',
  announcementLevel: 'info',
  status: 'draft',
  targetAllUsers: true,
  targetRoles: [],
  showAsBanner: true,
  showAsModal: false,
  startAt: '',
  endAt: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function tsToDate(ts: Timestamp | null | undefined): Date | null {
  if (!ts) return null;
  return ts.toDate ? ts.toDate() : new Date((ts as any)._seconds * 1000);
}

function formatDate(ts: Timestamp | null | undefined): string {
  const d = tsToDate(ts);
  if (!d) return '—';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  });
}

function toDatetimeLocal(ts: Timestamp | null | undefined): string {
  const d = tsToDate(ts);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseToTimestamp(s: string): Timestamp | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

function isCurrentlyActive(a: Announcement): boolean {
  if (a.status !== 'active') return false;
  const now = new Date();
  const start = tsToDate(a.startAt);
  const end = tsToDate(a.endAt);
  if (start && start > now) return false;
  if (end && end < now) return false;
  return true;
}

function isScheduled(a: Announcement): boolean {
  if (a.status !== 'active') return false;
  const start = tsToDate(a.startAt);
  return !!start && start > new Date();
}

function getLevelInfo(level: string) {
  return LEVELS.find(l => l.value === level) ?? LEVELS[0];
}

function getCategoryLabel(v: string) {
  return CATEGORIES.find(c => c.value === v)?.label ?? v;
}

function getStatusBadge(a: Announcement) {
  if (a.status === 'archived') return { label: 'Diarsipkan', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  if (a.status === 'draft')    return { label: 'Draft',      cls: 'bg-slate-50 text-slate-500 border-slate-200' };
  if (isScheduled(a))          return { label: 'Terjadwal',  cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  return                              { label: 'Aktif',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}

// ── Form Section Heading ───────────────────────────────────────────────────────

function SectionHeading({ step, label }: { step: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
        {step}
      </span>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <div className="flex-1 border-t border-slate-100" />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AnnouncementsClient() {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [viewing, setViewing] = useState<Announcement | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'publish' | 'archive' | 'delete' | 'delete_permanent' | 'lock' | 'unlock';
    announcement: Announcement;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Firestore subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!firestore) return;
    const q = query(collection(firestore, 'system_announcements'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Announcement));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [firestore]);

  // ── Summary counts ─────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    active:    announcements.filter(isCurrentlyActive).length,
    draft:     announcements.filter(a => a.status === 'draft').length,
    scheduled: announcements.filter(isScheduled).length,
    locked:    announcements.filter(a => isCurrentlyActive(a) && a.announcementLevel === 'maintenance_lock').length,
  }), [announcements]);

  // Active maintenance lock announcements — used for the banner action buttons
  const activeLocks = useMemo(
    () => announcements.filter(a => isCurrentlyActive(a) && a.announcementLevel === 'maintenance_lock'),
    [announcements],
  );

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return announcements.filter(a => {
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        if (!a.title?.toLowerCase().includes(q) && !a.content?.toLowerCase().includes(q)) return false;
      }
      if (filterStatus !== 'all') {
        if (filterStatus === 'active')    { if (!isCurrentlyActive(a)) return false; }
        else if (filterStatus === 'scheduled') { if (!isScheduled(a)) return false; }
        else if (a.status !== filterStatus) return false;
      }
      if (filterLevel !== 'all' && a.announcementLevel !== filterLevel) return false;
      if (filterCategory !== 'all' && a.category !== filterCategory) return false;
      return true;
    });
  }, [announcements, filterSearch, filterStatus, filterLevel, filterCategory]);

  // ── Audit log ──────────────────────────────────────────────────────────────
  const writeAuditLog = useCallback(async (
    action: string, targetId: string, targetName: string,
    before?: Record<string, unknown> | null,
    after?: Record<string, unknown> | null,
  ) => {
    if (!userProfile || !firestore) return;
    try {
      await addDoc(collection(firestore, 'audit_logs'), {
        actorUid: userProfile.uid,
        actorName: (userProfile as any).fullName ?? userProfile.email,
        actorEmail: userProfile.email,
        actorRole: userProfile.role,
        action,
        category: 'system_announcement',
        targetType: 'announcement',
        targetId,
        targetName,
        before: before ?? null,
        after: after ?? null,
        reason: null,
        createdAt: serverTimestamp(),
      });
    } catch { /* non-fatal */ }
  }, [userProfile, firestore]);

  // ── Form helpers ───────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = useCallback((a: Announcement) => {
    setEditingId(a.id);
    setFormData({
      title: a.title ?? '',
      content: a.content ?? '',
      category: a.category ?? 'info_sistem',
      announcementLevel: a.announcementLevel ?? 'info',
      status: a.status === 'archived' ? 'active' : (a.status as 'draft' | 'active'),
      targetAllUsers: a.targetAllUsers ?? true,
      targetRoles: a.targetRoles ?? [],
      showAsBanner: a.showAsBanner ?? true,
      showAsModal: a.showAsModal ?? false,
      startAt: toDatetimeLocal(a.startAt),
      endAt: toDatetimeLocal(a.endAt),
    });
    setModalOpen(true);
  }, []);

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setFormData(prev => ({ ...prev, [key]: value }));

  const toggleRole = (role: TargetRole) =>
    setFormData(prev => ({
      ...prev,
      targetRoles: prev.targetRoles.includes(role)
        ? prev.targetRoles.filter(r => r !== role)
        : [...prev.targetRoles, role],
    }));

  const isLock = formData.announcementLevel === 'maintenance_lock';
  const levelInfo = getLevelInfo(formData.announcementLevel);

  // Validation: lock requires both startAt and endAt
  const isFormValid = useMemo(() => {
    if (!formData.title.trim() || !formData.content.trim()) return false;
    if (isLock && (!formData.startAt || !formData.endAt)) return false;
    return true;
  }, [formData, isLock]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!isFormValid) {
      toast({
        variant: 'destructive',
        title: isLock
          ? 'Maintenance Lock wajib mengisi waktu mulai dan selesai.'
          : 'Judul dan isi pengumuman wajib diisi.',
      });
      return;
    }
    if (!userProfile || !firestore) return;

    setSaving(true);
    try {
      const payload = {
        title: formData.title.trim(),
        content: formData.content.trim(),
        category: formData.category,
        announcementLevel: formData.announcementLevel,
        status: formData.status,
        targetAllUsers: formData.targetAllUsers,
        targetRoles: formData.targetAllUsers ? [] : formData.targetRoles,
        showAsBanner: formData.showAsBanner,
        showAsModal: formData.showAsModal,
        startAt: parseToTimestamp(formData.startAt),
        endAt: parseToTimestamp(formData.endAt),
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        const before = announcements.find(a => a.id === editingId);
        await updateDoc(doc(firestore, 'system_announcements', editingId), payload);
        await writeAuditLog('update_announcement', editingId, payload.title,
          { status: before?.status, announcementLevel: before?.announcementLevel },
          { status: payload.status, announcementLevel: payload.announcementLevel },
        );
        toast({ title: 'Pengumuman berhasil diperbarui.' });
      } else {
        const ref = await addDoc(collection(firestore, 'system_announcements'), {
          ...payload,
          createdByUid: userProfile.uid,
          createdByName: (userProfile as any).fullName ?? userProfile.email ?? '',
          createdByEmail: userProfile.email ?? '',
          createdAt: serverTimestamp(),
          archivedAt: null,
          archivedByUid: null,
        });
        const auditAction = isLock ? 'enable_maintenance_lock' : 'create_announcement';
        await writeAuditLog(auditAction, ref.id, payload.title, null, {
          status: payload.status,
          announcementLevel: payload.announcementLevel,
        });
        toast({ title: isLock ? 'Maintenance Lock dibuat.' : 'Pengumuman berhasil dibuat.' });
      }

      setModalOpen(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Confirm actions ────────────────────────────────────────────────────────
  const openConfirm = (
    type: 'publish' | 'archive' | 'delete' | 'delete_permanent' | 'lock' | 'unlock',
    a: Announcement,
  ) => {
    setConfirmAction({ type, announcement: a });
    setConfirmOpen(true);
  };

  const executeConfirm = async () => {
    if (!confirmAction || !firestore || !userProfile) return;
    const { type, announcement } = confirmAction;
    setActionLoading(true);
    try {
      const ref = doc(firestore, 'system_announcements', announcement.id);

      if (type === 'publish' || type === 'lock') {
        await updateDoc(ref, { status: 'active', updatedAt: serverTimestamp() });
        const isLockAnnouncement = announcement.announcementLevel === 'maintenance_lock';
        await writeAuditLog(
          isLockAnnouncement ? 'enable_maintenance_lock' : 'publish_announcement',
          announcement.id, announcement.title,
          { status: 'draft' }, { status: 'active' },
        );
        toast({ title: isLockAnnouncement ? 'Maintenance Lock diaktifkan.' : 'Pengumuman diaktifkan.' });

      } else if (type === 'unlock') {
        // "Matikan Maintenance" — ends a maintenance_lock manually
        await updateDoc(ref, {
          status: 'archived',
          archivedAt: serverTimestamp(),
          archivedByUid: userProfile.uid,
          endedManually: true,
          endedAt: serverTimestamp(),
          endedByUid: userProfile.uid,
          endedByName: (userProfile as any).fullName ?? userProfile.email ?? '',
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog(
          'disable_maintenance_lock',
          announcement.id, announcement.title,
          { status: 'active', announcementLevel: 'maintenance_lock' },
          { status: 'archived', endedManually: true },
        );
        toast({ title: 'Maintenance berhasil dimatikan. User dapat mengakses sistem kembali.' });

      } else if (type === 'archive') {
        await updateDoc(ref, {
          status: 'archived',
          archivedAt: serverTimestamp(),
          archivedByUid: userProfile.uid,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog(
          'archive_announcement',
          announcement.id, announcement.title,
          { status: announcement.status }, { status: 'archived' },
        );
        toast({ title: 'Pengumuman diarsipkan.' });

      } else if (type === 'delete') {
        await deleteDoc(ref);
        await writeAuditLog('delete_announcement', announcement.id, announcement.title,
          { status: announcement.status, title: announcement.title }, null);
        toast({ title: 'Pengumuman berhasil dihapus.' });

      } else if (type === 'delete_permanent') {
        await deleteDoc(ref);
        await writeAuditLog('delete_announcement', announcement.id, announcement.title,
          { status: 'archived', title: announcement.title }, null);
        toast({ title: 'Pengumuman berhasil dihapus.' });
      }

      setConfirmOpen(false);
      setConfirmAction(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Tindakan gagal.', description: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <Megaphone className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Pengumuman Sistem</h1>
            <p className="text-sm text-slate-500">
              Kelola pengumuman teknis HRP — maintenance, gangguan, update fitur, dan keamanan sistem.
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="mt-3 gap-2 bg-blue-600 text-white hover:bg-blue-700 sm:mt-0">
          <Plus className="h-4 w-4" />
          Buat Pengumuman
        </Button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Aktif Sekarang', value: counts.active,    icon: CheckCircle2, cls: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Draft',          value: counts.draft,     icon: Clock,        cls: 'text-slate-500',   bg: 'bg-slate-50' },
          { label: 'Terjadwal',      value: counts.scheduled, icon: Bell,         cls: 'text-blue-600',    bg: 'bg-blue-50' },
          { label: 'Maintenance Lock Aktif', value: counts.locked, icon: Lock, cls: 'text-red-600', bg: 'bg-red-50' },
        ].map(({ label, value, icon: Icon, cls, bg }) => (
          <Card key={label} className="border-slate-100 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', bg)}>
                  <Icon className={cn('h-4 w-4', cls)} />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-500">{label}</p>
                  <p className="text-xl font-bold text-slate-900">{value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Maintenance Lock aktif — alert dengan tombol Matikan per lock */}
      {activeLocks.map(lock => (
        <div key={lock.id} className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-start gap-3 min-w-0">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-800">
                Maintenance Lock Aktif
              </p>
              <p className="truncate text-xs font-medium text-red-700">{lock.title}</p>
              <p className="mt-0.5 text-xs text-red-500">
                User yang ditargetkan sedang dikunci. Super Admin tetap bisa mengakses sistem.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openConfirm('unlock', lock)}
            className="shrink-0 border-red-300 bg-white text-red-700 hover:bg-red-100 hover:text-red-800"
          >
            <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
            Matikan Maintenance
          </Button>
        </div>
      ))}

      {/* ── Filters ── */}
      <Card className="border-slate-100 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Cari judul atau isi..."
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                className="pl-8 text-sm"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="scheduled">Terjadwal</SelectItem>
                <SelectItem value="archived">Diarsipkan</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterLevel} onValueChange={setFilterLevel}>
              <SelectTrigger className="w-44 text-sm"><SelectValue placeholder="Level" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Level</SelectItem>
                {LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-44 text-sm"><SelectValue placeholder="Kategori" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {(filterSearch || filterStatus !== 'all' || filterLevel !== 'all' || filterCategory !== 'all') && (
              <Button
                variant="ghost" size="sm"
                onClick={() => { setFilterSearch(''); setFilterStatus('all'); setFilterLevel('all'); setFilterCategory('all'); }}
                className="gap-1.5 text-slate-500"
              >
                <X className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Table ── */}
      <Card className="border-slate-100 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Megaphone className="h-6 w-6 text-slate-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-700">
                  {announcements.length === 0 ? 'Belum ada pengumuman sistem' : 'Tidak ada hasil filter'}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {announcements.length === 0
                    ? 'Buat pengumuman teknis pertama untuk memberi tahu user tentang kondisi sistem.'
                    : 'Coba ubah atau reset filter pencarian.'}
                </p>
              </div>
              {announcements.length === 0 && (
                <Button onClick={openCreate} size="sm" className="mt-2 gap-2 bg-blue-600 text-white hover:bg-blue-700">
                  <Plus className="h-3.5 w-3.5" /> Buat Pengumuman
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                    <TableHead className="text-xs font-semibold text-slate-600">Judul</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Level</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Kategori</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Target</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Status</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Mulai</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Selesai</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Dibuat Oleh</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(a => {
                    const lvl = getLevelInfo(a.announcementLevel ?? 'info');
                    const statusBadge = getStatusBadge(a);
                    const LvlIcon = lvl.icon;
                    return (
                      <TableRow key={a.id} className={cn('hover:bg-slate-50/50', a.announcementLevel === 'maintenance_lock' && isCurrentlyActive(a) && 'bg-red-50/30')}>
                        <TableCell className="max-w-[200px]">
                          <div className="flex items-start gap-1.5">
                            {a.announcementLevel === 'maintenance_lock' && isCurrentlyActive(a) && (
                              <Lock className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
                            )}
                            <div>
                              <p className="truncate text-sm font-medium text-slate-800">{a.title}</p>
                              <div className="mt-0.5 flex gap-1">
                                {a.showAsBanner && <span className="text-[10px] text-blue-400">banner</span>}
                                {a.showAsModal && <span className="text-[10px] text-amber-400">modal</span>}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('gap-1 text-[11px]', lvl.badgeCls)}>
                            <LvlIcon className="h-2.5 w-2.5" />
                            {lvl.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-600">{getCategoryLabel(a.category)}</span>
                        </TableCell>
                        <TableCell>
                          {a.targetAllUsers
                            ? <Badge variant="outline" className="text-[11px] bg-slate-50 text-slate-600">Semua</Badge>
                            : <span className="text-xs text-slate-600">{(a.targetRoles ?? []).join(', ') || '—'}</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[11px]', statusBadge.cls)}>
                            {statusBadge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-slate-600">{formatDate(a.startAt)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-slate-600">{formatDate(a.endAt)}</TableCell>
                        <TableCell className="max-w-[120px] truncate text-xs text-slate-600">
                          {a.createdByName ?? a.createdByEmail ?? '—'}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => { setViewing(a); setDetailOpen(true); }}>
                                <Eye className="mr-2 h-3.5 w-3.5" /> Lihat Detail
                              </DropdownMenuItem>
                              {a.status !== 'archived' && (
                                <DropdownMenuItem onClick={() => openEdit(a)}>
                                  <Edit2 className="mr-2 h-3.5 w-3.5" /> Edit
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {a.status === 'draft' && (
                                <DropdownMenuItem
                                  onClick={() => openConfirm(a.announcementLevel === 'maintenance_lock' ? 'lock' : 'publish', a)}
                                  className={a.announcementLevel === 'maintenance_lock' ? 'text-red-700' : 'text-emerald-700'}
                                >
                                  {a.announcementLevel === 'maintenance_lock'
                                    ? <><Lock className="mr-2 h-3.5 w-3.5" /> Aktifkan Lock</>
                                    : <><Send className="mr-2 h-3.5 w-3.5" /> Aktifkan</>}
                                </DropdownMenuItem>
                              )}
                              {a.status === 'active' && (
                                <DropdownMenuItem
                                  onClick={() => openConfirm(a.announcementLevel === 'maintenance_lock' ? 'unlock' : 'archive', a)}
                                  className={a.announcementLevel === 'maintenance_lock' ? 'text-red-700' : 'text-amber-700'}
                                >
                                  {a.announcementLevel === 'maintenance_lock'
                                    ? <><ShieldAlert className="mr-2 h-3.5 w-3.5" /> Matikan Maintenance</>
                                    : <><Archive className="mr-2 h-3.5 w-3.5" /> Arsipkan</>}
                                </DropdownMenuItem>
                              )}
                              {/* Delete: draft or scheduled (active but not yet started) */}
                              {(a.status === 'draft' || isScheduled(a)) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openConfirm('delete', a)} className="text-red-600">
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    {a.status === 'draft' ? 'Hapus Draft' : 'Hapus Terjadwal'}
                                  </DropdownMenuItem>
                                </>
                              )}
                              {/* Permanent delete: archived only */}
                              {a.status === 'archived' && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openConfirm('delete_permanent', a)} className="text-red-600">
                                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Hapus Permanen
                                  </DropdownMenuItem>
                                </>
                              )}
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

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={modalOpen} onOpenChange={open => { if (!saving) setModalOpen(open); }}>
        <DialogContent className="w-full max-w-2xl overflow-hidden p-0 gap-0">
          <DialogTitle className="sr-only">
            {editingId ? 'Edit Pengumuman Sistem' : 'Buat Pengumuman Sistem'}
          </DialogTitle>

          {/* Header — warna sesuai level */}
          <div className={cn('flex items-center gap-3 border-b px-6 py-4', levelInfo.headerCls)}>
            {(() => {
              const LIcon = levelInfo.icon;
              return <LIcon className="h-5 w-5 shrink-0 text-slate-700" />;
            })()}
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {editingId ? 'Edit Pengumuman Sistem' : 'Buat Pengumuman Sistem'}
              </p>
              <p className="text-[11px] text-slate-500">
                {editingId ? 'Perubahan tersimpan ke Firestore dan langsung efektif.' : 'Isi semua bagian di bawah sebelum mempublish.'}
              </p>
            </div>
          </div>

          <div className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-6">

            {/* ── Section 1: Isi Pengumuman ── */}
            <div className="space-y-4">
              <SectionHeading step={1} label="Isi Pengumuman" />

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Judul <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={formData.title}
                  onChange={e => setField('title', e.target.value)}
                  placeholder="Contoh: Maintenance Terjadwal — Sabtu 5 Jul 2025 02.00–04.00 WIB"
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Isi Pengumuman <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  value={formData.content}
                  onChange={e => setField('content', e.target.value)}
                  placeholder="Jelaskan detail teknis — waktu, dampak, tindakan yang perlu dilakukan user..."
                  rows={4}
                  className="resize-none text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Kategori Teknis</Label>
                <Select value={formData.category} onValueChange={v => setField('category', v as AnnouncementCategory)}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Section 2: Level Pengumuman ── */}
            <div className="space-y-3">
              <SectionHeading step={2} label="Level Pengumuman" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {LEVELS.map(lvl => {
                  const active = formData.announcementLevel === lvl.value;
                  const LIcon = lvl.icon;
                  return (
                    <button
                      key={lvl.value}
                      type="button"
                      onClick={() => {
                        setField('announcementLevel', lvl.value);
                        // Auto-set showAsBanner + showAsModal defaults
                        if (lvl.value === 'maintenance_lock') {
                          setField('showAsBanner', false);
                          setField('showAsModal', true);
                        } else {
                          setField('showAsBanner', true);
                          setField('showAsModal', false);
                        }
                      }}
                      className={cn(
                        'relative flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-all',
                        active ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      {active && (
                        <CheckCircle2 className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-blue-500" />
                      )}
                      <div className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        active ? 'bg-blue-100' : 'bg-slate-100',
                      )}>
                        <LIcon className={cn('h-4 w-4', active ? 'text-blue-600' : 'text-slate-500')} />
                      </div>
                      <div>
                        <p className={cn('text-xs font-semibold', active ? 'text-blue-800' : 'text-slate-700')}>
                          {lvl.label}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{lvl.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Status awal */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Status Awal</Label>
                <Select value={formData.status} onValueChange={v => setField('status', v as 'draft' | 'active')}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft — Simpan tanpa publish dulu</SelectItem>
                    <SelectItem value="active">Aktif — Langsung berlaku saat disimpan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Section 3: Target User ── */}
            <div className="space-y-3">
              <SectionHeading step={3} label="Target User" />

              {isLock && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                  <span>
                    <strong>Maintenance Lock:</strong> Super Admin tidak pernah ikut dikunci, meskipun dipilih sebagai target atau "Semua User" dipilih. Super Admin tetap bisa akses sistem.
                  </span>
                </div>
              )}

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Switch
                    id="targetAll"
                    checked={formData.targetAllUsers}
                    onCheckedChange={v => setField('targetAllUsers', v)}
                  />
                  <Label htmlFor="targetAll" className="cursor-pointer text-sm font-medium text-slate-700">
                    Semua User {isLock && <span className="ml-1 text-[11px] font-normal text-slate-400">(kecuali Super Admin)</span>}
                  </Label>
                </div>
                {!formData.targetAllUsers && (
                  <div className="flex flex-wrap gap-2">
                    {TARGET_ROLES.filter(r => !(isLock && r.value === 'super-admin')).map(r => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => toggleRole(r.value)}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                          formData.targetRoles.includes(r.value)
                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300',
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Section 4: Jadwal Tampil ── */}
            <div className="space-y-3">
              <SectionHeading step={4} label="Jadwal Tampil" />

              {isLock && (
                <p className="text-xs text-red-600 font-medium">
                  ⚠ Maintenance Lock wajib mengisi waktu mulai dan selesai.
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    Mulai {isLock && <span className="text-red-500">*</span>}
                  </Label>
                  <Input
                    type="datetime-local"
                    value={formData.startAt}
                    onChange={e => setField('startAt', e.target.value)}
                    className={cn('text-sm', isLock && !formData.startAt ? 'border-red-300' : '')}
                  />
                  <p className="text-[11px] text-slate-400">
                    {isLock ? 'Kapan lock mulai berlaku' : 'Kosongkan = tampil langsung'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    Selesai {isLock && <span className="text-red-500">*</span>}
                  </Label>
                  <Input
                    type="datetime-local"
                    value={formData.endAt}
                    onChange={e => setField('endAt', e.target.value)}
                    className={cn('text-sm', isLock && !formData.endAt ? 'border-red-300' : '')}
                  />
                  <p className="text-[11px] text-slate-400">
                    {isLock ? 'Kapan lock otomatis berakhir' : 'Kosongkan = tidak ada batas'}
                  </p>
                </div>
              </div>

              {/* Opsi tampilan */}
              <div className="space-y-2.5">
                <Label className="text-xs font-semibold text-slate-700">Cara Tampil</Label>
                {[
                  {
                    id: 'showBanner',
                    field: 'showAsBanner' as const,
                    label: 'Tampilkan sebagai Banner',
                    desc: 'Muncul di bagian atas dashboard user',
                    disabled: isLock,
                  },
                  {
                    id: 'showModal',
                    field: 'showAsModal' as const,
                    label: 'Tampilkan sebagai Modal/Pop-up',
                    desc: 'Muncul sebagai modal saat user membuka dashboard',
                    disabled: false,
                  },
                ].map(opt => (
                  <div key={opt.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
                    <div>
                      <p className={cn('text-xs font-medium', opt.disabled ? 'text-slate-400' : 'text-slate-700')}>{opt.label}</p>
                      <p className="text-[11px] text-slate-400">{opt.desc}</p>
                    </div>
                    <Switch
                      id={opt.id}
                      checked={formData[opt.field] as boolean}
                      onCheckedChange={v => setField(opt.field, v)}
                      disabled={opt.disabled}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* ── Section 5: Preview Dampak ── */}
            <div className="space-y-3">
              <SectionHeading step={5} label="Preview Dampak ke User" />

              <div className={cn(
                'rounded-xl border-2 p-4 space-y-3',
                formData.announcementLevel === 'maintenance_lock' ? 'border-red-200 bg-red-50' :
                formData.announcementLevel === 'maintenance'      ? 'border-orange-200 bg-orange-50' :
                formData.announcementLevel === 'warning'          ? 'border-amber-200 bg-amber-50' :
                                                                    'border-blue-200 bg-blue-50',
              )}>
                {/* Simulasi banner */}
                <div className={cn(
                  'flex items-start gap-3 rounded-lg border px-3 py-2.5',
                  formData.announcementLevel === 'maintenance_lock' ? 'border-red-300 bg-red-100' :
                  formData.announcementLevel === 'maintenance'      ? 'border-orange-300 bg-orange-100' :
                  formData.announcementLevel === 'warning'          ? 'border-amber-300 bg-amber-100' :
                                                                      'border-blue-300 bg-blue-100',
                )}>
                  {(() => {
                    const PreviewIcon = levelInfo.icon;
                    return (
                      <PreviewIcon className={cn('mt-0.5 h-4 w-4 shrink-0',
                        formData.announcementLevel === 'maintenance_lock' ? 'text-red-600' :
                        formData.announcementLevel === 'maintenance'      ? 'text-orange-600' :
                        formData.announcementLevel === 'warning'          ? 'text-amber-600' :
                                                                            'text-blue-600',
                      )} />
                    );
                  })()}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800">
                      {formData.title || `[Judul Pengumuman — ${levelInfo.label}]`}
                    </p>
                    {formData.content && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600 leading-relaxed">
                        {formData.content}
                      </p>
                    )}
                  </div>
                </div>

                {/* Efek yang dirasakan user */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                    Efek ke User yang Ditarget
                  </p>
                  <p className="text-xs leading-relaxed text-slate-700">{levelInfo.userEffect}</p>

                  {formData.announcementLevel === 'maintenance_lock' && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-red-700 font-medium">
                        ✕ User ditarget → dialihkan ke halaman maintenance
                      </p>
                      <p className="text-xs text-emerald-700 font-medium">
                        ✓ Super Admin → tetap bisa akses semua halaman
                      </p>
                      {formData.startAt && formData.endAt && (
                        <p className="text-xs text-slate-600">
                          🕐 Lock aktif: {new Date(formData.startAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} — {new Date(formData.endAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
                      Target: {formData.targetAllUsers ? 'Semua User' : (formData.targetRoles.join(', ') || 'Belum dipilih')}
                    </span>
                    {formData.showAsBanner && (
                      <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-blue-600 border border-blue-200">
                        Banner
                      </span>
                    )}
                    {formData.showAsModal && (
                      <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-amber-600 border border-amber-200">
                        Modal Pop-up
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-3">
            <p className="text-[11px] text-slate-400">
              {isLock
                ? 'Maintenance Lock hanya bisa dinonaktifkan manual oleh Super Admin.'
                : editingId ? 'Perubahan efektif segera setelah disimpan.' : ''}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>
                Batal
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !isFormValid}
                className={cn(
                  'gap-2 text-white disabled:opacity-50',
                  isLock ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700',
                )}
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isLock && !editingId ? 'Buat Maintenance Lock' :
                 editingId ? 'Simpan Perubahan' :
                 formData.status === 'active' ? 'Buat & Aktifkan' : 'Simpan Draft'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Detail Dialog ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-full max-w-lg">
          {viewing && (() => {
            const lvl = getLevelInfo(viewing.announcementLevel ?? 'info');
            const LvlIcon = lvl.icon;
            const statusBadge = getStatusBadge(viewing);
            return (
              <>
                <DialogHeader>
                  <div className="flex items-start gap-3">
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', lvl.headerCls.replace('border-', 'border '))}>
                      <LvlIcon className="h-4 w-4 text-slate-700" />
                    </div>
                    <div>
                      <DialogTitle className="text-base">{viewing.title}</DialogTitle>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className={cn('text-[11px]', lvl.badgeCls)}>{lvl.label}</Badge>
                        <Badge variant="outline" className={cn('text-[11px]', statusBadge.cls)}>{statusBadge.label}</Badge>
                        <Badge variant="outline" className="text-[11px] bg-slate-50 text-slate-600">{getCategoryLabel(viewing.category)}</Badge>
                      </div>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-4 text-sm">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p className="whitespace-pre-wrap leading-relaxed text-slate-700">{viewing.content}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {[
                      { label: 'Target', value: viewing.targetAllUsers ? 'Semua User' : (viewing.targetRoles?.join(', ') || '—') },
                      { label: 'Mulai', value: formatDate(viewing.startAt) },
                      { label: 'Selesai', value: formatDate(viewing.endAt) },
                      { label: 'Dibuat Oleh', value: viewing.createdByName ?? viewing.createdByEmail ?? '—' },
                      { label: 'Dibuat', value: formatDate(viewing.createdAt) },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="font-semibold text-slate-500">{label}</p>
                        <p className="mt-0.5 text-slate-700">{value}</p>
                      </div>
                    ))}
                    <div>
                      <p className="font-semibold text-slate-500">Tampil Sebagai</p>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {viewing.showAsBanner && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">Banner</span>}
                        {viewing.showAsModal  && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">Modal</span>}
                      </div>
                    </div>
                  </div>

                  {/* Efek level */}
                  <div className={cn('rounded-lg border p-3 text-xs', lvl.headerCls)}>
                    <p className="font-semibold text-slate-700 mb-1">Efek ke User</p>
                    <p className="text-slate-600">{getLevelInfo(viewing.announcementLevel ?? 'info').userEffect}</p>
                  </div>
                </div>

                <DialogFooter>
                  {viewing.status !== 'archived' && (
                    <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); openEdit(viewing); }}>
                      <Edit2 className="mr-1.5 h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setDetailOpen(false)}>Tutup</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Confirm Dialog ── */}
      <Dialog open={confirmOpen} onOpenChange={open => { if (!actionLoading) setConfirmOpen(open); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {(confirmAction?.type === 'lock') && <Lock className="h-4 w-4 text-red-600" />}
              {(confirmAction?.type === 'unlock') && <ShieldAlert className="h-4 w-4 text-red-600" />}
              {confirmAction?.type === 'publish'          ? 'Aktifkan Pengumuman?' :
               confirmAction?.type === 'lock'             ? 'Aktifkan Maintenance Lock?' :
               confirmAction?.type === 'archive'          ? 'Arsipkan Pengumuman?' :
               confirmAction?.type === 'unlock'           ? 'Matikan Maintenance Lock?' :
               confirmAction?.type === 'delete_permanent' ? 'Hapus Permanen Pengumuman?' :
               'Hapus Pengumuman?'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 -mt-2">
            {(confirmAction?.type === 'publish') && (
              <>Pengumuman "<strong>{confirmAction.announcement.title}</strong>" akan diaktifkan dan tampil ke user yang ditarget.</>
            )}
            {(confirmAction?.type === 'lock') && (
              <>Maintenance Lock "<strong>{confirmAction.announcement.title}</strong>" akan diaktifkan. User yang ditarget tidak dapat mengakses dashboard selama maintenance berlangsung. Super Admin tetap bisa akses.</>
            )}
            {(confirmAction?.type === 'archive') && (
              <>Pengumuman "<strong>{confirmAction.announcement.title}</strong>" akan diarsipkan dan tidak lagi tampil ke user.</>
            )}
            {(confirmAction?.type === 'unlock') && (
              <>User yang sebelumnya dikunci akan bisa mengakses sistem kembali setelah maintenance dimatikan.</>
            )}
            {(confirmAction?.type === 'delete') && (
              <>Pengumuman ini akan dihapus dari sistem. Tindakan ini tidak dapat dibatalkan.</>
            )}
            {(confirmAction?.type === 'delete_permanent') && (
              <>Pengumuman yang sudah dihapus permanen tidak dapat dikembalikan.</>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={actionLoading}>
              Batal
            </Button>
            <Button
              size="sm"
              onClick={executeConfirm}
              disabled={actionLoading}
              className={cn(
                'gap-2',
                (confirmAction?.type === 'delete' || confirmAction?.type === 'delete_permanent' || confirmAction?.type === 'lock' || confirmAction?.type === 'unlock')
                  ? 'bg-red-600 hover:bg-red-700 text-white' :
                confirmAction?.type === 'archive'
                  ? 'bg-amber-600 hover:bg-amber-700 text-white' :
                'bg-emerald-600 hover:bg-emerald-700 text-white',
              )}
            >
              {actionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {confirmAction?.type === 'publish'          ? 'Ya, Aktifkan' :
               confirmAction?.type === 'lock'             ? 'Ya, Aktifkan Lock' :
               confirmAction?.type === 'archive'          ? 'Ya, Arsipkan' :
               confirmAction?.type === 'unlock'           ? 'Matikan Maintenance' :
               confirmAction?.type === 'delete_permanent' ? 'Hapus Permanen' :
               'Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
