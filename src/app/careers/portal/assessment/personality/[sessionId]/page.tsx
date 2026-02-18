'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useDoc, useFirestore, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import type { AssessmentQuestion, AssessmentSession } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function AssessmentSkeleton() {
  return (
    <Card className="p-6 md:p-8">
      <Skeleton className="h-4 w-1/4 mb-2" />
      <Skeleton className="h-3 w-1/5 mb-8" />
      <Skeleton className="h-16 w-full mb-8" />
      <div className="flex justify-center items-center gap-4 mb-8">
        {[...Array(7)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-12 rounded-full" />
        ))}
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </Card>
  );
}

const likertOptions = [
  { value: 7, size: 'h-14 w-14', color: 'border-green-500 bg-green-500/10 data-[state=checked]:bg-green-500' },
  { value: 6, size: 'h-12 w-12', color: 'border-green-400 bg-green-400/10 data-[state=checked]:bg-green-400' },
  { value: 5, size: 'h-10 w-10', color: 'border-green-300 bg-green-300/10 data-[state=checked]:bg-green-300' },
  { value: 4, size: 'h-8 w-8', color: 'border-gray-400 bg-gray-400/10 data-[state=checked]:bg-gray-400' },
  { value: 3, size: 'h-10 w-10', color: 'border-purple-300 bg-purple-300/10 data-[state=checked]:bg-purple-300' },
  { value: 2, size: 'h-12 w-12', color: 'border-purple-400 bg-purple-400/10 data-[state=checked]:bg-purple-400' },
  { value: 1, size: 'h-14 w-14', color: 'border-purple-500 bg-purple-500/10 data-[state=checked]:bg-purple-500' },
].reverse();

function TakeAssessmentPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const firestore = useFirestore();
  const { userProfile, loading: authLoading } = useAuth();

  const sessionId = params.sessionId as string;

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isFinishing, setIsFinishing] = useState(false);
  
  // Fetch session
  const sessionRef = useMemoFirebase(() => doc(firestore, 'assessment_sessions', sessionId), [firestore, sessionId]);
  const { data: session, isLoading: sessionLoading } = useDoc<AssessmentSession>(sessionRef);
  
  // Fetch questions once session is loaded
  const questionsQuery = useMemoFirebase(() => {
    if (!session) return null;
    return query(collection(firestore, 'assessment_questions'), where('assessmentId', '==', session.assessmentId));
  }, [firestore, session]);
  const { data: questions, isLoading: questionsLoading } = useCollection<AssessmentQuestion>(questionsQuery);
  
  const sortedQuestions = useMemo(() => questions?.sort((a, b) => a.order - b.order) || [], [questions]);

  useEffect(() => {
    if (session) {
      setAnswers(session.answers || {});
    }
  }, [session]);
  
  const isLoading = authLoading || sessionLoading || (session && questionsLoading);

  const handleAnswerChange = async (questionId: string, value: string) => {
    const numericValue = parseInt(value, 10);
    const newAnswers = { ...answers, [questionId]: numericValue };
    setAnswers(newAnswers);

    // Autosave non-blockingly
    try {
      await updateDocumentNonBlocking(sessionRef, { answers: newAnswers });
    } catch (error) {
      console.error("Autosave failed:", error);
      toast({ variant: 'destructive', title: 'Gagal menyimpan sementara', description: 'Jawaban Anda mungkin tidak tersimpan. Periksa koneksi Anda.' });
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < sortedQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleFinish = async () => {
    setIsFinishing(true);
    try {
        const res = await fetch('/api/assessment/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Gagal menyelesaikan tes.');
        }

        toast({ title: 'Tes Selesai!', description: 'Hasil Anda sedang diproses.' });
        router.push(`/careers/portal/assessment/personality/result/${sessionId}`);

    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
        setIsFinishing(false);
    }
  };
  
  if (isLoading || !sortedQuestions.length) return <AssessmentSkeleton />;
  
  const currentQuestion = sortedQuestions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / sortedQuestions.length) * 100;
  const isLastQuestion = currentQuestionIndex === sortedQuestions.length - 1;

  return (
    <Card className="max-w-4xl mx-auto shadow-lg">
      <div className="p-4 border-b">
        <div className="flex justify-between items-center mb-2">
            <Button variant="ghost" size="sm" onClick={handlePrev} disabled={currentQuestionIndex === 0}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Halaman Sebelumnya
            </Button>
            <p className="text-sm text-muted-foreground">Langkah {currentQuestionIndex + 1} dari {sortedQuestions.length}</p>
        </div>
        <Progress value={progress} className="w-full h-2" />
      </div>
      <CardContent className="p-6 md:p-12 text-center">
        <p className="text-lg md:text-xl text-foreground mb-12 max-w-2xl mx-auto">{currentQuestion.text}</p>
        
        <RadioGroup
          value={answers[currentQuestion.id!]?.toString()}
          onValueChange={(value) => handleAnswerChange(currentQuestion.id!, value)}
          className="flex justify-between items-center max-w-xl mx-auto"
        >
          <span className="text-green-600 font-medium">Setuju</span>
          <div className="flex items-center gap-2 md:gap-4">
            {likertOptions.map(opt => (
              <RadioGroupItem 
                key={opt.value} 
                value={opt.value.toString()} 
                id={`${currentQuestion.id}-${opt.value}`}
                className={cn('rounded-full transition-all duration-200 ease-in-out transform hover:scale-110', opt.size, opt.color, 'data-[state=checked]:text-white data-[state=unchecked]:text-transparent' )}
              />
            ))}
          </div>
          <span className="text-purple-600 font-medium">Tidak Setuju</span>
        </RadioGroup>

        <div className="mt-16 flex justify-center">
            {!isLastQuestion ? (
                <Button size="lg" onClick={handleNext} disabled={!answers[currentQuestion.id!]}>
                    Lanjut
                </Button>
            ) : (
                <Button size="lg" onClick={handleFinish} disabled={isFinishing || !answers[currentQuestion.id!]}>
                    {isFinishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Selesaikan Tes
                </Button>
            )}
        </div>
      </CardContent>
    </Card>
  );
}

export default TakeAssessmentPage;
