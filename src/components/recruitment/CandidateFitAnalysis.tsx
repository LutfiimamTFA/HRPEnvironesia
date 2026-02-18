
'use client';

import { useState } from 'react';
import type { Profile, Job, CandidateFitAnalysisOutput, AssessmentSession } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from '../ui/button';
import { Sparkles, Loader2, AlertCircle, CheckCircle, XCircle, Briefcase } from 'lucide-react';
import { analyzeCandidateFit } from '@/ai/flows/analyze-candidate-fit-flow';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';

interface CandidateFitAnalysisProps {
  profile: Profile;
  job: Job;
  assessmentSession: AssessmentSession | null;
}

export function CandidateFitAnalysis({ profile, job, assessmentSession }: CandidateFitAnalysisProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<CandidateFitAnalysisOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const profileForAnalysis = {
        skills: profile.skills || [],
        workExperience: profile.workExperience?.map(exp => ({
            company: exp.company,
            position: exp.position,
            jobType: exp.jobType,
            startDate: exp.startDate,
            endDate: exp.endDate,
            isCurrent: exp.isCurrent,
            description: exp.description
        })) || [],
        education: profile.education?.map(edu => ({
            institution: edu.institution,
            level: edu.level,
            fieldOfStudy: edu.fieldOfStudy
        })) || []
      };

      const personalityData = assessmentSession?.result?.report ? {
          typeTitle: assessmentSession.result.report.title || '',
          typeSubtitle: assessmentSession.result.report.subtitle || '',
          strengths: assessmentSession.result.report.strengths || [],
          risks: assessmentSession.result.report.risks || [],
          roleFit: assessmentSession.result.report.roleFit || [],
      } : undefined;

      const result = await analyzeCandidateFit({
        candidateProfile: profileForAnalysis,
        jobRequirements: job.specialRequirementsHtml,
        personalityAnalysis: personalityData,
      });
      setAnalysis(result);
    } catch (e: any) {
      setError("Gagal melakukan analisis. Silakan coba lagi.");
      toast({
        variant: 'destructive',
        title: 'Analisis Gagal',
        description: e.message || 'Terjadi kesalahan saat berkomunikasi dengan AI.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Analisis AI
            </CardTitle>
            <CardDescription>Analisis kesesuaian kandidat dengan kualifikasi khusus (didukung oleh AI).</CardDescription>
          </div>
           <Button onClick={handleAnalyze} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {isLoading ? 'Menganalisis...' : 'Lakukan Analisis AI'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!isLoading && !analysis && !error && (
            <div className="text-center py-8 text-muted-foreground">
                Klik tombol untuk memulai analisis AI.
            </div>
        )}
        {isLoading && (
            <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="mt-2 text-muted-foreground">AI sedang menganalisis profil...</p>
            </div>
        )}
        {error && (
            <div className="flex flex-col items-center justify-center text-center py-8 text-destructive">
                <AlertCircle className="h-8 w-8 mb-2" />
                <p className="font-semibold">{error}</p>
            </div>
        )}
        {analysis && (
            <div className="space-y-6">
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-muted-foreground">Skor Kecocokan</span>
                        <span className="font-bold text-lg text-primary">{analysis.score}/100</span>
                    </div>
                    <Progress value={analysis.score} className="h-3" />
                </div>
                <div>
                    <h4 className="font-semibold mb-2">Ringkasan Analisis</h4>
                    <p className="text-sm text-muted-foreground italic p-4 bg-muted/50 rounded-lg">{analysis.summary}</p>
                </div>
                 <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <h4 className="font-semibold flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-600" /> Sinergi Kekuatan</h4>
                        <ul className="list-none space-y-2">
                            {analysis.strengths.map((item, index) => (
                                <li key={index} className="flex items-start gap-2 text-sm p-2 bg-green-50 dark:bg-green-900/20 rounded-md">
                                    <CheckCircle className="h-4 w-4 mt-0.5 text-green-600 flex-shrink-0" /> 
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                     <div className="space-y-2">
                        <h4 className="font-semibold flex items-center gap-2"><XCircle className="h-5 w-5 text-red-600" /> Potensi Area Pengembangan</h4>
                        <ul className="list-none space-y-2">
                            {analysis.weaknesses.map((item, index) => (
                               <li key={index} className="flex items-start gap-2 text-sm p-2 bg-red-50 dark:bg-red-900/20 rounded-md">
                                    <XCircle className="h-4 w-4 mt-0.5 text-red-600 flex-shrink-0" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                {analysis.roleSuggestions && analysis.roleSuggestions.length > 0 && (
                     <div className="space-y-2">
                        <h4 className="font-semibold flex items-center gap-2"><Briefcase className="h-5 w-5 text-indigo-600" /> Saran Peran Alternatif</h4>
                        <div className="flex flex-wrap gap-2">
                            {analysis.roleSuggestions.map((role, index) => (
                                <Badge key={index} variant="outline" className="text-base py-1 px-3 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200">
                                    {role}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}
      </CardContent>
    </Card>
  );
}
