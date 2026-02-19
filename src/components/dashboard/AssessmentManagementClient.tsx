'use client';

import { useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Assessment, AssessmentConfig } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AssessmentBootstrapClient } from './AssessmentBootstrapClient';
import { AssessmentSettingsClient } from './AssessmentSettingsClient';
import { Separator } from '../ui/separator';

function AssessmentManagementSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function AssessmentManagementClient() {
  const firestore = useFirestore();

  const assessmentsQuery = useMemoFirebase(
    () => collection(firestore, 'assessments'),
    [firestore]
  );
  const { data: assessments, isLoading, error, mutate } = useCollection<Assessment>(assessmentsQuery);

  const configQuery = useMemoFirebase(
    () => collection(firestore, 'assessment_config'),
    [firestore]
  );
  const { data: configs, isLoading: isLoadingConfig, error: configError } = useCollection<AssessmentConfig>(configQuery);
  const assessmentConfig = configs?.[0];

  const isLoadingData = isLoading || isLoadingConfig;
  const dataError = error || configError;
  const personalityTest = assessments?.find(a => a.id === 'default');

  if (isLoadingData) {
    return <AssessmentManagementSkeleton />;
  }

  if (dataError) {
    return (
        <Alert variant="destructive">
            <AlertTitle>Error Loading Data</AlertTitle>
            <AlertDescription>
                <p>There was an issue fetching assessment data. This could be a network issue or a problem with Firestore permissions.</p>
                <p className="mt-2 text-xs">Error: {dataError.message}</p>
            </AlertDescription>
        </Alert>
    );
  }

  if (!personalityTest) {
    return <AssessmentBootstrapClient onBootstrapSuccess={mutate} />;
  }

  return (
    <div className="space-y-6">
       <Card>
          <CardHeader>
              <CardTitle>Tes Kepribadian Internal</CardTitle>
              <CardDescription>
                  Ini adalah tes kepribadian baku yang terdiri dari 2 bagian (Big Five & DISC). Kandidat akan mengerjakan subset pertanyaan yang dipilih secara acak dari bank soal.
              </CardDescription>
          </CardHeader>
          <CardContent>
               <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild>
                  <Link href={`/admin/hrd/assessments/default/submissions`}>Lihat Hasil</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/admin/hrd/assessments/default`}>Kelola Bank Soal</Link>
                </Button>
              </div>
          </CardContent>
       </Card>

       <Separator />
       
       <AssessmentSettingsClient config={assessmentConfig} />
    </div>
  );
}
