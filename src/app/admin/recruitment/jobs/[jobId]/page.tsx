'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import type { Job, JobApplication, NavigationSetting } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Eye, ArrowLeft } from 'lucide-react';
import { MENU_CONFIG } from '@/lib/menu-config';
import { ApplicationStatusBadge } from '@/components/recruitment/ApplicationStatusBadge';

function ApplicantsTableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-[240px]" />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {[...Array(5)].map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(3)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
  const { data: job, isLoading: isLoadingJob } = useDoc<Job>(jobRef);

  const applicationsQuery = useMemoFirebase(
    () => (jobId ? query(collection(firestore, 'applications'), where('jobId', '==', jobId)) : null),
    [firestore, jobId]
  );
  const { data: applications, isLoading: isLoadingApps, error } = useCollection<JobApplication>(applicationsQuery);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') return MENU_CONFIG['hrd-recruitment'];
    return [];
  }, [userProfile]);

  const sortedApplications = useMemo(() => {
    if (!applications) return [];
    return [...applications].sort((a, b) => {
      const timeA = a.submittedAt?.toMillis() || a.createdAt.toMillis();
      const timeB = b.submittedAt?.toMillis() || b.createdAt.toMillis();
      return timeB - timeA;
    });
  }, [applications]);
  
  const isLoading = isLoadingApps || isLoadingJob;

  if (!hasAccess || isLoading) {
    return (
      <DashboardLayout pageTitle="Loading Applicants..." menuConfig={menuConfig}>
        <ApplicantsTableSkeleton />
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout pageTitle="Error" menuConfig={menuConfig}>
        <Alert variant="destructive">
          <AlertTitle>Error Loading Applications</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle={`Applicants for: ${job?.position || '...'}`} menuConfig={menuConfig}>
      <div className="space-y-4">
        <div className="flex items-start justify-between">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/recruitment')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to All Jobs
            </Button>
        </div>
        
        <div className="rounded-lg border">
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {sortedApplications.length > 0 ? (
                sortedApplications.map(app => (
                    <TableRow key={app.id}>
                    <TableCell className="font-medium">{app.candidateName}</TableCell>
                    <TableCell>{app.candidateEmail}</TableCell>
                    <TableCell>{app.submittedAt ? format(app.submittedAt.toDate(), 'dd MMM yyyy') : '-'}</TableCell>
                    <TableCell><ApplicationStatusBadge status={app.status} /></TableCell>
                    <TableCell className="text-right">
                        <Button asChild variant="ghost" size="icon">
                        <Link href={`/admin/recruitment/${app.id}`}>
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">View Application</span>
                        </Link>
                        </Button>
                    </TableCell>
                    </TableRow>
                ))
                ) : (
                <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                    No applicants for this job yet.
                    </TableCell>
                </TableRow>
                )}
            </TableBody>
            </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
