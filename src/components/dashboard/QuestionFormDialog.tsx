'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, collection } from 'firebase/firestore';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { Assessment, AssessmentQuestion } from '@/lib/types';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';

const formSchema = z.object({
  order: z.coerce.number().int().min(1, 'Order must be at least 1'),
  text: z.string().min(10, 'Question text is required.'),
  dimensionKey: z.string({ required_error: 'Dimension is required.' }),
  weight: z.coerce.number().default(1),
  reverse: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

interface QuestionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: AssessmentQuestion | null;
  assessment: Assessment;
}

export function QuestionFormDialog({ open, onOpenChange, question, assessment }: QuestionFormDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const mode = question ? 'Edit' : 'Create';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      order: 1, text: '', dimensionKey: undefined, weight: 1, reverse: false
    },
  });

  useEffect(() => {
    if (open) {
      form.reset(
        question
          ? { ...question }
          : { order: 1, text: '', dimensionKey: undefined, weight: 1, reverse: false }
      );
    }
  }, [open, question, form]);

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
        const docRef = question ? doc(firestore, 'assessment_questions', question.id!) : doc(collection(firestore, 'assessment_questions'));
        
        const questionData = {
          ...values,
          assessmentId: assessment.id!,
          // For now, choices are static. If they become dynamic, they'd be part of the form.
          choices: [
            { text: 'Sangat Tidak Setuju', value: 1 },
            { text: 'Tidak Setuju', value: 2 },
            { text: 'Netral', value: 3 },
            { text: 'Setuju', value: 4 },
            { text: 'Sangat Setuju', value: 5 },
          ],
        }

        await setDocumentNonBlocking(docRef, questionData, { merge: true });
        
        toast({ title: `Question ${mode === 'Edit' ? 'Updated' : 'Created'}` });
        onOpenChange(false);
    } catch (error: any) {
        toast({ variant: "destructive", title: `Error saving question`, description: error.message });
    } finally {
        setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{mode} Question</DialogTitle>
          <DialogDescription>Fill in the details for the assessment question.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="question-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField control={form.control} name="text" render={({ field }) => (<FormItem><FormLabel>Question Text</FormLabel><FormControl><Textarea placeholder="e.g., Saya suka mencoba hal-hal baru..." {...field} /></FormControl><FormMessage /></FormItem>)} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="order" render={({ field }) => (<FormItem><FormLabel>Order</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="weight" render={({ field }) => (<FormItem><FormLabel>Weight</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="dimensionKey" render={({ field }) => (
              <FormItem>
                <FormLabel>Dimension</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select a dimension" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {assessment.scoringConfig.dimensions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="reverse" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Reverse Scored</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
          </form>
        </Form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="question-form" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
