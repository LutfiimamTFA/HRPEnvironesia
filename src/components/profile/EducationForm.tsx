'use client';

import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import type { Education } from '@/lib/types';
import { Checkbox } from '../ui/checkbox';
import { Separator } from '../ui/separator';

const educationSchema = z.object({
  id: z.string(),
  institution: z.string().min(1, "Nama institusi harus diisi"),
  degree: z.string().optional(),
  fieldOfStudy: z.string().optional(),
  startDate: z.string().min(4, "Tahun mulai harus diisi"),
  endDate: z.string().min(4, "Tahun selesai harus diisi").optional().or(z.literal('')),
  isCurrent: z.boolean().default(false),
}).refine(data => data.isCurrent || (data.endDate && data.endDate.length > 0), {
    message: "Tahun selesai harus diisi jika tidak sedang menempuh pendidikan ini.",
    path: ["endDate"],
});


const formSchema = z.object({
  education: z.array(educationSchema),
});

type FormValues = z.infer<typeof formSchema>;

interface EducationFormProps {
    initialData: Education[];
    onSave: (data: Education[]) => Promise<void>;
    isSaving: boolean;
}

export function EducationForm({ initialData, onSave, isSaving }: EducationFormProps) {
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            education: initialData.map(item => ({ ...item })) || [],
        },
    });
    
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "education",
    });

    const handleSubmit = (values: FormValues) => {
        onSave(values.education);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Riwayat Pendidikan</CardTitle>
                <CardDescription>Tambahkan riwayat pendidikan formal Anda.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
                        {fields.map((field, index) => (
                            <div key={field.id} className="space-y-4 p-4 border rounded-md relative">
                                <Button 
                                    type="button"
                                    variant="ghost" 
                                    size="icon" 
                                    className="absolute top-2 right-2 text-destructive hover:bg-destructive/10"
                                    onClick={() => remove(index)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name={`education.${index}.institution`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Nama Institusi</FormLabel>
                                                <FormControl><Input {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name={`education.${index}.degree`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Gelar (Opsional)</FormLabel>
                                                <FormControl><Input {...field} value={field.value || ''} placeholder="Contoh: Sarjana Ekonomi" /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <FormField
                                    control={form.control}
                                    name={`education.${index}.fieldOfStudy`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Bidang Studi / Jurusan (Opsional)</FormLabel>
                                            <FormControl><Input {...field} value={field.value || ''} placeholder="Contoh: Akuntansi, IPA" /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <FormField
                                        control={form.control}
                                        name={`education.${index}.startDate`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Tahun Mulai</FormLabel>
                                                <FormControl><Input type="number" {...field} placeholder="YYYY" /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                     <FormField
                                        control={form.control}
                                        name={`education.${index}.endDate`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Tahun Selesai</FormLabel>
                                                <FormControl><Input type="number" {...field} placeholder="YYYY" disabled={form.watch(`education.${index}.isCurrent`)} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <FormField
                                    control={form.control}
                                    name={`education.${index}.isCurrent`}
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                            <div className="space-y-1 leading-none">
                                                <FormLabel>Saat ini sedang menempuh pendidikan di sini</FormLabel>
                                            </div>
                                        </FormItem>
                                    )}
                                />
                                {index < fields.length - 1 && <Separator />}
                            </div>
                        ))}
                        
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => append({ id: crypto.randomUUID(), institution: '', degree: '', fieldOfStudy: '', startDate: '', endDate: '', isCurrent: false })}
                        >
                            <PlusCircle className="mr-2 h-4 w-4" /> Tambah Pendidikan
                        </Button>
                        
                        <div className="flex justify-end">
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Simpan Pendidikan
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
