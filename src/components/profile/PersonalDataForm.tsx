'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import type { Profile, Address } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { GoogleDatePicker } from '../ui/google-date-picker';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Checkbox } from '../ui/checkbox';
import React, { useEffect } from 'react';
import { Alert, AlertDescription } from '../ui/alert';

const DRAFT_KEY = 'personal-data-form-draft';

const addressObjectSchema = z.object({
    street: z.string().min(5, "Alamat jalan harus diisi."),
    rt: z.string().min(1, "RT harus diisi."),
    rw: z.string().min(1, "RW harus diisi."),
    village: z.string().min(2, "Kelurahan/Desa harus diisi."),
    district: z.string().min(2, "Kecamatan harus diisi."),
    city: z.string().min(2, "Kota/Kabupaten harus diisi."),
    province: z.string().min(2, "Provinsi harus diisi."),
    postalCode: z.string().min(5, "Kode Pos harus diisi."),
});

const formSchema = z.object({
    fullName: z.string().min(2, { message: "Nama lengkap harus diisi." }),
    nickname: z.string().min(1, { message: "Nama panggilan harus diisi." }),
    email: z.string().email({ message: "Email tidak valid." }),
    phone: z.string().min(10, { message: "Nomor telepon tidak valid." }),
    eKtpNumber: z.string().length(16, { message: "Nomor e-KTP harus 16 digit." }),
    gender: z.enum(['Laki-laki', 'Perempuan'], { required_error: "Jenis kelamin harus dipilih." }),
    birthDate: z.date({ required_error: "Tanggal lahir harus diisi."}),
    addressKtp: addressObjectSchema,
    isDomicileSameAsKtp: z.boolean().default(false),
    addressDomicile: addressObjectSchema.deepPartial().optional(), // Make fields optional for conditional validation
    hasNpwp: z.boolean().default(false),
    npwpNumber: z.string().optional().or(z.literal('')),
    willingToWfo: z.enum(['ya', 'tidak'], { required_error: "Pilihan ini harus diisi." }),
    linkedinUrl: z.string().url().optional().or(z.literal('')),
    websiteUrl: z.string().url().optional().or(z.literal('')),
}).superRefine((data, ctx) => {
    // Conditionally validate addressDomicile only if the checkbox is unchecked
    if (!data.isDomicileSameAsKtp) {
        const domicileResult = addressObjectSchema.safeParse(data.addressDomicile);
        if (!domicileResult.success) {
            domicileResult.error.errors.forEach((error) => {
                ctx.addIssue({
                    ...error,
                    path: ['addressDomicile', ...error.path],
                });
            });
        }
    }

    // Conditionally validate npwpNumber
    if (data.hasNpwp) {
        const npwpDigits = data.npwpNumber?.replace(/[\.\-]/g, '');
        if (!npwpDigits || (npwpDigits.length !== 15 && npwpDigits.length !== 16)) {
             ctx.addIssue({
                path: ["npwpNumber"],
                message: "NPWP tidak valid. Harap masukkan 15 atau 16 digit.",
                code: 'custom'
            });
        }
    }
});


type FormValues = z.infer<typeof formSchema>;

interface PersonalDataFormProps {
    initialData: Partial<Profile>;
    onSave: (data: Partial<Profile>) => Promise<void>;
    isSaving: boolean;
}

const addressDefaultValues: Address = {
    street: '',
    rt: '',
    rw: '',
    village: '',
    district: '',
    city: '',
    province: '',
    postalCode: '',
};

const getAddressObject = (address: any): Address => {
    if (typeof address === 'string') {
        return { ...addressDefaultValues, street: address };
    }
    return address ? { ...addressDefaultValues, ...address } : addressDefaultValues;
};


