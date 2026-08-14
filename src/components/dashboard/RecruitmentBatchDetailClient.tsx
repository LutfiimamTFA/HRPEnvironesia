'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { useHrdScopedBrands, useHrdScopedCollection } from '@/hooks/useHrdScopedCollection';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Pencil, Briefcase, Users, AlertTriangle, PlusCircle, Link2, Eye, Unlink, Loader2 } from 'lucide-react';
import type { RecruitmentBatch, Job, JobApplication } from '@/lib/types';
import { RECRUITMENT_BATCH_STATUS_LABELS } from '@/lib/types';
import { getBatchStatusBadgeClass, normalizeBatchStatus, BATCH_STATUS_ACTIONS, type BatchStatusActionKey } from '@/lib/recruitment-batch';
import { resolveEffectiveStatus, StatusPill } from './JobManagementClient';
import { RecruitmentBatchFormDialog } from './RecruitmentBatchFormDialog';
import { RecruitmentBatchStatusActionDialog } from './RecruitmentBatchStatusActionDialog';
import { JobFormDialog } from './JobFormDialog';
import { LinkExistingJobDialog } from './LinkExistingJobDialog';

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
      <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

export function RecruitmentBatchDetailClient({ batch }: { batch: RecruitmentBatch }) {
  const router = useRouter();
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const { data: brands } = useHrdScopedBrands();
  const { data: jobs, mutate: mutateJobs } = useHrdScopedCollection<Job>('jobs');
  const { data: applications } = useHrdScopedCollection<JobApplication>('applications');

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [actionKey, setActionKey] = useState<BatchStatusActionKey | null>(null);
  const [isCreateJobOpen, setIsCreateJobOpen] = useState(false);
  const [isLinkExistingOpen, setIsLinkExistingOpen] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<Job | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const normalizedStatus = normalizeBatchStatus(batch.status);
  const actions = BATCH_STATUS_ACTIONS[normalizedStatus] || [];
  const canEdit = normalizedStatus === 'open' || normalizedStatus === 'selection';

  // Job.batchId is the single source of truth relation — never a stored
  // array on the batch doc, so this can never drift out of sync.
  const linkedJobs = useMemo(() => (jobs || []).filter(j => j.batchId === batch.id), [jobs, batch.id]);

  const { appCountsByJob, batchStats } = useMemo(() => {
    const linkedJobIds = new Set(linkedJobs.map(j => j.id!));
    const counts = new Map<string, { total: number; hired: number }>();
    let totalApplicants = 0, totalShortlisted = 0, totalInterview = 0, totalAccepted = 0, totalRejected = 0;

    (applications || []).forEach(a => {
      if (!a.jobId || !linkedJobIds.has(a.jobId)) return;
      const prev = counts.get(a.jobId) || { total: 0, hired: 0 };
      prev.total += 1;
      totalApplicants += 1;
      if (a.status === 'hired') { prev.hired += 1; totalAccepted += 1; }
      else if (a.status === 'rejected') totalRejected += 1;
      else if (a.status === 'interview') totalInterview += 1;
      else if (['screening', 'verification', 'tes_kepribadian', 'document_submission'].includes(a.status)) totalShortlisted += 1;
      counts.set(a.jobId, prev);
    });

    return {
      appCountsByJob: counts,
      batchStats: { totalApplicants, totalShortlisted, totalInterview, totalAccepted, totalRejected, totalOnboarded: totalAccepted },
    };
  }, [linkedJobs, applications]);

  const totalJobQuota = useMemo(() => linkedJobs.reduce((s, j) => s + (j.numberOfOpenings || 0), 0), [linkedJobs]);
  const quotaExceeded = totalJobQuota > batch.quota;

  const handleUnlink = async () => {
    if (!unlinkTarget || !userProfile) return;
    setIsUnlinking(true);
    try {
      await updateDoc(doc(firestore, 'jobs', unlinkTarget.id!), {
        batchId: null, batchName: null, batchCode: null, batchType: null, batchTypeLabel: null,
        batchRegistrationStartDate: null, batchRegistrationEndDate: null,
        updatedAt: serverTimestamp(), updatedBy: userProfile.uid,
      });
      toast({ title: 'Lowongan Dilepas dari Batch', description: unlinkTarget.position });
      setUnlinkTarget(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal melepas lowongan.', description: e.message });
    } finally {
      setIsUnlinking(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-6">

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="gap-1.5 text-sm font-semibold -ml-2 mb-1" onClick={() => router.push('/admin/hrd/recruitment-batches')}>
            <ArrowLeft className="h-4 w-4" /> Kembali ke Daftar Batch
          </Button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{batch.batchName}</h1>
            <Badge variant="outline" className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getBatchStatusBadgeClass(batch.status)}`}>
              {RECRUITMENT_BATCH_STATUS_LABELS[normalizedStatus]}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {batch.batchCode}
            {batch.batchNumber != null && <> &middot; Gelombang {batch.batchNumber}</>}
            {' '}&middot; {batch.brandName}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <Button variant="outline" className="rounded-xl font-semibold text-sm gap-1.5" onClick={() => setIsEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          {actions.map(a => (
            <Button
              key={a.action}
              className={`rounded-xl font-semibold text-sm ${a.tone === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
              onClick={() => setActionKey(a.action)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      {quotaExceeded && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Total kuota lowongan ({totalJobQuota}) melebihi kuota batch ({batch.quota}).
          </p>
        </div>
      )}

      {/* A. Ringkasan Batch */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">A. Ringkasan Batch</p>
        <Card className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Brand</p>
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100 mt-0.5">{batch.brandName}</p>
            </div>
            <div>
              <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Divisi</p>
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100 mt-0.5">{(batch.divisionNames || []).join(', ') || 'Semua divisi'}</p>
            </div>
            <div>
              <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Kuota</p>
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100 mt-0.5">{batchStats.totalAccepted} / {batch.quota} peserta</p>
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Periode Pendaftaran</p>
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100 mt-0.5">
                {format(batch.registrationStartDate.toDate(), 'dd MMM yyyy', { locale: idLocale })} - {format(batch.registrationEndDate.toDate(), 'dd MMM yyyy', { locale: idLocale })}
              </p>
            </div>
            {batch.description && (
              <div className="md:col-span-2 lg:col-span-3">
                <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Deskripsi</p>
                <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 mt-1">{batch.description}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* B. Lowongan Magang Terhubung */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">B. Lowongan Magang Terhubung</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs font-semibold" onClick={() => setIsLinkExistingOpen(true)}>
              <Link2 className="h-3.5 w-3.5" /> Hubungkan Lowongan Existing
            </Button>
            <Button size="sm" className="rounded-xl gap-1.5 text-xs font-semibold" onClick={() => setIsCreateJobOpen(true)}>
              <PlusCircle className="h-3.5 w-3.5" /> Buat Job Posting untuk Batch Ini
            </Button>
          </div>
        </div>
        <Card className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {linkedJobs.length === 0 ? (
              <div className="p-8 flex flex-col items-center gap-2 text-center">
                <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Briefcase className="h-5 w-5 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Belum ada lowongan magang yang terhubung ke batch ini.</p>
                <p className="text-xs text-slate-500 max-w-sm">Buat lowongan baru untuk batch ini, atau hubungkan lowongan yang sudah ada.</p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table className="w-full min-w-[1000px]">
                  <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                    <TableRow className="border-b border-slate-200 dark:border-slate-800">
                      <TableHead className="pl-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Posisi</TableHead>
                      <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Brand / Divisi</TableHead>
                      <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Deadline</TableHead>
                      <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status Lowongan</TableHead>
                      <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Pelamar</TableHead>
                      <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Diterima</TableHead>
                      <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Kuota</TableHead>
                      <TableHead className="text-right pr-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedJobs.map(job => {
                      const counts = appCountsByJob.get(job.id!) || { total: 0, hired: 0 };
                      const deadline = job.applyDeadline || job.applicationDeadline;
                      return (
                        <TableRow key={job.id} className="border-b border-slate-100 dark:border-slate-800/80">
                          <TableCell className="pl-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">{job.position}</TableCell>
                          <TableCell className="py-4 text-sm">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">{job.brandName}</span>
                            <span className="block text-xs text-slate-400">{job.divisionName || '-'}</span>
                          </TableCell>
                          <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                            {deadline ? format(deadline.toDate(), 'dd MMM yyyy', { locale: idLocale }) : '-'}
                          </TableCell>
                          <TableCell className="py-4"><StatusPill status={resolveEffectiveStatus(job)} /></TableCell>
                          <TableCell className="py-4 text-sm font-semibold text-slate-800 dark:text-slate-100">{counts.total}</TableCell>
                          <TableCell className="py-4 text-sm font-semibold text-slate-800 dark:text-slate-100">{counts.hired}</TableCell>
                          <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">{job.numberOfOpenings || '-'}</TableCell>
                          <TableCell className="text-right pr-6 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <Button asChild variant="ghost" size="sm" className="rounded-xl gap-1 text-xs font-semibold">
                                <Link href={`/admin/recruitment/jobs/${job.id}`}><Eye className="h-3.5 w-3.5" /> Lihat</Link>
                              </Button>
                              <Button asChild variant="ghost" size="sm" className="rounded-xl gap-1 text-xs font-semibold">
                                <Link href={`/admin/recruitment/jobs/${job.id}`}><Users className="h-3.5 w-3.5" /> Pelamar</Link>
                              </Button>
                              <Button variant="ghost" size="sm" className="rounded-xl gap-1 text-xs font-semibold text-red-600 hover:text-red-700" onClick={() => setUnlinkTarget(job)}>
                                <Unlink className="h-3.5 w-3.5" /> Lepas
                              </Button>
                            </div>
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
      </div>

      {/* C. Statistik Batch */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">C. Statistik Batch</p>
        <Card className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatTile label="Pelamar" value={batchStats.totalApplicants} />
              <StatTile label="Shortlisted" value={batchStats.totalShortlisted} />
              <StatTile label="Interview" value={batchStats.totalInterview} />
              <StatTile label="Diterima" value={batchStats.totalAccepted} />
              <StatTile label="Ditolak" value={batchStats.totalRejected} />
              <StatTile label="Onboarded" value={batchStats.totalOnboarded} />
            </div>
          </CardContent>
        </Card>
      </div>

      <RecruitmentBatchFormDialog open={isEditOpen} onOpenChange={setIsEditOpen} batch={batch} onSaved={() => {}} />
      <RecruitmentBatchStatusActionDialog
        batch={batch}
        action={actionKey}
        open={!!actionKey}
        onOpenChange={(v) => !v && setActionKey(null)}
        onDone={() => {}}
      />
      <JobFormDialog
        open={isCreateJobOpen}
        onOpenChange={setIsCreateJobOpen}
        job={null}
        brands={brands || []}
        batches={[batch]}
        presetBatch={batch}
      />
      <LinkExistingJobDialog
        batch={batch}
        open={isLinkExistingOpen}
        onOpenChange={setIsLinkExistingOpen}
        onLinked={mutateJobs}
      />

      {/* Lepas dari Batch confirm */}
      <Dialog open={!!unlinkTarget} onOpenChange={(v) => !v && setUnlinkTarget(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Lepas Lowongan dari Batch?</DialogTitle>
            <DialogDescription className="text-sm">
              "{unlinkTarget?.position}" tidak akan lagi terhubung ke batch ini. Lowongan dan datanya tetap ada, hanya relasinya yang dilepas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setUnlinkTarget(null)} disabled={isUnlinking} className="font-semibold text-sm">Batal</Button>
            <Button onClick={handleUnlink} disabled={isUnlinking} className="bg-red-600 hover:bg-red-700 text-white font-semibold text-sm">
              {isUnlinking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Melepas...</> : 'Ya, Lepas dari Batch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
