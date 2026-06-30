'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, setDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Megaphone, Plus, Search, Filter, Eye, Edit2, Trash2, Archive, Send,
  Bell, AlertTriangle, AlertCircle, Info, CheckCircle2, Clock, Users,
  ChevronDown, X, Loader2, MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
  | 'informasi_umum' | 'maintenance' | 'payroll' | 'absensi'
  | 'cuti_izin' | 'lembur' | 'perjalanan_dinas' | 'rekrutmen'
  | 'keamanan' | 'darurat';

type AnnouncementPriority = 'normal' | 'penting' | 'urgent' | 'darurat';
type AnnouncementStatus = 'draft' | 'active' | 'archived';
type TargetRole = 'super-admin' | 'hrd' | 'manager' | 'karyawan' | 'kandidat';

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  targetRoles: TargetRole[];
  targetAllUsers: boolean;
  showAsBanner: boolean;
  sendNotification: boolean;
  requireAcknowledgement: boolean;
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
  priority: AnnouncementPriority;
  status: 'draft' | 'active';
  targetAllUsers: boolean;
  targetRoles: TargetRole[];
  showAsBanner: boolean;
  sendNotification: boolean;
  requireAcknowledgement: boolean;
  startAt: string;
  endAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { value: AnnouncementCategory; label: string }[] = [
  { value: 'informasi_umum',   label: 'Informasi Umum' },
  { value: 'maintenance',      label: 'Maintenance Sistem' },
  { value: 'payroll',          label: 'Payroll' },
  { value: 'absensi',          label: 'Absensi' },
  { value: 'cuti_izin',        label: 'Cuti & Izin' },
  { value: 'lembur',           label: 'Lembur' },
  { value: 'perjalanan_dinas', label: 'Perjalanan Dinas' },
  { value: 'rekrutmen',        label: 'Rekrutmen' },
  { value: 'keamanan',         label: 'Keamanan' },
  { value: 'darurat',          label: 'Darurat' },
];

