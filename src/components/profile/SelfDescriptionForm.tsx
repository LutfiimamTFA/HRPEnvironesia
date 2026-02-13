'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { useEffect } from 'react';

const DRAFT_KEY = 'self-description-form-draft';

const formSchema = z.object({
  selfDescription: z.string().optional(),
  salaryExpectation: z.string().optional(),
  motivation: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface SelfDescriptionFormProps {
    initialData: {
        selfDescription?: string;
        salaryExpectation?: string;
        motivation?: string;
    };
    onSave: (data: FormValues) => Promise<void>;
    isSaving: boolean;
}

export function SelfDescriptionForm({ initialData, onSave, isSaving }: SelfDescriptionFormProps) {
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: (() => {
            try {
                const savedDraft = localStorage.getItem(DRAFT_KEY);
                if (savedDraft) {
                    return JSON.parse(savedDraft);
                }
            } catch (e) { console.error("Failed to load self description draft", e); }
            return {
                selfDescription: initialData?.selfDescription || '',
                salaryExpectation: initialData?.salaryExpectation || '',
                motivation: initialData?.motivation || '',
            };
        })(),
    });

    useEffect(() => {
        const savedDraft = localStorage.getItem(DRAFT_KEY);
        if (!savedDraft) {
            form.reset({
                selfDescription: initialData?.selfDescription || '',
                salaryExpectation: initialData?.salaryExpectation || '',
                motivation: initialData?.motivation || '',
            });
        }
    }, [initialData, form]);

    const { watch } = form;
    useEffect(() => {
        const subscription = watch((value) => {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
        });
        return () => subscription.unsubscribe();
    }, [watch]);


    const handleSubmit = async (values: FormValues) => {
        try {
            await onSave(values);
            localStorage.removeItem(DRAFT_KEY);
        } catch (error) {
            console.error("Failed to save self description data:", error);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Deskripsi Diri</CardTitle>
                <CardDescription>Berikan gambaran yang lebih dalam tentang diri Anda kepada tim rekruter.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
                        <FormField
                            control={form.control}
                            name="selfDescription"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Profil Singkat</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            {...field}
                                            value={field.value ?? ''}
                                            placeholder="Ceritakan secara singkat tentang karakter/kepribadian, sikap kerja, keunggulan, dan kekurangan diri Anda."
                                            rows={6}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="salaryExpectation"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Ekspektasi Gaji</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            value={field.value ?? ''}
                                            placeholder="Contoh: 5 - 7 Juta atau UMR"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="motivation"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Motivasi & Alasan</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            {...field}
                                            value={field.value ?? ''}
                                            placeholder="Jelaskan motivasi dan alasan yang mendasari Anda untuk bekerja pada bidang/posisi yang Anda pilih."
                                            rows={6}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        
                        <div className="flex justify-end">
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Simpan Deskripsi Diri
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
