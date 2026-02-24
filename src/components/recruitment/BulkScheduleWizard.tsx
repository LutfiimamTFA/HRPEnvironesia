'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { useToast } from '@/hooks/use-toast';
import { getInitials, cn, generateTimeSlots } from '@/lib/utils';
import type { JobApplication, ApplicationInterview, UserProfile, ApplicationTimelineEvent, Brand } from '@/lib/types';
import { ArrowLeft, ArrowRight, Calendar, Clock, GripVertical, Loader2, Save, Users, AlertCircle, Link as LinkIcon, Briefcase } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { format } from 'date-fns';
import { useFirestore, updateDocumentNonBlocking, useCollection, useMemoFirebase } from '@/firebase';
import { doc, writeBatch, serverTimestamp, Timestamp, query, collection, where } from 'firebase/firestore';
import { PanelistPickerSimple } from './PanelistPickerSimple';

// --- Step 1: Candidate List Item ---

const SortableCandidateItem = ({ candidate }: { candidate: JobApplication }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: candidate.id! });
    const style = { transform: CSS.Transform.toString(transform), transition };

    return (
        <div ref={setNodeRef} style={style} className={cn("flex items-center gap-3 p-2 rounded-md bg-background border", isDragging && "shadow-lg ring-2 ring-primary")}>
            <button {...attributes} {...listeners} className="cursor-grab p-1 text-muted-foreground"><GripVertical className="h-5 w-5" /></button>
            <Avatar className="h-9 w-9">
                <AvatarImage src={candidate.candidatePhotoUrl} />
                <AvatarFallback>{getInitials(candidate.candidateName)}</AvatarFallback>
            </Avatar>
            <div className="flex-grow">
                <p className="font-medium text-sm">{candidate.candidateName}</p>
                <p className="text-xs text-muted-foreground">{candidate.candidateEmail}</p>
            </div>
        </div>
    );
};


// --- Step 2: Schedule Configuration ---

const scheduleConfigSchema = z.object({
  startDate: z.date({ required_error: 'Tanggal mulai harus diisi.' }),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format waktu harus HH:MM."),
  slotDuration: z.coerce.number().int().min(5, 'Durasi minimal 5 menit.'),
  buffer: z.coerce.number().int().min(0, 'Buffer tidak boleh negatif.'),
  workdayEndTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format waktu harus HH:MM."),
  panelistIds: z.array(z.string()).min(1, 'Minimal satu panelis harus dipilih.'),
  meetingLink: z.string().url({ message: "URL meeting tidak valid." }),
});

type ScheduleConfigValues = z.infer<typeof scheduleConfigSchema>;

// --- Main Wizard Component ---

interface BulkScheduleWizardProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: JobApplication[];
  recruiter: UserProfile;
  onSuccess: () => void;
}

