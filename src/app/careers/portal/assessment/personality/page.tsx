'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { collection, query, where, limit, serverTimestamp, Timestamp, getDocs } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import type { Assessment, AssessmentSession } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function AssessmentStartPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  // 1. Find the active assessment
  const assessmentQuery = useMemoFirebase(
    () => query(collection(firestore, 'assessments'), where('isActive', '==', true), limit(1)),
    [firestore]
  );
  const { data: assessments, isLoading: assessmentLoading } = useCollection<Assessment>(assessmentQuery);
  const activeAssessment = assessments?.[0];

  const isLoading = authLoading || assessmentLoading;

  const handleStart = async () => {
    if (!userProfile || !activeAssessment) return;
    setIsProcessing(true);

    try {
      // 2. Check for existing "draft" session
      const sessionsQuery = query(
        collection(firestore, 'assessment_sessions'),
        where('candidateUid', '==', userProfile.uid),
        where('assessmentId', '==', activeAssessment.id!),
        where('status', '==', 'draft'),
        limit(1)
      );
      const existingSessionsSnap = await getDocs(sessionsQuery);

      if (!existingSessionsSnap.empty) {
        // A draft session exists, resume it
        const existingSession = existingSessionsSnap.docs[0];
        toast({ title: 'Melanjutkan Sesi', description: 'Anda akan melanjutkan tes yang belum selesai.' });
        router.push(`/careers/portal/assessment/personality/${existingSession.id}`);
        return;
      }
      
      // 3. Check for "submitted" session
       const submittedQuery = query(
        collection(firestore, 'assessment_sessions'),
        where('candidateUid', '==', userProfile.uid),
        where('assessmentId', '==', activeAssessment.id!),
        where('status', '==', 'submitted'),
        limit(1)
      );
      const submittedSnap = await getDocs(submittedQuery);

      if (!submittedSnap.empty) {
        const submittedSession = submittedSnap.docs[0];
        toast({ title: 'Tes Sudah Selesai', description: 'Anda sudah pernah menyelesaikan tes ini.' });
        router.push(`/careers/portal/assessment/personality/result/${submittedSession.id}`);
        return;
      }

      // 4. Create a new session
      const sessionData: Omit<AssessmentSession, 'id'> = {
        assessmentId: activeAssessment.id!,
        candidateUid: userProfile.uid,
        status: 'draft',
        answers: {},
        scores: {},
        startedAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      };

      const docRef = await addDocumentNonBlocking(collection(firestore, 'assessment_sessions'), sessionData);
      toast({ title: 'Tes Dimulai!', description: 'Selamat mengerjakan.' });
      router.push(`/careers/portal/assessment/personality/${docRef.id}`);

    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal Memulai Tes', description: error.message });
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!activeAssessment) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Tes Tidak Tersedia</CardTitle>
            </CardHeader>
            <CardContent>
                <p>Saat ini tidak ada tes kepribadian yang aktif. Silakan kembali lagi nanti.</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card className="max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Tes Kepribadian: {activeAssessment.name}</CardTitle>
        <CardDescription>
          Tes ini dirancang untuk membantu kami memahami preferensi dan gaya kerja Anda.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Petunjuk Pengerjaan</AlertTitle>
            <AlertDescription>
                <ul className="list-disc pl-5 space-y-1 mt-2">
                    <li>Tidak ada jawaban benar atau salah. Jawablah sesuai dengan diri Anda.</li>
                    <li>Tes ini tidak memiliki batasan waktu, namun usahakan untuk menyelesaikannya dalam satu sesi.</li>
                    <li>Jawaban Anda akan disimpan secara otomatis saat Anda melanjutkan ke pertanyaan berikutnya.</li>
                    <li>Jika Anda keluar di tengah jalan, Anda dapat melanjutkannya nanti.</li>
                </ul>
            </AlertDescription>
        </Alert>

        <div className="p-4 border rounded-lg flex items-start space-x-3 bg-muted/50">
          <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
          <div>
            <h4 className="font-semibold">Persetujuan</h4>
            <p className="text-sm text-muted-foreground">
              Dengan mengklik tombol "Mulai Tes", saya menyatakan bahwa saya akan mengerjakan tes ini dengan jujur dan data yang saya berikan dapat digunakan untuk proses rekrutmen di Environesia.
            </p>
          </div>
        </div>
        
        <div className="text-center pt-4">
          <Button size="lg" onClick={handleStart} disabled={isProcessing}>
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mulai Tes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
