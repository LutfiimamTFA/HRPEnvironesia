'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useFirestore } from '@/firebase';
import type { UserProfile, JobApplication } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { PanelistPicker } from './PanelistPicker';

export const scheduleSchema = z.object({
  dateTime: z.coerce.date({ required_error: 'Tanggal dan waktu harus diisi.' }),
  duration: z.coerce.number().int().min(5, 'Durasi minimal 5 menit.').default(30),
  meetingLink: z.string().url({ message: "URL meeting tidak valid." }),
  panelists: z.array(z.object({ value: z.string(), label: z.string() })).min(1, 'Minimal satu panelis harus dipilih.'),
  notes: z.string().optional(),
});

export type ScheduleInterviewData = z.infer<typeof scheduleSchema>;

interface ScheduleInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: ScheduleInterviewData) => Promise<boolean>;
  initialData?: Partial<ScheduleInterviewData>;
  application?: JobApplication;
  recruiter: UserProfile;
}

export function ScheduleInterviewDialog({ open, onOpenChange, onConfirm, initialData, application, recruiter }: ScheduleInterviewDialogProps) {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<ScheduleInterviewData>({
    resolver: zodResolver(scheduleSchema),
  });

  useEffect(() => {
    if (open) {
      const defaultPanelists = recruiter ? [{ value: recruiter.uid, label: `${recruiter.fullName} (${recruiter.email})` }] : [];
      form.reset({
        dateTime: initialData?.dateTime,
        duration: initialData?.duration || 30,
        meetingLink: initialData?.meetingLink || '',
        panelists: initialData?.panelists || defaultPanelists,
        notes: initialData?.notes || '',
      });
    }
  }, [open, initialData, form, recruiter]);

  const handleSubmit = async (values: ScheduleInterviewData) => {
    setIsSaving(true);
    const success = await onConfirm(values);
    setIsSaving(false);
    if (success) {
      onOpenChange(false);
    }
  };
  
  const title = initialData 
    ? `Edit Wawancara untuk ${application?.candidateName}`
    : `Jadwalkan Wawancara untuk ${application?.candidateName}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Masukkan detail untuk jadwal wawancara kandidat.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="schedule-interview-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="dateTime"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Tanggal & Waktu</FormLabel>
                  <FormControl>
                    <Input
                        type="datetime-local"
                        value={field.value ? new Date(field.value.getTime() - (field.value.getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : ''}
                        onChange={e => field.onChange(e.target.value ? new Date(e.target.value) : null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField control={form.control} name="duration" render={({ field }) => (<FormItem><FormLabel>Durasi (menit)</FormLabel><Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value)}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="15">15</SelectItem><SelectItem value="30">30</SelectItem><SelectItem value="45">45</SelectItem><SelectItem value="60">60</SelectItem><SelectItem value="90">90</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
            <FormField
              control={form.control}
              name="meetingLink"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Link Meeting (Zoom/Meet)</FormLabel>
                  <FormControl><Input {...field} placeholder="https://zoom.us/j/..." /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {application && (
                <FormField
                    control={form.control}
                    name="panelists"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Panelis Wawancara</FormLabel>
                        <PanelistPicker
                            job={application} // The job object is embedded in the application object
                            selected={field.value}
                            onChange={field.onChange}
                        />
                        <FormMessage />
                    </FormItem>
                    )}
                />
            )}
             <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Catatan (Opsional)</FormLabel>
                  <FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Catatan tambahan untuk internal..." /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="schedule-interview-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan Jadwal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
