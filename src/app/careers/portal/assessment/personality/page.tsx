'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking, useDoc, setDocumentNonBlocking } from '@/firebase';
import { collection, query, where, limit, serverTimestamp, Timestamp, getDocs, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import type { Assessment, AssessmentSession, JobApplication, AssessmentConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


function StartTestForApplication({ applicationId }: { applicationId: string }) {
    const { userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();

    const appRef = useMemoFirebase(() => doc(firestore, 'applications', applicationId), [firestore, applicationId]);
    const { data: application, isLoading: appLoading, error: appError } = useDoc<JobApplication>(appRef);

    const assessmentRef = useMemoFirebase(() => doc(firestore, 'assessments', 'default'), [firestore]);
    const { data: activeAssessment, isLoading: assessmentLoading } = useDoc<Assessment>(assessmentRef);

    const configDocRef = useMemoFirebase(() => doc(firestore, 'assessment_config', 'main'), [firestore]);
    const { data: assessmentConfig, isLoading: configLoading } = useDoc<AssessmentConfig>(configDocRef);


    useEffect(() => {
        if (appLoading || assessmentLoading || authLoading || configLoading) return;

        if (!application || !userProfile || !activeAssessment || !activeAssessment.isActive || activeAssessment.publishStatus !== 'published') {
            if (appError) {
                toast({ variant: 'destructive', title: 'Error', description: `Gagal memuat detail lamaran: ${appError.message}` });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: 'Gagal mempersiapkan tes. Lamaran, tes, atau konfigurasi tidak valid.' });
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
                const existingSessionDoc = existingSessionsSnap.docs[0];
                const existingSessionData = existingSessionDoc.data() as AssessmentSession;

                // **NEW LOGIC: Check for and repair incomplete sessions**
                if (!existingSessionData.selectedQuestionIds?.forcedChoice || existingSessionData.selectedQuestionIds.forcedChoice.length === 0) {
                    toast({ title: 'Memperbaiki Sesi Tes', description: 'Sesi Anda tidak lengkap. Menyiapkan bagian kedua dari tes...' });

                    const forcedChoiceQuery = query(collection(firestore, 'assessment_questions'),
                        where('assessmentId', '==', 'default'),
                        where('isActive', '==', true),
                        where('type', '==', 'forced-choice')
                    );
                    const forcedChoiceQuestionsSnap = await getDocs(forcedChoiceQuery);
                    const forcedChoiceIds = forcedChoiceQuestionsSnap.docs.map(doc => doc.id);
                    const forcedChoiceCount = assessmentConfig?.forcedChoiceCount || 20;

                    if (forcedChoiceIds.length < forcedChoiceCount) {
                        toast({ variant: 'destructive', title: 'Bank Soal Tidak Cukup', description: `Soal Forced-Choice tidak mencukupi untuk perbaikan. Hubungi HRD.` });
                        router.push('/careers/portal/applications');
                        return;
                    }

                    const shuffle = (array: string[]) => {
                      for (let i = array.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [array[i], array[j]] = [array[j], array[i]];
                      }
                      return array;
                    };
                    const selectedForcedChoiceIds = shuffle(forcedChoiceIds).slice(0, forcedChoiceCount);

                    await setDocumentNonBlocking(existingSessionDoc.ref, {
                        selectedQuestionIds: {
                            ...existingSessionData.selectedQuestionIds,
                            forcedChoice: selectedForcedChoiceIds,
                        },
                        currentTestPart: 'forced-choice', // Direct them to the second part
                        updatedAt: serverTimestamp()
                    }, { merge: true });

                    toast({ title: 'Sesi Diperbarui', description: 'Silakan lanjutkan ke bagian kedua.' });
                    router.push(`/careers/portal/assessment/personality/${existingSessionDoc.id}`);
                    return;
                }

                if (existingSessionData.status === 'submitted') {
                    toast({ title: 'Tes Selesai', description: 'Anda sudah menyelesaikan tes untuk lowongan ini. Melihat hasil...' });
                    router.push(`/careers/portal/assessment/personality/result/${existingSessionDoc.id}`);
                } else {
                    toast({ title: 'Melanjutkan Sesi', description: 'Anda akan melanjutkan tes yang sedang berjalan.' });
                    router.push(`/careers/portal/assessment/personality/${existingSessionDoc.id}`);
                }
                return;
            }

            // Fetch question banks
            const questionsCollection = collection(firestore, 'assessment_questions');
            const likertQuery = query(questionsCollection, where('assessmentId', '==', 'default'), where('isActive', '==', true), where('type', '==', 'likert'));
            const forcedChoiceQuery = query(questionsCollection, where('assessmentId', '==', 'default'), where('isActive', '==', true), where('type', '==', 'forced-choice'));
            
            const [likertQuestionsSnap, forcedChoiceQuestionsSnap] = await Promise.all([
                getDocs(likertQuery),
                getDocs(forcedChoiceQuery)
            ]);

            const likertIds = likertQuestionsSnap.docs.map(d => d.id);
            const forcedChoiceIds = forcedChoiceQuestionsSnap.docs.map(doc => doc.id);

            const likertCount = (assessmentConfig?.bigfiveCount || 30) + (assessmentConfig?.discCount || 20);
            const forcedChoiceCount = assessmentConfig?.forcedChoiceCount || 20;

            if (likertIds.length < likertCount || forcedChoiceIds.length < forcedChoiceCount) {
                toast({ variant: 'destructive', title: 'Bank Soal Tidak Cukup', description: `Soal tidak mencukupi. Likert: ${likertIds.length}/${likertCount}, Forced-Choice: ${forcedChoiceIds.length}/${forcedChoiceCount}. Hubungi HRD.` });
                router.push('/careers/portal/applications');
                return;
            }

            const shuffle = (array: string[]) => {
              for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
              }
              return array;
            };

            const sessionData: Omit<AssessmentSession, 'id'> = {
                assessmentId: activeAssessment.id!,
                candidateUid: userProfile.uid,
                candidateName: userProfile.fullName,
                candidateEmail: userProfile.email,
                applicationId: applicationId,
                jobPosition: application.jobPosition,
                brandName: application.brandName,
                status: 'draft',
                currentTestPart: 'likert',
                selectedQuestionIds: {
                    likert: shuffle(likertIds).slice(0, likertCount),
                    forcedChoice: shuffle(forcedChoiceIds).slice(0, forcedChoiceCount),
                },
                answers: {},
                scores: { disc: {}, bigfive: {} },
                startedAt: serverTimestamp() as Timestamp,
                updatedAt: serverTimestamp() as Timestamp,
            };

            const docRef = await addDocumentNonBlocking(collection(firestore, 'assessment_sessions'), sessionData);
            toast({ title: 'Tes Dimulai!', description: 'Selamat mengerjakan.' });
            router.push(`/careers/portal/assessment/personality/${docRef.id}`);
        };

        handleStart().catch(e => {
            console.error("Failed to start assessment:", e);
            toast({ variant: 'destructive', title: 'Gagal Memulai Tes', description: e.message });
            router.push('/careers/portal/applications');
        });

    }, [appLoading, assessmentLoading, authLoading, configLoading, application, userProfile, activeAssessment, assessmentConfig, applicationId, router, toast, firestore, appError]);

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
  
  // New: Query for active applications that need a test.
  const activeTestApplicationQuery = useMemoFirebase(() => {
    if (!userProfile) return null;
    return query(
      collection(firestore, 'applications'),
      where('candidateUid', '==', userProfile.uid),
      where('status', '==', 'tes_kepribadian'),
      limit(1)
    );
  }, [firestore, userProfile]);
  const { data: activeTestApplications, isLoading: activeTestAppsLoading } = useCollection<JobApplication>(activeTestApplicationQuery);
  const activeTestApplication = activeTestApplications?.[0];

  const isLoading = authLoading || activeTestAppsLoading;

  // If an applicationId is in the URL, that takes top priority.
  if (applicationId) {
      return <StartTestForApplication applicationId={applicationId} />;
  }

  // If not, but we found an active application that needs a test, start that one.
  if (!isLoading && activeTestApplication) {
      return <StartTestForApplication applicationId={activeTestApplication.id!} />;
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
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
              Untuk mengerjakan tes, silakan akses melalui tombol "Kerjakan Tes" pada lamaran Anda yang berstatus "Tahap Tes Kepribadian" di halaman <Link href="/careers/portal/applications" className="font-bold underline">Lamaran Saya</Link>.
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
