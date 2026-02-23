
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
import { Mail, Phone, XCircle, Calendar, Users, RefreshCw, X, MessageSquare, AlertTriangle } from 'lucide-react';
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
import { ScheduleInterviewDialog } from '@/components/recruitment/ScheduleInterviewDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { id as idLocale } from 'date-fns/locale';

function ApplicationDetailSkeleton() {
  return <Skeleton className="h-[500px] w-full" />;
}

function InterviewManagement({ application, onUpdate }: { application: JobApplication; onUpdate: () => void; }) {
  const [isScheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [interviewToReschedule, setInterviewToReschedule] = useState<ApplicationInterview | null>(null);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const handleOpenScheduleDialog = (interview: ApplicationInterview | null = null) => {
    setInterviewToReschedule(interview);
    setScheduleDialogOpen(true);
  };

  const handleConfirmSchedule = async (data: ScheduleInterviewData) => {
    if (!application || !userProfile) return false;

    const newInterviews = [...(application.interviews || [])];
    const newTimeline = [...(application.timeline || [])];
    
    // If rescheduling, mark the old one as canceled
    if (interviewToReschedule) {
      const index = newInterviews.findIndex(iv => iv.startAt === interviewToReschedule.startAt);
      if (index !== -1) {
        newInterviews[index] = { ...newInterviews[index], status: 'canceled' };
      }
      newTimeline.push({
        type: 'status_changed',
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: { note: 'Wawancara dijadwalkan ulang oleh HRD.' },
      });
    }

    const newInterview: ApplicationInterview = {
      startAt: Timestamp.fromDate(data.dateTime),
      endAt: Timestamp.fromDate(new Date(data.dateTime.getTime() + (data.duration || 30) * 60000)),
      interviewerIds: [],
      interviewerNames: data.interviewerNames.split(',').map(s => s.trim()),
      status: 'scheduled',
      meetingLink: data.meetingLink,
      notes: data.notes,
    };
    newInterviews.push(newInterview);
    
    newTimeline.push({
        type: 'interview_scheduled',
        at: Timestamp.now(),
        by: userProfile.uid,
        meta: { interviewDate: Timestamp.fromDate(data.dateTime) }
    });

    try {
      await updateDoc(doc(firestore, 'applications', application.id!), { interviews: newInterviews, timeline: newTimeline });
      onUpdate();
      toast({ title: 'Wawancara Dijadwalkan' });
      return true;
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal Menjadwalkan', description: error.message });
      return false;
    }
  };

  const handleDenyReschedule = async (interviewToDeny: ApplicationInterview) => {
    if (!application) return;
    
    const newInterviews = (application.interviews || []).map(iv => {
        if (iv.startAt === interviewToDeny.startAt) {
            return { ...iv, status: 'scheduled' as const, rescheduleReason: '' };
        }
        return iv;
    });

    try {
        await updateDoc(doc(firestore, 'applications', application.id!), { interviews: newInterviews });
        onUpdate();
        toast({ title: 'Permintaan Ditolak', description: 'Status wawancara dikembalikan ke "Terjadwal".' });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Gagal Menolak', description: error.message });
    }
  };
  
  if (application.status !== 'interview') {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <CardTitle>Manajemen Wawancara</CardTitle>
             <Button size="sm" onClick={() => handleOpenScheduleDialog()}>Jadwalkan Wawancara Baru</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!application.interviews || application.interviews.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Belum ada wawancara yang dijadwalkan.</p>
        ) : (
            <div className="space-y-4">
                {application.interviews.map((iv, index) => (
                    <div key={index} className="p-4 border rounded-lg space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="font-semibold">{format(iv.startAt.toDate(), 'eeee, dd MMM yyyy, HH:mm', { locale: idLocale })}</p>
                                <p className="text-sm text-muted-foreground">Pewawancara: {iv.interviewerNames.join(', ')}</p>
                            </div>
                            <Badge variant={iv.status === 'scheduled' ? 'default' : 'secondary'} className="capitalize">{iv.status.replace('_', ' ')}</Badge>
                        </div>
                        {iv.status === 'reschedule_requested' && iv.rescheduleReason && (
                             <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Permintaan Jadwal Ulang</AlertTitle>
                                <AlertDescription className="italic">"{iv.rescheduleReason}"</AlertDescription>
                                <div className="flex gap-2 mt-3">
                                    <Button size="sm" onClick={() => handleOpenScheduleDialog(iv)}>Jadwalkan Ulang</Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleDenyReschedule(iv)}>Tolak Permintaan</Button>
                                </div>
                            </Alert>
                        )}
                    </div>
                ))}
            </div>
        )}
      </CardContent>
       <ScheduleInterviewDialog
        open={isScheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        onConfirm={handleConfirmSchedule}
      />
    </Card>
  );
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
        at: Timestamp.now(),
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
    
    if (newStage === 'personality_test' && !application.personalityTestAssignedAt) {
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

  useEffect(() => {
    const autoScreening = async () => {
      if (isLoadingApp || !application || !userProfile || application.status !== 'submitted' || hasTriggeredAutoScreen) {
        return;
      }
      setHasTriggeredAutoScreen(true);
      
      const timelineEvent: ApplicationTimelineEvent = {
        type: 'stage_changed',
        at: Timestamp.now(),
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
        mutateApplication(); 
        toast({
          title: 'Lamaran Discreening',
          description: `Status lamaran ini secara otomatis diperbarui menjadi "Screening".`,
        });
      } catch (error) {
        console.error("Failed to auto-update status to screening:", error);
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
                <InterviewManagement application={application} onUpdate={mutateApplication} />
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
