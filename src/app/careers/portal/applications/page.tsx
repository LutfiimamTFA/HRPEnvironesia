'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, orderBy, query, where } from 'firebase/firestore';
import type { JobApplication } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Check, Briefcase, Building, FileSignature, FileUp, ClipboardCheck, Users, Award, XCircle, BrainCircuit } from "lucide-react";
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';


const applicationSteps = [
  { status: 'draft', label: 'Draf', icon: FileSignature },
  { status: 'submitted', label: 'Terkirim', icon: FileUp },
  { status: 'psychotest', label: 'Psikotes', icon: BrainCircuit },
  { status: 'reviewed', label: 'Ditinjau', icon: ClipboardCheck },
  { status: 'interview', label: 'Wawancara', icon: Users },
  { status: 'hired', label: 'Diterima', icon: Award },
];

const statusLabels: Record<JobApplication['status'], string> = {
  draft: 'Draf',
  submitted: 'Lamaran Terkirim',
  psychotest: 'Tahap Psikotes',
  reviewed: 'Sedang Ditinjau',
  interview: 'Tahap Wawancara',
  rejected: 'Tidak Lolos',
  hired: 'Diterima',
};

function ApplicationCard({ application }: { application: JobApplication }) {
  const currentStepIndex = applicationSteps.findIndex(step => step.status === application.status);
  const isRejected = application.status === 'rejected';
  const isHired = application.status === 'hired';

  const canContinue = application.status === 'draft';
  const jobIsExpired = application.jobApplyDeadline && application.jobApplyDeadline.toDate() < new Date();

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
            <div>
                <CardTitle className="text-xl">{application.jobPosition}</CardTitle>
                <CardDescription className="flex items-center gap-2 pt-1">
                    <Building className="h-4 w-4" /> {application.brandName}
                </CardDescription>
            </div>
             <Badge variant={isRejected ? 'destructive' : isHired ? 'default' : 'secondary'} className={cn("w-fit", isHired && "bg-emerald-600 hover:bg-emerald-600")}>
                {statusLabels[application.status]}
            </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-grow space-y-4">
        <Separator />
        <div className="w-full overflow-x-auto pb-4">
            <div className="flex items-center min-w-[500px]">
            {applicationSteps.map((step, index) => {
              const isActive = index === currentStepIndex;
              const isCompleted = !isRejected && currentStepIndex >= index;

              return (
                <React.Fragment key={step.status}>
                  <div className="flex flex-col items-center text-center w-24 flex-shrink-0 z-10">
                    <div
                      className={cn(
                        'h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all duration-300',
                        isCompleted ? 'bg-primary border-primary' : 'bg-card border-border'
                      )}
                    >
                      {isCompleted ? 
                        <Check className="h-5 w-5 text-primary-foreground" /> :
                        <step.icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
                      }
                    </div>
                    <p className={cn(
                      'mt-2 text-xs font-medium transition-colors duration-300',
                      isCompleted ? 'text-primary' : 'text-muted-foreground'
                    )}>
                      {step.label}
                    </p>
                  </div>

                  {index < applicationSteps.length - 1 && (
                    <div className={cn(
                      "flex-1 h-1 transition-colors duration-300",
                      isCompleted && index < currentStepIndex ? 'bg-primary' : 'bg-border'
                    )} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
        
         {isRejected && (
            <div className="p-4 rounded-md border border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-3">
                <XCircle className="h-5 w-5" />
                <div className="text-sm font-medium">
                    <p>Terima kasih atas minat Anda. Saat ini kami belum dapat melanjutkan proses lamaran Anda.</p>
                </div>
            </div>
        )}

      </CardContent>
      <CardFooter className="bg-muted/50 p-4 border-t flex justify-between items-center">
         <p className="text-sm text-muted-foreground">
            Batas Waktu: {application.jobApplyDeadline ? format(application.jobApplyDeadline.toDate(), 'dd MMM yyyy') : '-'}
        </p>
        {canContinue && !jobIsExpired && (
            <Button asChild size="sm">
                <Link href={`/careers/jobs/${application.jobSlug}/apply`}>
                    Lanjutkan Draf
                    <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
            </Button>
        )}
        {canContinue && jobIsExpired && (
             <Badge variant="outline">Lowongan ditutup</Badge>
        )}
      </CardFooter>
    </Card>
  );
}

function ApplicationsPageSkeleton() {
    return (
        <div className="space-y-6">
            {[...Array(2)].map((_, i) => (
                <Card key={i}>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div className="space-y-2">
                                <Skeleton className="h-6 w-48" />
                                <Skeleton className="h-4 w-32" />
                            </div>
                            <Skeleton className="h-6 w-24" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-16 w-full" />
                    </CardContent>
                    <CardFooter className="bg-muted/50 p-4 border-t flex justify-between items-center">
                         <Skeleton className="h-4 w-40" />
                         <Skeleton className="h-9 w-32" />
                    </CardFooter>
                </Card>
            ))}
        </div>
    );
}

export default function ApplicationsPage() {
    const { userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();

    const applicationsQuery = useMemoFirebase(() => {
        if (!userProfile) return null;
        return query(
            collection(firestore, 'applications'),
            where('candidateUid', '==', userProfile.uid),
            orderBy('createdAt', 'desc')
        );
    }, [userProfile, firestore]);

    const { data: applications, isLoading: applicationsLoading, error } = useCollection<JobApplication>(applicationsQuery);

    const isLoading = authLoading || applicationsLoading;

    if (error) {
        return (
            <div className="p-4 border-2 border-dashed border-red-500 rounded-lg bg-red-50 text-red-900">
                <h3 className="font-bold text-lg mb-2">Terjadi Kesalahan</h3>
                <p>Gagal memuat data lamaran Anda. Silakan coba lagi nanti.</p>
                <pre className="mt-4 text-xs bg-white p-2 rounded overflow-auto">{error.message}</pre>
            </div>
        )
    }

    return (
        <div className="space-y-6">
             <div>
                <h1 className="text-3xl font-bold tracking-tight">Lamaran Saya</h1>
                <p className="text-muted-foreground">Riwayat dan status lamaran pekerjaan yang telah Anda kirimkan atau simpan sebagai draf.</p>
            </div>
            
            {isLoading ? (
                <ApplicationsPageSkeleton />
            ) : applications && applications.length > 0 ? (
                <div className="space-y-6">
                    {applications.map(app => (
                        <ApplicationCard key={app.id} application={app} />
                    ))}
                </div>
            ) : (
                <Card className="h-64 flex flex-col items-center justify-center text-center">
                     <CardHeader>
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                            <Briefcase className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <CardTitle className="mt-4">Anda Belum Pernah Melamar</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Semua lamaran Anda akan muncul di sini.</p>
                    </CardContent>
                    <CardFooter>
                        <Button asChild>
                            <Link href="/careers/portal/jobs">Cari Lowongan Sekarang</Link>
                        </Button>
                    </CardFooter>
                </Card>
            )}
        </div>
    );
}
