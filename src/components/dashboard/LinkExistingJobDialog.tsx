'use client';

import { useMemo, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useHrdScopedCollection } from '@/hooks/useHrdScopedCollection';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Briefcase } from 'lucide-react';
import type { Job, RecruitmentBatch } from '@/lib/types';
import { resolveEffectiveStatus, StatusPill } from './JobManagementClient';

interface LinkExistingJobDialogProps {
  batch: RecruitmentBatch;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}

/**
 * Pure relation update — never creates or duplicates a job posting doc.
 * Only jobs that already belong to the batch's brand and aren't linked to
 * any batch yet are selectable, so this can never pull in another brand's
 * (or another batch's) lowongan.
 */
export function LinkExistingJobDialog({ batch, open, onOpenChange, onLinked }: LinkExistingJobDialogProps) {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const { data: jobs, isLoading } = useHrdScopedCollection<Job>('jobs');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const candidateJobs = useMemo(() => {
    return (jobs || []).filter(j =>
      j.brandId === batch.brandId &&
      !j.batchId &&
      j.publishStatus !== 'archived' &&
      j.publishStatus !== 'deleted'
    );
  }, [jobs, batch.brandId]);

  const toggle = (jobId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  };

  const handleClose = (v: boolean) => {
    if (!v) setSelectedIds(new Set());
    onOpenChange(v);
  };

  const handleConfirm = async () => {
    if (!userProfile || selectedIds.size === 0) return;
    setIsSaving(true);
    try {
      const fsBatch = writeBatch(firestore);
      selectedIds.forEach(jobId => {
        fsBatch.update(doc(firestore, 'jobs', jobId), {
          batchId: batch.id,
          batchName: batch.batchName,
          batchCode: batch.batchCode,
          batchType: batch.batchType,
          batchTypeLabel: batch.batchTypeLabel || 'Magang',
          batchRegistrationStartDate: batch.registrationStartDate,
          batchRegistrationEndDate: batch.registrationEndDate,
          updatedAt: serverTimestamp(),
          updatedBy: userProfile.uid,
        });
      });
      await fsBatch.commit();
      toast({ title: 'Lowongan Terhubung', description: `${selectedIds.size} lowongan dihubungkan ke ${batch.batchName}.` });
      setSelectedIds(new Set());
      onLinked();
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal menghubungkan lowongan.', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col rounded-2xl">
        <DialogHeader className="flex-none">
          <DialogTitle className="text-xl font-semibold">Hubungkan Lowongan Existing</DialogTitle>
          <DialogDescription className="text-sm">
            Pilih lowongan brand <strong>{batch.brandName}</strong> yang belum terhubung ke batch manapun.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-2">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Memuat lowongan...
            </div>
          ) : candidateJobs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Briefcase className="h-4.5 w-4.5 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tidak ada lowongan yang bisa dihubungkan.</p>
              <p className="text-xs text-slate-500 max-w-xs">Semua lowongan brand ini sudah punya batch, atau belum ada lowongan sama sekali.</p>
            </div>
          ) : candidateJobs.map(job => (
            <label
              key={job.id}
              className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50"
            >
              <Checkbox
                checked={selectedIds.has(job.id!)}
                onCheckedChange={() => toggle(job.id!)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{job.position}</p>
                  <StatusPill status={resolveEffectiveStatus(job)} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {job.brandName}{job.divisionName ? ` · ${job.divisionName}` : ''}
                </p>
              </div>
            </label>
          ))}
        </div>

        <DialogFooter className="flex-none border-t border-slate-200 dark:border-slate-800 pt-4 gap-2">
          <Button type="button" variant="ghost" onClick={() => handleClose(false)} disabled={isSaving} className="font-semibold text-sm">
            Batal
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isSaving || selectedIds.size === 0} className="font-semibold text-sm">
            {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Menghubungkan...</> : `Hubungkan (${selectedIds.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
