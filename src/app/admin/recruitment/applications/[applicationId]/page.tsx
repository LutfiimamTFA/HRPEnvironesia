'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useFirestore, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, updateDoc, Timestamp } from 'firebase/firestore';
import type { JobApplication, Profile, Job, ApplicationTimelineEvent, ApplicationInterview } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, Phone, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MENU_CONFIG } from '@/lib/menu-config';
import { ProfileView } from '@/components/recruitment/ProfileView';
import { ApplicationStatusBadge, statusDisplayLabels } from '@/components/recruitment/ApplicationStatusBadge';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { format } from 'date-fns';
import { ApplicationProgressStepper } from '@/components/recruitment/ApplicationProgressStepper';
import { CandidateDocumentsCard } from '@/components/recruitment/CandidateDocumentsCard';
import { CandidateFitAnalysis } from '@/components/recruitment/CandidateFitAnalysis';
import { ApplicationActionBar } from '@/components/recruitment/ApplicationActionBar';
import { ApplicationNotes } from '@/components/recruitment/ApplicationNotes';
import type { ScheduleInterviewData } from '@/components/recruitment/ScheduleInterviewDialog';


function ApplicationDetailSkeleton() {
  return <Skeleton className="h-[500px] w-full" />;
}

export default function ApplicationDetailPage() {
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const params = useParams();
  const { toast } = useToast();
  const applicationId = params.applicationId as string;
  const [hasTriggeredAutoScreen, setHasTriggeredAutoScreen] = useState(false);

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
  
  const jobRef = useMemoFirebase(
    () => (application ? doc(firestore, 'jobs', application.jobId) : null),
    [firestore, application]
  );
  const { data: job, isLoading: isLoadingJob } = useDoc<Job>(jobRef);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') {
      return MENU_CONFIG['hrd'];
    }
    return [];
  }, [userProfile]);

  const handleStageChange = async (newStage: JobApplication['status'], reason: string) => {
    if (!application || !userProfile) return false;

    const timelineEvent: ApplicationTimelineEvent = {
        type: 'stage_changed',
        at: serverTimestamp() as any,
        by: userProfile.uid,
        meta: {
            from: application.status,
            to: newStage,
            note: reason,
        }
    };
    
    const updatePayload: any = {
        status: newStage,
        updatedAt: serverTimestamp(),
        timeline: [
            ...(application.timeline || []),
            timelineEvent
        ]
    };
    
    if (newStage === 'tes_kepribadian' && !application.personalityTestAssignedAt) {
      updatePayload.personalityTestAssignedAt = serverTimestamp();
    }

    try {
        await updateDoc(applicationRef!, updatePayload);
        mutateApplication(); // Re-fetch data
        toast({ title: 'Status Diperbarui', description: `Kandidat dipindahkan ke tahap "${statusDisplayLabels[newStage]}".` });
        return true;
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Gagal Memperbarui', description: error.message });
        return false;
    }
  };

  const handleScheduleInterview = async (data: ScheduleInterviewData): Promise<boolean> => {
    if (!application || !userProfile) return false;

    const interviewEvent: ApplicationTimelineEvent = {
      type: 'interview_scheduled',
      at: serverTimestamp() as any,
      by: userProfile.uid,
      meta: {
        from: application.status,
        to: 'interview',
        note: data.notes,
        interviewType: data.type,
        interviewDate: Timestamp.fromDate(data.dateTime),
        meetingLink: data.meetingLink,
      },
    };

    const newInterview: ApplicationInterview = {
      type: data.type,
      dateTime: Timestamp.fromDate(data.dateTime),
      interviewerIds: [], // placeholder for future functionality
      interviewerNames: data.interviewerNames.split(',').map(s => s.trim()),
      status: 'scheduled',
      meetingLink: data.meetingLink,
      notes: data.notes,
    };

    const updatePayload = {
      status: 'interview' as JobApplication['status'],
      updatedAt: serverTimestamp(),
      timeline: [...(application.timeline || []), interviewEvent],
      interviews: [...(application.interviews || []), newInterview],
    };

    try {
      await updateDoc(applicationRef!, updatePayload);
      mutateApplication();
      toast({ title: 'Wawancara Dijadwalkan', description: `Kandidat telah dipindahkan ke tahap Wawancara.` });
      return true;
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal Menjadwalkan', description: error.message });
      return false;
    }
  };


  useEffect(() => {
    const autoScreening = async () => {
      // Only run if data is loaded, user exists, status is 'submitted', and it hasn't run before.
      if (isLoadingApp || !application || !userProfile || application.status !== 'submitted' || hasTriggeredAutoScreen) {
        return;
      }
      setHasTriggeredAutoScreen(true); // Prevent re-triggering

      const timelineEvent: ApplicationTimelineEvent = {
        type: 'stage_changed',
        at: serverTimestamp() as any,
        by: userProfile.uid,
        meta: {
          from: 'submitted',
          to: 'screening',
          note: 'Application automatically moved to screening upon HR review.',
        },
      };

      const updatePayload = {
        status: 'screening',
        updatedAt: serverTimestamp(),
        timeline: [...(application.timeline || []), timelineEvent],
      };

      try {
        await updateDocumentNonBlocking(applicationRef!, updatePayload);
        mutateApplication(); // Refresh the UI with new status
        toast({
          title: 'Lamaran Discreening',
          description: `Status lamaran ini secara otomatis diperbarui menjadi "Screening".`,
        });
      } catch (error) {
        console.error("Failed to auto-update status to screening:", error);
        // We don't show a toast for this background failure to avoid interrupting the user.
      }
    };

    autoScreening();
  }, [application, isLoadingApp, userProfile, hasTriggeredAutoScreen, applicationRef, mutateApplication, toast]);


  const isLoading = isLoadingApp || isLoadingProfile || isLoadingJob;

  if (!hasAccess) {
    return <DashboardLayout pageTitle="Loading..." menuConfig={[]}><ApplicationDetailSkeleton /></DashboardLayout>;
  }

  return (
    <DashboardLayout 
        pageTitle="Application Detail" 
        menuConfig={menuConfig}
    >
      {isLoading ? (
        <ApplicationDetailSkeleton />
      ) : !application || !profile || !job ? (
        <p>Application, profile, or job details not found.</p>
      ) : (
        <>
        <div className="space-y-6">
          <ApplicationActionBar 
            application={application} 
            onStageChange={handleStageChange}
            onScheduleInterview={handleScheduleInterview}
          />
          
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-16 w-16 border">
                     <AvatarImage src={profile.photoUrl || `https://picsum.photos/seed/${application.candidateUid}/100/100`} alt={profile.fullName} data-ai-hint="profile avatar" />
                     <AvatarFallback className="text-xl">{getInitials(profile.fullName)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-2xl">{profile.fullName}</CardTitle>
                    <CardDescription className="text-base">{profile.nickname}</CardDescription>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-2"><Mail className="h-4 w-4" /> {application.candidateEmail}</span>
                        <span className="flex items-center gap-2"><Phone className="h-4 w-4" /> {profile.phone}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <ApplicationStatusBadge status={application.status} className="text-base px-4 py-1" />
                     {application.submittedAt && <p className="text-sm text-muted-foreground">Applied on {format(application.submittedAt.toDate(), 'dd MMM yyyy')}</p>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="border-t pt-6 space-y-6">
                <h3 className="font-semibold text-lg">Applied for: {application.jobPosition}</h3>
                 {application.status !== 'rejected' ? (
                  <ApplicationProgressStepper currentStatus={application.status} />
                 ) : (
                    <div className="p-4 rounded-md border border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-3">
                        <XCircle className="h-5 w-5" />
                        <p className="text-sm font-medium">This application was rejected.</p>
                    </div>
                 )}
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
                <CandidateFitAnalysis profile={profile} job={job} application={application}/>
                <ProfileView profile={profile} />
            </div>
            <div className="lg:sticky lg:top-24 space-y-6">
                <CandidateDocumentsCard application={application} onVerificationChange={mutateApplication}/>
                <ApplicationNotes application={application} onNoteAdded={mutateApplication} />
            </div>
          </div>
        </div>
        </>
      )}
    </DashboardLayout>
  );
}
