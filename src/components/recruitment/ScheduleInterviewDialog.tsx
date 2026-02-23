'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { Loader2 } from 'lucide-react';

const scheduleSchema = z.object({
  type: z.enum(['hr', 'user', 'final'], { required_error: 'Tipe wawancara harus dipilih.' }),
  dateTime: z.date({ required_error: 'Tanggal dan waktu harus diisi.' }),
  meetingLink: z.string().url({ message: "URL meeting tidak valid." }),
  interviewerNames: z.string().min(1, "Nama pewawancara harus diisi."),
  notes: z.string().optional(),
});

export type ScheduleInterviewData = z.infer<typeof scheduleSchema>;

interface ScheduleInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: ScheduleInterviewData) => Promise<void>;
}

export function ScheduleInterviewDialog({ open, onOpenChange, onConfirm }: ScheduleInterviewDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const form = useForm<ScheduleInterviewData>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: { type: 'hr', dateTime: undefined, meetingLink: '', interviewerNames: '', notes: '' },
  });

  const handleSubmit = async (values: ScheduleInterviewData) => {
    setIsSaving(true);
    await onConfirm(values);
    setIsSaving(false);
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Jadwalkan Wawancara</DialogTitle>
          <DialogDescription>
            Masukkan detail untuk jadwal wawancara kandidat.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="schedule-interview-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipe Wawancara</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="hr">Wawancara HR</SelectItem>
                      <SelectItem value="user">Wawancara User</SelectItem>
                      <SelectItem value="final">Wawancara Final</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateTime"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Tanggal & Waktu</FormLabel>
                  <FormControl>
                    <GoogleDatePicker mode="general" value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
            <FormField
              control={form.control}
              name="interviewerNames"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Pewawancara</FormLabel>
                  <FormControl><Input {...field} placeholder="Contoh: Budi, Dina" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
            Jadwalkan & Pindahkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
