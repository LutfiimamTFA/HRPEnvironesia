'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { collection, query, where, limit, doc, getDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import type { Job, JobApplication } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Building, Calendar, MapPin, Briefcase, Loader2 } from 'lucide-react';
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
  const [isApplying, setIsApplying] = useState(false);

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

  const handleApply = async () => {
    if (!userProfile || !job) return;

    setIsApplying(true);

    // 1. Check profile completeness
    if (!userProfile.isProfileComplete) {
        toast({
            variant: 'destructive',
            title: 'Profil Belum Lengkap',
            description: 'Silakan lengkapi Data Diri dan Pendidikan Anda sebelum melamar.',
        });
        router.push('/careers/portal/profile');
        setIsApplying(false);
        return;
    }

    const applicationId = `${job.id}_${userProfile.uid}`;
    const applicationRef = doc(firestore, 'applications', applicationId);

    try {
        // 2. Check for existing application
        const existingAppSnap = await getDoc(applicationRef);
        if (existingAppSnap.exists()) {
            toast({
                variant: 'destructive',
                title: 'Lamaran Sudah Ada',
                description: 'Anda sudah pernah melamar untuk posisi ini.',
            });
            setIsApplying(false);
            router.push('/careers/portal/applications');
            return;
        }

        // 3. Check if candidate has already completed a psychotest
        const psychotestQuery = query(
            collection(firestore, 'assessment_sessions'),
            where('candidateUid', '==', userProfile.uid),
            where('status', '==', 'submitted'),
            limit(1)
        );
        const psychotestSnap = await getDocs(psychotestQuery);
        const hasCompletedTest = !psychotestSnap.empty;

        // 4. Determine initial status based on psychotest completion
        const initialStatus = hasCompletedTest ? 'verification' : 'submitted';
        const toastMessage = hasCompletedTest 
            ? 'Lamaran Anda telah dikirim dan akan langsung diverifikasi oleh tim HRD karena Anda sudah pernah menyelesaikan psikotes.'
            : `Lamaran Anda untuk posisi ${job.position} telah berhasil dikirim.`;

        // 5. Construct application data
        const applicationData: Omit<JobApplication, 'id'> = {
            candidateUid: userProfile.uid,
            candidateName: userProfile.fullName,
            candidateEmail: userProfile.email,
            jobId: job.id!,
            jobSlug: job.slug,
            jobPosition: job.position,
            brandId: job.brandId,
            brandName: job.brandName || '',
            jobType: job.statusJob,
            location: job.location,
            status: initialStatus,
            jobApplyDeadline: job.applyDeadline || null,
            createdAt: serverTimestamp() as any,
            updatedAt: serverTimestamp() as any,
            submittedAt: serverTimestamp() as any,
        };

        // 6. Submit application
        await setDocumentNonBlocking(applicationRef, applicationData, { merge: false });

        toast({
            title: 'Lamaran Terkirim!',
            description: toastMessage,
        });

        router.push('/careers/portal/applications');

    } catch (error: any) {
        console.error("Application submission error:", error);
        toast({
            variant: 'destructive',
            title: 'Gagal Mengirim Lamaran',
            description: error.message || 'Terjadi kesalahan. Silakan coba lagi.',
        });
    } finally {
        setIsApplying(false);
    }
  };


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
                        <CardDescription>Profil Anda akan dikirimkan sebagai lamaran untuk posisi ini. Pastikan semua data sudah benar.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                     <p className="text-sm text-center p-8 border rounded-lg bg-muted/50">
                        Profil Anda akan dikirimkan sebagai lamaran untuk posisi ini. Pastikan semua data di profil Anda sudah benar sebelum mengirim.
                    </p>
                    <div className="flex justify-end gap-2 pt-4">
                         <Button onClick={() => router.back()} variant="outline">
                            Kembali
                        </Button>
                        <Button onClick={handleApply} disabled={isApplying}>
                            {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Kirim Lamaran
                        </Button>
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
