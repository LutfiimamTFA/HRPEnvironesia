'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, collection } from 'firebase/firestore';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import type { Assessment, AssessmentQuestion, AssessmentTemplate } from '@/lib/types';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { cn } from '@/lib/utils';

const likertSchema = z.object({
  type: z.literal('likert'),
  text: z.string().min(10, 'Question text is required.'),
  dimension: z.string({ required_error: 'Dimension is required.' }),
  weight: z.coerce.number().default(1),
  reverse: z.boolean().default(false),
});

const forcedChoiceSchema = z.object({
  type: z.literal('forced-choice'),
  forcedChoices: z.array(z.object({
    text: z.string().min(3, 'Statement is required.'),
    dimension: z.string({ required_error: 'Dimension must be selected.' })
  })).length(4, "There must be exactly 4 statements."),
});

const formSchema = z.discriminatedUnion('type', [likertSchema, forcedChoiceSchema]);
type FormValues = z.infer<typeof formSchema>;

interface QuestionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: AssessmentQuestion | null;
  assessment: Assessment;
  template: AssessmentTemplate;
  creationType: 'likert' | 'forced-choice';
}

export function QuestionFormDialog({ open, onOpenChange, question, assessment, template, creationType }: QuestionFormDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const mode = question ? 'Edit' : 'Create';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    // Default values are set in the useEffect to handle dynamic form types
  });

  const formType = form.watch('type');
  const isForcedChoice = formType === 'forced-choice';
  
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "forcedChoices" as any, // Cast to any to handle discriminated union
  });

  useEffect(() => {
    if (open) {
      if (question) { // Edit mode
        const qType = question.type || 'likert';
        if (qType === 'forced-choice') {
            form.reset({
                type: 'forced-choice',
                forcedChoices: question.forcedChoices?.map(fc => ({ text: fc.text, dimension: `${fc.engineKey}|${fc.dimensionKey}` })) || Array(4).fill({ text: '', dimension: ''}),
            });
        } else { // Likert
            form.reset({
                type: 'likert',
                text: question.text || '',
                dimension: `${question.engineKey}|${question.dimensionKey}`,
                weight: question.weight || 1,
                reverse: question.reverse || false,
            });
        }
      } else { // Create mode
        form.reset({
          type: creationType,
          ...(creationType === 'forced-choice' ? {
              forcedChoices: Array(4).fill({ text: '', dimension: ''}),
          } : {
              text: '', dimension: undefined, weight: 1, reverse: false,
          })
        });
      }
    }
  }, [open, question, form, creationType]);

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
        const docRef = question ? doc(firestore, 'assessment_questions', question.id!) : doc(collection(firestore, 'assessment_questions'));
        
        let questionData: Partial<AssessmentQuestion> = {
            assessmentId: assessment.id!,
            isActive: question?.isActive ?? true, // Preserve existing status or default to true
            type: values.type,
        };

        if (values.type === 'likert') {
            const [engineKey, dimensionKey] = values.dimension.split('|');
            questionData = {
                ...questionData,
                text: values.text,
                weight: values.weight,
                reverse: values.reverse,
                engineKey,
                dimensionKey,
            };
        } else if (values.type === 'forced-choice') {
             questionData = {
                ...questionData,
                forcedChoices: values.forcedChoices.map(fc => {
                    const [engineKey, dimensionKey] = fc.dimension.split('|');
                    return { text: fc.text, engineKey, dimensionKey };
                }),
             };
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
      <DialogContent className={cn("max-h-[95vh] flex flex-col", isForcedChoice ? "sm:max-w-2xl" : "sm:max-w-xl")}>
        <DialogHeader>
          <DialogTitle>{mode} Question</DialogTitle>
          <DialogDescription>Fill in the details for the assessment question ({formType}).</DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto pr-2 -mr-6 pl-1">
            <Form {...form}>
            <form id="question-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 pr-4">
                {isForcedChoice ? (
                    <>
                        <FormLabel>Statements</FormLabel>
                        <div className="space-y-4">
                        {fields.map((field, index) => (
                            <div key={field.id} className="p-3 border rounded-lg space-y-3">
                                <FormField
                                    control={form.control}
                                    name={`forcedChoices.${index}.text` as const}
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>Statement {index + 1}</FormLabel>
                                        <FormControl><Textarea placeholder="Statement text..." {...field} /></FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={`forcedChoices.${index}.dimension` as const}
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Maps to Dimension</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Select dimension" /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {template.dimensions.disc && (
                                                <SelectGroup>
                                                    <SelectLabel>DISC</SelectLabel>
                                                    {template.dimensions.disc.map(d => <SelectItem key={`disc-${d.key}`} value={`disc|${d.key}`}>{d.label}</SelectItem>)}
                                                </SelectGroup>
                                                )}
                                                {template.dimensions.bigfive && (
                                                <SelectGroup>
                                                    <SelectLabel>Big Five</SelectLabel>
                                                    {template.dimensions.bigfive.map(d => <SelectItem key={`bigfive-${d.key}`} value={`bigfive|${d.key}`}>{d.label}</SelectItem>)}
                                                </SelectGroup>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                            </div>
                        ))}
                        </div>
                    </>
                ) : (
                    <>
                        <FormField control={form.control} name="text" render={({ field }) => (<FormItem><FormLabel>Question Text</FormLabel><FormControl><Textarea placeholder="e.g., Saya suka mencoba hal-hal baru..." {...field} value={(field as any).value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="weight" render={({ field }) => (<FormItem><FormLabel>Weight</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="dimension" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Dimension</FormLabel>
                            <Select onValueChange={field.onChange} value={(field as any).value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select a dimension" /></SelectTrigger></FormControl>
                            <SelectContent>
                                {template.dimensions.disc && (
                                <SelectGroup>
                                    <SelectLabel>DISC</SelectLabel>
                                    {template.dimensions.disc.map(d => <SelectItem key={d.key} value={`disc|${d.key}`}>{d.label}</SelectItem>)}
                                </SelectGroup>
                                )}
                                {template.dimensions.bigfive && (
                                <SelectGroup>
                                    <SelectLabel>Big Five</SelectLabel>
                                    {template.dimensions.bigfive.map(d => <SelectItem key={d.key} value={`bigfive|${d.key}`}>{d.label}</SelectItem>)}
                                </SelectGroup>
                                )}
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )} />
                        <FormField control={form.control} name="reverse" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Reverse Scored</FormLabel></div><FormControl><Switch checked={(field as any).value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                    </>
                )}
            </form>
            </Form>
        </div>
        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="question-form" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
