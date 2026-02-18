'use client';

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface ProfileStepperProps {
    steps: { id: number; name: string }[];
    currentStep: number;
}

export function ProfileStepper({ steps, currentStep }: ProfileStepperProps) {
    return (
        <nav aria-label="Progress">
            <ol role="list" className="space-y-4 md:flex md:space-x-8 md:space-y-0">
                {steps.map((step, index) => {
                    const stepIndex = index + 1;
                    const isCompleted = currentStep > stepIndex;
                    const isCurrent = currentStep === stepIndex;

                    return (
                        <li key={step.name} className="md:flex-1">
                            <div
                                className={cn(
                                    "group flex flex-col border-l-4 py-2 pl-4 md:border-l-0 md:border-t-4 md:pb-0 md:pl-0 md:pt-4",
                                    isCompleted ? "border-primary" : (isCurrent ? "border-primary" : "border-border")
                                )}
                            >
                                <span className={cn(
                                    "text-sm font-medium",
                                     isCompleted ? "text-primary" : (isCurrent ? "text-primary" : "text-muted-foreground")
                                )}>
                                    Step {stepIndex}
                                </span>
                                <span className="text-sm font-semibold">{step.name}</span>
                            </div>
                        </li>
                    )
                })}
            </ol>
        </nav>
    );
}
