'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { Loader2, X, PlusCircle, Trash2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import type { Certification } from '@/lib/types';
import { Separator } from '../ui/separator';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

const certificationSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Nama sertifikasi harus diisi"),
  organization: z.string().min(1, "Nama organisasi harus diisi"),
  issueDate: z.string().regex(/^\d{4}-\d{2}$/, { message: "Gunakan format YYYY-MM" }),
  expirationDate: z.string().regex(/^\d{4}-\d{2}$/, { message: "Gunakan format YYYY-MM" }).optional().or(z.literal('')),
});

const formSchema = z.object({
  skills: z.array(z.string()).min(1, "Tambahkan setidaknya satu keahlian."),
  certifications: z.array(certificationSchema).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface SkillsFormProps {
    initialData: { skills: string[], certifications?: Certification[] };
    onSaveSuccess: () => void;
    onBack: () => void;
}

export function SkillsForm({ initialData, onSaveSuccess, onBack }: SkillsFormProps) {
    const [isSaving, setIsSaving] = useState(false);
    const { firebaseUser } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [inputValue, setInputValue] = useState('');

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            skills: initialData?.skills || [],
            certifications: initialData?.certifications || [],
        },
    });

    const { fields: certFields, append: appendCert, remove: removeCert } = useFieldArray({
        control: form.control,
        name: "certifications",
    });

    const { setValue, watch } = form;
    const skills = watch('skills');

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && inputValue.trim()) {
            e.preventDefault();
            const newSkill = inputValue.trim();
            if (!skills.includes(newSkill)) {
                setValue('skills', [...skills, newSkill], { shouldValidate: true });
            }
            setInputValue('');
        }
    };

    const removeSkill = (skillToRemove: string) => {
        setValue('skills', skills.filter(skill => skill !== skillToRemove), { shouldValidate: true });
    };

    const handleSubmit = async (values: FormValues) => {
        if (!firebaseUser) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
            return;
        }
        setIsSaving(true);
        try {
            const payload = {
                skills: values.skills,
                certifications: values.certifications,
                profileStatus: 'draft',
                profileStep: 6,
                updatedAt: serverTimestamp() as Timestamp,
            };
            const profileDocRef = doc(firestore, 'profiles', firebaseUser.uid);
            await setDocumentNonBlocking(profileDocRef, payload, { merge: true });
            
            toast({ title: 'Keahlian Disimpan', description: 'Melanjutkan ke langkah terakhir.' });
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
                <CardTitle>Keahlian & Sertifikasi</CardTitle>
                <CardDescription>Sebutkan keahlian, serta sertifikasi dan pelatihan yang pernah Anda ikuti.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
                        <div className='space-y-4'>
                            <h3 className="text-lg font-medium">Keahlian</h3>
                             <FormItem>
                                <FormLabel>Tambahkan Keahlian (minimal 1)</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="Contoh: Javascript (Tekan Enter untuk menambah)"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                    />
                                </FormControl>
                                <div className="pt-4 flex flex-wrap gap-2 min-h-[2.5rem]">
                                    {skills.map((skill) => (
                                        <Badge key={skill} variant="secondary" className="text-sm py-1 pl-3 pr-2">
                                            {skill}
                                            <button type="button" onClick={() => removeSkill(skill)} className="ml-2 rounded-full hover:bg-muted-foreground/20 p-0.5"><X className="h-3 w-3" /></button>
                                        </Badge>
                                    ))}
                                </div>
                                <FormMessage>{form.formState.errors.skills?.message}</FormMessage>
                            </FormItem>
                        </div>
                        <Separator />
                        <div className='space-y-4'>
                            <h3 className="text-lg font-medium">Sertifikasi & Pelatihan (Opsional)</h3>
                            <div className="space-y-6">
                                {certFields.map((field, index) => (
                                    <div key={field.id} className="space-y-4 p-4 border rounded-md relative">
                                        <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive hover:bg-destructive/10" onClick={() => removeCert(index)}><Trash2 className="h-4 w-4" /></Button>
                                        <FormField control={form.control} name={`certifications.${index}.name`} render={({ field }) => (<FormItem><FormLabel>Nama Sertifikasi/Pelatihan</FormLabel><FormControl><Input {...field} placeholder="Contoh: Certified Cloud Practitioner" /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name={`certifications.${index}.organization`} render={({ field }) => (<FormItem><FormLabel>Lembaga Penerbit</FormLabel><FormControl><Input {...field} placeholder="Contoh: Amazon Web Services" /></FormControl><FormMessage /></FormItem>)} />
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <FormField control={form.control} name={`certifications.${index}.issueDate`} render={({ field }) => (<FormItem><FormLabel>Tanggal Terbit</FormLabel><FormControl><Input {...field} placeholder="YYYY-MM" /></FormControl><FormMessage /></FormItem>)} />
                                            <FormField control={form.control} name={`certifications.${index}.expirationDate`} render={({ field }) => (<FormItem><FormLabel>Tgl Kedaluwarsa (Opsional)</FormLabel><FormControl><Input {...field} value={field.value || ''} placeholder="YYYY-MM" /></FormControl><FormMessage /></FormItem>)} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Button type="button" variant="outline" onClick={() => appendCert({ id: crypto.randomUUID(), name: '', organization: '', issueDate: '' })}><PlusCircle className="mr-2 h-4 w-4" /> Tambah Sertifikasi</Button>
                        </div>
                        <div className="flex justify-between pt-4">
                            <Button type="button" variant="secondary" onClick={onBack}>Kembali</Button>
                            <Button type="submit" disabled={isSaving}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan & Lanjut</Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
