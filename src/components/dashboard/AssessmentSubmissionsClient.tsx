'use client';

import { useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import type { AssessmentSession, UserProfile } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

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

  // Get All Users to create a name map
  const usersQuery = useMemoFirebase(
    () => collection(firestore, 'users'),
    [firestore]
  );
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersQuery);

  // Get All Assessment Sessions
  const sessionsQuery = useMemoFirebase(
    () => query(collection(firestore, 'assessment_sessions')),
    [firestore]
  );
  const { data: sessions, isLoading: isLoadingSessions } = useCollection<AssessmentSession>(sessionsQuery);

  // Create a map from UID to Full Name
  const userMap = useMemo(() => {
    if (!users) return new Map<string, string>();
    return new Map(users.map(user => [user.uid, user.fullName]));
  }, [users]);

  // Join sessions with user names and sort them
  const sessionsWithNames = useMemo(() => {
    if (!sessions) return [];
    return sessions.map(session => ({
      ...session,
      candidateName: userMap.get(session.candidateUid) || session.candidateName || session.candidateUid,
    })).sort((a, b) => {
      const timeA = a.completedAt?.toMillis() || a.updatedAt.toMillis();
      const timeB = b.completedAt?.toMillis() || b.updatedAt.toMillis();
      return timeB - timeA;
    });
  }, [sessions, userMap]);

  const isLoading = isLoadingSessions || isLoadingUsers;

  if (isLoading) {
    return <SubmissionsSkeleton />;
  }
  
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Candidate</TableHead>
            <TableHead>Result Type</TableHead>
            <TableHead>Completed On</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessionsWithNames && sessionsWithNames.length > 0 ? (
            sessionsWithNames.map(session => (
              <TableRow key={session.id}>
                <TableCell className="font-medium">{session.candidateName}</TableCell>
                <TableCell>
                  {session.result?.discType ? <Badge variant="secondary">{session.result.discType}</Badge> : '-'}
                </TableCell>
                <TableCell>
                  {session.completedAt ? format(session.completedAt.toDate(), 'dd MMM yyyy') : '-'}
                </TableCell>
                  <TableCell>
                  <Badge variant={session.status === 'submitted' ? 'default' : 'outline'}>{session.status}</Badge>
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
              <TableCell colSpan={5} className="h-24 text-center">
                No assessment sessions found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
