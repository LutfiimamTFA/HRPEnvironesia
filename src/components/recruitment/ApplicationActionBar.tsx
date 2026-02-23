'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ArrowRight, ThumbsDown, Check, MoreVertical, Loader2 } from 'lucide-react';
import type { JobApplication } from '@/lib/types';
import { statusDisplayLabels } from './ApplicationStatusBadge';

interface ApplicationActionBarProps {
  application: JobApplication;
  onStageChange: (newStage: JobApplication['status'], reason: string) => Promise<boolean>;
}

interface StageAction {
  stage: JobApplication['status'];
  label: string;
  icon: React.ReactNode;
  reasonRequired?: boolean;
  variant?: 'default' | 'destructive';
}

export function ApplicationActionBar({ application, onStageChange }: ApplicationActionBarProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<StageAction | null>(null);
  const [reason, setReason] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleActionClick = (action: StageAction) => {
    setSelectedAction(action);
    setReason('');
    // For actions that need a reason, always open the dialog.
    // For actions that don't, we can consider confirming directly or still use a simpler dialog.
    // For consistency, we'll use the dialog for all state changes that need confirmation.
    setDialogOpen(true);
  };

  const handleConfirm = async () => {
    if (!selectedAction) return;
    setIsUpdating(true);
    const success = await onStageChange(selectedAction.stage, reason);
    if (success) {
      setDialogOpen(false);
      setSelectedAction(null);
    }
    setIsUpdating(false);
  };

  const nextStageMap: Partial<Record<JobApplication['status'], JobApplication['status']>> = {
    submitted: 'screening',
    screening: 'tes_kepribadian',
    tes_kepribadian: 'document_submission',
    document_submission: 'verification',
    verification: 'interview',
    interview: 'hired',
  };

  const primaryAction: StageAction | null = nextStageMap[application.status]
    ? {
        stage: nextStageMap[application.status]!,
        label: `Pindah ke ${statusDisplayLabels[nextStageMap[application.status]!]}`,
        icon: <ArrowRight className="mr-2 h-4 w-4" />,
        reasonRequired: false,
      }
    : application.status !== 'hired' && application.status !== 'rejected' 
    ? {
        stage: 'hired',
        label: 'Terima Kandidat',
        icon: <Check className="mr-2 h-4 w-4" />,
        reasonRequired: true,
        variant: 'default',
    }
    : null;

  const secondaryActions: StageAction[] = [
    {
      stage: 'rejected',
      label: 'Tolak Kandidat',
      icon: <ThumbsDown className="mr-2 h-4 w-4" />,
      reasonRequired: true,
      variant: 'destructive',
    },
    // Future actions like 'On Hold' can be added here
  ];
  
  if (application.status === 'hired' || application.status === 'rejected') {
      return null; // No actions for completed applications
  }

  return (
    <div className="flex items-center gap-2">
      {primaryAction && (
        <Button onClick={() => handleActionClick(primaryAction)} disabled={isUpdating} className={primaryAction.stage === 'hired' ? 'bg-green-600 hover:bg-green-700' : ''}>
          {primaryAction.icon}
          {primaryAction.label}
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon">
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Tindakan Lainnya</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {secondaryActions.map((action) => (
            <DropdownMenuItem
              key={action.stage}
              onClick={() => handleActionClick(action)}
              className={action.variant === 'destructive' ? 'text-destructive focus:text-destructive' : ''}
            >
              {action.icon}
              <span>{action.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi: {selectedAction?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedAction?.reasonRequired
                ? 'Harap berikan alasan atau catatan singkat untuk perubahan status ini. Catatan ini akan disimpan di riwayat lamaran.'
                : `Anda akan memindahkan kandidat ke tahap "${selectedAction?.label}". Lanjutkan?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedAction?.reasonRequired && (
            <div className="grid w-full gap-1.5 pt-2">
                <Label htmlFor="reason" className={selectedAction.stage === 'rejected' ? 'font-bold' : ''}>
                  Alasan {selectedAction.stage === 'rejected' ? '(Wajib)' : '(Opsional)'}
                </Label>
                <Textarea placeholder="Contoh: Kandidat tidak memenuhi kualifikasi teknis..." id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isUpdating || (selectedAction?.stage === 'rejected' && !reason.trim())}>
              {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Konfirmasi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}