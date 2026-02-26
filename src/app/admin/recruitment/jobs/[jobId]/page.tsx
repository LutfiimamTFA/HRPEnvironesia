'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import type { Job, JobApplication, UserProfile, Brand } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft } from 'lucide-react';
import { MENU_CONFIG } from '@/lib/menu-config';
import { ApplicantsPageClient } from '@/components/recruitment/ApplicantsPageClient';

function ApplicantsPageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-[240px]" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export default function RecruitmentApplicantsPage() {
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;
  
  const jobRef = useMemoFirebase(() => (jobId ? doc(firestore, 'jobs', jobId) : null), [firestore, jobId]);
  const { data: job, isLoading: isLoadingJob, mutate: mutateJob } = useDoc<Job>(jobRef);

  const applicationsQuery = useMemoFirebase(
    () => (jobId ? query(collection(firestore, 'applications'), where('jobId', '==', jobId)) : null),
    [firestore, jobId]
  );
  const { data: applications, isLoading: isLoadingApps, error } = useCollection<JobApplication>(applicationsQuery);

  const internalUsersQuery = useMemoFirebase(() =>
    query(
      collection(firestore, 'users'),
      where('role', 'in', ['hrd', 'manager', 'karyawan', 'super-admin']),
      where('isActive', '==', true)
    ),
    [firestore]
  );
  const { data: internalUsers, isLoading: isLoadingUsers } = useCollection<UserProfile>(internalUsersQuery);

  const brandsQuery = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(brandsQuery);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') {
      return MENU_CONFIG['hrd'];
    }
    return [];
  }, [userProfile]);
  
  const isLoading = isLoadingApps || isLoadingJob || isLoadingUsers || isLoadingBrands;

  if (!hasAccess || isLoading) {
    return (
      <DashboardLayout 
        pageTitle="Loading Applicants..." 
        menuConfig={menuConfig}
      >
        <ApplicantsPageSkeleton />
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout 
        pageTitle="Error" 
        menuConfig={menuConfig}
      >
        <Alert variant="destructive">
          <AlertTitle>Error Loading Applications</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
        pageTitle={`Applicants for: ${job?.position || '...'}`} 
        menuConfig={menuConfig}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/recruitment')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Job List
            </Button>
        </div>
        
        <ApplicantsPageClient 
          applications={applications || []} 
          job={job}
          onJobUpdate={mutateJob}
          allUsers={internalUsers || []}
          allBrands={brands || []}
        />
      </div>
    </DashboardLayout>
  );
}
