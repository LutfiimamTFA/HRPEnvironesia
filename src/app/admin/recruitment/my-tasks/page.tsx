'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { JobApplication, JobApplicationStatus, Job } from '@/lib/types';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ArrowRight, Briefcase, Calendar, CheckCircle2, Clock, User } from 'lucide-react';
import Link from 'next/link';
import { ApplicationStatusBadge } from '@/components/recruitment/ApplicationStatusBadge';

export default function MyRecruitmentTasksPage() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  // 1. Get Jobs where user is part of the Recruitment Team
  const assignedJobsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, 'jobs'),
      where('assignedUserIds', 'array-contains', userProfile.uid)
    );
  }, [firestore, userProfile?.uid]);

  const { data: assignedJobs } = useCollection<Job>(assignedJobsQuery);
  const assignedJobIds = useMemo(() => assignedJobs?.map(j => j.id).filter(Boolean) as string[] || [], [assignedJobs]);

  // 2. Query Applications based on multiple criteria:
  // - User is an explicit reviewer (array-contains on internalReviewConfig.assignedReviewerUids)
  // - User is a panelist (array-contains on allPanelistIds)
  // - User is part of the Job's team (jobId is in assignedJobIds) - Handled by client-side merge or separate query

  const directAssignmentQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, 'applications'),
      where('internalReviewConfig.assignedReviewerUids', 'array-contains', userProfile.uid)
    );
  }, [firestore, userProfile?.uid]);

  const panelistAssignmentQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, 'applications'),
      where('allPanelistIds', 'array-contains', userProfile.uid)
    );
  }, [firestore, userProfile?.uid]);

  // Applications from Job-level assignment (only if we have job IDs)
  const jobLevelAppsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid || assignedJobIds.length === 0) return null;
    // Firestore 'in' query supports up to 30 IDs
    return query(
      collection(firestore, 'applications'),
      where('jobId', 'in', assignedJobIds.slice(0, 30))
    );
  }, [firestore, userProfile?.uid, assignedJobIds]);

  const { data: directApps, isLoading: loadingDirect } = useCollection<JobApplication>(directAssignmentQuery);
  const { data: panelistApps, isLoading: loadingPanelist } = useCollection(panelistAssignmentQuery);
  const { data: jobApps, isLoading: loadingJobLevel } = useCollection(jobLevelAppsQuery);

  const applications = useMemo(() => {
    const all = [...(directApps || []), ...(panelistApps || []), ...(jobApps || [])];
    
    // Deduplicate by ID
    const unique = Array.from(new Map(all.map(a => [a.id, a])).values());

    // Client-side sort by updatedAt
    return unique.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis?.() || (a.updatedAt as any)?.seconds || 0;
        const timeB = b.updatedAt?.toMillis?.() || (b.updatedAt as any)?.seconds || 0;
        return timeB - timeA;
    });
  }, [directApps, panelistApps, jobApps]);

  const isLoading = loadingDirect || (assignedJobIds.length > 0 && loadingJobLevel);

  if (!userProfile) return null;

  return (
    <DashboardLayout pageTitle="Tugas Rekrutmen Saya" menuConfig={menuConfig}>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Tugas Rekrutmen Saya</h1>
          <p className="text-muted-foreground">Daftar kandidat yang ditugaskan kepada Anda untuk dilakukan evaluasi internal.</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !applications || applications.length === 0 ? (
          <Card className="border-dashed py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <div className="bg-muted p-4 rounded-full mb-4">
                <Briefcase className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <h3 className="text-xl font-semibold">Tidak Ada Tugas Review</h3>
              <p className="text-muted-foreground max-w-sm mx-auto mt-2 text-sm">
                Saat ini belum ada kandidat yang ditugaskan kepada Anda untuk evaluasi internal. Tugas akan muncul di sini jika HRD menambahkan Anda sebagai reviewer.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden border-none shadow-xl rounded-[2rem] bg-card/60 backdrop-blur-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-bold">Kandidat</TableHead>
                  <TableHead className="font-bold">Posisi</TableHead>
                  <TableHead className="font-bold">Assign Date</TableHead>
                  <TableHead className="font-bold">Status Saya</TableHead>
                  <TableHead className="font-bold">Review Tim</TableHead>
                  <TableHead className="text-right font-bold">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => (
                  <TableRow key={app.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                          {app.candidateName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold">{app.candidateName}</p>
                          <ApplicationStatusBadge status={app.status} className="text-[10px] h-4" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{app.jobPosition}</p>
                      <p className="text-xs text-muted-foreground">{app.brandName}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {app.internalReviewConfig?.lastUpdatedAt ? format(app.internalReviewConfig.lastUpdatedAt.toDate(), 'dd MMM yyyy') : '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                       {app.internalReviewSummary?.submittedReviewerUids?.includes(userProfile.uid) ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1.5 py-1">
                            <CheckCircle2 className="h-3 w-3" /> Sudah Review
                          </Badge>
                       ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1.5 py-1">
                            <Clock className="h-3 w-3" /> Menunggu Review
                          </Badge>
                       )}
                    </TableCell>
                    <TableCell>
                       <div className="flex items-center gap-2">
                          <p className="text-sm font-bold">{app.internalReviewSummary?.totalSubmitted || 0} / {app.internalReviewSummary?.totalAssigned || 0}</p>
                          <p className="text-xs text-muted-foreground">Komentar</p>
                       </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild className="rounded-xl group">
                        <Link href={`/admin/recruitment/applications/${app.id}`}>
                          Buka Detail <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
