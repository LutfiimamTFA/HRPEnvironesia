'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, doc, query } from 'firebase/firestore';
import type { AssessmentSession, NavigationSetting } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { ALL_MENU_ITEMS, ALL_UNIQUE_MENU_ITEMS } from '@/lib/menu-config';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function AssessmentSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export default function AssessmentsPage() {
  const hasAccess = useRoleGuard(['super-admin', 'hrd']);
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  // Get Menu Items
  const settingsDocRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'navigation_settings', userProfile.role) : null),
    [userProfile, firestore]
  );
  const { data: navSettings, isLoading: isLoadingSettings } = useDoc<NavigationSetting>(settingsDocRef);
  const menuItems = useMemo(() => {
    const defaultItems = ALL_MENU_ITEMS[userProfile?.role as keyof typeof ALL_MENU_ITEMS] || [];
    if (isLoadingSettings) return defaultItems;
    if (navSettings) {
      return ALL_UNIQUE_MENU_ITEMS.filter(item => navSettings.visibleMenuItems.includes(item.label));
    }
    return defaultItems;
  }, [navSettings, isLoadingSettings, userProfile]);

  // Get Assessment Sessions
  const sessionsQuery = useMemoFirebase(
    () => query(collection(firestore, 'assessment_sessions')),
    [firestore]
  );
  const { data: sessions, isLoading: isLoadingSessions } = useCollection<AssessmentSession>(sessionsQuery);

  const isLoading = isLoadingSettings || isLoadingSessions;

  if (!hasAccess || isLoading) {
    return (
      <DashboardLayout pageTitle="Assessments" menuItems={menuItems}>
        <AssessmentSkeleton />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Assessment Results" menuItems={menuItems}>
      <Card>
        <CardHeader>
          <CardTitle>Candidate Submissions</CardTitle>
          <CardDescription>
            This is a list of all personality assessments submitted by candidates.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                {sessions && sessions.length > 0 ? (
                  sessions.map(session => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{session.candidateUid.substring(0, 12)}...</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{session.resultType || 'N/A'}</Badge>
                      </TableCell>
                      <TableCell>
                        {session.completedAt ? format(session.completedAt.toDate(), 'dd MMM yyyy') : '-'}
                      </TableCell>
                       <TableCell>
                        <Badge variant={session.status === 'submitted' ? 'default' : 'outline'}>{session.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                         <Button asChild variant="outline" size="sm">
                            <Link href="#">View</Link>
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
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}