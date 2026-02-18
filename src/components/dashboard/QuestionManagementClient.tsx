'use client';

import { useState } from 'react';
import { collection, query, where, doc } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import type { Assessment, AssessmentQuestion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pencil, PlusCircle, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { QuestionFormDialog } from './QuestionFormDialog';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { Badge } from '../ui/badge';

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export function QuestionManagementClient({ assessment }: { assessment: Assessment }) {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<AssessmentQuestion | null>(null);

  const questionsQuery = useMemoFirebase(
    () => query(collection(firestore, 'assessment_questions'), where('assessmentId', '==', assessment.id!)),
    [firestore, assessment.id]
  );
  const { data: questions, isLoading, error } = useCollection<AssessmentQuestion>(questionsQuery);
  
  const sortedQuestions = questions?.sort((a, b) => a.order - b.order);

  const handleCreate = () => {
    setSelectedQuestion(null);
    setIsFormOpen(true);
  };

  const handleEdit = (question: AssessmentQuestion) => {
    setSelectedQuestion(question);
    setIsFormOpen(true);
  };
  
  const handleDelete = (question: AssessmentQuestion) => {
    setSelectedQuestion(question);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedQuestion || !selectedQuestion.id) return;
    const docRef = doc(firestore, 'assessment_questions', selectedQuestion.id);
    
    try {
        await deleteDocumentNonBlocking(docRef);
        toast({ title: 'Question Deleted' });
    } catch (error: any) {
        toast({ variant: "destructive", title: "Error deleting question", description: error.message });
    } finally {
        setIsDeleteConfirmOpen(false);
        setSelectedQuestion(null);
    }
  };

  if (isLoading) return <TableSkeleton />;
  if (error) return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
         <Button onClick={handleCreate}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Question
          </Button>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Order</TableHead>
              <TableHead>Question Text</TableHead>
              <TableHead>Dimension</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedQuestions && sortedQuestions.length > 0 ? (
              sortedQuestions.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">{q.order}</TableCell>
                  <TableCell>{q.text}</TableCell>
                   <TableCell><Badge variant="outline">{q.dimensionKey}</Badge></TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => handleEdit(q)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onSelect={() => handleDelete(q)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={4} className="h-24 text-center">No questions found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      <QuestionFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        question={selectedQuestion}
        assessment={assessment}
      />
      
      <DeleteConfirmationDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={confirmDelete}
        itemName="this question"
        itemType="Question"
      />
    </div>
  );
}
