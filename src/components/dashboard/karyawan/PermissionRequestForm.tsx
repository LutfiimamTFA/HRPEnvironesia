'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp, collection, writeBatch } from 'firebase/firestore';
import type { PermissionRequest, UserProfile, EmployeeProfile, Brand, PermissionType, PERMISSION_TYPES } from '@/lib/types';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { format, differenceInMinutes, set, addDays, startOfDay, endOfDay } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

const PERMISSION_TYPE_LABELS: Record<PermissionType, string> = {
    izin_keluar: 'Izin Keluar Kantor',
    sakit: 'Izin Sakit',
    keperluan_mendesak: 'Izin Keperluan Mendesak',
    duka: 'Izin Duka',
    akademik: 'Izin Akademik',
    lainnya: 'Izin Lainnya',
};

// Base schema for all permission requests
const baseSchema = z.object({
  type: z.enum(PERMISSION_TYPES, { required_error: 'Jenis izin harus dipilih.' }),
  reason: z.string().min(10, "Alasan/keterangan harus diisi (minimal 10 karakter)."),
  attachments: z.any().optional(), // Simplified for now
});

// Specific schemas for each permission type
const izinKeluarSchema = baseSchema.extend({
  type: z.literal('izin_keluar'),
  date: z.date({ required_error: "Tanggal izin harus diisi." }),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format waktu harus HH:MM."),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format waktu harus HH:MM."),
  destination: z.string().min(3, "Tujuan harus diisi."),
});

const izinAbsenSchema = baseSchema.extend({
  type: z.enum(['sakit', 'keperluan_mendesak', 'duka', 'akademik', 'lainnya']),
  startDate: z.date({ required_error: "Tanggal mulai harus diisi." }),
  endDate: z.date({ required_error: "Tanggal selesai harus diisi." }),
  sicknessDescription: z.string().optional(),
  familyRelation: z.string().optional(),
  academicActivityName: z.string().optional(),
  otherLeaveTitle: z.string().optional(),
});

// Discriminated union for validation based on 'type'
const formSchema = z.discriminatedUnion('type', [izinKeluarSchema, izinAbsenSchema]).superRefine((data, ctx) => {
    if (data.type !== 'izin_keluar') {
        if (data.endDate < data.startDate) {
            ctx.addIssue({
                path: ["endDate"],
                message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
            });
        }
    }
});


type FormValues = z.infer<typeof formSchema>;

interface PermissionRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: PermissionRequest | null;
  employeeProfile: EmployeeProfile | null;
  brands: Brand[];
  onSuccess: () => void;
}

const InfoRow = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex justify-between text-sm"><p className="text-muted-foreground">{label}</p><p className="font-medium text-right">{value}</p></div>
);

