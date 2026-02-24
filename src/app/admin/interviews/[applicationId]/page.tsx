'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { JobApplication, Profile, Job } from '@/lib/types';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Mail, Phone, User, Briefcase, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MENU_CONFIG } from '@/lib/menu-config';
import { ProfileView } from '@/components/recruitment/ProfileView';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { ApplicationNotes } from '@/components/recruitment/ApplicationNotes';
import { CandidateDocumentsCard } from '@/components/recruitment/CandidateDocumentsCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function InterviewKitSkeleton() {
  return <Skeleton className="h-[500px] w-full" />;
}

export default function InterviewKitPage() {
    const { userProfile } = useAuth();
    const firestore = useFirestore();
    const params = useParams();
    const router = useRouter();
    const applicationId = params.applicationId as string;

    const applicationRef = useMemoFirebase(
        () => (applicationId ? doc(firestore, 'applications', applicationId) : null),
        [firestore, applicationId]
    );
    const { data: application, isLoading: isLoadingApp, mutate: mutateApplication } = useDoc<JobApplication>(applicationRef);

    const profileRef = useMemoFirebase(
        () => (application ? doc(firestore, 'profiles', application.candidateUid) : null),
        [firestore, application]
    );
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(profileRef);

    const menuConfig = useMemo(() => {
        if (!userProfile) return [];
        return MENU_CONFIG[userProfile.role] || [];
    }, [userProfile]);

    const isLoading = isLoadingApp || isLoadingProfile;
    
    // Perform a manual, side-effect-free check for access.
    // This allows panelists who are not HRD/Admins to view the kit.
    const hasAccess = !isLoading && userProfile && application && (
        ['hrd', 'super-admin'].includes(userProfile.role) ||
        (application.allPanelistIds?.includes(userProfile.uid) ?? false)
    );

    if (isLoading) {
        return (
             <DashboardLayout pageTitle="Loading Interview Kit..." menuConfig={menuConfig}>
                <InterviewKitSkeleton />
             </DashboardLayout>
        );
    }
    
    if (!application || !profile || !hasAccess) {
        return (
             <DashboardLayout pageTitle="Akses Ditolak" menuConfig={menuConfig}>
                <Alert variant="destructive">
                    <AlertTitle>Akses Ditolak</AlertTitle>
                    <AlertDescription>Anda tidak memiliki izin untuk melihat interview kit ini.</AlertDescription>
                </Alert>
             </DashboardLayout>
        );
    }

    return (
        <DashboardLayout pageTitle="Interview Kit" menuConfig={menuConfig}>
            <div className="space-y-6">
                <Button variant="outline" size="sm" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Kembali
                </Button>
                
                <Card>
                    <CardHeader>
                        <div className="flex items-start gap-4">
                        <Avatar className="h-16 w-16 border">
                            <AvatarImage src={profile.photoUrl || `https://picsum.photos/seed/${application.candidateUid}/100/100`} alt={profile.fullName} data-ai-hint="profile avatar" />
                            <AvatarFallback className="text-xl">{getInitials(profile.fullName)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <CardTitle className="text-2xl">{profile.fullName}</CardTitle>
                            <CardDescription className="text-base flex items-center gap-2 mt-1">
                                <Briefcase className="h-4 w-4 text-muted-foreground" />
                                Melamar untuk: {application.jobPosition}
                            </CardDescription>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                <span className="flex items-center gap-2"><Mail className="h-4 w-4" /> {application.candidateEmail}</span>
                                <span className="flex items-center gap-2"><Phone className="h-4 w-4" /> {profile.phone}</span>
                            </div>
                        </div>
                        </div>
                    </CardHeader>
                </Card>

                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    <div className="lg:col-span-2 space-y-6">
                        <ProfileView profile={profile} />
                    </div>
                    <div className="lg:sticky lg:top-24 space-y-6">
                        <CandidateDocumentsCard application={application} onVerificationChange={mutateApplication}/>
                        <ApplicationNotes application={application} onNoteAdded={mutateApplication} />
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
