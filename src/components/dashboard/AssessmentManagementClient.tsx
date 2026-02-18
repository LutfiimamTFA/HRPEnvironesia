'use client';

import { useMemo, useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Assessment } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

function AssessmentListSkeleton() {
  return <Skeleton className="h-24 w-full" />;
}

export function AssessmentManagementClient() {
  const firestore = useFirestore();

  const assessmentsQuery = useMemoFirebase(
    () => collection(firestore, 'assessments'),
    [firestore]
  );
  const { data: assessments, isLoading } = useCollection<Assessment>(assessmentsQuery);

  if (isLoading) {
    return <AssessmentListSkeleton />;
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
                <Badge variant={assessment.isActive ? 'default' : 'secondary'}>
                  {assessment.isActive ? 'Active' : 'Inactive'}
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
        <p className="text-muted-foreground text-center py-8">No assessments found. Run the seeder to create a default assessment.</p>
      )}
    </div>
  );
}
