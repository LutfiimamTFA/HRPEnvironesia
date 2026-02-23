'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup } from '@/components/ui/dropdown-menu';
import { Check, MoreVertical, Loader2, ThumbsDown } from 'lucide-react';
import type { JobApplication } from '@/lib/types';
import { APPLICATION_STATUSES, statusDisplayLabels } from './ApplicationStatusBadge';
import { cn } from '@/lib/utils';
import { StageChangeDialog } from './StageChangeDialog';
import { ScheduleInterviewDialog, type ScheduleInterviewData } from './ScheduleInterviewDialog';

interface ApplicationActionBarProps {
  application: JobApplication;
  onStageChange: (newStage: JobApplication['status'], reason: string) => Promise<boolean>;
  onScheduleInterview: (data: ScheduleInterviewData) => Promise<boolean>;
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

    const primaryAction: JobApplication['status'] | null = nextLogicalStage;

    const otherActions: JobApplication['status'][] = orderedStages
        .filter(stage => stage !== currentStatus && stage !== nextLogicalStage);
        
    return { primaryAction, otherActions };
}

export function ApplicationActionBar({ application, onStageChange, onScheduleInterview }: ApplicationActionBarProps) {
  const [stageChangeDialogOpen, setStageChangeDialogOpen] = useState(false);
  const [interviewDialogOpen, setInterviewDialogOpen] = useState(false);
  const [targetStage, setTargetStage] = useState<JobApplication['status'] | null>(null);

  const handleActionClick = (stage: JobApplication['status']) => {
    setTargetStage(stage);
    if (stage === 'interview') {
        setInterviewDialogOpen(true);
    } else {
        setStageChangeDialogOpen(true);
    }
  };

  const handleConfirmStageChange = async (reason: string) => {
    if (!targetStage) return;
    await onStageChange(targetStage, reason);
    setStageChangeDialogOpen(false);
    setTargetStage(null);
  };
  
  const handleConfirmInterviewSchedule = async (data: ScheduleInterviewData) => {
    await onScheduleInterview(data);
    setInterviewDialogOpen(false);
    setTargetStage(null);
  };

  const { primaryAction, otherActions } = getStageActions(application.status);
  
  const finalStageActions = ['hired', 'rejected'];
  const backAndSkipActions = otherActions.filter(stage => !finalStageActions.includes(stage));

  return (
    <>
      <div className="flex items-center gap-2">
        {primaryAction && (
          <Button onClick={() => handleActionClick(primaryAction)}>
            <Check className="mr-2 h-4 w-4" />
            {`Lolos ke ${statusDisplayLabels[primaryAction]}`}
          </Button>
        )}

        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Tindakan Lain</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {backAndSkipActions.length > 0 && (
                    <DropdownMenuGroup>
                        <DropdownMenuLabel>Pindahkan ke Tahap Lain</DropdownMenuLabel>
                        {backAndSkipActions.map(stage => (
                            <DropdownMenuItem key={stage} onSelect={() => handleActionClick(stage)} className="cursor-pointer">
                                {statusDisplayLabels[stage]}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuGroup>
                )}
                
                <DropdownMenuSeparator />
                
                <DropdownMenuGroup>
                    <DropdownMenuLabel>Keputusan Final</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => handleActionClick('hired')} className="cursor-pointer">
                        Diterima Kerja
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={() => handleActionClick('rejected')}
                        className="cursor-pointer text-destructive focus:text-destructive"
                    >
                        Tolak Kandidat
                    </DropdownMenuItem>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      <StageChangeDialog 
        open={stageChangeDialogOpen}
        onOpenChange={setStageChangeDialogOpen}
        targetStage={targetStage}
        onConfirm={handleConfirmStageChange}
      />
      
      <ScheduleInterviewDialog
        open={interviewDialogOpen}
        onOpenChange={setInterviewDialogOpen}
        onConfirm={handleConfirmInterviewSchedule}
      />
    </>
  );
}
