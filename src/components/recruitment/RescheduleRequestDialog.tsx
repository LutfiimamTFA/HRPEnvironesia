
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { JobApplication, ApplicationInterview } from '@/lib/types';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';

const formSchema = z.object({
  reason: z.string().min(10, { message: "Alasan harus diisi, minimal 10 karakter." }),
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
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { reason: '' },
  });

  const handleSubmit = async (values: FormValues) => {
    setIsSaving(true);
    try {
      const appRef = doc(firestore, 'applications', application.id!);
      const currentInterviews = application.interviews ? [...application.interviews] : [];
      
      if (currentInterviews[interviewIndex]) {
        currentInterviews[interviewIndex] = {
          ...currentInterviews[interviewIndex],
          status: 'reschedule_requested',
          rescheduleReason: values.reason,
        };
      }

      await updateDocumentNonBlocking(appRef, { interviews: currentInterviews });

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Minta Jadwal Ulang Wawancara</DialogTitle>
          <DialogDescription>
            Jelaskan alasan Anda memerlukan jadwal ulang. Tim HRD akan meninjau permintaan Anda.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="reschedule-request-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alasan dan Usulan Waktu</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Contoh: Mohon maaf, saya ada ujian di waktu yang sama. Apakah memungkinkan untuk dijadwalkan ulang keesokan harinya?"
                      rows={5}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
