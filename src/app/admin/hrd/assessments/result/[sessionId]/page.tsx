'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import type { AssessmentSession, NavigationSetting, Profile, AssessmentQuestion } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { ALL_MENU_ITEMS, ALL_UNIQUE_MENU_ITEMS } from '@/lib/menu-config';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getInitials } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AnswerAnalysis } from '@/components/dashboard/AnswerAnalysis';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

function ResultSkeleton() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-32 w-full" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Skeleton className="h-64 w-full" />
                    <Skeleton className="h-48 w-full" />
                </div>
                <div className="space-y-6">
                    <Skeleton className="h-32 w-full" />
                </div>
            </div>
        </div>
    );
}

export default function HrdAssessmentResultPage() {
    const hasAccess = useRoleGuard(['hrd', 'super-admin']);
    const { userProfile } = useAuth();
    const params = useParams();
    const router = useRouter();
    const sessionId = params.sessionId as string;
    const firestore = useFirestore();
    
    // Get menu
    const settingsDocRef = useMemoFirebase(
      () => (userProfile ? doc(firestore, 'navigation_settings', userProfile.role) : null),
      [userProfile, firestore]
    );
    const { data: navSettings, isLoading: isLoadingSettings } = useDoc<NavigationSetting>(settingsDocRef);
    const menuItems = useMemo(() => {
        const defaultItems = ALL_MENU_ITEMS[userProfile?.role as keyof typeof ALL_MENU_ITEMS] || [];
        if (isLoadingSettings) return defaultItems;
        if (navSettings) {
        return ALL_UNIQUE_MENU_ITEMS.filter(item => navSettings.visibleMenuItems.includes(item.label));
        }
        return defaultItems;
    }, [navSettings, isLoadingSettings, userProfile]);

    // Get session
    const sessionRef = useMemoFirebase(
        () => (sessionId ? doc(firestore, 'assessment_sessions', sessionId) : null),
        [firestore, sessionId]
    );
    const { data: session, isLoading: isLoadingSession, error } = useDoc<AssessmentSession>(sessionRef);
    
    // Get candidate profile
    const profileRef = useMemoFirebase(
      () => (session ? doc(firestore, 'profiles', session.candidateUid) : null),
      [firestore, session]
    );
    const { data: profile } = useDoc<Profile>(profileRef);

    // Get assessment questions
    const questionsQuery = useMemoFirebase(() => {
        if (!session) return null;
        return query(collection(firestore, 'assessment_questions'), where('assessmentId', '==', session.assessmentId));
    }, [firestore, session]);
    const { data: questions, isLoading: isLoadingQuestions } = useCollection<AssessmentQuestion>(questionsQuery);

    const isLoading = isLoadingSettings || isLoadingSession || isLoadingQuestions;

    if (!hasAccess || isLoading) {
        return (
             <DashboardLayout pageTitle="Assessment Result" menuItems={menuItems}>
                <ResultSkeleton />
            </DashboardLayout>
        )
    }

    if (error || !session || !session.result?.report) {
        return (
             <DashboardLayout pageTitle="Error" menuItems={menuItems}>
                <p>Could not load assessment results. The session may be invalid or not yet completed.</p>
             </DashboardLayout>
        );
    }
    
    const { report } = session.result;

    return (
        <DashboardLayout pageTitle="Assessment Result" menuItems={menuItems}>
            <div className="space-y-6">
                <Button variant="outline" size="sm" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Submissions
                </Button>

                {profile && (
                    <Card>
                        <CardHeader>
                             <div className="flex items-center gap-4">
                                <Avatar className="h-12 w-12 border">
                                    <AvatarImage src={`https://picsum.photos/seed/${profile.email}/80/80`} alt={profile.fullName} data-ai-hint="profile avatar" />
                                    <AvatarFallback className="text-lg">{getInitials(profile.fullName)}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <CardTitle className="text-xl">Result for: {profile.fullName}</CardTitle>
                                    <CardDescription>{profile.email}</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                    </Card>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    <div className="lg:col-span-2 space-y-6">
                        <Card className="bg-gradient-to-br from-primary/90 to-primary text-primary-foreground text-center shadow-lg overflow-hidden">
                            <CardHeader className="p-8">
                                <Badge variant="secondary" className="mx-auto w-fit text-sm px-3 py-1 mb-3">Personality Type</Badge>
                                <CardTitle className="text-3xl font-bold tracking-tight">{report.title}</CardTitle>
                                <CardDescription className="text-base text-primary-foreground/80 mt-1 max-w-xl mx-auto">
                                    {report.subtitle}
                                </CardDescription>
                            </CardHeader>
                        </Card>
                         <Card>
                            <CardHeader><CardTitle>Description</CardTitle></CardHeader>
                            <CardContent className="prose max-w-none dark:prose-invert">
                                {report.blocks?.map((block, i) => <p key={i}>{block}</p>)}
                            </CardContent>
                        </Card>
                         <div className="grid md:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader><CardTitle>Strengths</CardTitle></CardHeader>
                                <CardContent><ul className="list-disc list-inside space-y-2">{report.strengths?.map(item => <li key={item}>{item}</li>)}</ul></CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>Areas for Development</CardTitle></CardHeader>
                                <CardContent><ul className="list-disc list-inside space-y-2">{report.risks?.map(item => <li key={item}>{item}</li>)}</ul></CardContent>
                            </Card>
                        </div>
                    </div>

                    <div className="lg:sticky lg:top-24 space-y-6">
                        <Card>
                            <CardHeader><CardTitle>Recommended Roles</CardTitle></CardHeader>
                            <CardContent className="flex flex-wrap gap-2">
                                {report.roleFit?.map(role => <Badge key={role} variant="secondary">{role}</Badge>)}
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <Separator />
                
                {questions && <AnswerAnalysis session={session} questions={questions} />}

            </div>
        </DashboardLayout>
    )
}
