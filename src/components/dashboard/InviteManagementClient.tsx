'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCollection, useFirestore, useMemoFirebase, useAuth as useFirebaseAuth } from '@/firebase';
import { useFeatureFlags } from '@/lib/feature-flags';
import { collection, query, where } from 'firebase/firestore';
import type { InviteBatch, Brand, UserProfile, InviteContractType } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, PlusCircle, Copy, Trash2, ToggleLeft, ToggleRight,
  Users, Link2, TrendingUp, CheckCircle2, ChevronDown, Search,
  CalendarClock, StickyNote, AlertTriangle, PowerOff, Power,
  ExternalLink, Mail, UserCheck, ClipboardList, Info,
} from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { parseJsonSafe } from '@/lib/parse-json-safe';
import { useRouter } from 'next/navigation';

const CONTRACT_TYPES: InviteContractType[] = ['Magang', 'Probation', 'Kontrak', 'Tetap'];

const CONTRACT_NOTES: Record<InviteContractType, string> = {
  Magang:    'Peserta akan masuk ke Data Karyawan dengan status Magang. Cocok untuk program internship atau praktik kerja.',
  Probation: 'Peserta akan masuk dengan status Probation. Gunakan untuk karyawan baru yang masih dalam masa percobaan.',
  Kontrak:   'Peserta akan masuk dengan status Kontrak. Sesuai untuk karyawan dengan perjanjian kerja waktu tertentu (PKWT).',
  Tetap:     'Peserta akan masuk dengan status Tetap. Gunakan untuk karyawan dengan perjanjian kerja waktu tidak tertentu (PKWTT).',
};

const CONTRACT_COLORS: Record<InviteContractType, string> = {
  Magang:    'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900',
  Probation: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900',
  Kontrak:   'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-900',
  Tetap:     'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
};

const generateSchema = z.object({
  brandId: z.string({ required_error: 'Brand wajib dipilih.' }),
  contractType: z.enum(['Magang', 'Probation', 'Kontrak', 'Tetap'] as const, {
    required_error: 'Jenis Kontrak / Tipe wajib dipilih.',
  }),
  quantity: z.coerce.number().int().min(1, 'Minimal 1.').max(500, 'Maksimal 500.'),
  expiresAt: z.string().optional(),
  notes: z.string().max(500).optional(),
});
type GenerateFormValues = z.infer<typeof generateSchema>;

const addQuotaSchema = z.object({
  additionalQuantity: z.coerce.number().int().min(1, 'Minimal 1.').max(500, 'Maksimal 500.'),
});
type AddQuotaFormValues = z.infer<typeof addQuotaSchema>;