export function BulkScheduleWizard({ isOpen, onOpenChange, candidates, recruiter, onSuccess }: BulkScheduleWizardProps) {
  const [step, setStep] = useState(1);
  const [orderedCandidates, setOrderedCandidates] = useState<JobApplication[]>([]);
  const [dialogContent, setDialogContent] = useState<HTMLDivElement | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();

  const internalUsersQuery = useMemoFirebase(() =>
    query(
      collection(firestore, 'users'),
      where('role', 'in', ['hrd', 'manager', 'karyawan', 'super-admin']),
      where('isActive', '==', true)
    ),
    [firestore]
  );
  const { data: internalUsers } = useCollection<UserProfile>(internalUsersQuery);
  const { data: brands } = useCollection<Brand>(useMemoFirebase(() => collection(firestore, 'brands'), [firestore]));

  const [panelistIds, setPanelistIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setOrderedCandidates(candidates.sort((a,b) => (a.submittedAt?.toMillis() || 0) - (b.submittedAt?.toMillis() || 0)));
      setStep(1);
      if (recruiter && panelistIds.length === 0) {
        setPanelistIds([recruiter.uid]);
      }
    } else {
        setPanelistIds([]);
    }
  }, [isOpen, candidates, recruiter]);
  
  const scheduleForm = useForm<ScheduleConfigValues>({
    resolver: zodResolver(scheduleConfigSchema),
    defaultValues: {
      startDate: new Date(),
      startTime: '09:00',
      slotDuration: 30,
      buffer: 10,
      workdayEndTime: '17:00',
      panelistIds: recruiter ? [recruiter.uid] : [],
      meetingLink: '',
    },
  });

  const generatedSlots = useMemo(() => {
    const config = scheduleForm.getValues();
    if (step < 3 || !config.startDate) return [];
    return generateTimeSlots(orderedCandidates, config);
  }, [step, orderedCandidates, scheduleForm.watch()]);

  const [continueToNextDay, setContinueToNextDay] = useState(true);

  const totalSlotsNeeded = orderedCandidates.length;
  const slotsGeneratedCount = generatedSlots.length;
  const hasConflicts = totalSlotsNeeded > slotsGeneratedCount && !continueToNextDay;

  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setOrderedCandidates((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };
  
  const handleSave = async () => {
    if (hasConflicts) {
        toast({ variant: 'destructive', title: 'Jadwal Melebihi Jam Kerja', description: 'Harap sesuaikan pengaturan atau aktifkan "Lanjutkan ke hari berikutnya".'});
        return;
    }
    
    const batch = writeBatch(firestore);
    
    const selectedPanelists = (internalUsers || []).filter(u => panelistIds.includes(u.uid));
    const panelistNames = selectedPanelists.map(p => p.fullName);
    const { meetingLink } = scheduleForm.getValues();


    generatedSlots.forEach(slot => {
        const appRef = doc(firestore, 'applications', slot.candidate.id!);
        const interviewData: ApplicationInterview = {
            interviewId: crypto.randomUUID(),
            startAt: Timestamp.fromDate(slot.startAt),
            endAt: Timestamp.fromDate(slot.endAt),
            panelistIds: panelistIds,
            panelistNames: panelistNames,
            meetingLink: meetingLink,
            status: 'scheduled',
        };

        const timelineEvent: ApplicationTimelineEvent = {
            type: 'interview_scheduled',
            at: Timestamp.now(),
            by: recruiter.uid,
            meta: {
                from: slot.candidate.status,
                to: 'interview',
                interviewDate: Timestamp.fromDate(slot.startAt),
            }
        };
        
        const allPanelistIds = Array.from(new Set([...(slot.candidate.allPanelistIds || []), ...panelistIds]));

        batch.update(appRef, {
            status: 'interview',
            interviews: [
                ...(slot.candidate.interviews || []),
                interviewData,
            ],
            allPanelistIds,
            timeline: [
                ...(slot.candidate.timeline || []),
                timelineEvent
            ],
            updatedAt: serverTimestamp()
        });
    });

    try {
        await batch.commit();
        toast({ title: 'Sukses!', description: `${generatedSlots.length} wawancara telah berhasil dijadwalkan.`});
        onSuccess();
        onOpenChange(false);
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: e.message });
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1: // Select & Reorder Candidates
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Seret dan lepas untuk mengatur urutan wawancara. Kandidat di urutan atas akan dijadwalkan lebih awal.</p>
            <div className="w-full rounded-md border p-2">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={orderedCandidates.map(c => c.id!)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                            {orderedCandidates.map(candidate => (
                                <SortableCandidateItem key={candidate.id} candidate={candidate} />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>
          </div>
        );
      case 2: // Configure Schedule
        return (
          <Form {...scheduleForm}>
            <form className="space-y-4">
                <FormField control={scheduleForm.control} name="startDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Tanggal Mulai</FormLabel><FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} container={dialogContent} /></FormControl><FormMessage /></FormItem>)} />
                <div className="grid grid-cols-2 gap-4">
                    <FormField control={scheduleForm.control} name="startTime" render={({ field }) => ( <FormItem><FormLabel>Waktu Mulai</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={scheduleForm.control} name="workdayEndTime" render={({ field }) => ( <FormItem><FormLabel>Batas Jam Kerja</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                 <div className="grid grid-cols-2 gap-4">
                    <FormField control={scheduleForm.control} name="slotDuration" render={({ field }) => (<FormItem><FormLabel>Durasi per Slot (menit)</FormLabel><Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value)}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent container={dialogContent}><SelectItem value="15">15</SelectItem><SelectItem value="20">20</SelectItem><SelectItem value="30">30</SelectItem><SelectItem value="45">45</SelectItem><SelectItem value="60">60</SelectItem><SelectItem value="90">90</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                    <FormField control={scheduleForm.control} name="buffer" render={({ field }) => (<FormItem><FormLabel>Jeda antar Slot (menit)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                 <PanelistPickerSimple
                    allUsers={internalUsers || []}
                    allBrands={brands || []}
                    selectedIds={panelistIds}
                    onChange={setPanelistIds}
                />
                 <FormField control={scheduleForm.control} name="meetingLink" render={({ field }) => ( <FormItem><FormLabel>Link Meeting</FormLabel><FormControl><Input placeholder="https://zoom.us/j/..." {...field} /></FormControl><FormMessage /></FormItem>)} />
            </form>
          </Form>
        );
      case 3: // Preview & Conflict Check
        return (
            <div className="space-y-4">
                {hasConflicts && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Konflik Jadwal</AlertTitle>
                        <AlertDescription>
                            {totalSlotsNeeded - slotsGeneratedCount} kandidat tidak dapat dijadwalkan karena melebihi jam kerja. Sesuaikan pengaturan atau aktifkan opsi di bawah.
                        </AlertDescription>
                    </Alert>
                )}
                <div className="rounded-md border">
                    <ScrollArea className="h-96">
                        <div className="space-y-2 p-2">
                            {generatedSlots.map(slot => (
                                <div key={slot.candidate.id} className="flex items-center gap-3 p-2 rounded-md bg-background border">
                                    <Avatar className="h-9 w-9"><AvatarFallback>{getInitials(slot.candidate.candidateName)}</AvatarFallback></Avatar>
                                    <div className="flex-grow">
                                        <p className="font-medium text-sm">{slot.candidate.candidateName}</p>
                                        <p className="text-xs text-primary">{format(slot.startAt, 'dd MMM, HH:mm')} - {format(slot.endAt, 'HH:mm')}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent ref={setDialogContent} className="max-w-2xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Jadwalkan Wawancara Massal ({step}/3)</DialogTitle>
          <DialogDescription>
            {
              step === 1 ? `Atur urutan kandidat (${orderedCandidates.length} terpilih).` :
              step === 2 ? 'Konfigurasi templat jadwal untuk semua kandidat.' :
              'Pratinjau jadwal yang dihasilkan sebelum menyimpan.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-grow py-4 overflow-y-auto -mx-6 px-6">{renderStepContent()}</div>

        <DialogFooter className="flex-shrink-0 justify-between border-t pt-4">
            <div>
              {step > 1 && <Button variant="ghost" onClick={() => setStep(s => s - 1)}><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Button>}
            </div>
            <div className="flex items-center gap-2">
                <DialogClose asChild><Button variant="outline">Batal</Button></DialogClose>
                {step < 2 && <Button onClick={() => setStep(2)}>Lanjut <ArrowRight className="ml-2 h-4 w-4" /></Button>}
                {step === 2 && <Button onClick={() => scheduleForm.trigger().then(isValid => isValid && setStep(3))}>Pratinjau Jadwal <ArrowRight className="ml-2 h-4 w-4" /></Button>}
                {step === 3 && <Button onClick={handleSave} disabled={hasConflicts}>Konfirmasi & Jadwalkan <Save className="ml-2 h-4 w-4" /></Button>}
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