export function PermissionRequestForm({ open, onOpenChange, submission, employeeProfile, brands, onSuccess }: PermissionRequestFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const mode = submission ? 'Edit' : 'Buat';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { type: 'izin_keluar', reason: '' }
  });

  const selectedType = form.watch('type');

  useEffect(() => {
    if(open && !submission) {
        form.reset({
            type: 'izin_keluar',
            date: new Date(),
            startTime: '12:00',
            endTime: '13:00',
            destination: '',
            reason: '',
        });
    } else if (open && submission) {
        // Populate form for editing (logic to be added)
    }
  }, [open, submission, form]);

  const handleSubmit = async (values: FormValues) => {
    if (!userProfile || !employeeProfile) return;
    setIsSaving(true);
    try {
        const docRef = submission ? doc(firestore, 'permission_requests', submission.id!) : doc(collection(firestore, 'permission_requests'));
        let startDate: Date;
        let endDate: Date;
        let totalDurationMinutes = 0;

        if (values.type === 'izin_keluar') {
            const [startH, startM] = values.startTime.split(':').map(Number);
            const [endH, endM] = values.endTime.split(':').map(Number);
            startDate = set(values.date, { hours: startH, minutes: startM });
            endDate = set(values.date, { hours: endH, minutes: endM });
            if (endDate < startDate) {
                endDate = addDays(endDate, 1);
            }
            totalDurationMinutes = differenceInMinutes(endDate, startDate);
        } else {
            startDate = startOfDay(values.startDate);
            endDate = endOfDay(values.endDate);
            // This is a rough calculation, doesn't account for work days.
            totalDurationMinutes = differenceInMinutes(endDate, startDate);
        }

        const payload: Omit<PermissionRequest, 'id' | 'createdAt' | 'updatedAt'> = {
            uid: userProfile.uid,
            fullName: userProfile.fullName,
            brandId: Array.isArray(employeeProfile.brandId) ? employeeProfile.brandId[0] : (employeeProfile.brandId || ''),
            division: employeeProfile.division || 'N/A',
            positionTitle: employeeProfile.positionTitle || 'N/A',
            type: values.type,
            reason: values.reason,
            startDate: Timestamp.fromDate(startDate),
            endDate: Timestamp.fromDate(endDate),
            totalDurationMinutes: totalDurationMinutes,
            attachments: [],
            status: userProfile.isDivisionManager ? 'pending_hrd' : 'pending_manager',
            managerUid: employeeProfile.supervisorUid || undefined,
            // Type-specific fields
            destination: values.type === 'izin_keluar' ? values.destination : undefined,
            sicknessDescription: values.type === 'sakit' ? (values as any).sicknessDescription : undefined,
            familyRelation: values.type === 'duka' ? (values as any).familyRelation : undefined,
            academicActivityName: values.type === 'akademik' ? (values as any).academicActivityName : undefined,
            otherLeaveTitle: values.type === 'lainnya' ? (values as any).otherLeaveTitle : undefined,
        };

        await setDocumentNonBlocking(docRef, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
        
        toast({ title: 'Pengajuan Terkirim' });
        onSuccess();
        onOpenChange(false);
    } catch(e: any) {
        toast({ variant: 'destructive', title: 'Gagal Mengirim', description: e.message });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>{mode} Pengajuan Izin</DialogTitle>
          <DialogDescription>Pilih jenis izin dan lengkapi detail yang diperlukan.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-grow">
          <div className="p-6">
            <Form {...form}>
              <form id="permission-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jenis Izin</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Pilih jenis izin" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {Object.entries(PERMISSION_TYPE_LABELS).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {selectedType === 'izin_keluar' && (
                    <>
                        <FormField control={form.control} name="date" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Tanggal</FormLabel><FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)}/>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="startTime" render={({ field }) => (<FormItem><FormLabel>Jam Keluar</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                            <FormField control={form.control} name="endTime" render={({ field }) => (<FormItem><FormLabel>Jam Kembali</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                        </div>
                        <FormField control={form.control} name="destination" render={({ field }) => (<FormItem><FormLabel>Tujuan</FormLabel><FormControl><Input placeholder="Contoh: Mengambil berkas di BPN" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                    </>
                )}

                {selectedType !== 'izin_keluar' && (
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="startDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Tanggal Mulai</FormLabel><FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={form.control} name="endDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Tanggal Selesai</FormLabel><FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)}/>
                    </div>
                )}
                
                {selectedType === 'sakit' && <FormField control={form.control} name="sicknessDescription" render={({ field }) => (<FormItem><FormLabel>Keluhan Singkat</FormLabel><FormControl><Input placeholder="Contoh: Demam dan pusing" {...field} /></FormControl><FormMessage /></FormItem>)} />}
                {selectedType === 'duka' && <FormField control={form.control} name="familyRelation" render={({ field }) => (<FormItem><FormLabel>Hubungan Keluarga</FormLabel><FormControl><Input placeholder="Contoh: Paman, Nenek" {...field} /></FormControl><FormMessage /></FormItem>)} />}
                {selectedType === 'akademik' && <FormField control={form.control} name="academicActivityName" render={({ field }) => (<FormItem><FormLabel>Nama Kegiatan Akademik</FormLabel><FormControl><Input placeholder="Contoh: Bimbingan Skripsi" {...field} /></FormControl><FormMessage /></FormItem>)} />}
                {selectedType === 'lainnya' && <FormField control={form.control} name="otherLeaveTitle" render={({ field }) => (<FormItem><FormLabel>Judul Izin</FormLabel><FormControl><Input placeholder="Contoh: Izin Pernikahan" {...field} /></FormControl><FormMessage /></FormItem>)} />}

                <FormField control={form.control} name="reason" render={({ field }) => (<FormItem><FormLabel>Keterangan / Alasan</FormLabel><FormControl><Textarea rows={4} placeholder="Jelaskan alasan pengajuan izin Anda..." {...field} /></FormControl><FormMessage /></FormItem>)}/>
              </form>
            </Form>
          </div>
        </ScrollArea>
        <DialogFooter className="p-6 pt-4 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button type="submit" form="permission-form" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Kirim Pengajuan Izin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
