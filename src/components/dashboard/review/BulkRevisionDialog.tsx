'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore } from '@/firebase';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';

const revisionSchema = z.object({
  note: z.string().min(10, { message: "Catatan revisi harus diisi, minimal 10 karakter." }),
});

type RevisionFormValues = z.infer<typeof revisionSchema>;

interface BulkRevisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportIds: string[];
  onSuccess: () => void;
}

export function BulkRevisionDialog({ open, onOpenChange, reportIds, onSuccess }: BulkRevisionDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const form = useForm<RevisionFormValues>({
    resolver: zodResolver(revisionSchema),
    defaultValues: { note: '' },
  });

  const handleSubmit = async (values: RevisionFormValues) => {
    if (!userProfile || reportIds.length === 0) return;
    
    setIsSaving(true);
    const batch = writeBatch(firestore);

    reportIds.forEach(id => {
      const ref = doc(firestore, 'daily_reports', id);
      batch.update(ref, {
        status: 'needs_revision',
        reviewerNotes: values.note,
        reviewedAt: serverTimestamp(),
        reviewedByUid: userProfile.uid,
        reviewedByName: userProfile.fullName,
      });
    });

    try {
      await batch.commit();
      toast({ title: 'Sukses', description: `${reportIds.length} laporan telah diminta untuk direvisi.` });
      onSuccess();
      onOpenChange(false);
      form.reset();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Minta Revisi untuk {reportIds.length} Laporan</DialogTitle>
          <DialogDescription>
            Tulis satu catatan revisi yang akan diterapkan ke semua laporan yang dipilih.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="bulk-revision-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Catatan Revisi</FormLabel>
                  <FormControl>
                    <Textarea rows={5} placeholder="Contoh: Tolong lengkapi detail aktivitas dan jelaskan apa saja pembelajaran yang didapat." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="bulk-revision-form" variant="destructive" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Kirim Permintaan Revisi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
