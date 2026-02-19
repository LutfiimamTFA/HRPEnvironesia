'use client';

import { useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import type { Assessment, AssessmentConfig, AssessmentTemplate } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AssessmentBootstrapClient } from './AssessmentBootstrapClient';
import { AssessmentSettingsClient } from './AssessmentSettingsClient';
import { Separator } from '../ui/separator';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { Loader2, Trash2 } from 'lucide-react';

function AssessmentManagementSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function AssessmentManagementClient() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { firebaseUser } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const assessmentsQuery = useMemoFirebase(
    () => collection(firestore, 'assessments'),
    [firestore]
  );
  const { data: assessments, isLoading: isLoadingAssessments, error: assessmentError } = useCollection<Assessment>(assessmentsQuery);

  const templatesQuery = useMemoFirebase(
    () => collection(firestore, 'assessment_templates'),
    [firestore]
  );
  const { data: templates, isLoading: isLoadingTemplates, error: templateError } = useCollection<AssessmentTemplate>(templatesQuery);

  const configDocRef = useMemoFirebase(
    () => doc(firestore, 'assessment_config', 'main'),
    [firestore]
  );
  const { data: assessmentConfig, isLoading: isLoadingConfig, error: configError } = useDoc<AssessmentConfig>(configDocRef);
  
  const isLoadingData = isLoadingAssessments || isLoadingTemplates || isLoadingConfig;
  const dataError = assessmentError || templateError || configError;

  const personalityTest = assessments?.find(a => a.id === 'default');
  const personalityTestTemplate = templates?.find(t => t.id === personalityTest?.templateId);

  const isSetupIncomplete = !personalityTest || !personalityTestTemplate;

  const handleDelete = async () => {
    if (!firebaseUser) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
      return;
    }
    setIsDeleting(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch('/api/admin/delete-assessments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete assessments.');
      }
      toast({ title: 'Assessments Deleted', description: 'Default assessment data has been cleared.' });
      // No mutate() call needed. The useCollection hook's onSnapshot will automatically update the UI.
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Deletion Failed', description: e.message });
    } finally {
      setIsDeleting(false);
      setIsDeleteConfirmOpen(false);
    }
  };

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

  if (isSetupIncomplete) {
    return <AssessmentBootstrapClient />;
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
                <Button onClick={() => setIsDeleteConfirmOpen(true)} variant="destructive" className="ml-auto">
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Hapus
                </Button>
              </div>
          </CardContent>
       </Card>

       <Separator />
       
       <AssessmentSettingsClient config={assessmentConfig || undefined} />

       <DeleteConfirmationDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={handleDelete}
        itemName="default assessment, its template, and all associated questions"
        itemType="Data"
      />
    </div>
  );
}
