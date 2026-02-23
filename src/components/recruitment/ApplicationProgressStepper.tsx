'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { JobApplication } from '@/lib/types';
import { Check, BrainCircuit, ClipboardCheck, Users, Award, FileUp, FileText, Search } from 'lucide-react';

const applicationSteps = [
  { status: 'submitted', label: 'Terkirim', icon: FileUp },
  { status: 'screening', label: 'Screening', icon: Search },
  { status: 'tes_kepribadian', label: 'Tes Kepribadian', icon: BrainCircuit },
  { status: 'document_submission', label: 'Dokumen', icon: FileText },
  { status: 'verification', label: 'Verifikasi', icon: ClipboardCheck },
  { status: 'interview', label: 'Wawancara', icon: Users },
  { status: 'hired', label: 'Diterima', icon: Award },
];

interface ApplicationProgressStepperProps {
  currentStatus: JobApplication['status'];
  onStageClick?: (stage: JobApplication['status']) => void;
}

export function ApplicationProgressStepper({ currentStatus, onStageClick }: ApplicationProgressStepperProps) {
  const currentStepIndex = applicationSteps.findIndex(step => step.status === currentStatus);
  const isRejected = currentStatus === 'rejected';

  if (isRejected) {
    return null;
  }

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="flex items-center min-w-[700px]">
        {applicationSteps.map((step, index) => {
          const isActive = index === currentStepIndex;
          const isCompleted = !isRejected && currentStepIndex > index;
          const isClickable = onStageClick && !isActive;
          
          const StepContainer = isClickable ? 'button' : 'div';
          const containerProps = {
            className: cn(
              "flex flex-col items-center text-center w-24 flex-shrink-0 z-10 rounded-md p-1",
              isClickable && "cursor-pointer transition-colors hover:bg-muted"
            ),
            onClick: isClickable ? () => onStageClick(step.status as JobApplication['status']) : undefined,
          };

          return (
            <React.Fragment key={step.status}>
              <StepContainer {...containerProps}>
                <div
                  className={cn(
                    'h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all duration-300',
                    isCompleted ? 'bg-primary border-primary' : (isActive ? 'bg-primary/10 border-primary' : 'bg-card border-border')
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5 text-primary-foreground" />
                  ) : (
                    <step.icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
                  )}
                </div>
                <p className={cn(
                  'mt-2 text-xs font-medium transition-colors duration-300',
                  (isCompleted || isActive) ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {step.label}
                </p>
              </StepContainer>

              {index < applicationSteps.length - 1 && (
                <div className={cn(
                  "flex-1 h-1 transition-colors duration-300 -mx-1",
                  isCompleted ? 'bg-primary' : 'bg-border'
                )} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
