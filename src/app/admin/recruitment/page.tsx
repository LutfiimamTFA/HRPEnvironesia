'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Job, JobApplication } from '@/lib/types';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Eye } from 'lucide-react';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Badge } from '@/components/ui/badge';

function JobListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {[...Array(5)].map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
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

export default function RecruitmentJobSelectionPage() {
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const jobsQuery = useMemoFirebase(() => collection(firestore, 'jobs'), [firestore]);
  const { data: jobs, isLoading: isLoadingJobs, error: jobsError } = useCollection<Job>(jobsQuery);

  const appsQuery = useMemoFirebase(() => collection(firestore, 'applications'), [firestore]);
  const { data: applications, isLoading: isLoadingApps, error: appsError } = useCollection<JobApplication>(appsQuery);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile.role === 'hrd') return MENU_CONFIG['hrd'];
    return [];
  }, [userProfile]);

  const applicantCounts = useMemo(() => {
    if (!applications) return new Map<string, number>();
    return applications.reduce((acc, app) => {
      acc.set(app.jobId, (acc.get(app.jobId) || 0) + 1);
      return acc;
    }, new Map<string, number>());
  }, [applications]);

  const jobsWithCounts = useMemo(() => {
    if (!jobs) return [];
    return jobs.map(job => ({
      ...job,
      applicantCount: applicantCounts.get(job.id!) || 0,
    })).sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  }, [jobs, applicantCounts]);

  const isLoading = isLoadingJobs || isLoadingApps;
  const error = jobsError || appsError;

  if (!hasAccess || isLoading) {
    return (
      <DashboardLayout pageTitle="Recruitment: Select Job" menuConfig={menuConfig}>
        <JobListSkeleton />
      </DashboardLayout>
    );
  }
  
  if (error) {
    return (
        <DashboardLayout pageTitle="Recruitment: Select Job" menuConfig={menuConfig}>
            <Alert variant="destructive">
                <AlertTitle>Error Loading Data</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
            </Alert>
        </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Recruitment: Select Job Posting" menuConfig={menuConfig}>
        <div className="rounded-lg border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Position</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Total Applicants</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {jobsWithCounts.length > 0 ? (
                        jobsWithCounts.map(job => (
                            <TableRow key={job.id}>
                                <TableCell className="font-medium">{job.position}</TableCell>
                                <TableCell>{job.brandName}</TableCell>
                                <TableCell><Badge variant={job.publishStatus === 'published' ? 'default' : 'secondary'}>{job.publishStatus}</Badge></TableCell>
                                <TableCell>{job.applicantCount}</TableCell>
                                <TableCell className="text-right">
                                    <Button asChild variant="outline" size="sm">
                                        <Link href={`/admin/recruitment/jobs/${job.id}`}>
                                            <Eye className="mr-2 h-4 w-4" />
                                            View Applicants
                                        </Link>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center">No jobs found. Create one in "Job Postings".</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    </DashboardLayout>
  );
}
