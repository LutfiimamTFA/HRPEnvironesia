'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import type { JobApplication } from '@/lib/types';
import { statusDisplayLabels } from './ApplicationStatusBadge';

interface StageChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetStage: JobApplication['status'] | null;
  onConfirm: (reason: string) => Promise<void>;
}

export function StageChangeDialog({ open, onOpenChange, targetStage, onConfirm }: StageChangeDialogProps) {
  const [reason, setReason] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  if (!targetStage) return null;

  const isRejection = targetStage === 'rejected';

  const handleConfirm = async () => {
    setIsUpdating(true);
    await onConfirm(reason);
    // Do not close dialog here, let the parent handle it based on success
    setIsUpdating(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Konfirmasi Perubahan Tahap</AlertDialogTitle>
          <AlertDialogDescription>
            Anda akan memindahkan kandidat ini ke tahap "{statusDisplayLabels[targetStage]}". Lanjutkan?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid w-full gap-1.5 pt-2">
          <Label htmlFor="reason">
            Catatan {isRejection ? <span className="text-destructive">(Wajib)</span> : '(Opsional)'}
          </Label>
          <Textarea 
            placeholder={isRejection ? "Jelaskan alasan penolakan..." : "Tinggalkan catatan singkat untuk internal..."}
            id="reason" 
            value={reason} 
            onChange={(e) => setReason(e.target.value)} 
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isUpdating || (isRejection && !reason.trim())}>
            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Konfirmasi
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
