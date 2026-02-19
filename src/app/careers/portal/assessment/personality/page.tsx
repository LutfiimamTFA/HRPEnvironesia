'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, useDoc } from '@/firebase';
import { collection, query, where, limit, serverTimestamp, Timestamp, getDocs, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import type { Assessment, AssessmentSession, JobApplication } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


function CompletedTestView({ sessionId }: { sessionId: string }) {
    return (
        <Card className="max-w-3xl mx-auto">
            <CardHeader className="items-center text-center">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <CardTitle className="text-2xl mt-4">Tes Telah Diselesaikan</CardTitle>
                <CardDescription>
                    Anda sudah pernah menyelesaikan tes kepribadian ini.
                </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
                <p className="text-muted-foreground mb-6">
                    Anda dapat melihat kembali hasil tes Anda atau melanjutkan proses lamaran lainnya.
                </p>
                <Button asChild size="lg">
                    <Link href={`/careers/portal/assessment/personality/result/${sessionId}`}>
                        Lihat Hasil Tes
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}

function StartTestForApplication({ applicationId }: { applicationId: string }) {
    const { userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();

    const appRef = useMemoFirebase(() => doc(firestore, 'applications', applicationId), [firestore, applicationId]);
    const { data: application, isLoading: appLoading, error: appError } = useDoc<JobApplication>(appRef);

    const assessmentQuery = useMemoFirebase(() => query(collection(firestore, 'assessments'), where('isActive', '==', true), limit(1)), [firestore]);
    const { data: assessments, isLoading: assessmentLoading } = useCollection<Assessment>(assessmentQuery);
    const activeAssessment = assessments?.[0];

    useEffect(() => {
        if (appLoading || assessmentLoading || authLoading) return;

        if (!application || !userProfile || !activeAssessment) {
            if (appError) {
                toast({ variant: 'destructive', title: 'Error', description: `Gagal memuat detail lamaran: ${appError.message}` });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: 'Gagal mempersiapkan tes. Lamaran atau tes tidak ditemukan.' });
            }
            router.push('/careers/portal/applications');
            return;
        }
        
        if (application.candidateUid !== userProfile.uid) {
             toast({ variant: 'destructive', title: 'Akses Ditolak', description: 'Anda tidak diizinkan untuk memulai sesi tes ini.' });
             router.push('/careers/portal/applications');
             return;
        }

        const handleStart = async () => {
            const sessionsQuery = query(
                collection(firestore, 'assessment_sessions'),
                where('applicationId', '==', applicationId),
                limit(1)
            );
            const existingSessionsSnap = await getDocs(sessionsQuery);

            if (!existingSessionsSnap.empty) {
                const existingSession = existingSessionsSnap.docs[0];
                toast({ title: 'Melanjutkan Sesi', description: 'Anda akan melanjutkan tes untuk lowongan ini.' });
                router.push(`/careers/portal/assessment/personality/${existingSession.id}`);
                return;
            }

            const sessionData: Omit<AssessmentSession, 'id' | 'scores' | 'answers'> = {
                assessmentId: activeAssessment.id!,
                candidateUid: userProfile.uid,
                candidateName: userProfile.fullName,
                candidateEmail: userProfile.email,
                applicationId: applicationId,
                jobPosition: application.jobPosition,
                brandName: application.brandName,
                status: 'draft',
                startedAt: serverTimestamp() as Timestamp,
                updatedAt: serverTimestamp() as Timestamp,
            };

            const docRef = await addDocumentNonBlocking(collection(firestore, 'assessment_sessions'), sessionData);
            toast({ title: 'Tes Dimulai!', description: 'Selamat mengerjakan.' });
            router.push(`/careers/portal/assessment/personality/${docRef.id}`);
        };

        handleStart().catch(e => {
            toast({ variant: 'destructive', title: 'Gagal Memulai Tes', description: e.message });
            router.push('/careers/portal/applications');
        });

    }, [appLoading, assessmentLoading, authLoading, application, userProfile, activeAssessment, applicationId, router, toast, firestore, appError]);

    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-4 text-muted-foreground">Mempersiapkan sesi tes untuk<br/><span className="font-bold text-foreground">{application?.jobPosition || '...'}</span></p>
      </div>
    );
}


function AssessmentStartPageContent() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get('applicationId');
  
  const sessionsQuery = useMemoFirebase(() => {
    if (!userProfile) return null;
    return query(
        collection(firestore, 'assessment_sessions'),
        where('candidateUid', '==', userProfile.uid),
        where('status', '==', 'submitted'),
        limit(1)
    );
  }, [firestore, userProfile]);

  const { data: sessions, isLoading: sessionsLoading } = useCollection<AssessmentSession>(sessionsQuery);
  const submittedSession = useMemo(() => sessions?.find(s => s.status === 'submitted'), [sessions]);

  const isLoading = authLoading || sessionsLoading;

  if (applicationId) {
      return <StartTestForApplication applicationId={applicationId} />;
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  
  if (submittedSession) {
    return <CompletedTestView sessionId={submittedSession.id!} />;
  }

  return (
    <Card className="max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Tes Kepribadian</CardTitle>
        <CardDescription>
          Tes ini dirancang untuk membantu kami memahami preferensi dan gaya kerja Anda.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Petunjuk Memulai Tes</AlertTitle>
            <AlertDescription>
              Untuk mengerjakan tes, silakan akses melalui tombol "Kerjakan Tes" pada lamaran Anda yang berstatus "Tahap Psikotes" di halaman <Link href="/careers/portal/applications" className="font-bold underline">Lamaran Saya</Link>.
            </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

export default function AssessmentPage() {
    return (
        <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <AssessmentStartPageContent />
        </Suspense>
    )
}
