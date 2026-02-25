'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore } from '@/firebase';
import { doc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '../ui/checkbox';

const formSchema = z.object({
  selfDescription: z.string().min(20, { message: "Deskripsi diri harus diisi, minimal 20 karakter." }),
  salaryExpectation: z.string().min(1, { message: "Ekspektasi gaji harus diisi." }),
  motivation: z.string().min(20, { message: "Motivasi dan alasan harus diisi, minimal 20 karakter." }),
  declaration: z.literal(true, {
    errorMap: () => ({ message: "Anda harus menyetujui pernyataan ini untuk menyelesaikan profil." }),
  }),
});

type FormValues = z.infer<typeof formSchema>;

interface SelfDescriptionFormProps {
    initialData: {
        selfDescription?: string;
        salaryExpectation?: string;
        motivation?: string;
    };
    onFinish: () => void;
    onBack: () => void;
}

export function SelfDescriptionForm({ initialData, onFinish, onBack }: SelfDescriptionFormProps) {
    const [isSaving, setIsSaving] = useState(false);
    const { firebaseUser } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            selfDescription: initialData?.selfDescription || '',
            salaryExpectation: initialData?.salaryExpectation || '',
            motivation: initialData?.motivation || '',
            declaration: false,
        },
    });

    const handleSubmit = async (values: FormValues) => {
        if (!firebaseUser) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
            return;
        }
        setIsSaving(true);
        try {
            const { declaration, ...rest } = values;
            
            const batch = writeBatch(firestore);
            const now = serverTimestamp();

            const profileDocRef = doc(firestore, 'profiles', firebaseUser.uid);
            const profilePayload = {
                ...rest,
                profileStatus: 'completed',
                profileStep: 6,
                updatedAt: now,
                completedAt: now,
            };
            batch.update(profileDocRef, profilePayload);

            const userDocRef = doc(firestore, 'users', firebaseUser.uid);
            batch.update(userDocRef, { isProfileComplete: true });

            await batch.commit();
            
            toast({ title: 'Profil Selesai!', description: 'Profil Anda telah berhasil disimpan dan dilengkapi.' });
            onFinish();
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Gagal Menyimpan", description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Deskripsi Diri & Pernyataan</CardTitle>
                <CardDescription>Ini adalah langkah terakhir. Berikan sentuhan personal pada profil Anda. Kolom dengan tanda <span className="text-destructive">*</span> adalah kolom yang wajib diisi.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
                        <FormField control={form.control} name="selfDescription" render={({ field }) => (<FormItem><FormLabel>Profil Singkat <span className="text-destructive">*</span></FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Ceritakan secara singkat tentang karakter/kepribadian, sikap kerja, keunggulan, dan kekurangan diri Anda." rows={6} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="salaryExpectation" render={({ field }) => (<FormItem><FormLabel>Ekspektasi Gaji <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Contoh: 5 - 7 Juta atau UMR" /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="motivation" render={({ field }) => (<FormItem><FormLabel>Motivasi & Alasan <span className="text-destructive">*</span></FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Jelaskan motivasi dan alasan yang mendasari Anda untuk bekerja pada bidang/posisi yang Anda pilih." rows={6} /></FormControl><FormMessage /></FormItem>)} />
                        
                        <FormField
                            control={form.control}
                            name="declaration"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
                                <FormControl>
                                    <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                    <FormLabel>Pernyataan Kebenaran Data <span className="text-destructive">*</span></FormLabel>
                                    <FormDescription>
                                        Saya menyatakan dengan sesungguhnya bahwa seluruh data yang saya berikan adalah benar dan dapat dipertanggungjawabkan.
                                    </FormDescription>
                                    <FormMessage />
                                </div>
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-between pt-4">
                            <Button type="button" variant="secondary" onClick={onBack}>
                                Kembali
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Selesaikan & Kirim Profil
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