export function PersonalDataForm({ initialData, onSave, isSaving }: PersonalDataFormProps) {
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: (() => {
            try {
                const savedDraft = localStorage.getItem(DRAFT_KEY);
                if (savedDraft) {
                    const parsed = JSON.parse(savedDraft);
                    // Dates need to be converted back from string
                    if (parsed.birthDate) {
                        parsed.birthDate = new Date(parsed.birthDate);
                    }
                    return parsed;
                }
            } catch (e) { console.error("Failed to load personal data draft", e); }
            return {
                fullName: initialData.fullName || '',
                nickname: initialData.nickname || '',
                email: initialData.email || '',
                phone: initialData.phone || '',
                eKtpNumber: initialData.eKtpNumber || '',
                gender: initialData.gender,
                birthDate: initialData.birthDate instanceof Timestamp ? initialData.birthDate.toDate() : initialData.birthDate,
                addressKtp: getAddressObject(initialData.addressKtp),
                isDomicileSameAsKtp: initialData.isDomicileSameAsKtp || false,
                addressDomicile: getAddressObject(initialData.addressDomicile),
                hasNpwp: initialData.hasNpwp || false,
                npwpNumber: initialData.npwpNumber || '',
                willingToWfo: typeof initialData.willingToWfo === 'boolean' ? (initialData.willingToWfo ? 'ya' : 'tidak') : undefined,
                linkedinUrl: initialData.linkedinUrl || '',
                websiteUrl: initialData.websiteUrl || '',
            };
        })(),
    });

    useEffect(() => {
        const savedDraft = localStorage.getItem(DRAFT_KEY);
        if (!savedDraft) {
            form.reset({
                fullName: initialData.fullName || '',
                nickname: initialData.nickname || '',
                email: initialData.email || '',
                phone: initialData.phone || '',
                eKtpNumber: initialData.eKtpNumber || '',
                gender: initialData.gender,
                birthDate: initialData.birthDate instanceof Timestamp ? initialData.birthDate.toDate() : initialData.birthDate,
                addressKtp: getAddressObject(initialData.addressKtp),
                isDomicileSameAsKtp: initialData.isDomicileSameAsKtp || false,
                addressDomicile: getAddressObject(initialData.addressDomicile),
                hasNpwp: initialData.hasNpwp || false,
                npwpNumber: initialData.npwpNumber || '',
                willingToWfo: typeof initialData.willingToWfo === 'boolean' ? (initialData.willingToWfo ? 'ya' : 'tidak') : undefined,
                linkedinUrl: initialData.linkedinUrl || '',
                websiteUrl: initialData.websiteUrl || '',
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


    const isDomicileSameAsKtp = form.watch('isDomicileSameAsKtp');
    const hasNpwp = form.watch('hasNpwp');

    const handleSubmit = async (values: FormValues) => {
        const dataToSave: Partial<Profile> = {
            ...values,
            willingToWfo: values.willingToWfo === 'ya',
            birthDate: Timestamp.fromDate(values.birthDate),
            addressDomicile: values.isDomicileSameAsKtp ? values.addressKtp : (values.addressDomicile as Address || addressDefaultValues),
        };
        try {
            await onSave(dataToSave);
            localStorage.removeItem(DRAFT_KEY);
        } catch (error) {
            console.error("Failed to save personal data:", error);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Informasi Pribadi</CardTitle>
                <CardDescription>Pastikan semua data yang Anda masukkan sudah benar. Kolom dengan tanda <span className="text-destructive">*</span> wajib diisi.</CardDescription>
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
                                        <FormLabel>Nama Lengkap (Sesuai KTP) <span className="text-destructive">*</span></FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value ?? ''} />
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
                                        <FormLabel>Nama Panggilan <span className="text-destructive">*</span></FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value ?? ''} />
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
                                        <FormLabel>Email <span className="text-destructive">*</span></FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value ?? ''} />
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
                                        <FormLabel>Nomor Telepon <span className="text-destructive">*</span></FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value ?? ''} placeholder="0812..." />
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
                                        <FormLabel>Nomor e-KTP <span className="text-destructive">*</span></FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value ?? ''} maxLength={16} />
                                        </FormControl>
                                        <FormMessage />
                                        <Alert variant="destructive" className="mt-2 flex items-start gap-2 text-amber-800 dark:text-amber-400 border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-500">
                                            <AlertTriangle className="h-4 w-4 mt-0.5" />
                                            <AlertDescription className="text-xs">
                                                Mohon pastikan kembali Nomor NIK KTP yang Anda masukkan sama dengan yang tertulis di KTP untuk kelancaran proses verifikasi.
                                            </AlertDescription>
                                        </Alert>
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="gender"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Jenis Kelamin <span className="text-destructive">*</span></FormLabel>
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
                                    <FormLabel>Tanggal Lahir <span className="text-destructive">*</span></FormLabel>
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

                        {/* KTP Address */}
                        <div className="space-y-4">
                            <FormLabel>Alamat Sesuai KTP <span className="text-destructive">*</span></FormLabel>
                            <div className="p-4 border rounded-lg space-y-4">
                                <FormField
                                    control={form.control}
                                    name="addressKtp.street"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Jalan <span className="text-destructive">*</span></FormLabel>
                                            <FormControl>
                                                <Textarea {...field} value={field.value ?? ''} placeholder="Masukkan nama jalan, nomor rumah, dll..." />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField control={form.control} name="addressKtp.rt" render={({ field }) => (<FormItem><FormLabel>RT <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="001" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name="addressKtp.rw" render={({ field }) => (<FormItem><FormLabel>RW <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="002" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                </div>
                                <FormField control={form.control} name="addressKtp.village" render={({ field }) => (<FormItem><FormLabel>Kelurahan/Desa <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Caturtunggal" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="addressKtp.district" render={({ field }) => (<FormItem><FormLabel>Kecamatan <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Depok" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField control={form.control} name="addressKtp.city" render={({ field }) => (<FormItem><FormLabel>Kota/Kabupaten <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Sleman" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name="addressKtp.province" render={({ field }) => (<FormItem><FormLabel>Provinsi <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="D.I. Yogyakarta" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                </div>
                                <FormField control={form.control} name="addressKtp.postalCode" render={({ field }) => (<FormItem><FormLabel>Kode Pos <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="55281" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                            </div>
                        </div>


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

                        {/* Domicile Address */}
                        {!isDomicileSameAsKtp && (
                             <div className="space-y-4">
                                <FormLabel>Alamat Domisili <span className="text-destructive">*</span></FormLabel>
                                <div className="p-4 border rounded-lg space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="addressDomicile.street"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Jalan <span className="text-destructive">*</span></FormLabel>
                                                <FormControl>
                                                    <Textarea {...field} value={field.value ?? ''} placeholder="Masukkan nama jalan, nomor rumah, dll..." />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField control={form.control} name="addressDomicile.rt" render={({ field }) => (<FormItem><FormLabel>RT <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="001" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name="addressDomicile.rw" render={({ field }) => (<FormItem><FormLabel>RW <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="002" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                    <FormField control={form.control} name="addressDomicile.village" render={({ field }) => (<FormItem><FormLabel>Kelurahan/Desa <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Caturtunggal" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name="addressDomicile.district" render={({ field }) => (<FormItem><FormLabel>Kecamatan <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Depok" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField control={form.control} name="addressDomicile.city" render={({ field }) => (<FormItem><FormLabel>Kota/Kabupaten <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Sleman" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name="addressDomicile.province" render={({ field }) => (<FormItem><FormLabel>Provinsi <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="D.I. Yogyakarta" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                    <FormField control={form.control} name="addressDomicile.postalCode" render={({ field }) => (<FormItem><FormLabel>Kode Pos <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="55281" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                </div>
                            </div>
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
                                        <FormLabel>Nomor NPWP <span className="text-destructive">*</span></FormLabel>
                                        <FormControl>
                                            <Input {...field} value={field.value ?? ''} placeholder="Masukkan nomor NPWP Anda" />
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
                                    <FormLabel>Apakah Anda bersedia Work From Office (WFO)? <span className="text-destructive">*</span></FormLabel>
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
                                            <Input {...field} value={field.value ?? ''} placeholder="https://linkedin.com/in/..." />
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
                                            <Input {...field} value={field.value ?? ''} placeholder="https://github.com/..." />
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
