
'use client';

import React, { useState } from 'react';
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
import { Check, MoreVertical, Loader2, ThumbsDown } from 'lucide-react';
import type { JobApplication } from '@/lib/types';
import { statusDisplayLabels } from './ApplicationStatusBadge';
import { cn } from '@/lib/utils';

interface StageAction {
  stage: JobApplication['status'];
  label: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'destructive';
}

interface ApplicationActionBarProps {
  application: JobApplication;
  onStageChange: (newStage: JobApplication['status'], reason: string) => Promise<boolean>;
}

// Ordered list of stages for logical progression
const orderedStages: JobApplication['status'][] = [
    'submitted', 
    'screening', 
    'tes_kepribadian', 
    'document_submission', 
    'verification', 
    'interview', 
    'hired', 
];

const getStageActions = (currentStatus: JobApplication['status']) => {
    const currentIndex = orderedStages.indexOf(currentStatus);
    
    // Final states have no further actions
    if (currentStatus === 'hired' || currentStatus === 'rejected' || currentIndex === -1) {
        return { primaryAction: null, otherActions: [] };
    }

    const nextLogicalStage = orderedStages[currentIndex + 1];

    const primaryAction: StageAction | null = nextLogicalStage ? {
        stage: nextLogicalStage,
        label: `Lolos ke ${statusDisplayLabels[nextLogicalStage]}`,
        variant: 'default',
        icon: <Check className="mr-2 h-4 w-4" />,
    } : null;

    // All other stages, plus 'rejected'
    const otherActions: StageAction[] = orderedStages
        .filter(stage => stage !== currentStatus && stage !== nextLogicalStage)
        .map(stage => ({
            stage,
            label: `Pindah ke ${statusDisplayLabels[stage]}`,
            variant: 'default',
        }));
        
    otherActions.push({
        stage: 'rejected',
        label: 'Tolak Kandidat',
        variant: 'destructive',
        icon: <ThumbsDown className="mr-2 h-4 w-4" />
    });
    
    return { primaryAction, otherActions };
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

  const { primaryAction, otherActions } = getStageActions(application.status);

  if (!primaryAction && otherActions.length === 0) {
      return null;
  }

  return (
    <div className="flex items-center gap-2">
      {primaryAction && (
        <Button onClick={() => handleActionClick(primaryAction)}>
          {primaryAction.icon}
          {primaryAction.label}
        </Button>
      )}

      {otherActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Tindakan Lain</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Tindakan Lain</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {otherActions.map(action => (
                <DropdownMenuItem
                  key={action.stage}
                  onSelect={() => handleActionClick(action)}
                  className={cn(
                    "cursor-pointer",
                    action.variant === 'destructive' && "text-destructive focus:text-destructive"
                  )}
                >
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
      )}


      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi: {selectedAction?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              {`Anda akan memindahkan kandidat ini ke tahap "${statusDisplayLabels[selectedAction?.stage!]}". Lanjutkan?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid w-full gap-1.5 pt-2">
            <Label htmlFor="reason">
              Catatan {selectedAction?.stage === 'rejected' ? <span className="text-destructive">(Wajib)</span> : '(Opsional)'}
            </Label>
            <Textarea 
                placeholder={selectedAction?.stage === 'rejected' ? "Jelaskan alasan penolakan..." : "Tinggalkan catatan singkat untuk internal..."}
                id="reason" 
                value={reason} 
                onChange={(e) => setReason(e.target.value)} 
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isUpdating || (selectedAction?.stage === 'rejected' && !reason.trim())}>
              {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Konfirmasi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
