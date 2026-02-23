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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ThumbsDown, MoreVertical, Loader2, ChevronDown } from 'lucide-react';
import type { JobApplication } from '@/lib/types';
import { APPLICATION_STAGES, statusDisplayLabels } from './ApplicationStatusBadge';
import { cn } from '@/lib/utils';

interface ApplicationActionBarProps {
  application: JobApplication;
  onStageChange: (newStage: JobApplication['status'], reason: string) => Promise<boolean>;
}

interface StageAction {
  stage: JobApplication['status'];
  label: string;
  icon?: React.ReactNode;
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

  const otherActions: StageAction[] = [
    {
      stage: 'rejected',
      label: 'Tolak Kandidat',
      icon: <ThumbsDown className="mr-2 h-4 w-4" />,
      reasonRequired: true,
      variant: 'destructive',
    },
  ];

  const currentStageIndex = APPLICATION_STAGES.indexOf(application.status);
  
  if (application.status === 'hired' || application.status === 'rejected') {
      return null;
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            Ubah Tahap
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Pindahkan kandidat ke...</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {APPLICATION_STAGES.filter(s => s !== 'draft').map((stage, index) => {
            const isCurrent = application.status === stage;
            const isNext = index === currentStageIndex + 1;
            return (
              <DropdownMenuItem 
                key={stage} 
                disabled={isCurrent}
                onSelect={() => handleActionClick({ stage, label: `Pindah ke ${statusDisplayLabels[stage]}`})}
              >
                <span className={cn(isNext && "font-bold")}>{statusDisplayLabels[stage]}</span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon">
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Tindakan Lainnya</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {otherActions.map((action) => (
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
