
'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useDoc, useFirestore, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, collection, query, where } from 'firebase/firestore';
import type { JobApplication, Profile, NavigationSetting, Job, AssessmentSession } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Briefcase, Calendar, Mail, Phone, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_MENU_ITEMS, ALL_UNIQUE_MENU_ITEMS } from '@/lib/menu-config';
import { ProfileView } from '@/components/recruitment/ProfileView';
import { ApplicationStatusBadge, APPLICATION_STATUSES } from '@/components/recruitment/ApplicationStatusBadge';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { format } from 'date-fns';
import { ApplicationProgressStepper } from '@/components/recruitment/ApplicationProgressStepper';
import { Separator } from '@/components/ui/separator';
import { CandidateDocumentsCard } from '@/components/recruitment/CandidateDocumentsCard';
import { CandidateFitAnalysis } from '@/components/recruitment/CandidateFitAnalysis';

function ApplicationDetailSkeleton() {
  return <Skeleton className="h-[500px] w-full" />;
}

function StatusManager({ application }: { application: JobApplication }) {
  const [selectedStatus, setSelectedStatus] = useState(application.status);
  const [isUpdating, setIsUpdating] = useState(false);
  const firestore = useFirestore();
  const { toast } = useToast();

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const appRef = doc(firestore, 'applications', application.id!);
      await updateDocumentNonBlocking(appRef, {
        status: selectedStatus,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Success', description: 'Application status has been updated.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as JobApplication['status'])}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Update status" />
        </SelectTrigger>
        <SelectContent>
          {APPLICATION_STATUSES.map(status => (
            <SelectItem key={status} value={status} className="capitalize">{status}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={handleUpdate} disabled={selectedStatus === application.status || isUpdating}>
        {isUpdating ? 'Updating...' : 'Update'}
      </Button>
    </div>
  );
}

export default function ApplicationDetailPage() {
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const params = useParams();
  const router = useRouter();
  const applicationId = params.applicationId as string;

  const settingsDocRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'navigation_settings', userProfile.role) : null),
    [userProfile, firestore]
  );
  const { data: navSettings, isLoading: isLoadingSettings } = useDoc<NavigationSetting>(settingsDocRef);

  const applicationRef = useMemoFirebase(
    () => (applicationId ? doc(firestore, 'applications', applicationId) : null),
    [firestore, applicationId]
  );
  const { data: application, isLoading: isLoadingApp } = useDoc<JobApplication>(applicationRef);

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

  const assessmentSessionsQuery = useMemoFirebase(() => {
    if (!application) return null;
    return query(
      collection(firestore, 'assessment_sessions'),
      where('candidateUid', '==', application.candidateUid),
      where('status', '==', 'submitted')
    );
  }, [firestore, application]);
  const { data: assessmentSessions, isLoading: isLoadingSessions } = useCollection<AssessmentSession>(assessmentSessionsQuery);

  const latestAssessmentSession = useMemo(() => {
    if (!assessmentSessions || assessmentSessions.length === 0) return null;
    return [...assessmentSessions].sort((a, b) => (b.completedAt?.toMillis() || 0) - (a.completedAt?.toMillis() || 0))[0];
  }, [assessmentSessions]);


  const menuItems = useMemo(() => {
    const defaultItems = ALL_MENU_ITEMS[userProfile?.role as keyof typeof ALL_MENU_ITEMS] || [];
    if (isLoadingSettings) return defaultItems;
    if (navSettings) {
      return ALL_UNIQUE_MENU_ITEMS.filter(item => navSettings.visibleMenuItems.includes(item.label));
    }
    return defaultItems;
  }, [navSettings, isLoadingSettings, userProfile]);

  const isLoading = isLoadingApp || isLoadingProfile || isLoadingSettings || isLoadingJob || isLoadingSessions;

  if (!hasAccess) {
    return <DashboardLayout pageTitle="Loading..." menuItems={[]}><ApplicationDetailSkeleton /></DashboardLayout>;
  }

  return (
    <DashboardLayout pageTitle="Application Detail" menuItems={menuItems}>
      {isLoading ? (
        <ApplicationDetailSkeleton />
      ) : !application || !profile || !job ? (
        <p>Application, profile, or job details not found.</p>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to List
            </Button>
          </div>
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-16 w-16 border">
                     <AvatarImage src={`https://picsum.photos/seed/${application.candidateUid}/100/100`} alt={profile.fullName} data-ai-hint="profile avatar" />
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
                 {application.status !== 'rejected' && (
                  <ApplicationProgressStepper currentStatus={application.status} />
                 )}

                 {application.status === 'rejected' && (
                    <div className="p-4 rounded-md border border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-3">
                        <XCircle className="h-5 w-5" />
                        <p className="text-sm font-medium">This application was rejected.</p>
                    </div>
                 )}

                 <Separator />

                 <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div>
                        <h3 className="font-semibold text-lg">Applied for: {application.jobPosition}</h3>
                        <p className="flex items-center gap-2 text-muted-foreground"><Briefcase className="h-4 w-4" />{application.brandName} - {application.location}</p>
                    </div>
                    <StatusManager application={application} />
                 </div>
            </CardContent>
          </Card>
          <CandidateDocumentsCard application={application} />
          <CandidateFitAnalysis profile={profile} job={job} assessmentSession={latestAssessmentSession} />
          <ProfileView profile={profile} />
        </div>
      )}
    </DashboardLayout>
  );
}
