'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import type { Assessment, AssessmentSession } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AssessmentBootstrapClient } from './AssessmentBootstrapClient';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

function SubmissionsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export function AssessmentSubmissionsClient() {
  const firestore = useFirestore();

  const assessmentsQuery = useMemoFirebase(
    () => query(collection(firestore, 'assessments')),
    [firestore]
  );
  const { data: assessments, isLoading: isLoadingAssessments, error: assessmentError, mutate } = useCollection<Assessment>(assessmentsQuery);

  const sessionsQuery = useMemoFirebase(
    () => query(collection(firestore, 'assessment_sessions')),
    [firestore]
  );
  const { data: sessions, isLoading: isLoadingSessions, error: sessionError } = useCollection<AssessmentSession>(sessionsQuery);

  const submissionCounts = useMemo(() => {
    if (!sessions) return new Map<string, number>();
    return sessions.reduce((acc, session) => {
      acc.set(session.assessmentId, (acc.get(session.assessmentId) || 0) + 1);
      return acc;
    }, new Map<string, number>());
  }, [sessions]);

  const assessmentsWithCounts = useMemo(() => {
    if (!assessments) return [];
    return assessments.map(assessment => ({
      ...assessment,
      submissionCount: submissionCounts.get(assessment.id!) || 0,
    }));
  }, [assessments, submissionCounts]);
  
  const isLoading = isLoadingAssessments || isLoadingSessions;
  const error = assessmentError || sessionError;

  if (isLoading) {
    return <SubmissionsSkeleton />;
  }

  if (error) {
    return (
        <Alert variant="destructive">
            <AlertTitle>Error Loading Data</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
        </Alert>
    );
  }

  if (!assessments || assessments.length === 0) {
    return <AssessmentBootstrapClient onBootstrapSuccess={mutate} />;
  }
  
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Assessment Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total Submissions</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assessmentsWithCounts.map(assessment => (
            <TableRow key={assessment.id}>
              <TableCell className="font-medium">{assessment.name}</TableCell>
              <TableCell>
                <Badge variant={assessment.isActive ? 'default' : 'secondary'}>
                  {assessment.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  {assessment.submissionCount}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/hrd/assessments/${assessment.id}/submissions`}>
                    View Submissions
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
