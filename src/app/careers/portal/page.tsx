'use client';

import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ArrowRight, Briefcase, FileText } from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { JobApplication } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

export default function CandidateDashboardPage() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const draftApplicationsQuery = useMemoFirebase(() => {
    if (!userProfile) return null;
    return query(
        collection(firestore, 'applications'),
        where('candidateUid', '==', userProfile.uid),
        where('status', '==', 'draft')
    );
  }, [userProfile, firestore]);

  const { data: draftApplications, isLoading } = useCollection<JobApplication>(draftApplicationsQuery);
  
  const activeDrafts = draftApplications;

  return (
    <div className="space-y-6">
        <div className="space-y-1">
            <h1 className="text-3xl font-bold">Halo, {userProfile?.fullName}!</h1>
            <p className="text-muted-foreground">Selamat datang di portal kandidat Anda. Mari mulai perjalanan karir Anda.</p>
        </div>

        {isLoading ? (
            <Skeleton className="h-48 w-full" />
        ) : activeDrafts && activeDrafts.length > 0 ? (
            <div className='space-y-4'>
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Lamaran Draf Anda</h2>
                    <p className="text-muted-foreground">Anda memiliki beberapa lamaran yang belum selesai.</p>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                    {activeDrafts.map(app => {
                        const deadline = app.jobApplyDeadline && app.jobApplyDeadline.toDate ? app.jobApplyDeadline.toDate() : null;
                        const canStillApply = !deadline || deadline > new Date();
                        
                        return (
                            <Card key={app.id}>
                                <CardHeader>
                                    <CardTitle className="text-lg">{app.jobPosition}</CardTitle>
                                    <CardDescription>{app.brandName}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {deadline && (
                                        <p className={`text-sm mb-4 ${canStillApply ? 'text-muted-foreground' : 'text-destructive'}`}>
                                            Batas waktu: {format(deadline, 'dd MMM yyyy')}
                                        </p>
                                    )}
                                    {!deadline && (
                                        <p className="text-sm text-muted-foreground mb-4">
                                            Tidak ada batas waktu.
                                        </p>
                                    )}
                                    <Button asChild className="w-full" disabled={!canStillApply}>
                                        <Link href={`/careers/jobs/${app.jobSlug}/apply`}>
                                            Lanjutkan Lamaran
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </Link>
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>
        ) : (
             <Card className="bg-primary/5 text-center">
                <CardHeader>
                    <CardTitle>Tidak Ada Lamaran Draf</CardTitle>
                    <CardDescription>Anda tidak memiliki draf lamaran yang sedang berjalan. Mulai cari pekerjaan impian Anda sekarang.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Button asChild>
                        <Link href="/careers">
                            <Briefcase className="mr-2 h-4 w-4" />
                            Lihat Semua Lowongan
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        )}
       
        <Card>
            <CardHeader>
                <CardTitle>Riwayat Lamaran</CardTitle>
                <CardDescription>Lacak semua draf dan lamaran yang telah Anda kirimkan di sini.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild className="w-full">
                    <Link href="/careers/portal/applications">
                        <FileText className="mr-2 h-4 w-4" />
                        Lihat Riwayat Lengkap
                    </Link>
                </Button>
            </CardContent>
        </Card>
    </div>
  );
}
