'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useHrdScopedBrands, useHrdScopedCollection } from '@/hooks/useHrdScopedCollection';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  PlusCircle, Search, Eye, Pencil, Layers, CalendarCheck2, Users, FolderOpen,
} from 'lucide-react';
import type { RecruitmentBatch, RecruitmentBatchStatus, Job, JobApplication } from '@/lib/types';
import { RECRUITMENT_BATCH_STATUS_LABELS, RECRUITMENT_BATCH_STATUSES } from '@/lib/types';
import { getBatchStatusBadgeClass, normalizeBatchStatus, BATCH_STATUS_ACTIONS, type BatchStatusActionKey } from '@/lib/recruitment-batch';
import { MonthYearPicker } from '@/components/ui/MonthYearPicker';
import { matchesPeriod } from '@/lib/period';
import { RecruitmentBatchFormDialog } from './RecruitmentBatchFormDialog';
import { RecruitmentBatchStatusActionDialog } from './RecruitmentBatchStatusActionDialog';

function SummaryCard({ label, value, icon, tone }: { label: string; value: number | string; icon: React.ReactNode; tone: string; title?: string }) {
  return (
    <Card className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <CardContent className="p-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">{value}</p>
        </div>
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

export function RecruitmentBatchClient() {
  const router = useRouter();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { data: brands, isLoading: isLoadingBrands } = useHrdScopedBrands();
  const {
    data: batches, isLoading: isLoadingBatches, mutate: mutateBatches,
    isScopeLoading, isScopeConfigured, emptyStateMessage,
  } = useHrdScopedCollection<RecruitmentBatch>('recruitment_batches');
  // Linked-job / candidate counts are always derived client-side from the
  // already brand-scoped jobs+applications collections — never a stored
  // counter on the batch doc, so they can never drift out of sync (same
  // convention as JobManagementClient.tsx's own appCountsByJob).
  const { data: jobs } = useHrdScopedCollection<Job>('jobs');
  const { data: applications } = useHrdScopedCollection<JobApplication>('applications');

  const [search, setSearch] = useState('');
  const [filterBrandId, setFilterBrandId] = useState('all');
  const [filterDivisionId, setFilterDivisionId] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | RecruitmentBatchStatus>('all');
  const [filterPeriod, setFilterPeriod] = useState('all');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<RecruitmentBatch | null>(null);
  const [actionState, setActionState] = useState<{ batch: RecruitmentBatch; action: BatchStatusActionKey } | null>(null);

  const allBatches = useMemo(() => {
    if (!batches) return [];
    return [...batches].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  }, [batches]);

  // Divisi filter options MUST come from master data (brands/{brandId}/
  // divisions), never from recruitment_batches — deriving them from batches
  // meant a brand with zero batches so far (or batches saved without a
  // division picked) showed no divisions at all, even though the brand's
  // master data has plenty. Divisions aren't a flat collection in this
  // schema (no division.brandId field) — the brand relationship is the
  // subcollection path itself, so each allowed brand's divisions are fetched
  // one-shot here (not realtime — division master data changes rarely, and
  // this avoids N live listeners for N brands). `brands` is already
  // HRD-scoped via useHrdScopedBrands(), so this can never reach outside the
  // HRD's allowedBrandIds / Super Admin sees every brand.
  const [divisionsByBrand, setDivisionsByBrand] = useState<Map<string, { id: string; name: string }[]>>(new Map());
  useEffect(() => {
    if (!brands || brands.length === 0) { setDivisionsByBrand(new Map()); return; }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(brands.map(async (b) => {
        const snap = await getDocs(query(collection(firestore, 'brands', b.id!, 'divisions'), where('isActive', '==', true)));
        return [b.id!, snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name || d.id }))] as const;
      }));
      if (!cancelled) setDivisionsByBrand(new Map(entries));
    })();
    return () => { cancelled = true; };
  }, [brands, firestore]);

  // "Semua Brand" -> every division across every allowed brand, labeled
  // "Nama — Brand" so same-named divisions in different brands aren't
  // ambiguous. A specific brand -> just that brand's divisions, plain names.
  const divisionOptions = useMemo(() => {
    if (filterBrandId === 'all') {
      const opts: { id: string; label: string }[] = [];
      divisionsByBrand.forEach((divs, brandId) => {
        const brandName = brands?.find(b => b.id === brandId)?.name || '';
        divs.forEach(d => opts.push({ id: d.id, label: brandName ? `${d.name} — ${brandName}` : d.name }));
      });
      return opts.sort((a, b) => a.label.localeCompare(b.label));
    }
    return (divisionsByBrand.get(filterBrandId) || [])
      .map(d => ({ id: d.id, label: d.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [divisionsByBrand, filterBrandId, brands]);

  const isDivisionOptionsEmpty = filterBrandId !== 'all' && divisionsByBrand.has(filterBrandId) && divisionOptions.length === 0;

  // Temporary debug — safe to remove once the brand/divisi filter bug is
  // confirmed fixed in production.
  useEffect(() => {
    console.log('[BATCH_FILTER_DEBUG]', {
      filterBrandId,
      filterDivisionId,
      brandOptionsLength: (brands || []).length,
      allDivisionsLength: Array.from(divisionsByBrand.values()).reduce((sum, arr) => sum + arr.length, 0),
      filteredDivisionOptionsLength: divisionOptions.length,
      filteredDivisionOptions: divisionOptions,
    });
  }, [filterBrandId, filterDivisionId, brands, divisionsByBrand, divisionOptions]);

  // batchId -> { jobCount, totalApplicants, totalAccepted, totalOnboarded },
  // built once from the scoped jobs/applications collections rather than N
  // per-batch queries.
  const statsByBatch = useMemo(() => {
    const jobCountByBatch = new Map<string, number>();
    const jobIdsByBatch = new Map<string, Set<string>>();
    (jobs || []).forEach(j => {
      if (!j.batchId) return;
      jobCountByBatch.set(j.batchId, (jobCountByBatch.get(j.batchId) || 0) + 1);
      if (!jobIdsByBatch.has(j.batchId)) jobIdsByBatch.set(j.batchId, new Set());
      jobIdsByBatch.get(j.batchId)!.add(j.id!);
    });

    const stats = new Map<string, { jobCount: number; totalApplicants: number; totalAccepted: number; totalOnboarded: number }>();
    jobIdsByBatch.forEach((jobIds, batchId) => {
      let totalApplicants = 0, totalAccepted = 0, totalOnboarded = 0;
      (applications || []).forEach(a => {
        if (!a.jobId || !jobIds.has(a.jobId)) return;
        totalApplicants += 1;
        if (a.status === 'hired') { totalAccepted += 1; totalOnboarded += 1; }
      });
      stats.set(batchId, { jobCount: jobCountByBatch.get(batchId) || 0, totalApplicants, totalAccepted, totalOnboarded });
    });
    return stats;
  }, [jobs, applications]);

  const getBatchStats = (batchId?: string) =>
    (batchId && statsByBatch.get(batchId)) || { jobCount: 0, totalApplicants: 0, totalAccepted: 0, totalOnboarded: 0 };

  const filteredBatches = useMemo(() => {
    return allBatches.filter(b => {
      if (search) {
        const q = search.toLowerCase();
        const haystack = [
          b.batchName, b.batchCode, b.brandName,
          b.batchNumber != null ? `gelombang ${b.batchNumber}` : '',
          ...(b.divisionNames || []),
          RECRUITMENT_BATCH_STATUS_LABELS[normalizeBatchStatus(b.status)],
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Matched by ID, never by name — a name-based match is fragile to
      // capitalization/typos/stale snapshots the moment a division gets
      // renamed after a batch already references it.
      if (filterBrandId !== 'all' && b.brandId !== filterBrandId) return false;
      if (filterDivisionId !== 'all' && !(b.divisionIds || []).includes(filterDivisionId)) return false;
      // Compared against the normalized status — a legacy "draft" batch
      // must match the "Dibuka" filter, since it displays/behaves as open.
      if (filterStatus !== 'all' && normalizeBatchStatus(b.status) !== filterStatus) return false;
      if (filterPeriod !== 'all' && !matchesPeriod(b.registrationStartDate.toDate(), filterPeriod)) return false;
      return true;
    });
  }, [allBatches, search, filterBrandId, filterDivisionId, filterStatus, filterPeriod]);

  const summary = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const batchJobIds = new Set((jobs || []).filter(j => j.batchId).map(j => j.id!));
    const activeCandidates = (applications || []).filter(a =>
      a.jobId && batchJobIds.has(a.jobId) && a.status !== 'rejected'
    ).length;
    return {
      open: allBatches.filter(b => normalizeBatchStatus(b.status) === 'open').length,
      selection: allBatches.filter(b => b.status === 'selection').length,
      completedThisMonth: allBatches.filter(b => {
        if (b.status !== 'completed') return false;
        const d = b.updatedAt?.toDate?.();
        return d && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      }).length,
      activeCandidates,
    };
  }, [allBatches, jobs, applications]);

  const hasActiveFilters = Boolean(search || filterBrandId !== 'all' || filterDivisionId !== 'all' || filterStatus !== 'all' || filterPeriod !== 'all');
  const resetFilters = () => {
    setSearch(''); setFilterBrandId('all'); setFilterDivisionId('all');
    setFilterStatus('all'); setFilterPeriod('all');
  };

  // Reset Divisi whenever Brand changes, so a division from the previous
  // brand can never stay silently selected against the new brand.
  const handleBrandFilterChange = (brandId: string) => {
    setFilterBrandId(brandId);
    setFilterDivisionId('all');
  };

  const openCreate = () => { setEditingBatch(null); setIsFormOpen(true); };
  const openEdit = (batch: RecruitmentBatch) => { setEditingBatch(batch); setIsFormOpen(true); };

  const isLoading = isScopeLoading || isLoadingBrands || isLoadingBatches;

  if (isLoading) {
    return (
      <div className="w-full min-w-0 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (!isScopeConfigured) {
    return (
      <Card className="border-dashed border-2 border-slate-200 dark:border-slate-700 shadow-none rounded-2xl">
        <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
          <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <Layers className="h-5 w-5 text-slate-400" />
          </div>
          <p className="font-medium text-slate-700 dark:text-slate-300">{emptyStateMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Batch Magang</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Kelola gelombang pendaftaran magang dan hubungkan dengan lowongan magang.
          </p>
        </div>
        <Button onClick={openCreate} className="rounded-xl font-semibold text-sm gap-2">
          <PlusCircle className="h-4 w-4" /> Buat Batch Magang
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Batch Dibuka" value={summary.open} icon={<CalendarCheck2 className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />} tone="bg-emerald-50 dark:bg-emerald-950/40" />
        <SummaryCard label="Dalam Seleksi" value={summary.selection} icon={<Search className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />} tone="bg-amber-50 dark:bg-amber-950/40" />
        <SummaryCard label="Selesai Bulan Ini" value={summary.completedThisMonth} icon={<FolderOpen className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" />} tone="bg-violet-50 dark:bg-violet-950/40" />
        <SummaryCard label="Total Kandidat Aktif" value={summary.activeCandidates} icon={<Users className="h-4.5 w-4.5 text-slate-500 dark:text-slate-400" />} tone="bg-slate-100 dark:bg-slate-800" />
      </div>

      {/* Filter toolbar — always visible */}
      <Card className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cari Batch</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Nama, kode, brand, divisi..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl text-sm font-semibold h-10" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Brand</label>
              <select value={filterBrandId} onChange={e => handleBrandFilterChange(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white">
                <option value="all">Semua Brand</option>
                {brands?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Divisi</label>
              <select value={filterDivisionId} onChange={e => setFilterDivisionId(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white">
                <option value="all">Semua Divisi</option>
                {isDivisionOptionsEmpty && <option value="" disabled>Belum ada divisi untuk brand ini</option>}
                {divisionOptions.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status Batch</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="w-full h-10 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white">
                <option value="all">Semua Status</option>
                {/* "draft" is excluded — it's a legacy value only, never
                    offered as a filterable/settable status anymore. */}
                {RECRUITMENT_BATCH_STATUSES.filter(s => s !== 'draft').map(s => <option key={s} value={s}>{RECRUITMENT_BATCH_STATUS_LABELS[s]}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Periode</label>
              <MonthYearPicker value={filterPeriod} onChange={setFilterPeriod} />
            </div>

            <div className="space-y-1.5 flex flex-col justify-end">
              <Button variant="outline" onClick={resetFilters} disabled={!hasActiveFilters} className="w-full h-10 rounded-xl font-semibold text-sm border-slate-300 dark:border-slate-700 disabled:opacity-50">
                Reset Filter
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table className="w-full min-w-[1320px]">
              <TableHeader className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10">
                <TableRow className="border-b border-slate-200 dark:border-slate-800">
                  <TableHead className="pl-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Batch</TableHead>
                  <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Brand / Divisi</TableHead>
                  <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Periode Pendaftaran</TableHead>
                  <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Kuota</TableHead>
                  <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Lowongan Terhubung</TableHead>
                  <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Kandidat</TableHead>
                  <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</TableHead>
                  <TableHead className="text-right pr-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBatches.length > 0 ? filteredBatches.map(b => {
                  const normalizedStatus = normalizeBatchStatus(b.status);
                  const primaryAction = BATCH_STATUS_ACTIONS[normalizedStatus]?.[0];
                  const stats = getBatchStats(b.id);
                  return (
                    <TableRow
                      key={b.id}
                      onClick={() => router.push(`/admin/hrd/recruitment-batches/${b.id}`)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors border-b border-slate-100 dark:border-slate-800/80 cursor-pointer"
                    >
                      <TableCell className="pl-6 py-4">
                        <span className="text-slate-900 dark:text-white font-bold text-base block">{b.batchName}</span>
                        <span className="text-sm font-semibold text-slate-500 block">
                          {b.batchCode}
                          {b.batchNumber != null && <span className="text-slate-400 font-medium"> &middot; Gelombang {b.batchNumber}</span>}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-sm">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">{b.brandName}</span>
                          <span className="text-xs text-slate-400 font-medium">{(b.divisionNames || []).join(', ') || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300 font-medium">
                        {format(b.registrationStartDate.toDate(), 'dd MMM yyyy', { locale: idLocale })} - {format(b.registrationEndDate.toDate(), 'dd MMM yyyy', { locale: idLocale })}
                      </TableCell>
                      <TableCell className="py-4 font-bold text-slate-800 dark:text-slate-100 text-base">
                        {stats.totalAccepted} / {b.quota}
                      </TableCell>
                      <TableCell className="py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">
                        {stats.jobCount} lowongan
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                        {stats.totalApplicants} pelamar &middot; {stats.totalAccepted} diterima &middot; {stats.totalOnboarded} onboarding
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant="outline" className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getBatchStatusBadgeClass(b.status)}`}>
                          {RECRUITMENT_BATCH_STATUS_LABELS[normalizedStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="ghost" size="sm" className="rounded-xl gap-1 text-xs font-semibold" onClick={() => router.push(`/admin/hrd/recruitment-batches/${b.id}`)}>
                            <Eye className="h-3.5 w-3.5" /> Detail
                          </Button>
                          {(normalizedStatus === 'open' || normalizedStatus === 'selection') && (
                            <Button variant="ghost" size="sm" className="rounded-xl gap-1 text-xs font-semibold" onClick={() => openEdit(b)}>
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </Button>
                          )}
                          {primaryAction && (
                            <Button
                              size="sm"
                              className={`rounded-xl text-xs font-semibold ${primaryAction.tone === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                              onClick={() => setActionState({ batch: b, action: primaryAction.action })}
                            >
                              {primaryAction.label}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8}>
                      <div className="flex flex-col items-center justify-center gap-3 text-center px-4 h-56">
                        <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${hasActiveFilters ? 'bg-slate-100 dark:bg-slate-900' : 'bg-indigo-50 dark:bg-indigo-950/20'}`}>
                          {hasActiveFilters ? <Search className="h-6 w-6 text-slate-400 dark:text-slate-600" /> : <Layers className="h-6 w-6 text-indigo-500" />}
                        </div>
                        {hasActiveFilters ? (
                          <>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Tidak ada batch yang cocok dengan filter.</p>
                            <p className="text-xs text-slate-500 dark:text-slate-500 max-w-xs">Coba ubah kata kunci atau filter yang dipilih.</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Belum ada batch magang.</p>
                            <p className="text-xs text-slate-500 dark:text-slate-500 max-w-xs">Buat batch pertama untuk mengelola gelombang pendaftaran magang.</p>
                            <Button onClick={openCreate} className="rounded-xl font-semibold text-sm gap-2 mt-1">
                              <PlusCircle className="h-4 w-4" /> Buat Batch Magang
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <RecruitmentBatchFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        batch={editingBatch}
        onSaved={mutateBatches}
      />
      <RecruitmentBatchStatusActionDialog
        batch={actionState?.batch || null}
        action={actionState?.action || null}
        open={!!actionState}
        onOpenChange={(v) => !v && setActionState(null)}
        onDone={mutateBatches}
      />
    </div>
  );
}
