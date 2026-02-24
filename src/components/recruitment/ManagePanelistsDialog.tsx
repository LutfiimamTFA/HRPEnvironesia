'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { JobApplication, ApplicationInterview, UserProfile, ApplicationTimelineEvent, Brand } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc, Timestamp, writeBatch } from 'firebase/firestore';
import { PanelistPickerSimple } from './PanelistPickerSimple';

interface ManagePanelistsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: JobApplication;
  interview: ApplicationInterview;
  currentUser: UserProfile;
  allUsers: UserProfile[];
  allBrands: Brand[];
  onSuccess: () => void;
}

export function ManagePanelistsDialog({ open, onOpenChange, application, interview, currentUser, allUsers, allBrands, onSuccess }: ManagePanelistsDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [panelistIds, setPanelistIds] = useState<string[]>([]);
  const firestore = useFirestore();
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setPanelistIds(interview.panelistIds || []);
    }
  }, [open, interview.panelistIds]);

  const handleSave = async () => {
    setIsSaving(true);

    const originalIds = new Set(interview.panelistIds || []);
    const newIds = new Set(panelistIds);

    const added = panelistIds.filter(id => !originalIds.has(id));
    const removed = (interview.panelistIds || []).filter(id => !newIds.has(id));
    const newPanelistNames = allUsers.filter(u => newIds.has(u.uid)).map(u => u.fullName);

    const batch = writeBatch(firestore);
    const appRef = doc(firestore, 'applications', application.id!);
    
    const newInterviews = (application.interviews || []).map(iv => {
      if (iv.interviewId === interview.interviewId) {
        return {
          ...iv,
          panelistIds: panelistIds,
          panelistNames: newPanelistNames,
        };
      }
      return iv;
    });
    
    const allPanelistIds = Array.from(new Set(newInterviews.flatMap(iv => iv.panelistIds || [])));

    const timelineEvent: ApplicationTimelineEvent = {
        type: 'panelists_updated',
        at: Timestamp.now(),
        by: currentUser.uid,
        meta: {
            interviewId: interview.interviewId,
            added: added,
            removed: removed,
        }
    };
    
    batch.update(appRef, {
        interviews: newInterviews,
        allPanelistIds: allPanelistIds,
        timeline: [...(application.timeline || []), timelineEvent]
    });

    try {
      await batch.commit();
      toast({ title: 'Panelis Diperbarui', description: 'Daftar panelis untuk wawancara ini telah berhasil diperbarui.' });
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Kelola Panelis untuk {application.candidateName}</DialogTitle>
          <DialogDescription>
            Ubah daftar panelis untuk sesi wawancara ini.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
            <PanelistPickerSimple
                allUsers={allUsers}
                allBrands={allBrands}
                selectedIds={panelistIds}
                onChange={setPanelistIds}
            />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan Perubahan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
