'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useFirestore, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import type { AssessmentSession, NavigationSetting, Profile } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { ALL_MENU_ITEMS, ALL_UNIQUE_MENU_ITEMS } from '@/lib/menu-config';
import { Loader2, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getInitials } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


function ResultSkeleton() {
    return <div className="h-96 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
}

function HrdNoteManager({ session }: { session: AssessmentSession }) {
  const [note, setNote] = useState(session.hrdNote || '');
  const [status, setStatus] = useState(session.hrdStatus || 'pending');
  const [isUpdating, setIsUpdating] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const sessionRef = doc(firestore, 'assessment_sessions', session.id!);
      await updateDocumentNonBlocking(sessionRef, {
        hrdNote: note,
        hrdStatus: status,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Success', description: 'HRD notes have been updated.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsUpdating(false);
    }
  };

  const hasChanges = note !== (session.hrdNote || '') || status !== (session.hrdStatus || 'pending');

  return (
    <Card>
      <CardHeader>
        <CardTitle>HRD Review</CardTitle>
        <CardDescription>Add internal notes and set the review status for this assessment.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Internal Note</label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add your notes here..." />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Review Status</label>
           <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Update status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleUpdate} disabled={!hasChanges || isUpdating}>
          {isUpdating ? 'Saving...' : 'Save Review'}
        </Button>
      </CardFooter>
    </Card>
  )
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
    const { data: session, isLoading, error } = useDoc<AssessmentSession>(sessionRef);
    
    // Get candidate profile
    const profileRef = useMemoFirebase(
      () => (session ? doc(firestore, 'profiles', session.candidateUid) : null),
      [firestore, session]
    );
    const { data: profile } = useDoc<Profile>(profileRef);


    if (!hasAccess || isLoading) {
        return (
             <DashboardLayout pageTitle="Assessment Result" menuItems={menuItems}>
                <ResultSkeleton />
            </DashboardLayout>
        )
    }

    if (error || !session || !session.report) {
        return (
             <DashboardLayout pageTitle="Error" menuItems={menuItems}>
                <p>Could not load assessment results. The session may be invalid or not yet completed.</p>
             </DashboardLayout>
        );
    }
    
    const { report } = session;

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
                                {report.descBlocks?.map((block, i) => <p key={i}>{block}</p>)}
                            </CardContent>
                        </Card>
                         <div className="grid md:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader><CardTitle>Strengths</CardTitle></CardHeader>
                                <CardContent><ul className="list-disc list-inside space-y-2">{report.strengths?.map(item => <li key={item}>{item}</li>)}</ul></CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>Areas for Development</CardTitle></CardHeader>
                                <CardContent><ul className="list-disc list-inside space-y-2">{report.weaknesses?.map(item => <li key={item}>{item}</li>)}</ul></CardContent>
                            </Card>
                        </div>
                    </div>

                    <div className="lg:sticky lg:top-24 space-y-6">
                        <HrdNoteManager session={session} />
                        <Card>
                            <CardHeader><CardTitle>Recommended Roles</CardTitle></CardHeader>
                            <CardContent className="flex flex-wrap gap-2">
                                {report.roleFit?.map(role => <Badge key={role} variant="secondary">{role}</Badge>)}
                            </CardContent>
                        </Card>
                    </div>

                </div>
            </div>
        </DashboardLayout>
    )
}
