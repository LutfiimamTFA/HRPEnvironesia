'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import type { JobApplication, ApplicationInterview, RescheduleRequest } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc, Timestamp } from 'firebase/firestore';
import { add, differenceInMinutes } from 'date-fns';
import { Input } from '../ui/input';
import { format } from 'date-fns';

const proposedSlotSchema = z.object({
    startAt: z.coerce.date({ required_error: 'Tanggal dan waktu harus diisi.' }),
});

const formSchema = z.object({
  reason: z.string().min(10, { message: "Alasan harus diisi, minimal 10 karakter." }),
  proposedSlots: z.array(proposedSlotSchema).min(1, 'Harap usulkan minimal 1 slot waktu.').max(3, 'Anda bisa mengusulkan maksimal 3 slot waktu.'),
});

type FormValues = z.infer<typeof formSchema>;

interface RescheduleRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: JobApplication;
  interviewIndex: number;
  onSuccess: () => void;
}

export function RescheduleRequestDialog({ open, onOpenChange, application, interviewIndex, onSuccess }: RescheduleRequestDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { userProfile, firebaseUser } = useAuth();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { reason: '', proposedSlots: [{ startAt: undefined }] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "proposedSlots",
  });

  const originalInterview = application.interviews?.[interviewIndex];
  const originalDuration = originalInterview ? differenceInMinutes(originalInterview.endAt.toDate(), originalInterview.startAt.toDate()) : 30;

  const handleSubmit = async (values: FormValues) => {
    if (!originalInterview || !firebaseUser) {
        toast({ variant: 'destructive', title: 'Error', description: 'Data wawancara atau pengguna tidak ditemukan.' });
        return;
    }

    setIsSaving(true);
    try {
      const appRef = doc(firestore, 'applications', application.id!);
      const currentInterviews = application.interviews ? [...application.interviews] : [];
      
      const rescheduleRequestData: RescheduleRequest = {
          requestedAt: Timestamp.now(),
          requestedByUid: firebaseUser.uid,
          reason: values.reason,
          proposedSlots: values.proposedSlots.map(slot => ({
              startAt: Timestamp.fromDate(slot.startAt),
              endAt: Timestamp.fromDate(add(slot.startAt, { minutes: originalDuration }))
          })),
          status: 'pending'
      };

      if (currentInterviews[interviewIndex]) {
        const oldInterviewData = currentInterviews[interviewIndex];
        currentInterviews[interviewIndex] = {
            // Carry over essential fields to avoid 'undefined'
            interviewId: oldInterviewData.interviewId,
            startAt: oldInterviewData.startAt,
            endAt: oldInterviewData.endAt,
            meetingLink: oldInterviewData.meetingLink,
            interviewerIds: oldInterviewData.interviewerIds,
            interviewerNames: oldInterviewData.interviewerNames,
            
            // Set new status and request data
            status: 'reschedule_requested',
            rescheduleRequest: rescheduleRequestData,

            // Conditionally carry over optional fields
            ...(oldInterviewData.notes && { notes: oldInterviewData.notes }),
            ...(oldInterviewData.leadInterviewerId && { leadInterviewerId: oldInterviewData.leadInterviewerId }),
        };
      }

      await updateDocumentNonBlocking(appRef, { 
          interviews: currentInterviews,
          timeline: [
              ...(application.timeline || []),
              {
                  type: 'status_changed',
                  at: Timestamp.now(),
                  by: firebaseUser.uid,
                  meta: {
                      note: `Candidate requested reschedule for interview ${originalInterview.interviewId}`,
                      interviewId: originalInterview.interviewId,
                  },
              },
          ],
      });

      toast({
        title: 'Permintaan Terkirim',
        description: 'Tim HRD telah menerima permintaan jadwal ulang Anda.',
      });
      onSuccess();
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal Mengirim Permintaan',
        description: error.message,
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Minta Jadwal Ulang Wawancara</DialogTitle>
          <DialogDescription>
            Jelaskan alasan Anda dan usulkan 2-3 opsi waktu pengganti.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="reschedule-request-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alasan Anda</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Contoh: Mohon maaf, saya ada ujian di waktu yang sama. Berikut usulan waktu penggantinya."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
                <FormLabel>Usulan Jadwal Baru</FormLabel>
                <div className="space-y-2 mt-2">
                    {fields.map((field, index) => (
                         <div key={field.id} className="flex items-center gap-2">
                            <FormField
                                control={form.control}
                                name={`proposedSlots.${index}.startAt`}
                                render={({ field }) => (
                                    <FormItem className="flex-grow">
                                        <FormControl>
                                            <Input
                                                type="datetime-local"
                                                value={field.value ? format(field.value, "yyyy-MM-dd'T'HH:mm") : ''}
                                                onChange={e => field.onChange(e.target.value ? new Date(e.target.value) : null)}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>
                 {fields.length < 3 && (
                    <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => append({ startAt: undefined })}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Tambah Opsi
                    </Button>
                )}
                 <FormMessage>{form.formState.errors.proposedSlots?.message}</FormMessage>
            </div>
          </form>
        </Form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="reschedule-request-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Kirim Permintaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
