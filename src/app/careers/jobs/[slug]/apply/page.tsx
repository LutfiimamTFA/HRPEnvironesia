'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import type { Job } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Building, Calendar, MapPin, Briefcase, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';

function JobApplySkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-3/4" />
                        <Skeleton className="h-5 w-1/2" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-32 w-full" />
                    </CardContent>
                </Card>
            </div>
            <div className="space-y-4">
                <Skeleton className="h-48 w-full" />
            </div>
        </div>
    );
}

export default function JobApplyPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const firestore = useFirestore();
  const { userProfile } = useAuth();

  const isProfileComplete = userProfile?.isProfileComplete ?? false;

  // Fetch Job details.
  const jobQuery = useMemoFirebase(() => {
    if (!slug) return null;
    return query(
        collection(firestore, 'jobs'), 
        where('slug', '==', slug),
        where('publishStatus', '==', 'published'),
        limit(1)
    );
  }, [firestore, slug]);

  const { data: jobs, isLoading: isLoadingJob } = useCollection<Job>(jobQuery);
  const job = jobs?.[0];


  if (isLoadingJob || !job) {
      return <JobApplySkeleton />
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2">
            <Card>
                <CardHeader>
                    <div>
                        <CardTitle>Lamar Posisi: {job.position}</CardTitle>
                        <CardDescription>Selesaikan aplikasi Anda untuk posisi ini.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!isProfileComplete && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Profil Belum Lengkap!</AlertTitle>
                            <AlertDescription>
                                Anda harus melengkapi profil Anda sebelum dapat melamar.
                                <Button asChild variant="link" className="p-0 h-auto ml-1">
                                    <Link href="/careers/portal/profile">Lengkapi Profil Sekarang</Link>
                                </Button>
                            </AlertDescription>
                        </Alert>
                    )}
                    <p className="text-sm text-center p-8 border rounded-lg bg-muted/50">
                        Formulir aplikasi dan fitur unggah CV sedang dalam tahap pengembangan.
                    </p>
                    <div className="flex justify-end gap-2 pt-4">
                         <Button onClick={() => router.back()} variant="outline">
                            Kembali
                        </Button>
                        <Button disabled={!isProfileComplete}>Kirim Lamaran (Segera Hadir)</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
        <Card className="sticky top-20">
            <CardHeader>
                <CardTitle className="text-lg">{job.position}</CardTitle>
                <CardDescription>{job.brandName}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
                 <div className="flex items-center gap-2 text-muted-foreground">
                    <Building className="h-4 w-4" />
                    <span>{job.division}</span>
                </div>
                 <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{job.location}</span>
                </div>
                 <div className="flex items-center gap-2 text-muted-foreground">
                    <Briefcase className="h-4 w-4" />
                    <span className="capitalize">{job.statusJob}</span>
                </div>
                {job.applyDeadline && (
                    <div className="flex items-center gap-2 pt-2 text-destructive font-medium">
                        <Calendar className="h-4 w-4" />
                        <span>Lamar sebelum {format(job.applyDeadline.toDate(), 'dd MMM yyyy')}</span>
                    </div>
                )}
            </CardContent>
        </Card>
    </div>
  );
}
