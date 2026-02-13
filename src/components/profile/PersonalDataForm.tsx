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
import type { Profile } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { GoogleDatePicker } from '../ui/google-date-picker';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Checkbox } from '../ui/checkbox';
import React, { useEffect } from 'react';

const formSchema = z.object({
    fullName: z.string().min(2, { message: "Nama lengkap harus diisi." }),
    nickname: z.string().min(1, { message: "Nama panggilan harus diisi." }),
    email: z.string().email({ message: "Email tidak valid." }),
    phone: z.string().min(10, { message: "Nomor telepon tidak valid." }),
    eKtpNumber: z.string().length(16, { message: "Nomor e-KTP harus 16 digit." }),
    gender: z.enum(['Laki-laki', 'Perempuan'], { required_error: "Jenis kelamin harus dipilih." }),
    birthDate: z.date({ required_error: "Tanggal lahir harus diisi."}),
    addressKtp: z.string().min(10, { message: "Alamat KTP harus diisi." }),
    isDomicileSameAsKtp: z.boolean().default(false),
    addressDomicile: z.string().optional(),
    hasNpwp: z.boolean().default(false),
    npwpNumber: z.string().optional().or(z.literal('')),
    willingToWfo: z.enum(['ya', 'tidak'], { required_error: "Pilihan ini harus diisi." }),
    linkedinUrl: z.string().url().optional().or(z.literal('')),
    websiteUrl: z.string().url().optional().or(z.literal('')),
}).refine(data => {
    if (data.isDomicileSameAsKtp) return true;
    return data.addressDomicile && data.addressDomicile.length >= 10;
}, {
    message: "Alamat domisili harus diisi jika berbeda.",
    path: ["addressDomicile"],
}).refine(data => {
    if (!data.hasNpwp) return true;
    const npwpDigits = data.npwpNumber?.replace(/[\.\-]/g, '');
    return npwpDigits && (npwpDigits.length === 15 || npwpDigits.length === 16);
}, {
    message: "NPWP tidak valid. Harap masukkan 15 atau 16 digit.",
    path: ["npwpNumber"],
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
            fullName: initialData.fullName || '',
            nickname: initialData.nickname || '',
            email: initialData.email || '',
            phone: initialData.phone || '',
            eKtpNumber: initialData.eKtpNumber || '',
            gender: initialData.gender,
            birthDate: initialData.birthDate instanceof Timestamp ? initialData.birthDate.toDate() : initialData.birthDate,
            addressKtp: initialData.addressKtp || '',
            isDomicileSameAsKtp: initialData.isDomicileSameAsKtp || false,
            addressDomicile: initialData.addressDomicile || '',
            hasNpwp: initialData.hasNpwp || false,
            npwpNumber: initialData.npwpNumber || '',
            willingToWfo: typeof initialData.willingToWfo === 'boolean' ? (initialData.willingToWfo ? 'ya' : 'tidak') : undefined,
            linkedinUrl: initialData.linkedinUrl || '',
            websiteUrl: initialData.websiteUrl || '',
        },
    });

    useEffect(() => {
        form.reset({
            fullName: initialData.fullName || '',
            nickname: initialData.nickname || '',
            email: initialData.email || '',
            phone: initialData.phone || '',
            eKtpNumber: initialData.eKtpNumber || '',
            gender: initialData.gender,
            birthDate: initialData.birthDate instanceof Timestamp ? initialData.birthDate.toDate() : initialData.birthDate,
            addressKtp: initialData.addressKtp || '',
            isDomicileSameAsKtp: initialData.isDomicileSameAsKtp || false,
            addressDomicile: initialData.addressDomicile || '',
            hasNpwp: initialData.hasNpwp || false,
            npwpNumber: initialData.npwpNumber || '',
            willingToWfo: typeof initialData.willingToWfo === 'boolean' ? (initialData.willingToWfo ? 'ya' : 'tidak') : undefined,
            linkedinUrl: initialData.linkedinUrl || '',
            websiteUrl: initialData.websiteUrl || '',
        })
    }, [initialData, form]);

    const isDomicileSameAsKtp = form.watch('isDomicileSameAsKtp');
    const hasNpwp = form.watch('hasNpwp');

    const handleSubmit = (values: FormValues) => {
        const dataToSave: Partial<Profile> = {
            ...values,
            willingToWfo: values.willingToWfo === 'ya',
            birthDate: Timestamp.fromDate(values.birthDate),
            addressDomicile: values.isDomicileSameAsKtp ? values.addressKtp : values.addressDomicile || '',
        };
        onSave(dataToSave);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Informasi Pribadi</CardTitle>
                <CardDescription>Pastikan semua data yang Anda masukkan sudah benar.</CardDescription>
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
                                        <FormLabel>Nama Lengkap (Sesuai KTP)</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="nickname"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nama Panggilan</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
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
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="eKtpNumber"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nomor e-KTP</FormLabel>
                                        <FormControl>
                                            <Input {...field} maxLength={16} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="gender"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Jenis Kelamin</FormLabel>
                                         <FormControl>
                                            <RadioGroup
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                            className="flex items-center space-x-4 pt-2"
                                            >
                                                <FormItem className="flex items-center space-x-2 space-y-0">
                                                    <FormControl><RadioGroupItem value="Laki-laki" /></FormControl>
                                                    <FormLabel className="font-normal">Laki-laki</FormLabel>
                                                </FormItem>
                                                <FormItem className="flex items-center space-x-2 space-y-0">
                                                    <FormControl><RadioGroupItem value="Perempuan" /></FormControl>
                                                    <FormLabel className="font-normal">Perempuan</FormLabel>
                                                </FormItem>
                                            </RadioGroup>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="birthDate"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Tanggal Lahir</FormLabel>
                                    <FormControl>
                                        <GoogleDatePicker
                                            mode="dob"
                                            value={field.value}
                                            onChange={field.onChange}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="addressKtp"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Alamat Sesuai KTP</FormLabel>
                                    <FormControl>
                                        <Textarea {...field} placeholder="Masukkan alamat lengkap sesuai KTP..." />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="isDomicileSameAsKtp"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                    <FormControl>
                                        <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>
                                            Alamat domisili sama dengan alamat KTP
                                        </FormLabel>
                                    </div>
                                </FormItem>
                            )}
                        />
                        {!isDomicileSameAsKtp && (
                            <FormField
                                control={form.control}
                                name="addressDomicile"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Alamat Domisili</FormLabel>
                                        <FormControl>
                                            <Textarea {...field} value={field.value ?? ''} placeholder="Masukkan alamat domisili saat ini..." />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <FormField
                            control={form.control}
                            name="hasNpwp"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                    <FormControl>
                                        <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>
                                            Saya memiliki NPWP
                                        </FormLabel>
                                    </div>
                                </FormItem>
                            )}
                        />
                         {hasNpwp && (
                            <FormField
                                control={form.control}
                                name="npwpNumber"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nomor NPWP</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="Masukkan nomor NPWP Anda" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <FormField
                            control={form.control}
                            name="willingToWfo"
                            render={({ field }) => (
                                <FormItem className="space-y-3">
                                    <FormLabel>Apakah Anda bersedia Work From Office (WFO)?</FormLabel>
                                    <FormControl>
                                        <RadioGroup
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
                                        className="flex flex-col space-y-1"
                                        >
                                            <FormItem className="flex items-center space-x-3 space-y-0">
                                                <FormControl>
                                                <RadioGroupItem value="ya" />
                                                </FormControl>
                                                <FormLabel className="font-normal">
                                                Ya
                                                </FormLabel>
                                            </FormItem>
                                            <FormItem className="flex items-center space-x-3 space-y-0">
                                                <FormControl>
                                                <RadioGroupItem value="tidak" />
                                                </FormControl>
                                                <FormLabel className="font-normal">
                                                Tidak
                                                </FormLabel>
                                            </FormItem>
                                        </RadioGroup>
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
