'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, Send, XCircle } from 'lucide-react';
import type { DailyReport } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { format, formatDistanceToNow } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';

const reviewSchema = z.object({
  reviewerNotes: z.string().min(10, { message: 'Catatan revisi harus diisi, minimal 10 karakter.' }),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

interface ReviewReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: DailyReport & { internName?: string; };
  onSuccess: () => void;
}

const ContentSection = ({ title, content }: { title: string, content: string }) => (
    <div>
        <h4 className="font-semibold text-base mb-1">{title}</h4>
        <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md whitespace-pre-wrap">
            {content}
        </div>
    </div>
);


export function ReviewReportDialog({ open, onOpenChange, report, onSuccess }: ReviewReportDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { reviewerNotes: report.reviewerNotes || '' },
  });

  const handleReview = async (newStatus: 'approved' | 'needs_revision') => {
    if (!userProfile) return;

    if (newStatus === 'needs_revision') {
      const isNotesValid = await form.trigger('reviewerNotes');
      if (!isNotesValid) return;
    }
    
    setIsSaving(true);
    try {
      const reportRef = doc(firestore, 'daily_reports', report.id!);
      
      const payload: Partial<DailyReport> = {
        status: newStatus,
        reviewedAt: serverTimestamp() as Timestamp,
        reviewedByUid: userProfile.uid,
        reviewedByName: userProfile.fullName,
        reviewerNotes: form.getValues('reviewerNotes') || null,
      };

      await updateDocumentNonBlocking(reportRef, payload);
      
      toast({ title: 'Laporan Direview', description: `Status laporan telah diubah menjadi "${newStatus}".` });
      onSuccess();

    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal mereview laporan', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>Review Laporan: {report.internName}</DialogTitle>
           <DialogDescription>
            {format(report.date.toDate(), 'eeee, dd MMMM yyyy', { locale: idLocale })}
            <span className="mx-2 text-muted-foreground">•</span>
            <span className="text-muted-foreground">
                Dikirim {formatDistanceToNow(report.submittedAt?.toDate() || report.createdAt.toDate(), { addSuffix: true, locale: idLocale })}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto -mx-6 px-6 py-4 space-y-6">
            <ContentSection title="Uraian Aktivitas" content={report.activity} />
            <ContentSection title="Pembelajaran yang Diperoleh" content={report.learning} />
            <ContentSection title="Kendala yang Dialami" content={report.obstacle} />
            
            <Separator />
            
            <Form {...form}>
              <form id="review-form" className="space-y-2">
                <FormField
                  control={form.control}
                  name="reviewerNotes"
                  render={({ field }) => (
                    <FormItem>
                      <Label className="text-base font-semibold">Catatan Reviewer <span className="text-destructive font-normal">*</span> (wajib untuk revisi)</Label>
                      <FormControl>
                        <Textarea placeholder="Berikan feedback atau arahan untuk revisi..." {...field} rows={4} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
        </div>
        <DialogFooter className="flex-shrink-0 p-6 pt-4 border-t bg-background">
          <Button variant="destructive" className="w-full sm:w-auto" onClick={() => handleReview('needs_revision')} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
            <XCircle className="mr-2 h-4 w-4" /> Minta Revisi
          </Button>
          <Button className="bg-green-600 hover:bg-green-700 w-full sm:w-auto" onClick={() => handleReview('approved')} disabled={isSaving}>
             {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
            <CheckCircle className="mr-2 h-4 w-4" /> Setujui
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
