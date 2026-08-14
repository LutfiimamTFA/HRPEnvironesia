'use client';

import { useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { RecruitmentBatch } from '@/lib/types';
import { BATCH_STATUS_ACTIONS, normalizeBatchStatus, type BatchStatusActionKey } from '@/lib/recruitment-batch';

interface RecruitmentBatchStatusActionDialogProps {
  batch: RecruitmentBatch | null;
  action: BatchStatusActionKey | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

/**
 * Shared 2-step confirm dialog for every batch status transition (Tutup
 * Pendaftaran / Selesaikan Batch / Tutup Batch / Batalkan) — Batch Magang
 * has no Draft/Publish step, so "open" is simply the status a new batch
 * always starts at. Used by both the list page and the detail page so the
 * two surfaces can never expose a transition the other doesn't know about —
 * both read from the same BATCH_STATUS_ACTIONS table in
 * src/lib/recruitment-batch.ts.
 */
export function RecruitmentBatchStatusActionDialog({
  batch, action, open, onOpenChange, onDone,
}: RecruitmentBatchStatusActionDialogProps) {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  if (!batch || !action) return null;
  const config = BATCH_STATUS_ACTIONS[normalizeBatchStatus(batch.status)].find(a => a.action === action);
  if (!config) return null;

  const handleConfirm = async () => {
    if (!userProfile) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(firestore, 'recruitment_batches', batch.id!), {
        status: config.toStatus,
        updatedAt: serverTimestamp(),
        updatedByUid: userProfile.uid,
        updatedByName: userProfile.fullName,
      });
      toast({ title: 'Status Batch Diperbarui', description: `${batch.batchName} sekarang "${config.confirmLabel.replace('Ya, ', '')}"` });
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal memperbarui status batch.', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{config.confirmTitle}</DialogTitle>
          <DialogDescription className="text-sm">
            Tindakan ini akan mengubah status batch. Lanjutkan?
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 text-sm space-y-0.5">
          <p className="font-semibold text-slate-900 dark:text-white">{batch.batchName}</p>
          <p className="text-slate-500 dark:text-slate-400">{batch.batchCode} &middot; {batch.brandName}</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving} className="font-semibold text-sm">
            Batal
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSaving}
            className={`font-semibold text-sm ${config.tone === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
          >
            {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memproses...</> : config.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
