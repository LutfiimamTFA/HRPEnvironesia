'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { JobApplication } from '@/lib/types';
import { Check, BrainCircuit, ClipboardCheck, Users, Award, FileUp, FileText } from 'lucide-react';

const applicationSteps = [
  { status: 'submitted', label: 'Terkirim', icon: FileUp },
  { status: 'psychotest', label: 'Psikotes', icon: BrainCircuit },
  { status: 'verification', label: 'Verifikasi', icon: ClipboardCheck },
  { status: 'document_submission', label: 'Dokumen', icon: FileText },
  { status: 'interview', label: 'Wawancara', icon: Users },
  { status: 'hired', label: 'Diterima', icon: Award },
];

interface ApplicationProgressStepperProps {
  currentStatus: JobApplication['status'];
}

export function ApplicationProgressStepper({ currentStatus }: ApplicationProgressStepperProps) {
  const currentStepIndex = applicationSteps.findIndex(step => step.status === currentStatus);
  const isRejected = currentStatus === 'rejected';

  // If rejected, we don't show the stepper in a "progress" state.
  if (isRejected) {
    return null; // Or a specific "rejected" state UI if desired
  }

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="flex items-center min-w-[600px]">
        {applicationSteps.map((step, index) => {
          const isActive = index === currentStepIndex;
          const isCompleted = !isRejected && currentStepIndex > index;

          return (
            <React.Fragment key={step.status}>
              <div className="flex flex-col items-center text-center w-24 flex-shrink-0 z-10">
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
