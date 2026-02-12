'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { collection, query, where, limit, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import type { Job, JobApplication } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Building, Calendar, MapPin, Briefcase, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

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

  const [isDraftCreated, setIsDraftCreated] = useState(false);

  // 1. Fetch Job details.
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

  // 2. Idempotently create a draft application when job and user are loaded.
  useEffect(() => {
    if (!job || !userProfile || isDraftCreated) {
      return;
    }

    const applicationId = `${job.id}_${userProfile.uid}`;
    const applicationRef = doc(firestore, 'applications', applicationId);

    const createDraft = async () => {
        try {
            const docSnap = await getDoc(applicationRef);
            
            if (!docSnap.exists()) {
                const newApplication: Omit<JobApplication, 'id' | 'createdAt' | 'updatedAt'> & { createdAt: any; updatedAt: any; } = {
                    candidateUid: userProfile.uid,
                    candidateName: userProfile.fullName,
                    candidateEmail: userProfile.email,
                    jobId: job.id!,
                    jobSlug: job.slug,
                    jobPosition: job.position,
                    brandId: job.brandId,
                    brandName: job.brandName || 'N/A',
                    jobType: job.statusJob,
                    location: job.location,
                    status: 'draft',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                };
                
                // Using setDocumentNonBlocking for optimistic UI update
                setDocumentNonBlocking(applicationRef, newApplication, { merge: false });

                toast({
                    title: "Lamaran Dimulai!",
                    description: `Posisi ${job.position} telah disimpan sebagai draf.`,
                });
            }
            setIsDraftCreated(true); // Mark as created/checked
        } catch (error) {
            console.error("Error creating application draft:", error);
            toast({
                variant: "destructive",
                title: "Gagal Menyimpan Draf",
                description: "Terjadi kesalahan saat memulai lamaran Anda.",
            });
        }
    };
    
    createDraft();

  }, [job, userProfile, firestore, toast, isDraftCreated]);


  if (isLoadingJob || !job) {
      return <JobApplySkeleton />
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <Card className="lg:col-span-2">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Lamar Posisi: {job.position}</CardTitle>
                        <CardDescription>Selesaikan aplikasi Anda untuk posisi ini.</CardDescription>
                    </div>
                     {isDraftCreated && (
                        <Badge variant="secondary" className="flex items-center gap-1.5">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Draf Tersimpan</span>
                        </Badge>
                     )}
                </div>
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
