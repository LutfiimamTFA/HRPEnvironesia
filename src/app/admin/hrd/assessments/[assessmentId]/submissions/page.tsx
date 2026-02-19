'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import type { Assessment, AssessmentSession, NavigationSetting } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft } from 'lucide-react';
import { ALL_MENU_ITEMS, ALL_UNIQUE_MENU_ITEMS } from '@/lib/menu-config';
import { format } from 'date-fns';
import { AssessmentStatusBadge } from '@/components/dashboard/AssessmentStatusBadge';

function SubmissionsTableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-[240px]" />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {[...Array(6)].map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(3)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(6)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function AssessmentSubmissionsPage() {
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.assessmentId as string;

  const settingsDocRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'navigation_settings', userProfile.role) : null),
    [userProfile, firestore]
  );
  const { data: navSettings, isLoading: isLoadingSettings } = useDoc<NavigationSetting>(settingsDocRef);
  
  const assessmentRef = useMemoFirebase(() => (assessmentId ? doc(firestore, 'assessments', assessmentId) : null), [firestore, assessmentId]);
  const { data: assessment, isLoading: isLoadingAssessment } = useDoc<Assessment>(assessmentRef);

  const sessionsQuery = useMemoFirebase(
    () => (assessmentId ? query(collection(firestore, 'assessment_sessions'), where('assessmentId', '==', assessmentId)) : null),
    [firestore, assessmentId]
  );
  const { data: sessions, isLoading: isLoadingSessions, error } = useCollection<AssessmentSession>(sessionsQuery);

  const menuItems = useMemo(() => {
    const defaultItems = ALL_MENU_ITEMS[userProfile?.role as keyof typeof ALL_MENU_ITEMS] || [];
    if (isLoadingSettings) return defaultItems;
    if (navSettings) {
      return ALL_UNIQUE_MENU_ITEMS.filter(item => navSettings.visibleMenuItems.includes(item.label));
    }
    return defaultItems;
  }, [navSettings, isLoadingSettings, userProfile]);

  const sortedSessions = useMemo(() => {
    if (!sessions) return [];
    return [...sessions].sort((a, b) => {
      const timeA = a.completedAt?.toMillis() || a.updatedAt.toMillis();
      const timeB = b.completedAt?.toMillis() || b.updatedAt.toMillis();
      return timeB - timeA;
    });
  }, [sessions]);
  
  const isLoading = isLoadingSessions || isLoadingSettings || isLoadingAssessment;

  if (!hasAccess || isLoading) {
    return (
      <DashboardLayout pageTitle="Loading Submissions..." menuItems={menuItems}>
        <SubmissionsTableSkeleton />
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout pageTitle="Error" menuItems={menuItems}>
        <Alert variant="destructive">
          <AlertTitle>Error Loading Submissions</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle={`Submissions for: ${assessment?.name || '...'}`} menuItems={menuItems}>
      <div className="space-y-4">
        <div className="flex items-start justify-between">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/hrd/assessments')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Assessment Tools
            </Button>
        </div>
        
        <div className="rounded-lg border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Candidate</TableHead>
                        <TableHead>Job Position</TableHead>
                        <TableHead>Result Type</TableHead>
                        <TableHead>Completed On</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                {sortedSessions && sortedSessions.length > 0 ? (
                    sortedSessions.map(session => (
                    <TableRow key={session.id}>
                        <TableCell className="font-medium">
                          {session.candidateName ?? session.candidateEmail ?? session.candidateUid}
                        </TableCell>
                        <TableCell>
                          {session.jobPosition || '-'}
                          {session.brandName && <span className="text-xs text-muted-foreground block">{session.brandName}</span>}
                        </TableCell>
                        <TableCell>
                          {session.result?.discType ? <AssessmentStatusBadge status="result" label={session.result.discType} /> : '-'}
                        </TableCell>
                        <TableCell>
                          {session.completedAt ? format(session.completedAt.toDate(), 'dd MMM yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                            <AssessmentStatusBadge status={session.hrdDecision || session.status} />
                        </TableCell>
                        <TableCell className="text-right">
                            <Button asChild variant="outline" size="sm" disabled={session.status !== 'submitted'}>
                            <Link href={`/admin/hrd/assessments/result/${session.id}`}>View</Link>
                            </Button>
                        </TableCell>
                    </TableRow>
                    ))
                ) : (
                    <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                        No submissions for this assessment yet.
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
