'use client';

import { useMemo, useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Assessment } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AssessmentBootstrapClient } from './AssessmentBootstrapClient';

function AssessmentListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function AssessmentManagementClient() {
  const firestore = useFirestore();

  const assessmentsQuery = useMemoFirebase(
    () => collection(firestore, 'assessments'),
    [firestore]
  );
  // Using mutate to allow child components to trigger a re-fetch
  const { data: assessments, isLoading, error, mutate } = useCollection<Assessment>(assessmentsQuery);

  if (isLoading) {
    return <AssessmentListSkeleton />;
  }

  if (error) {
    return (
        <Alert variant="destructive">
            <AlertTitle>Error Loading Assessments</AlertTitle>
            <AlertDescription>
                <p>There was an issue fetching assessment data. This could be a network issue or a problem with Firestore permissions.</p>
                <p className="mt-2 text-xs">Error: {error.message}</p>
            </AlertDescription>
        </Alert>
    );
  }

  return (
    <div className="space-y-4">
       <CardDescription>
        Manage internal assessments. You can edit assessment details and manage the question bank for each.
      </CardDescription>
      {assessments && assessments.length > 0 ? (
        assessments.map(assessment => (
          <Card key={assessment.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{assessment.name}</CardTitle>
                  <CardDescription>Version {assessment.version}</CardDescription>
                </div>
                 <Badge variant={assessment.isActive && assessment.publishStatus === 'published' ? 'default' : 'secondary'}>
                  {assessment.isActive && assessment.publishStatus === 'published' ? 'Active & Published' : 'Inactive/Draft'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button asChild>
                  <Link href={`/admin/hrd/assessments/${assessment.id}`}>Manage Questions</Link>
                </Button>
                 <Button variant="outline" disabled>Edit Details</Button>
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <AssessmentBootstrapClient onBootstrapSuccess={mutate} />
      )}
    </div>
  );
}
