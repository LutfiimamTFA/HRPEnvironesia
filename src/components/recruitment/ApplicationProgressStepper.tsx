'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { JobApplicationStatus } from '@/lib/types';
import { Check, BrainCircuit, Users, Award, FileUp, FileText, Search, ClipboardCheck } from 'lucide-react';
import { ORDERED_RECRUITMENT_STAGES } from '@/lib/types';

const applicationSteps = [
  { status: 'submitted', label: 'Terkirim', icon: FileUp },
  { status: 'screening', label: 'Screening', icon: Search },
  { status: 'tes_kepribadian', label: 'Tes', icon: BrainCircuit },
  { status: 'verification', label: 'Verifikasi', icon: ClipboardCheck },
  { status: 'document_submission', label: 'Dokumen', icon: FileText },
  { status: 'interview', label: 'Wawancara', icon: Users },
  { status: 'hired', label: 'Diterima', icon: Award },
];

interface ApplicationProgressStepperProps {
  currentStatus: JobApplicationStatus;
}

export function ApplicationProgressStepper({ currentStatus }: ApplicationProgressStepperProps) {
  const currentStepIndex = ORDERED_RECRUITMENT_STAGES.indexOf(currentStatus);
  const isRejected = currentStatus === 'rejected';

  if (isRejected) {
    return null;
  }

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="flex items-center min-w-[700px]">
        {applicationSteps.map((step, index) => {
          const canonicalIndex = ORDERED_RECRUITMENT_STAGES.indexOf(step.status as JobApplicationStatus);
          
          const isActive = canonicalIndex === currentStepIndex;
          const isCompleted = !isRejected && currentStepIndex > canonicalIndex;
          
          return (
            <React.Fragment key={step.status}>
              <div className="flex flex-col items-center text-center w-24 flex-shrink-0 z-10 rounded-md p-1">
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
              </div>

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
