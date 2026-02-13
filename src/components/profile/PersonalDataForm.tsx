'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { DatePickerField } from '../ui/date-picker-field';
import type { Profile } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';

const formSchema = z.object({
    fullName: z.string().min(2, { message: "Nama lengkap harus diisi." }),
    email: z.string().email({ message: "Email tidak valid." }),
    phone: z.string().min(10, { message: "Nomor telepon tidak valid." }),
    birthDate: z.date({ required_error: "Tanggal lahir harus diisi."}),
    address: z.string().min(10, { message: "Alamat harus diisi." }),
    linkedinUrl: z.string().url().optional().or(z.literal('')),
    websiteUrl: z.string().url().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

interface PersonalDataFormProps {
    initialData: Partial<Profile>;
    onSave: (data: Partial<Profile>) => Promise<void>;
    isSaving: boolean;
}

export function PersonalDataForm({ initialData, onSave, isSaving }: PersonalDataFormProps) {
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            ...initialData,
            birthDate: initialData.birthDate?.toDate(),
        },
    });

    const handleSubmit = (values: FormValues) => {
        const dataToSave: Partial<Profile> = {
            ...values,
            birthDate: Timestamp.fromDate(values.birthDate)
        };
        onSave(dataToSave);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Informasi Pribadi</CardTitle>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <FormField
                                control={form.control}
                                name="fullName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nama Lengkap</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input {...field} readOnly disabled />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="phone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nomor Telepon</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="0812..." />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="birthDate"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Tanggal Lahir</FormLabel>
                                        <FormControl>
                                            <DatePickerField
                                                value={field.value}
                                                onChange={field.onChange}
                                                disabled={(date) => date > new Date()}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <FormField
                            control={form.control}
                            name="address"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Alamat Lengkap</FormLabel>
                                    <FormControl>
                                        <Textarea {...field} placeholder="Masukkan alamat lengkap Anda..." />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="linkedinUrl"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Profil LinkedIn (Opsional)</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="https://linkedin.com/in/..." />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="websiteUrl"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Situs Web/Portofolio (Opsional)</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="https://github.com/..." />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="flex justify-end">
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Simpan Data Pribadi
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    )
}
