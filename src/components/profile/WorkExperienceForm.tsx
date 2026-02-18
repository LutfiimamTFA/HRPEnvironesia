'use client';

import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import type { WorkExperience } from '@/lib/types';
import { Checkbox } from '../ui/checkbox';
import { Separator } from '../ui/separator';
import { Textarea } from '../ui/textarea';
import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

const experienceSchema = z.object({
  id: z.string(),
  company: z.string().min(1, "Nama perusahaan harus diisi"),
  position: z.string().min(1, "Posisi harus diisi"),
  startDate: z.string().min(4, "Tahun mulai harus diisi"),
  endDate: z.string().optional(),
  isCurrent: z.boolean().default(false),
  description: z.string().optional(),
}).refine(data => data.isCurrent || (data.endDate && data.endDate.length > 0), {
    message: "Tahun selesai harus diisi jika tidak sedang bekerja di sini.",
    path: ["endDate"],
});

const formSchema = z.object({
  experience: z.array(experienceSchema),
});

type FormValues = z.infer<typeof formSchema>;

interface WorkExperienceFormProps {
    initialData: WorkExperience[];
    onSaveSuccess: () => void;
    onBack: () => void;
}

export function WorkExperienceForm({ initialData, onSaveSuccess, onBack }: WorkExperienceFormProps) {
    const [isSaving, setIsSaving] = useState(false);
    const { firebaseUser } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { experience: initialData || [] },
    });
    
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "experience",
    });

    const handleSubmit = async (values: FormValues) => {
        if (!firebaseUser) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
            return;
        }
        setIsSaving(true);
        try {
            const payload = {
                workExperience: values.experience,
                profileStatus: 'draft',
                profileStep: 4,
                updatedAt: serverTimestamp() as Timestamp,
            };
            const profileDocRef = doc(firestore, 'profiles', firebaseUser.uid);
            await setDocumentNonBlocking(profileDocRef, payload, { merge: true });
            
            toast({ title: 'Pengalaman Kerja Disimpan', description: 'Melanjutkan ke langkah berikutnya...' });
            onSaveSuccess();
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Gagal Menyimpan", description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Pengalaman Kerja</CardTitle>
                <CardDescription>Tambahkan pengalaman kerja yang relevan. Kosongkan jika belum ada. Kolom dengan tanda <span className="text-destructive">*</span> adalah kolom yang wajib diisi.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
                        <div className="space-y-6">
                            {fields.map((field, index) => (
                                <div key={field.id} className="space-y-4 p-4 border rounded-md relative">
                                    <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive hover:bg-destructive/10" onClick={() => remove(index)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name={`experience.${index}.company`} render={({ field }) => (<FormItem><FormLabel>Nama Perusahaan <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name={`experience.${index}.position`} render={({ field }) => (<FormItem><FormLabel>Posisi <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name={`experience.${index}.startDate`} render={({ field }) => (<FormItem><FormLabel>Tahun Mulai <span className="text-destructive">*</span></FormLabel><FormControl><Input type="number" {...field} placeholder="YYYY" /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name={`experience.${index}.endDate`} render={({ field }) => (<FormItem><FormLabel>Tahun Selesai <span className="text-destructive">*</span></FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} placeholder="YYYY" disabled={form.watch(`experience.${index}.isCurrent`)} /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                    <FormField control={form.control} name={`experience.${index}.isCurrent`} render={({ field }) => (<FormItem className="flex flex-row items-start space-x-3 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Saat ini masih bekerja di sini</FormLabel></div></FormItem>)} />
                                    <FormField control={form.control} name={`experience.${index}.description`} render={({ field }) => (<FormItem><FormLabel>Deskripsi (Opsional)</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Jelaskan tanggung jawab Anda..." /></FormControl><FormMessage /></FormItem>)} />
                                    {index < fields.length - 1 && <Separator className="!mt-6" />}
                                </div>
                            ))}
                        </div>
                        
                        <Button type="button" variant="outline" onClick={() => append({ id: crypto.randomUUID(), company: '', position: '', startDate: '', endDate: '', isCurrent: false, description: '' })}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Tambah Pengalaman
                        </Button>
                        
                        <div className="flex justify-between pt-4">
                            <Button type="button" variant="secondary" onClick={onBack}>
                                Kembali
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Simpan & Lanjut
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
