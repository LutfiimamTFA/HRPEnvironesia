'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2, Save } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { UserProfile, Job, Brand } from '@/lib/types';
import { GoogleDatePicker } from '../ui/google-date-picker';
import { Timestamp } from 'firebase/firestore';

const templateSchema = z.object({
  meetingLink: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
  slotDurationMinutes: z.coerce.number().int().min(5),
  breakMinutes: z.coerce.number().int().min(0),
  workdayStartTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format waktu harus HH:MM."),
  workdayEndTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format waktu harus HH:MM."),
  defaultStartDate: z.date().optional(),
});

type FormValues = z.infer<typeof templateSchema>;

interface EditInterviewTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job;
  onSave: (templateData: Partial<Job['interviewTemplate']>) => void;
}

export function EditInterviewTemplateDialog({ open, onOpenChange, job, onSave }: EditInterviewTemplateDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(templateSchema),
  });

  useEffect(() => {
    if (open && job.interviewTemplate) {
      form.reset({
        meetingLink: job.interviewTemplate.meetingLink || '',
        slotDurationMinutes: job.interviewTemplate.slotDurationMinutes || 30,
        breakMinutes: job.interviewTemplate.breakMinutes || 10,
        workdayStartTime: job.interviewTemplate.workdayStartTime || '09:00',
        workdayEndTime: job.interviewTemplate.workdayEndTime || '17:00',
        defaultStartDate: job.interviewTemplate.defaultStartDate?.toDate(),
      });
    } else if (open) {
        form.reset({
            meetingLink: '',
            slotDurationMinutes: 30,
            breakMinutes: 10,
            workdayStartTime: '09:00',
            workdayEndTime: '17:00',
        });
    }
  }, [open, job, form]);

  const handleSubmit = (values: FormValues) => {
    setIsSaving(true);
    const dataToSave: Partial<Job['interviewTemplate']> = {
        ...values,
        defaultStartDate: values.defaultStartDate ? Timestamp.fromDate(values.defaultStartDate) : undefined,
    };
    onSave(dataToSave);
    setIsSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>Edit Interview Template for: {job.position}</DialogTitle>
          <DialogDescription>
            These settings will be the default for all interviews scheduled for this job.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto px-6">
            <Form {...form}>
                <form id="template-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
                    <FormField control={form.control} name="meetingLink" render={({ field }) => ( <FormItem><FormLabel>Default Meeting Link</FormLabel><FormControl><Input placeholder="https://zoom.us/j/..." {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="defaultStartDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Default Start Date</FormLabel><FormControl><GoogleDatePicker portalled={false} value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="workdayStartTime" render={({ field }) => ( <FormItem><FormLabel>Workday Start Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="workdayEndTime" render={({ field }) => ( <FormItem><FormLabel>Workday End Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="slotDurationMinutes" render={({ field }) => (<FormItem><FormLabel>Slot Duration (minutes)</FormLabel><Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value)}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent portalled={false}><SelectItem value="15">15</SelectItem><SelectItem value="30">30</SelectItem><SelectItem value="45">45</SelectItem><SelectItem value="60">60</SelectItem><SelectItem value="90">90</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="breakMinutes" render={({ field }) => (<FormItem><FormLabel>Break (minutes)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </div>
                </form>
            </Form>
        </div>
        <DialogFooter className="p-6 pt-4 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="template-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