// ── Add Quota Dialog ──────────────────────────────────────────────────────────
function AddQuotaDialog({
  batch, open, onOpenChange, onDone,
}: { batch: InviteBatch | null; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const { firebaseUser } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const form = useForm<AddQuotaFormValues>({
    resolver: zodResolver(addQuotaSchema),
    defaultValues: { additionalQuantity: 5 },
  });

  useEffect(() => { if (open) form.reset({ additionalQuantity: 5 }); }, [open, form]);

  const handleSubmit = async (values: AddQuotaFormValues) => {
    if (!batch || !firebaseUser) return;
    setIsSaving(true);
    try {
      const token = await firebaseUser.getIdToken(true);
      const res = await fetch(`/api/admin/invite-batches/${batch.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalQuantity: values.additionalQuantity }),
      });
      const result = await parseJsonSafe(res);
      console.log('[employee-invites response]', { status: res.status, ok: res.ok, result });
      if (!res.ok || !result.success) throw new Error(result.message || 'Gagal menambah kuota.');
      toast({ title: 'Kuota Ditambahkan', description: `${values.additionalQuantity} slot baru ditambahkan.` });
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal menambah kuota.', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  if (!batch) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Kuota</DialogTitle>
          <DialogDescription>
            Menambah slot untuk batch <strong>{batch.brandName} — {batch.contractType}</strong>. Link undangan tetap sama.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="add-quota-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-2">
            <FormField control={form.control} name="additionalQuantity" render={({ field }) => (
              <FormItem>
                <FormLabel>Jumlah Kuota Tambahan</FormLabel>
                <FormControl>
                  <Input type="number" min={1} max={500} className="h-11 text-base" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="add-quota-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Tambah Kuota
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Batch Dialog ───────────────────────────────────────────────────────
function DeleteBatchDialog({
  batch,
  registeredCount,
  open,
  onOpenChange,
  onConfirm,
  onDeactivate,
}: {
  batch: InviteBatch | null;
  registeredCount: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  onDeactivate: () => void;
}) {
  if (!batch) return null;
  const hasUsers = registeredCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasUsers
              ? <><AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />Tidak Dapat Dihapus</>
              : <><Trash2 className="h-5 w-5 text-destructive flex-shrink-0" />Hapus Batch Undangan?</>
            }
          </DialogTitle>
          <DialogDescription className="sr-only">
            {hasUsers ? 'Batch ini memiliki peserta dan tidak dapat dihapus.' : 'Konfirmasi hapus batch undangan.'}
          </DialogDescription>
          <div className="space-y-3 pt-1">
            {hasUsers ? (
              <>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Batch undangan <strong>{batch.brandName} — {batch.contractType}</strong> sudah memiliki{' '}
                  <strong>{registeredCount} peserta terdaftar</strong>, sehingga tidak dapat dihapus permanen.
                </p>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3">
                  <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                    Untuk menghentikan pemakaian link ini, gunakan tombol <strong>Nonaktifkan</strong>. Link tidak akan bisa digunakan lagi, tapi data peserta tetap tersimpan.
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Batch undangan <strong>{batch.brandName} — {batch.contractType}</strong> akan dihapus permanen.
                  Tindakan ini tidak dapat dibatalkan.
                </p>
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-3">
                  <p className="text-xs text-red-700 dark:text-red-400">
                    Link undangan yang sudah dibagikan akan langsung tidak berlaku setelah dihapus.
                  </p>
                </div>
              </>
            )}
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0 flex-col-reverse sm:flex-row">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          {hasUsers ? (
            <Button
              variant="outline"
              className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30"
              onClick={() => { onDeactivate(); onOpenChange(false); }}
            >
              <PowerOff className="h-4 w-4" />
              Nonaktifkan Saja
            </Button>
          ) : (
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => { onConfirm(); onOpenChange(false); }}
            >
              <Trash2 className="h-4 w-4" />
              Ya, Hapus Undangan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Batch status helper ───────────────────────────────────────────────────────
type BatchStatusKey = 'Aktif' | 'Nonaktif' | 'Penuh' | 'Kedaluwarsa';

function getBatchStatus(batch: InviteBatch): { label: BatchStatusKey; className: string; dotClass: string } {
  if (!batch.isActive) return {
    label: 'Nonaktif',
    className: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    dotClass: 'bg-slate-400',
  };
  if (batch.expiresAt && (batch.expiresAt as any).toMillis?.() < Date.now()) return {
    label: 'Kedaluwarsa',
    className: 'bg-red-100 text-red-600 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900',
    dotClass: 'bg-red-500',
  };
  if (batch.claimedSlots >= batch.totalSlots) return {
    label: 'Penuh',
    className: 'bg-orange-100 text-orange-600 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-900',
    dotClass: 'bg-orange-500',
  };
  return {
    label: 'Aktif',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
    dotClass: 'bg-emerald-500',
  };
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon, accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow rounded-xl">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0', accent)}>
            {icon}
          </div>
          <div className="flex-1 text-right">
            <p className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-4">{label}</p>
      </CardContent>
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function InviteManagementClient() {
  const { firebaseUser, userProfile } = useAuth();
  const auth = useFirebaseAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const { isEnabled: isFeatureFlagEnabled } = useFeatureFlags(firestore);
  const employeeInviteEnabled = isFeatureFlagEnabled('employee_invite');

  const [isGenerating, setIsGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BatchStatusKey>('all');
  const [contractFilter, setContractFilter] = useState<'all' | InviteContractType>('all');
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);
  const [addQuotaBatch, setAddQuotaBatch] = useState<InviteBatch | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [batchToDelete, setBatchToDelete] = useState<InviteBatch | null>(null);

  const { data: inviteBatches, isLoading: isLoadingBatches, mutate: mutateBatches } = useCollection<InviteBatch>(
    useMemoFirebase(() => collection(firestore, 'invite_batches'), [firestore]),
  );
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore]),
  );
  const { data: inviteUsers } = useCollection<UserProfile>(
    useMemoFirebase(() => query(collection(firestore, 'users'), where('source', '==', 'employee_invite')), [firestore]),
  );

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateSchema),
    defaultValues: { quantity: 10 },
  });

  // All batches sorted desc
  const allBatches = useMemo(() => {
    if (!inviteBatches) return [];
    return [...inviteBatches].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  }, [inviteBatches]);

  // Filtered batches for the list
  const filteredBatches = useMemo(() => {
    let list = allBatches;
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(b =>
        b.brandName.toLowerCase().includes(q) ||
        b.contractType.toLowerCase().includes(q) ||
        (b.notes || '').toLowerCase().includes(q),
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter(b => getBatchStatus(b).label === statusFilter);
    }
    if (contractFilter !== 'all') {
      list = list.filter(b => b.contractType === contractFilter);
    }
    return list;
  }, [allBatches, searchQuery, statusFilter, contractFilter]);

  // KPI based on all batches (not filtered)
  const summary = useMemo(() => {
    const total = allBatches.reduce((s, b) => s + b.totalSlots, 0);
    const used = allBatches.reduce((s, b) => s + b.claimedSlots, 0);
    const active = allBatches.filter(b => getBatchStatus(b).label === 'Aktif').length;
    const rate = total > 0 ? Math.round((used / total) * 100) : 0;
    return { total, used, rate, active };
  }, [allBatches]);

  const usersByBatch = useMemo(() => {
    if (!inviteUsers) return new Map<string, UserProfile[]>();
    return inviteUsers.reduce((acc, u) => {
      if (u.inviteBatchId) {
        if (!acc.has(u.inviteBatchId)) acc.set(u.inviteBatchId, []);
        acc.get(u.inviteBatchId)!.push(u);
      }
      return acc;
    }, new Map<string, UserProfile[]>());
  }, [inviteUsers]);

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || contractFilter !== 'all';

  const handleGenerate = async (values: GenerateFormValues) => {
    if (!firebaseUser) return;

    // Guard against stale/undefined selections before ever reading a field off
    // them (e.g. brands list still loading, or a previously-selected id no
    // longer exists) — this is what used to crash with
    // "Cannot read properties of undefined (reading 'label')".
    const selectedBrand = brands?.find(b => b.id === values.brandId);
    if (!selectedBrand) {
      toast({ variant: 'destructive', title: 'Brand tidak valid. Silakan pilih ulang.' });
      return;
    }
    const selectedContractType = CONTRACT_TYPES.find(t => t === values.contractType);
    if (!selectedContractType) {
      toast({ variant: 'destructive', title: 'Jenis kontrak tidak valid. Silakan pilih ulang.' });
      return;
    }
    if (!values.quantity || values.quantity <= 0) {
      toast({ variant: 'destructive', title: 'Kuota harus berupa angka lebih dari 0.' });
      return;
    }

    setIsGenerating(true);
    try {
      const token = await firebaseUser.getIdToken(true);
      const body: any = {
        brandId: selectedBrand.id,
        brandName: selectedBrand.name ?? selectedBrand.id,
        contractType: selectedContractType,
        contractTypeLabel: selectedContractType,
        quantity: values.quantity,
        quota: values.quantity,
      };
      if (values.expiresAt) body.expiresAt = new Date(values.expiresAt).toISOString();
      if (values.notes) body.notes = values.notes;

      const res = await fetch('/api/admin/generate-invites', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        toast({ variant: 'destructive', title: 'Sesi Habis', description: 'Silakan login kembali.' });
        await auth.signOut(); router.push('/admin/login'); return;
      }
      const result = await parseJsonSafe(res);
      console.log('[generate invite response]', { status: res.status, ok: res.ok, result });
      if (!res.ok || !result.success) throw new Error(result.message || 'Gagal membuat undangan.');
      toast({ title: 'Batch Undangan Dibuat', description: `Link undangan dengan kuota ${values.quantity} untuk ${values.contractType} telah dibuat.` });
      form.reset({ brandId: values.brandId, contractType: values.contractType, quantity: 10 });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal membuat undangan.', description: e.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleActive = async (batch: InviteBatch) => {
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken(true);
      const res = await fetch(`/api/admin/invite-batches/${batch.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !batch.isActive }),
      });
      const result = await parseJsonSafe(res);
      console.log('[employee-invites response]', { status: res.status, ok: res.ok, result });
      if (!res.ok || !result.success) throw new Error(result.message || 'Gagal menonaktifkan undangan.');
      toast({ title: batch.isActive ? 'Batch Dinonaktifkan' : 'Batch Diaktifkan' });
      mutateBatches();
    } catch (e: any) {
      toast({ variant: 'destructive', title: batch.isActive ? 'Gagal menonaktifkan undangan.' : 'Gagal mengaktifkan undangan.', description: e.message });
    }
  };

  const confirmDeleteBatch = async () => {
    if (!batchToDelete || !firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken(true);
      const res = await fetch(`/api/admin/invite-batches/${batchToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { await auth.signOut(); router.push('/admin/login'); return; }
      const result = await parseJsonSafe(res);
      console.log('[employee-invites response]', { status: res.status, ok: res.ok, result });
      if (!res.ok || !result.success) throw new Error(result.message || 'Gagal menghapus undangan.');
      toast({ title: 'Batch Dihapus', description: `Batch undangan ${batchToDelete.brandName} telah dihapus.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus undangan.', description: e.message });
    } finally {
      setBatchToDelete(null);
    }
  };

  const handleDeactivateBatchToDelete = async () => {
    if (!batchToDelete || !firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken(true);
      const res = await fetch(`/api/admin/invite-batches/${batchToDelete.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      const result = await parseJsonSafe(res);
      console.log('[employee-invites response]', { status: res.status, ok: res.ok, result });
      if (!res.ok || !result.success) throw new Error(result.message || 'Gagal menonaktifkan undangan.');
      toast({ title: 'Batch Dinonaktifkan', description: 'Link undangan tidak bisa digunakan lagi.' });
      mutateBatches();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal menonaktifkan undangan.', description: e.message });
    } finally {
      setBatchToDelete(null);
    }
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete || !firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken(true);
      const res = await fetch(`/api/users/${userToDelete.uid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await parseJsonSafe(res);
      console.log('[employee-invites response]', { status: res.status, ok: res.ok, result });
      if (!res.ok || !result.success) throw new Error(result.message || result.error || 'Gagal menghapus pengguna.');
      toast({ title: 'Pengguna Dihapus', description: `Akun ${userToDelete.fullName} dihapus.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus pengguna.', description: e.message });
    } finally {
      setUserToDelete(null);
    }
  };

  const copyLink = (batchId: string) => {
    const url = `${window.location.origin}/register?batch=${batchId}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link Disalin', description: 'Link undangan telah disalin ke clipboard.' });
  };

  return (
    <>
      <div className="space-y-8">

        {/* ── KPI Cards ──────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total Kuota Undangan"
            value={summary.total}
            sub="seluruh batch"
            icon={<Users className="h-5 w-5 text-slate-600 dark:text-slate-300" />}
            accent="bg-slate-100 dark:bg-slate-800"
          />
          <KpiCard
            label="Kuota Terpakai"
            value={summary.used}
            sub={`dari ${summary.total} total`}
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
            accent="bg-emerald-50 dark:bg-emerald-950/40"
          />
          <KpiCard
            label="Tingkat Penggunaan"
            value={`${summary.rate}%`}
            sub="rata-rata semua batch"
            icon={<TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
            accent="bg-blue-50 dark:bg-blue-950/40"
          />
          <KpiCard
            label="Link Aktif"
            value={summary.active}
            sub={`dari ${allBatches.length} batch`}
            icon={<Link2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />}
            accent="bg-violet-50 dark:bg-violet-950/40"
          />
        </div>

        {/* ── Main Grid ─────────────────────────────────────────────── */}
        <div className="grid gap-8 lg:grid-cols-3">

          {/* ── Form Buat Batch ───────────────────────────────────── */}
          <div className="lg:col-span-1">
            <Card className="border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-xl sticky top-6">
              <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-lg">Buat Batch Undangan</CardTitle>
                <CardDescription className="text-sm">
                  Satu link untuk banyak pendaftar dengan kuota terbatas.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleGenerate)} className="space-y-5">

                    <FormField control={form.control} name="brandId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold">Brand / Perusahaan</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingBrands}>
                          <FormControl>
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Pilih brand" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="contractType" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold">Jenis Kontrak / Tipe</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Pilih jenis kontrak" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CONTRACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          {form.watch('contractType')
                            ? (
                              <span className="flex items-start gap-1.5">
                                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
                                <span>{CONTRACT_NOTES[form.watch('contractType') as InviteContractType]}</span>
                              </span>
                            )
                            : 'Pilih tipe sesuai status awal yang akan otomatis masuk ke Data Karyawan setelah peserta mendaftar melalui link ini.'
                          }
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="quantity" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold">Jumlah Kuota</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={500} className="h-11" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="expiresAt" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold flex items-center gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                          Masa Berlaku
                          <span className="text-muted-foreground font-normal text-xs">(opsional)</span>
                        </FormLabel>
                        <FormControl>
                          <Input type="datetime-local" className="h-11" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold flex items-center gap-1.5">
                          <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                          Catatan Internal
                          <span className="text-muted-foreground font-normal text-xs">(opsional)</span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Misal: batch rekrutmen Juli 2025..."
                            rows={2}
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {!employeeInviteEnabled && (
                      <p className="text-xs font-medium text-red-600">
                        Fitur Employee Invite sedang dinonaktifkan oleh Super Admin.
                      </p>
                    )}
                    <Button
                      type="submit"
                      className="w-full h-12 text-base font-semibold"
                      disabled={
                        isGenerating ||
                        !employeeInviteEnabled ||
                        isLoadingBrands ||
                        !brands?.length ||
                        !form.watch('brandId') ||
                        !form.watch('contractType') ||
                        !form.watch('quantity')
                      }
                    >
                      {isGenerating
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Membuat...</>
                        : <><PlusCircle className="mr-2 h-4 w-4" />Generate Batch Undangan</>
                      }
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>

          {/* ── Daftar Batch ──────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Header + Filter */}
            <div className="space-y-3">
              <h2 className="text-base font-bold text-slate-800 dark:text-white">
                Daftar Batch Undangan
              </h2>

              {/* Filter bar */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Cari brand atau tipe kontrak..."
                    className="pl-9 h-10"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                  <SelectTrigger className="h-10 w-full sm:w-[160px]">
                    <SelectValue placeholder="Semua Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="Aktif">Aktif</SelectItem>
                    <SelectItem value="Nonaktif">Nonaktif</SelectItem>
                    <SelectItem value="Penuh">Penuh</SelectItem>
                    <SelectItem value="Kedaluwarsa">Kedaluwarsa</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={contractFilter} onValueChange={(v: any) => setContractFilter(v)}>
                  <SelectTrigger className="h-10 w-full sm:w-[150px]">
                    <SelectValue placeholder="Semua Tipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Tipe</SelectItem>
                    {CONTRACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Batch list */}
            {isLoadingBatches ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Memuat batch undangan...</span>
              </div>
            ) : filteredBatches.length === 0 ? (
              <Card className="border-dashed border-2 border-slate-200 dark:border-slate-700 shadow-none rounded-xl">
                <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
                  <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Link2 className="h-5 w-5 text-slate-400" />
                  </div>
                  <p className="font-medium text-slate-700 dark:text-slate-300">
                    {hasActiveFilters ? 'Tidak ada batch yang sesuai filter' : 'Belum ada batch undangan'}
                  </p>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    {hasActiveFilters
                      ? 'Coba ubah kata kunci pencarian atau filter yang dipilih.'
                      : 'Buat batch undangan pertama menggunakan form di sebelah kiri.'}
                  </p>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1"
                      onClick={() => { setSearchQuery(''); setStatusFilter('all'); setContractFilter('all'); }}
                    >
                      Hapus semua filter
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : filteredBatches.map(batch => {
              const registeredUsers = usersByBatch.get(batch.id!) || [];
              const status = getBatchStatus(batch);
              const isOpen = openBatchId === batch.id;
              const contractColor = CONTRACT_COLORS[batch.contractType as InviteContractType] || 'bg-slate-100 text-slate-600 border-slate-200';
              const usagePercent = batch.totalSlots > 0 ? Math.round((batch.claimedSlots / batch.totalSlots) * 100) : 0;
              const remaining = batch.totalSlots - batch.claimedSlots;
              const isInactive = !batch.isActive;

              const progressColor = isInactive
                ? 'bg-slate-300 dark:bg-slate-600'
                : usagePercent >= 100
                  ? 'bg-red-500'
                  : usagePercent >= 75
                    ? 'bg-orange-500'
                    : 'bg-emerald-500';

              return (
                <Card
                  key={batch.id}
                  className={cn(
                    'border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-xl transition-all duration-200',
                    'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700',
                    isInactive && 'opacity-60',
                  )}
                >
                  <CardContent className="p-0">

                    {/* ── Card body ── */}
                    <div className="p-5">
                      {/* Top: brand + badges + date */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                              {batch.brandName}
                            </h3>
                            <Badge className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', contractColor)}>
                              {batch.contractType}
                            </Badge>
                            <Badge className={cn('text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1.5', status.className)}>
                              <span className={cn('inline-block h-1.5 w-1.5 rounded-full', status.dotClass)} />
                              {status.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Dibuat {format(batch.createdAt.toDate(), 'dd MMM yyyy', { locale: idLocale })}
                            {batch.expiresAt && (
                              <span className="ml-2">
                                · Berlaku s/d {format((batch.expiresAt as any).toDate(), 'dd MMM yyyy', { locale: idLocale })}
                              </span>
                            )}
                          </p>
                          {batch.notes && (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              "{batch.notes}"
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Quota info */}
                      <div className="flex items-end justify-between mb-2">
                        <div>
                          <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">
                            {batch.claimedSlots}
                            <span className="text-sm font-medium text-muted-foreground ml-1">/ {batch.totalSlots} terpakai</span>
                          </p>
                          <p className={cn(
                            'text-xs font-medium mt-0.5',
                            remaining === 0 ? 'text-red-600 dark:text-red-400' :
                            remaining <= 3 ? 'text-orange-600 dark:text-orange-400' :
                            'text-emerald-600 dark:text-emerald-400',
                          )}>
                            {remaining > 0 ? `Sisa ${remaining} kuota` : 'Kuota habis'}
                          </p>
                        </div>
                        <span className={cn(
                          'text-sm font-bold tabular-nums',
                          usagePercent >= 100 ? 'text-red-600 dark:text-red-400' :
                          usagePercent >= 75 ? 'text-orange-600 dark:text-orange-400' :
                          'text-slate-600 dark:text-slate-400',
                        )}>
                          {usagePercent}%
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-500', progressColor)}
                          style={{ width: `${Math.min(usagePercent, 100)}%` }}
                        />
                      </div>

                      {/* ── Actions ── */}
                      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                        {/* Row 1: secondary actions */}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-10 px-4 text-sm font-medium gap-2"
                            title="Salin link undangan"
                            onClick={() => copyLink(batch.id!)}
                          >
                            <Copy className="h-4 w-4" />
                            Salin Link
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-10 px-4 text-sm font-medium gap-2"
                            title="Tambah kuota batch ini"
                            onClick={() => setAddQuotaBatch(batch)}
                          >
                            <PlusCircle className="h-4 w-4" />
                            Tambah Kuota
                          </Button>
                        </div>
                        {/* Row 2: status toggle + hapus */}
                        <div className="flex flex-wrap gap-2">
                          {batch.isActive ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-10 px-4 text-sm font-medium gap-2 border-slate-300 text-slate-600 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 dark:border-slate-700 dark:text-slate-400 dark:hover:border-orange-700 dark:hover:text-orange-400 dark:hover:bg-orange-950/20"
                              title="Nonaktifkan link undangan ini"
                              onClick={() => handleToggleActive(batch)}
                            >
                              <PowerOff className="h-4 w-4" />
                              Nonaktifkan
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="h-10 px-4 text-sm font-medium gap-2 bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-700 dark:hover:bg-emerald-600"
                              title="Aktifkan kembali link undangan ini"
                              onClick={() => handleToggleActive(batch)}
                            >
                              <Power className="h-4 w-4" />
                              Aktifkan
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-10 px-4 text-sm font-medium gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                            title={registeredUsers.length > 0 ? 'Batch sudah punya peserta, nonaktifkan dulu' : 'Hapus batch ini permanen'}
                            onClick={() => setBatchToDelete(batch)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Hapus Undangan
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* ── Collapsible peserta ── */}
                    <Collapsible open={isOpen} onOpenChange={v => setOpenBatchId(v ? batch.id! : null)}>
                      <CollapsibleTrigger className="w-full flex items-center justify-between px-5 py-3 text-xs font-medium text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors border-t border-slate-100 dark:border-slate-800 rounded-b-xl">
                        <span className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5" />
                          <span>
                            <strong className="text-slate-700 dark:text-slate-300">{registeredUsers.length}</strong> Peserta Terdaftar
                          </span>
                        </span>
                        <span className="flex items-center gap-1">
                          Lihat Peserta
                          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t border-slate-100 dark:border-slate-800">
                          {registeredUsers.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-8 px-5 text-center">
                              <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <Users className="h-4.5 w-4.5 text-slate-400" />
                              </div>
                              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                                Belum ada peserta yang mendaftar via link ini.
                              </p>
                              <p className="text-xs text-muted-foreground max-w-xs">
                                Peserta yang berhasil register melalui link undangan akan muncul di sini secara otomatis.
                              </p>
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="hover:bg-transparent border-slate-100 dark:border-slate-800">
                                    <TableHead className="text-xs pl-5 py-3 font-semibold text-slate-500">Nama</TableHead>
                                    <TableHead className="text-xs py-3 font-semibold text-slate-500">Email</TableHead>
                                    <TableHead className="text-xs py-3 font-semibold text-slate-500">Tgl Daftar</TableHead>
                                    <TableHead className="text-xs py-3 font-semibold text-slate-500">Kontrak</TableHead>
                                    <TableHead className="text-xs py-3 font-semibold text-slate-500">Status Akun</TableHead>
                                    <TableHead className="text-xs py-3 font-semibold text-slate-500">Data Karyawan</TableHead>
                                    <TableHead className="text-right text-xs py-3 font-semibold text-slate-500 pr-5">Aksi</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {registeredUsers.map(user => {
                                    const userContractType = (user as any).contractType || (user as any).employmentType;
                                    const hasProfile = !!(user as any).isProfileComplete;
                                    const isActive = user.isActive !== false;

                                    return (
                                      <TableRow key={user.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 border-slate-100 dark:border-slate-800/60">
                                        {/* Nama */}
                                        <TableCell className="pl-5 py-4">
                                          <div>
                                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                                              {user.fullName || '—'}
                                            </p>
                                            {user.brandName && (
                                              <p className="text-xs text-muted-foreground mt-0.5">{user.brandName}</p>
                                            )}
                                          </div>
                                        </TableCell>

                                        {/* Email */}
                                        <TableCell className="py-4">
                                          <p className="text-xs text-muted-foreground font-mono">{user.email}</p>
                                        </TableCell>

                                        {/* Tgl Daftar */}
                                        <TableCell className="py-4">
                                          <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                            {user.createdAt
                                              ? format((user.createdAt as any).toDate(), 'dd MMM yyyy', { locale: idLocale })
                                              : '—'
                                            }
                                          </p>
                                        </TableCell>

                                        {/* Kontrak */}
                                        <TableCell className="py-4">
                                          {userContractType ? (
                                            <Badge className={cn(
                                              'text-xs font-semibold px-2 py-0.5 rounded-full border',
                                              CONTRACT_COLORS[userContractType as InviteContractType] || 'bg-slate-100 text-slate-600 border-slate-200',
                                            )}>
                                              {userContractType}
                                            </Badge>
                                          ) : <span className="text-xs text-muted-foreground">—</span>}
                                        </TableCell>

                                        {/* Status Akun */}
                                        <TableCell className="py-4">
                                          <Badge className={cn(
                                            'text-xs font-semibold px-2 py-0.5 rounded-full border',
                                            isActive
                                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900'
                                              : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
                                          )}>
                                            <UserCheck className="h-3 w-3 mr-1 inline-block" />
                                            {isActive ? 'Terdaftar' : 'Nonaktif'}
                                          </Badge>
                                        </TableCell>

                                        {/* Status Data Karyawan */}
                                        <TableCell className="py-4">
                                          {hasProfile ? (
                                            <Badge className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900">
                                              <ClipboardList className="h-3 w-3 mr-1 inline-block" />
                                              Masuk Data Karyawan
                                            </Badge>
                                          ) : (
                                            <Badge className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900">
                                              <AlertTriangle className="h-3 w-3 mr-1 inline-block" />
                                              Perlu Review HRD
                                            </Badge>
                                          )}
                                        </TableCell>

                                        {/* Aksi */}
                                        <TableCell className="py-4 pr-5">
                                          <div className="flex items-center justify-end gap-1">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 px-2 text-xs gap-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                                              title="Lihat detail karyawan"
                                              onClick={() => window.open(`/admin/hrd/employee-data/karyawan/${user.uid}`, '_blank')}
                                            >
                                              <ExternalLink className="h-3.5 w-3.5" />
                                              <span className="hidden sm:inline">Detail</span>
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 px-2 text-xs gap-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                                              title="Salin email"
                                              onClick={() => {
                                                navigator.clipboard.writeText(user.email);
                                                toast({ title: 'Email Disalin', description: user.email });
                                              }}
                                            >
                                              <Mail className="h-3.5 w-3.5" />
                                            </Button>
                                            {userProfile?.role === 'super-admin' && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                                                title="Hapus akun peserta"
                                                onClick={() => setUserToDelete(user)}
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </Button>
                                            )}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────────── */}
      <DeleteConfirmationDialog
        open={!!userToDelete}
        onOpenChange={v => !v && setUserToDelete(null)}
        onConfirm={confirmDeleteUser}
        itemName={userToDelete?.fullName}
        itemType="Akun Pengguna"
      />
      <DeleteBatchDialog
        batch={batchToDelete}
        registeredCount={batchToDelete ? (usersByBatch.get(batchToDelete.id!) || []).length : 0}
        open={!!batchToDelete}
        onOpenChange={v => !v && setBatchToDelete(null)}
        onConfirm={confirmDeleteBatch}
        onDeactivate={handleDeactivateBatchToDelete}
      />
      <AddQuotaDialog
        batch={addQuotaBatch}
        open={!!addQuotaBatch}
        onOpenChange={v => !v && setAddQuotaBatch(null)}
        onDone={mutateBatches}
      />
    </>
  );
}
