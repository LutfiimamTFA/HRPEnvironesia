'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import type { Assessment } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AssessmentBootstrapClient } from './AssessmentBootstrapClient';
import { MoreHorizontal, Trash2, PlusCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { CreateAssessmentDialog } from './CreateAssessmentDialog';
import { useToast } from '@/hooks/use-toast';

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
  const router = useRouter();
  const { toast } = useToast();

  const [assessmentToDelete, setAssessmentToDelete] = useState<Assessment | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const assessmentsQuery = useMemoFirebase(
    () => collection(firestore, 'assessments'),
    [firestore]
  );

  const { data: assessments, isLoading, error, mutate } = useCollection<Assessment>(assessmentsQuery);

  const handleDelete = (assessment: Assessment) => {
    setAssessmentToDelete(assessment);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!assessmentToDelete) return;
    try {
      await deleteDocumentNonBlocking(doc(firestore, 'assessments', assessmentToDelete.id!));
      toast({
        title: 'Assessment Deleted',
        description: `The assessment "${assessmentToDelete.name}" has been deleted.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error deleting assessment",
        description: error.message,
      });
    } finally {
      setIsDeleteConfirmOpen(false);
      setAssessmentToDelete(null);
    }
  };


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
       <div className="flex justify-between items-start">
         <CardDescription>
          Manage internal assessments. You can edit assessment details and manage the question bank for each.
        </CardDescription>
         <Button onClick={() => setIsCreateDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Assessment
          </Button>
       </div>
      {assessments && assessments.length > 0 ? (
        assessments.map(assessment => (
          <Card key={assessment.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{assessment.name}</CardTitle>
                  <CardDescription>Version {assessment.version}</CardDescription>
                </div>
                 <div className="flex items-center gap-2">
                  <Badge variant={assessment.isActive && assessment.publishStatus === 'published' ? 'default' : 'secondary'}>
                    {assessment.isActive && assessment.publishStatus === 'published' ? 'Active & Published' : 'Inactive/Draft'}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => handleDelete(assessment)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
      <CreateAssessmentDialog 
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={mutate}
      />
       <DeleteConfirmationDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={confirmDelete}
        itemName={assessmentToDelete?.name}
        itemType="Assessment"
      />
    </div>
  );
}
