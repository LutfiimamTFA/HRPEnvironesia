'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { AssessmentQuestion, AssessmentSession } from '@/lib/types';
import { analyzeAnswer } from '@/ai/flows/analyze-answer-flow';
import { Sparkles } from 'lucide-react';

const answerLabels: Record<number, string> = {
  1: 'Sangat Tidak Setuju',
  2: 'Tidak Setuju',
  3: 'Agak Tidak Setuju',
  4: 'Netral',
  5: 'Agak Setuju',
  6: 'Setuju',
  7: 'Sangat Setuju',
};

const dimensionLabels: Record<string, string> = {
    'O': 'Openness',
    'C': 'Conscientiousness',
    'E': 'Extraversion',
    'A': 'Agreeableness',
    'N': 'Neuroticism',
    'D': 'Dominance',
    'I': 'Influence',
    'S': 'Steadiness',
};

interface AnalysisItemProps {
  question: AssessmentQuestion;
  answerValue: number;
}

function AnalysisItem({ question, answerValue }: AnalysisItemProps) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function getAnalysis() {
      setIsLoading(true);
      try {
        const result = await analyzeAnswer({
          questionText: question.text || '',
          answerValue: answerValue,
          answerScale: answerLabels[answerValue] || 'Tidak diketahui',
          dimensionKey: question.dimensionKey || '',
          dimensionLabel: dimensionLabels[question.dimensionKey || ''] || question.dimensionKey || '',
        });
        setAnalysis(result.analysis);
      } catch (error) {
        console.error("Failed to get AI analysis for question:", question.id, error);
        setAnalysis("Gagal memuat analisis AI.");
      } finally {
        setIsLoading(false);
      }
    }
    getAnalysis();
  }, [question, answerValue]);

  const answerLabel = answerLabels[answerValue] || 'Tidak menjawab';

  return (
    <div className="space-y-3">
      <div className='flex items-center gap-4'>
        <p className="text-sm">Jawaban Kandidat: <span className="font-semibold text-primary">{answerValue} - {answerLabel}</span></p>
        <Badge variant="outline" className="capitalize">{question.engineKey}: {dimensionLabels[question.dimensionKey || '']}</Badge>
      </div>
       <div className="flex items-start gap-2 text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
            <Sparkles className="h-4 w-4 mt-0.5 text-amber-500 flex-shrink-0" />
            {isLoading ? <Skeleton className="h-4 w-3/4" /> : <p className="italic">{analysis}</p>}
       </div>
    </div>
  );
}

interface ForcedChoiceAnswerViewProps {
  answerValue: { most: string; least: string };
}

function ForcedChoiceAnswerView({ answerValue }: ForcedChoiceAnswerViewProps) {
  return (
    <div className="space-y-3">
        <p className="font-medium">Jawaban Kandidat:</p>
        <div className="space-y-2">
            <div className="p-3 bg-green-50 border border-green-200 rounded-md dark:bg-green-900/20 dark:border-green-800">
                <p className="text-xs font-semibold text-green-800 dark:text-green-300">PALING SESUAI (V)</p>
                <p className="text-green-900 dark:text-green-200">{answerValue.most}</p>
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded-md dark:bg-red-900/20 dark:border-red-800">
                <p className="text-xs font-semibold text-red-800 dark:text-red-300">PALING TIDAK SESUAI (X)</p>
                <p className="text-red-900 dark:text-red-200">{answerValue.least}</p>
            </div>
        </div>
    </div>
  );
}


interface AnswerAnalysisProps {
  session: AssessmentSession;
  questions: AssessmentQuestion[];
}

export function AnswerAnalysis({ session, questions }: AnswerAnalysisProps) {
  const sortedQuestions = questions.sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analisis Jawaban per Pertanyaan</CardTitle>
        <CardDescription>
          Rincian setiap jawaban yang diberikan oleh kandidat. Analisis AI hanya tersedia untuk pertanyaan tipe skala (Likert).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full space-y-2">
          {sortedQuestions.map((question, index) => {
            const answerValue = session.answers[question.id!];
            if (answerValue === undefined) return null;

            const isLikert = question.type === 'likert';
            const title = isLikert ? question.text : 'Kelompok Pernyataan';
            const order = question.order || index + 1;

            return (
              <AccordionItem value={question.id!} key={question.id!} className="border rounded-md px-4">
                <AccordionTrigger className="text-left hover:no-underline">
                   <span className="font-medium">{order}. {title}</span>
                </AccordionTrigger>
                <AccordionContent>
                  {isLikert && typeof answerValue === 'number' ? (
                    <AnalysisItem question={question} answerValue={answerValue} />
                  ) : !isLikert && typeof answerValue === 'object' && answerValue !== null && 'most' in answerValue ? (
                    <ForcedChoiceAnswerView answerValue={answerValue as { most: string; least: string }} />
                  ) : (
                    <p className="text-sm text-muted-foreground">Tidak ada jawaban yang valid untuk pertanyaan ini.</p>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