const PRIORITIES: { value: AnnouncementPriority; label: string; cls: string }[] = [
  { value: 'normal',  label: 'Normal',  cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'penting', label: 'Penting', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'urgent',  label: 'Urgent',  cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'darurat', label: 'Darurat', cls: 'bg-red-100 text-red-700 border-red-200' },
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
  category: 'informasi_umum',
  priority: 'normal',
  status: 'draft',
  targetAllUsers: true,
  targetRoles: [],
  showAsBanner: true,
  sendNotification: false,
  requireAcknowledgement: false,
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

function getCategoryLabel(v: string) {
  return CATEGORIES.find(c => c.value === v)?.label ?? v;
}

function getPriorityInfo(v: string) {
  return PRIORITIES.find(p => p.value === v) ?? { label: v, cls: 'bg-slate-100 text-slate-700' };
}

function getStatusBadge(a: Announcement) {
  if (a.status === 'archived') return { label: 'Diarsipkan', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  if (a.status === 'draft')    return { label: 'Draft',       cls: 'bg-slate-50 text-slate-500 border-slate-200' };
  if (isScheduled(a))          return { label: 'Terjadwal',   cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  return                              { label: 'Aktif',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AnnouncementsClient() {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();

  // ── Data ───────────────────────────────────────────────────────────────────
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterTarget, setFilterTarget] = useState('all');

  // ── Modal state ────────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // ── Detail modal ───────────────────────────────────────────────────────────
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewing, setViewing] = useState<Announcement | null>(null);

  // ── Confirm dialog ─────────────────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'publish' | 'archive' | 'delete';
    announcement: Announcement;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Firestore subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!firestore) return;
    const q = query(
      collection(firestore, 'system_announcements'),
      orderBy('createdAt', 'desc'),
    );
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
    archived:  announcements.filter(a => a.status === 'archived').length,
  }), [announcements]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return announcements.filter(a => {
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        if (!a.title?.toLowerCase().includes(q) && !a.content?.toLowerCase().includes(q)) return false;
      }
      if (filterStatus !== 'all') {
        if (filterStatus === 'active')    return isCurrentlyActive(a);
        if (filterStatus === 'scheduled') return isScheduled(a);
        if (a.status !== filterStatus) return false;
      }
      if (filterCategory !== 'all' && a.category !== filterCategory) return false;
      if (filterPriority !== 'all' && a.priority !== filterPriority) return false;
      if (filterTarget !== 'all') {
        if (filterTarget === 'all_users') { if (!a.targetAllUsers) return false; }
        else { if (!a.targetRoles?.includes(filterTarget as TargetRole)) return false; }
      }
      return true;
    });
  }, [announcements, filterSearch, filterStatus, filterCategory, filterPriority, filterTarget]);

  // ── Audit log helper ───────────────────────────────────────────────────────
  const writeAuditLog = useCallback(async (
    action: string, targetId: string, targetName: string,
    before?: Record<string, unknown> | null,
    after?: Record<string, unknown> | null,
  ) => {
    if (!userProfile || !firestore) return;
    try {
      await addDoc(collection(firestore, 'audit_logs'), {
        actorUid: userProfile.uid,
        actorName: userProfile.fullName ?? userProfile.email,
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
    } catch {
      // Audit log failure is non-fatal
    }
  }, [userProfile, firestore]);

  // ── Form helpers ───────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditingId(a.id);
    setFormData({
      title: a.title ?? '',
      content: a.content ?? '',
      category: a.category ?? 'informasi_umum',
      priority: a.priority ?? 'normal',
      status: a.status === 'archived' ? 'active' : (a.status as 'draft' | 'active'),
      targetAllUsers: a.targetAllUsers ?? true,
      targetRoles: a.targetRoles ?? [],
      showAsBanner: a.showAsBanner ?? true,
      sendNotification: a.sendNotification ?? false,
      requireAcknowledgement: a.requireAcknowledgement ?? false,
      startAt: toDatetimeLocal(a.startAt),
      endAt: toDatetimeLocal(a.endAt),
    });
    setModalOpen(true);
  };

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const toggleRole = (role: TargetRole) => {
    setFormData(prev => ({
      ...prev,
      targetRoles: prev.targetRoles.includes(role)
        ? prev.targetRoles.filter(r => r !== role)
        : [...prev.targetRoles, role],
    }));
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast({ variant: 'destructive', title: 'Judul dan isi pengumuman wajib diisi.' });
      return;
    }
    if (!userProfile || !firestore) return;

    setSaving(true);
    try {
      const payload = {
        title: formData.title.trim(),
        content: formData.content.trim(),
        category: formData.category,
        priority: formData.priority,
        status: formData.status,
        targetAllUsers: formData.targetAllUsers,
        targetRoles: formData.targetAllUsers ? [] : formData.targetRoles,
        showAsBanner: formData.showAsBanner,
        sendNotification: formData.sendNotification,
        requireAcknowledgement: formData.requireAcknowledgement,
        startAt: parseToTimestamp(formData.startAt),
        endAt: parseToTimestamp(formData.endAt),
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        const before = announcements.find(a => a.id === editingId);
        await updateDoc(doc(firestore, 'system_announcements', editingId), payload);
        await writeAuditLog('update_announcement', editingId, payload.title,
          { status: before?.status, title: before?.title },
          { status: payload.status, title: payload.title },
        );
        toast({ title: 'Pengumuman berhasil diperbarui.' });
      } else {
        const createPayload = {
          ...payload,
          createdByUid: userProfile.uid,
          createdByName: (userProfile as any).fullName ?? userProfile.email ?? '',
          createdByEmail: userProfile.email ?? '',
          createdAt: serverTimestamp(),
          archivedAt: null,
          archivedByUid: null,
        };
        const ref = await addDoc(collection(firestore, 'system_announcements'), createPayload);
        await writeAuditLog('create_announcement', ref.id, payload.title, null, { status: payload.status, title: payload.title });
        toast({ title: 'Pengumuman berhasil dibuat.' });
      }

      setModalOpen(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const openConfirm = (type: 'publish' | 'archive' | 'delete', a: Announcement) => {
    setConfirmAction({ type, announcement: a });
    setConfirmOpen(true);
  };

  const executeConfirm = async () => {
    if (!confirmAction || !firestore || !userProfile) return;
    const { type, announcement } = confirmAction;
    setActionLoading(true);
    try {
      const ref = doc(firestore, 'system_announcements', announcement.id);

      if (type === 'publish') {
        await updateDoc(ref, { status: 'active', updatedAt: serverTimestamp() });
        await writeAuditLog('publish_announcement', announcement.id, announcement.title,
          { status: 'draft' }, { status: 'active' });
        toast({ title: 'Pengumuman diaktifkan.' });

      } else if (type === 'archive') {
        await updateDoc(ref, {
          status: 'archived',
          archivedAt: serverTimestamp(),
          archivedByUid: userProfile.uid,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog('archive_announcement', announcement.id, announcement.title,
          { status: announcement.status }, { status: 'archived' });
        toast({ title: 'Pengumuman diarsipkan.' });

      } else if (type === 'delete') {
        await deleteDoc(ref);
        await writeAuditLog('delete_announcement', announcement.id, announcement.title,
          { status: 'draft', title: announcement.title }, null);
        toast({ title: 'Pengumuman draft dihapus.' });
      }

      setConfirmOpen(false);
      setConfirmAction(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: err.message });
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
            <p className="text-sm text-slate-500">Kelola pengumuman resmi, informasi penting, dan pemberitahuan internal HRP.</p>
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
          { label: 'Pengumuman Aktif', value: counts.active,    icon: CheckCircle2, cls: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Draft',            value: counts.draft,     icon: Clock,        cls: 'text-slate-500',   bg: 'bg-slate-50' },
          { label: 'Terjadwal',        value: counts.scheduled, icon: Bell,         cls: 'text-blue-600',    bg: 'bg-blue-50' },
          { label: 'Diarsipkan',       value: counts.archived,  icon: Archive,      cls: 'text-amber-600',   bg: 'bg-amber-50' },
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
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-44 text-sm"><SelectValue placeholder="Kategori" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-32 text-sm"><SelectValue placeholder="Prioritas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Prioritas</SelectItem>
                {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterTarget} onValueChange={setFilterTarget}>
              <SelectTrigger className="w-36 text-sm"><SelectValue placeholder="Target" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Target</SelectItem>
                <SelectItem value="all_users">Semua User</SelectItem>
                {TARGET_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {(filterSearch || filterStatus !== 'all' || filterCategory !== 'all' || filterPriority !== 'all' || filterTarget !== 'all') && (
              <Button
                variant="ghost" size="sm"
                onClick={() => { setFilterSearch(''); setFilterStatus('all'); setFilterCategory('all'); setFilterPriority('all'); setFilterTarget('all'); }}
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
                  {announcements.length === 0 ? 'Belum ada pengumuman' : 'Tidak ada hasil filter'}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {announcements.length === 0
                    ? 'Buat pengumuman pertama untuk memberi informasi resmi kepada user HRP.'
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
                    <TableHead className="text-xs font-semibold text-slate-600">Kategori</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">Prioritas</TableHead>
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
                    const statusBadge = getStatusBadge(a);
                    const priorityInfo = getPriorityInfo(a.priority);
                    return (
                      <TableRow key={a.id} className="hover:bg-slate-50/50">
                        <TableCell className="max-w-[200px]">
                          <p className="truncate text-sm font-medium text-slate-800">{a.title}</p>
                          <div className="mt-0.5 flex gap-1">
                            {a.showAsBanner && <span className="text-[10px] text-blue-500">banner</span>}
                            {a.requireAcknowledgement && <span className="text-[10px] text-amber-500">wajib baca</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-600">{getCategoryLabel(a.category)}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[11px]', priorityInfo.cls)}>
                            {priorityInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {a.targetAllUsers
                            ? <Badge variant="outline" className="text-[11px] bg-slate-50 text-slate-600">Semua</Badge>
                            : <span className="text-xs text-slate-600">{(a.targetRoles ?? []).join(', ') || '—'}</span>
                          }
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[11px]', statusBadge.cls)}>
                            {statusBadge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 whitespace-nowrap">{formatDate(a.startAt)}</TableCell>
                        <TableCell className="text-xs text-slate-600 whitespace-nowrap">{formatDate(a.endAt)}</TableCell>
                        <TableCell className="text-xs text-slate-600 max-w-[120px] truncate">
                          {a.createdByName ?? a.createdByEmail ?? '—'}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
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
                                <DropdownMenuItem onClick={() => openConfirm('publish', a)} className="text-emerald-700">
                                  <Send className="mr-2 h-3.5 w-3.5" /> Aktifkan
                                </DropdownMenuItem>
                              )}
                              {a.status === 'active' && (
                                <DropdownMenuItem onClick={() => openConfirm('archive', a)} className="text-amber-700">
                                  <Archive className="mr-2 h-3.5 w-3.5" /> Arsipkan
                                </DropdownMenuItem>
                              )}
                              {a.status === 'draft' && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openConfirm('delete', a)} className="text-red-600">
                                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Hapus Draft
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
        <DialogContent className="w-full max-w-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="border-b border-slate-100 bg-slate-50 px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Megaphone className="h-4 w-4 text-blue-600" />
              {editingId ? 'Edit Pengumuman' : 'Buat Pengumuman Baru'}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-5">
            {/* Judul */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Judul Pengumuman <span className="text-red-500">*</span></Label>
              <Input
                value={formData.title}
                onChange={e => setField('title', e.target.value)}
                placeholder="Tulis judul yang jelas dan singkat..."
                className="text-sm"
              />
            </div>

            {/* Isi */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Isi Pengumuman <span className="text-red-500">*</span></Label>
              <Textarea
                value={formData.content}
                onChange={e => setField('content', e.target.value)}
                placeholder="Tulis isi pengumuman secara lengkap..."
                rows={4}
                className="text-sm resize-none"
              />
            </div>

            {/* Kategori + Prioritas */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Kategori</Label>
                <Select value={formData.category} onValueChange={v => setField('category', v as AnnouncementCategory)}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Prioritas</Label>
                <Select value={formData.priority} onValueChange={v => setField('priority', v as AnnouncementPriority)}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Status Awal</Label>
              <Select value={formData.status} onValueChange={v => setField('status', v as 'draft' | 'active')}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft — Simpan tanpa publish</SelectItem>
                  <SelectItem value="active">Aktif — Langsung tampil ke user</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Target Penerima */}
            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <Label className="text-xs font-semibold text-slate-700">Target Penerima</Label>
              <div className="flex items-center gap-3">
                <Switch
                  id="targetAll"
                  checked={formData.targetAllUsers}
                  onCheckedChange={v => setField('targetAllUsers', v)}
                />
                <Label htmlFor="targetAll" className="cursor-pointer text-sm text-slate-700">
                  Semua User
                </Label>
              </div>
              {!formData.targetAllUsers && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {TARGET_ROLES.map(r => (
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

            {/* Tanggal */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Mulai Tampil</Label>
                <Input
                  type="datetime-local"
                  value={formData.startAt}
                  onChange={e => setField('startAt', e.target.value)}
                  className="text-sm"
                />
                <p className="text-[11px] text-slate-400">Kosongkan = tampil langsung</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Selesai Tampil</Label>
                <Input
                  type="datetime-local"
                  value={formData.endAt}
                  onChange={e => setField('endAt', e.target.value)}
                  className="text-sm"
                />
                <p className="text-[11px] text-slate-400">Kosongkan = tidak ada batas</p>
              </div>
            </div>

            {/* Toggle Options */}
            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <Label className="text-xs font-semibold text-slate-700">Opsi Tampilan</Label>
              {[
                { id: 'showBanner', field: 'showAsBanner' as const, label: 'Tampilkan sebagai Banner', desc: 'Muncul di bagian atas dashboard user' },
                { id: 'sendNotif', field: 'sendNotification' as const, label: 'Kirim ke Notifikasi', desc: 'Kirim notifikasi ke user yang ditarget' },
                { id: 'reqAck', field: 'requireAcknowledgement' as const, label: 'Wajib Dibaca', desc: 'User harus klik "Saya Sudah Membaca"' },
              ].map(opt => (
                <div key={opt.id} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{opt.label}</p>
                    <p className="text-[11px] text-slate-400">{opt.desc}</p>
                  </div>
                  <Switch
                    id={opt.id}
                    checked={formData[opt.field] as boolean}
                    onCheckedChange={v => setField(opt.field, v)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-3">
            <p className="text-[11px] text-slate-400">
              {editingId ? 'Perubahan akan langsung disimpan.' : 'Pengumuman baru akan disimpan ke Firestore.'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>
                Batal
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !formData.title.trim() || !formData.content.trim()}
                className="gap-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingId ? 'Simpan Perubahan' : (formData.status === 'active' ? 'Buat & Aktifkan' : 'Simpan Draft')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Detail Dialog ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-full max-w-lg">
          {viewing && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    viewing.priority === 'darurat' ? 'bg-red-100' :
                    viewing.priority === 'urgent'  ? 'bg-orange-100' :
                    viewing.priority === 'penting' ? 'bg-amber-100' : 'bg-blue-100',
                  )}>
                    <Megaphone className={cn('h-4 w-4',
                      viewing.priority === 'darurat' ? 'text-red-600' :
                      viewing.priority === 'urgent'  ? 'text-orange-600' :
                      viewing.priority === 'penting' ? 'text-amber-600' : 'text-blue-600',
                    )} />
                  </div>
                  <div>
                    <DialogTitle className="text-base">{viewing.title}</DialogTitle>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="outline" className={cn('text-[11px]', getPriorityInfo(viewing.priority).cls)}>
                        {getPriorityInfo(viewing.priority).label}
                      </Badge>
                      <Badge variant="outline" className={cn('text-[11px]', getStatusBadge(viewing).cls)}>
                        {getStatusBadge(viewing).label}
                      </Badge>
                      <Badge variant="outline" className="text-[11px] bg-slate-50 text-slate-600">
                        {getCategoryLabel(viewing.category)}
                      </Badge>
                    </div>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="whitespace-pre-wrap text-slate-700 leading-relaxed">{viewing.content}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><p className="font-semibold text-slate-500">Target</p>
                    <p className="mt-0.5 text-slate-700">
                      {viewing.targetAllUsers ? 'Semua User' : (viewing.targetRoles?.join(', ') || '—')}
                    </p>
                  </div>
                  <div><p className="font-semibold text-slate-500">Mulai</p>
                    <p className="mt-0.5 text-slate-700">{formatDate(viewing.startAt)}</p>
                  </div>
                  <div><p className="font-semibold text-slate-500">Selesai</p>
                    <p className="mt-0.5 text-slate-700">{formatDate(viewing.endAt)}</p>
                  </div>
                  <div><p className="font-semibold text-slate-500">Dibuat Oleh</p>
                    <p className="mt-0.5 text-slate-700">{viewing.createdByName ?? viewing.createdByEmail ?? '—'}</p>
                  </div>
                  <div><p className="font-semibold text-slate-500">Dibuat</p>
                    <p className="mt-0.5 text-slate-700">{formatDate(viewing.createdAt)}</p>
                  </div>
                  <div><p className="font-semibold text-slate-500">Opsi</p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {viewing.showAsBanner && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">Banner</span>}
                      {viewing.requireAcknowledgement && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">Wajib Baca</span>}
                      {viewing.sendNotification && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">Notifikasi</span>}
                    </div>
                  </div>
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
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirm Dialog ── */}
      <Dialog open={confirmOpen} onOpenChange={open => { if (!actionLoading) setConfirmOpen(open); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {confirmAction?.type === 'publish' ? 'Aktifkan Pengumuman?' :
               confirmAction?.type === 'archive' ? 'Arsipkan Pengumuman?' :
               'Hapus Draft Pengumuman?'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 -mt-2">
            {confirmAction?.type === 'publish' && (
              <>Pengumuman "<strong>{confirmAction.announcement.title}</strong>" akan diaktifkan dan tampil ke user yang ditarget.</>
            )}
            {confirmAction?.type === 'archive' && (
              <>Pengumuman "<strong>{confirmAction.announcement.title}</strong>" akan diarsipkan dan tidak lagi tampil ke user.</>
            )}
            {confirmAction?.type === 'delete' && (
              <>Draft "<strong>{confirmAction.announcement.title}</strong>" akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.</>
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
                confirmAction?.type === 'delete'  ? 'bg-red-600 hover:bg-red-700 text-white' :
                confirmAction?.type === 'publish' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' :
                'bg-amber-600 hover:bg-amber-700 text-white',
              )}
            >
              {actionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {confirmAction?.type === 'publish' ? 'Ya, Aktifkan' :
               confirmAction?.type === 'archive' ? 'Ya, Arsipkan' : 'Ya, Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
