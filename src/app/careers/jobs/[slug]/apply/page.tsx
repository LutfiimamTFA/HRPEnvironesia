'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { collection, query, where, limit, serverTimestamp } from 'firebase/firestore';
import type { Job, JobApplication } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Building, Calendar, MapPin, Briefcase } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

  // 1. Fetch Job details. This is the primary data needed to render the page.
  const jobQuery = useMemoFirebase(() => {
    if (!slug) return null;
    return query(collection(firestore, 'jobs'), where('slug', '==', slug), limit(1));
  }, [firestore, slug]);

  const { data: jobs, isLoading: isLoadingJob } = useCollection<Job>(jobQuery);
  const job = jobs?.[0];

  // 2. In parallel, prepare a query to check for existing applications.
  const applicationQuery = useMemoFirebase(() => {
    if (!firestore || !userProfile || !job?.id) return null;
    return query(
      collection(firestore, 'users', userProfile.uid, 'applications'),
      where('jobId', '==', job.id),
      limit(1)
    );
  }, [firestore, userProfile, job]);

  // 3. This hook will manage checking for and creating the application draft.
  // It does not block rendering.
  const { data: existingApplications, isLoading: isLoadingApplication } = useCollection<JobApplication>(applicationQuery);

  // This useEffect handles the logic of creating a draft application
  // after the initial data has been loaded. It's a "side effect".
  useEffect(() => {
    // Wait until we have the user, the job, and the result of the application check.
    if (isLoadingApplication || !userProfile || !job) {
      return;
    }
    
    const hasApplied = existingApplications && existingApplications.length > 0;

    // If the user has not applied yet, create a draft.
    if (!hasApplied) {
      const newApplication: Omit<JobApplication, 'id' | 'appliedAt'> & { appliedAt: any } = {
        userId: userProfile.uid,
        jobId: job.id!,
        jobPosition: job.position,
        brandName: job.brandName || 'N/A',
        jobType: job.statusJob,
        status: 'draft',
        appliedAt: serverTimestamp(),
      };

      const applicationsRef = collection(firestore, 'users', userProfile.uid, 'applications');
      addDocumentNonBlocking(applicationsRef, newApplication);

      toast({
        title: "Lamaran Dimulai!",
        description: `Posisi ${job.position} telah ditambahkan ke daftar lamaran Anda.`,
      });
    }
  }, [existingApplications, isLoadingApplication, userProfile, job, firestore, toast]);

  // The page is only in a "loading" state while fetching the main job data.
  // The application check/creation happens in the background.
  if (isLoadingJob || !job) {
      return <JobApplySkeleton />
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <Card className="lg:col-span-2">
            <CardHeader>
            <CardTitle>Lamar Posisi: {job.position}</CardTitle>
            <CardDescription>Selesaikan aplikasi Anda untuk posisi ini.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
            <p className="text-sm text-center p-8 border rounded-lg bg-muted/50">
                Formulir aplikasi dan fitur unggah CV sedang dalam tahap pengembangan.
            </p>
            <Button onClick={() => router.back()} variant="outline" className="w-full">
                Kembali ke Detail Lowongan
            </Button>
            </CardContent>
        </Card>
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
