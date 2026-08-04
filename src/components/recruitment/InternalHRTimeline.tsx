'use client';

import React from 'react';
import { JobApplication } from '@/lib/types';
import { Check, Clock, Briefcase, FileSearch, Users, Star, FileSignature, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InternalHRTimelineProps {
  application: JobApplication;
}

export function InternalHRTimeline({ application }: InternalHRTimelineProps) {
  // Define the internal HR sequence
  const steps = [
    { title: 'Applied', icon: Briefcase },
    { title: 'Screening', icon: FileSearch },
    { title: 'Interview', icon: Users },
    { title: 'Final Review', icon: Star },
    { title: 'Offer / Contract', icon: FileSignature },
    { title: 'Hired', icon: CheckCircle }
  ];

  // Determine current active step index based on application.status
  const getCurrentStepIndex = () => {
    switch (application.status) {
      case 'draft':
      case 'submitted':
        return 0; // Applied
      case 'tes_kepribadian':
      case 'screening':
        return 1; // Screening
      case 'interview':
        // If interviews exist and are completed, or if there is an existing decision, maybe it's Final Review?
        // Let's just consider it Interview. Final Review could be if they are at 'verification' or 'document_submission'
        // Or we can just consider 'verification' as Final Review.
        // For visual, let's check if internal reviews exist and are locked, maybe highlight Final Review.
        if (application.internalReviewConfig?.reviewLocked || (application.interviews && application.interviews.some(i => i.status === 'completed'))) {
            return 3; // Final Review
        }
        return 2; // Interview
      case 'verification':
      case 'document_submission':
        return 3; // Final Review
      case 'offered':
        return 4; // Offer
      case 'hired':
        return 5; // Hired
      case 'rejected':
        // If rejected, just highlight up to the last stage entered based on timeline, or keep it at current
        // For simplicity, find the last step before reject
        return -1; 
      default:
        return 0;
    }
  };

  const currentIdx = getCurrentStepIndex();

  return (
    <div className="w-full bg-slate-950/40 border border-slate-800 rounded-[2rem] p-6 shadow-2xl mb-6 ring-1 ring-white/5">
      <div className="flex items-center justify-between gap-4">
        {steps.map((step, idx) => {
          const isActive = currentIdx === idx;
          const isPassed = currentIdx > idx;

          return (
            <div key={step.title} className="flex-1 flex flex-col items-center gap-3 relative group">
              {/* Connector line */}
              {idx < steps.length - 1 && (
                <div className={cn(
                  "absolute top-5 left-[50%] right-[-50%] h-1 z-0 rounded-full transition-all duration-500",
                  isPassed ? "bg-indigo-500" : "bg-slate-800"
                )} />
              )}

              {/* Step Circle */}
              <div className={cn(
                "relative z-10 w-10 h-10 flex items-center justify-center rounded-full border-4 transition-all duration-500",
                isPassed ? "border-indigo-500 bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" : 
                isActive ? "border-indigo-400 bg-slate-900 text-indigo-400 scale-110 shadow-[0_0_15px_rgba(99,102,241,0.5)]" : 
                "border-slate-800 bg-slate-900 text-slate-600"
              )}>
                {isPassed ? <Check className="w-4 h-4 font-black" /> : <step.icon className="w-4 h-4" />}
              </div>

              {/* Step Title */}
              <div className="text-center z-10">
                <p className={cn(
                  "text-[10px] font-black uppercase tracking-widest transition-colors duration-300",
                  isActive ? "text-indigo-400" : isPassed ? "text-slate-300" : "text-slate-600"
                )}>
                  {step.title}
                </p>
                {isActive && currentIdx !== -1 && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[8px] font-bold uppercase tracking-wider animate-pulse">
                    Current Stage
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
