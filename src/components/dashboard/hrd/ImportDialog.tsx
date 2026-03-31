'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UploadCloud, Loader2, ArrowRight, Info, Edit, FileQuestion, HelpCircle, Sparkles, ArrowLeft, AlertCircle, CheckCircle, FileUp, XCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HRP_FIELD_GROUPS, RECOMMENDED_HRP_FIELDS } from '@/lib/hrp-fields';
import { useAuth } from '@/providers/auth-provider';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess?: () => void;
}

interface ImportResult {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: string[];
}

const normalizeHeader = (header: string) => header ? header.toLowerCase().replace(/[\s_]+/g, '') : '';

const suggestMapping = (header: string): string => {
    const normalizedHeader = normalizeHeader(header);
    if (!normalizedHeader) return '';

    const keywordMap: Record<string, string[]> = {
        fullName: ['nama', 'namalengkap', 'fullname'],
        email: ['email', 'emailkantor', 'emailaddress'],
        phone: ['telepon', 'hp', 'nohp', 'phone', 'kontak'],
        employeeNumber: ['nik', 'nomorinduk', 'nomorkaryawan', 'employeeid'],
        brandName: ['brand', 'perusahaan', 'company'],
        division: ['divisi', 'division', 'departemen', 'department'],
        positionTitle: ['jabatan', 'posisi', 'jabatandikantor', 'position'],
        managerName: ['manager', 'atasan', 'supervisor', 'pic'],
        joinDate: ['join', 'masuk', 'tanggalbergabung', 'joindate', 'hiredate', 'tglmasuk'],
        employmentStatus: ['status', 'employmentstatus', 'statuskerja'],
        nik: ['ktp', 'noktp', 'nomorktp', 'identitynumber'],
        npwp: ['npwp', 'nomornpwp'],
        bpjsKesehatan: ['bpjskesehatan'],
        bpjsKetenagakerjaan: ['bpjsketenagakerjaan', 'bpjstk'],
        bankAccountNumber: ['rekening', 'norek', 'bankaccount'],
    };

    for (const hrpField in keywordMap) {
        for (const keyword of keywordMap[hrpField]) {
            if (normalizedHeader.includes(keyword)) {
                return hrpField;
            }
        }
    }
    return '';
};

const parseCsv = (csvText: string): { headers: string[], rows: Record<string, string>[] } => {
    const lines = csvText.split(/\r\n|\n/);
    if (lines.length < 2) return { headers: [], rows: [] };
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const rowObject: Record<string, string> = {};
        headers.forEach((header, index) => {
            rowObject[header] = values[index];
        });
        return rowObject;
    }).filter(row => Object.values(row).some(val => val)); // Filter out empty rows

    return { headers, rows };
};


export function ImportDialog({ open, onOpenChange, onImportSuccess }: ImportDialogProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const [csvData, setCsvData] = useState<{ headers: string[], rows: Record<string, string>[] }>({ headers: [], rows: [] });
    const [columnMapping, setColumnMapping] = useState<Record<string, string | undefined>>({});
    const [customFieldNames, setCustomFieldNames] = useState<Record<string, string>>({});
    const [importResult, setImportResult] = useState<ImportResult | null>(null);

    const { toast } = useToast();
    const { firebaseUser } = useAuth();

    const resetState = () => {
        setSelectedFile(null);
        setIsDragging(false);
        setStep(1);
        setCsvData({ headers: [], rows: [] });
        setColumnMapping({});
        setCustomFieldNames({});
        setImportResult(null);
    };
    
    const handleClose = (isOpen: boolean) => {
        if (!isOpen) {
            setTimeout(resetState, 300); // Delay reset to allow for closing animation
        }
        onOpenChange(isOpen);
    };

    const handleFileSelect = useCallback((file: File | null) => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            toast({ variant: 'destructive', title: 'File Terlalu Besar', description: 'Ukuran file tidak boleh melebihi 5MB.' });
            return;
        }
        if (!file.name.endsWith('.csv')) {
            toast({ variant: 'destructive', title: 'Format Tidak Valid', description: 'Saat ini hanya file .csv yang didukung.' });
            return;
        }
        setSelectedFile(file);
    }, [toast]);
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => handleFileSelect(e.target.files?.[0] || null);
    const handleDragEvents = (e: React.DragEvent<HTMLLabelElement>, isEntering: boolean) => { e.preventDefault(); e.stopPropagation(); setIsDragging(isEntering); };
    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => { handleDragEvents(e, false); handleFileSelect(e.dataTransfer.files?.[0] || null); };
    
    const handleNextStep = () => {
        if (!selectedFile) {
            toast({ variant: 'destructive', title: 'Tidak ada file', description: 'Silakan pilih file CSV untuk diimpor.' });
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const { headers, rows } = parseCsv(text);
            if (headers.length === 0) {
                 toast({ variant: 'destructive', title: 'File Kosong atau Tidak Valid', description: 'Pastikan file CSV Anda memiliki header dan data.' });
                 return;
            }
            setCsvData({ headers, rows });
            
            const initialMapping: Record<string, string | undefined> = {};
            headers.forEach(header => {
              const suggestion = suggestMapping(header);
              initialMapping[header] = suggestion || undefined;
            });
            setColumnMapping(initialMapping);

            setStep(2);
        };
        reader.readAsText(selectedFile);
    };
    
    const { isMappingComplete, unmappedRequiredFields, mappingSummary } = useMemo(() => {
        const mappedValues = new Set(Object.values(columnMapping).filter((v): v is string => !!v && !v.startsWith('__')));
        const mappedRecommended = RECOMMENDED_HRP_FIELDS.filter(field => mappedValues.has(field.value));
        const unmappedRecommended = RECOMMENDED_HRP_FIELDS.filter(field => !mappedValues.has(field.value));
        const autoDetectedCount = csvData.headers.filter(header => suggestMapping(header) && columnMapping[header] === suggestMapping(header)).length;
        const unmappedCount = csvData.headers.filter(header => !columnMapping[header]).length;
        const skippedCount = csvData.headers.filter(header => columnMapping[header] === '__skip__').length;
        const mappedManuallyCount = Object.values(columnMapping).filter(v => v && !suggestMapping(Object.keys(columnMapping).find(k => columnMapping[k] === v) || '')).length;

        return {
            isMappingComplete: unmappedRecommended.length === 0,
            unmappedRequiredFields: unmappedRecommended,
            mappingSummary: {
                autoDetected: autoDetectedCount,
                mappedManually: mappedManuallyCount,
                unmapped: unmappedCount,
                skipped: skippedCount,
                recommendedProgress: `${mappedRecommended.length}/${RECOMMENDED_HRP_FIELDS.length}`,
            }
        };
    }, [columnMapping, csvData.headers]);

    const handleMappingChange = (csvHeader: string, hrpField: string | undefined) => {
        setColumnMapping(prev => ({...prev, [csvHeader]: hrpField}));
        if (hrpField !== '__custom__') {
          setCustomFieldNames(prev => {
            const newNames = { ...prev };
            delete newNames[csvHeader];
            return newNames;
          });
        }
    };
    
    const handleCustomFieldNameChange = (csvHeader: string, customName: string) => {
      setCustomFieldNames(prev => ({...prev, [csvHeader]: customName }));
    }

    const handleImportFinal = async () => {
        if (!firebaseUser) {
             toast({ variant: 'destructive', title: 'Sesi tidak valid', description: 'Silakan login kembali.' });
             return;
        }
        setIsProcessing(true);
        try {
            const idToken = await firebaseUser.getIdToken();
            const response = await fetch('/api/admin/import-employees', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    rows: csvData.rows,
                    mapping: columnMapping,
                    customFields: customFieldNames,
                }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Terjadi kesalahan di server.');
            }
            setImportResult(result);
            setStep(4); // Move to results step
            onImportSuccess?.();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Gagal Mengimpor Data', description: e.message });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className={cn(
                "max-w-xl transition-all duration-300", 
                (step === 2 || step === 3) && "sm:max-w-5xl h-[90vh] flex flex-col p-0",
                step === 4 && "sm:max-w-lg"
            )}>
                <DialogHeader className={cn("p-6 pb-2", step >= 2 && "border-b")}>
                    <DialogTitle>
                      {step === 1 && 'Import Data Karyawan'}
                      {step === 2 && 'Tahap 2: Pemetaan Kolom'}
                      {step === 3 && 'Tahap 3: Pratinjau & Konfirmasi'}
                      {step === 4 && 'Hasil Impor'}
                    </DialogTitle>
                    <DialogDescription>
                       {step === 1 && 'Unggah file CSV untuk menambah atau memperbarui data karyawan secara massal.'}
                       {step === 2 && 'Sesuaikan kolom dari file Anda dengan field yang ada di sistem HRP.'}
                       {step === 3 && 'Tinjau beberapa baris data Anda sebelum mengimpor secara final.'}
                       {step === 4 && 'Berikut adalah ringkasan dari proses impor yang telah selesai.'}
                    </DialogDescription>
                </DialogHeader>
                
                {/* --- STEP 1: UPLOAD --- */}
                {step === 1 && (
                     <div className="p-6">
                       <label 
                            htmlFor="dropzone-file"
                            className={cn( "flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-muted transition-colors", isDragging ? "border-primary bg-primary/10" : "hover:bg-muted/80" )}
                            onDragOver={(e) => handleDragEvents(e, true)} onDragLeave={(e) => handleDragEvents(e, false)}
                            onDragEnd={(e) => handleDragEvents(e, false)} onDrop={handleDrop}
                        >
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadCloud className="w-8 h-8 mb-4 text-muted-foreground" />
                                {selectedFile ? (
                                    <><p className="font-semibold text-foreground">{selectedFile.name}</p><p className="text-xs text-muted-foreground">({(selectedFile.size / 1024).toFixed(2)} KB)</p></>
                                ) : (
                                    <><p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Klik untuk mengunggah</span> atau seret file ke sini</p><p className="text-xs text-muted-foreground">Hanya format .csv (Maks. 5MB)</p></>
                                )}
                            </div>
                            <input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} accept=".csv" />
                        </label> 
                    </div>
                )}
                
                {/* --- STEP 2: MAPPING --- */}
                {step === 2 && (
                    <div className="flex-grow overflow-y-auto px-6">
                        <div className="py-4 space-y-4">
                            <Alert>
                                <Info className="h-4 w-4" />
                                <AlertTitle>Petunjuk Pemetaan</AlertTitle>
                                <AlertDescription>
                                    Kolom di kiri adalah header asli dari file Anda. Pilih field tujuan yang sesuai di HRP pada dropdown di kanan. Field yang ditandai <strong className="text-destructive">*</strong> disarankan untuk dipetakan.
                                </AlertDescription>
                            </Alert>
                             <div className="rounded-md border max-h-[55vh]">
                                <ScrollArea className="h-full">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-muted z-10">
                                        <TableRow>
                                            <TableHead className="w-[40%] font-bold">Kolom dari File Anda</TableHead>
                                            <TableHead className="w-[45%] font-bold">Petakan ke Field Sistem HRP</TableHead>
                                            <TableHead className="w-[15%] text-center font-bold">Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {csvData.headers.map(header => {
                                            const mappedValue = columnMapping[header];
                                            const isAutoSuggested = !!suggestMapping(header) && mappedValue === suggestMapping(header);
                                            const isCustom = mappedValue === '__custom__';

                                            return (
                                            <TableRow key={header}>
                                                <TableCell className="font-semibold bg-slate-50 dark:bg-slate-900">{header}</TableCell>
                                                <TableCell>
                                                    <div className="space-y-2">
                                                        <Select onValueChange={(value) => handleMappingChange(header, value)} value={mappedValue || '__skip__'}>
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="(Jangan Impor Kolom Ini)" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="__skip__">(Jangan Impor Kolom Ini)</SelectItem>
                                                                <SelectSeparator />
                                                                {Object.entries(HRP_FIELD_GROUPS).map(([group, fields]) => (
                                                                    <SelectGroup key={group}>
                                                                        <SelectLabel>{group}</SelectLabel>
                                                                        {fields.map(field => (
                                                                            <SelectItem key={field.value} value={field.value}>
                                                                                {field.label} {field.required && <span className="text-destructive">*</span>}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectGroup>
                                                                ))}
                                                                 <SelectSeparator />
                                                                 <SelectItem value="__custom__">Buat Field Baru...</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                         {isCustom && (
                                                            <Input 
                                                                placeholder="Masukkan nama field baru..."
                                                                value={customFieldNames[header] || ''}
                                                                onChange={(e) => handleCustomFieldNameChange(header, e.target.value)}
                                                            />
                                                         )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {isAutoSuggested ? <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-300">Otomatis</Badge> : (mappedValue ? (mappedValue === '__skip__' ? <Badge variant="outline">Diabaikan</Badge> : (mappedValue === '__custom__' ? <Badge>Kustom</Badge> : <Badge variant="default">Dipilih</Badge>)) : <Badge variant="outline">Belum</Badge>)}
                                                </TableCell>
                                            </TableRow>
                                        )})}
                                    </TableBody>
                                </Table>
                                </ScrollArea>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* --- STEP 3: PREVIEW --- */}
                {step === 3 && (
                     <div className="flex-grow overflow-y-auto px-6">
                        <div className="py-4 space-y-4">
                             <Alert>
                                <Info className="h-4 w-4" />
                                <AlertTitle>Pratinjau Impor</AlertTitle>
                                <AlertDescription>Ini adalah 5 baris pertama dari data Anda berdasarkan pemetaan yang telah Anda atur. Periksa kembali sebelum melanjutkan.</AlertDescription>
                            </Alert>
                             <div className="rounded-md border max-h-[60vh]">
                                <ScrollArea className="h-full">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-muted z-10">
                                            <TableRow>
                                                {csvData.headers.map(header => {
                                                    const mappedField = columnMapping[header];
                                                    const isSkipped = !mappedField || mappedField === '__skip__';
                                                    if (isSkipped) return null;
                                                    const hrpField = mappedField === '__custom__'
                                                        ? customFieldNames[header]
                                                        : RECOMMENDED_HRP_FIELDS.find(f => f.value === mappedField)?.label;
                                                    return <TableHead key={header}>{hrpField || header}</TableHead>;
                                                })}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {csvData.rows.slice(0, 5).map((row, rowIndex) => (
                                                <TableRow key={rowIndex}>
                                                    {csvData.headers.map(header => {
                                                        const mappedField = columnMapping[header];
                                                        const isSkipped = !mappedField || mappedField === '__skip__';
                                                        if (isSkipped) return null;
                                                        return <TableCell key={`${rowIndex}-${header}`}>{row[header]}</TableCell>;
                                                    })}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- STEP 4: RESULTS --- */}
                {step === 4 && (
                    <div className="p-6">
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">Ringkasan Hasil Impor</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <KpiCard title="Berhasil Dibuat" value={importResult?.created || 0} />
                                <KpiCard title="Berhasil Diperbarui" value={importResult?.updated || 0} />
                                <KpiCard title="Gagal / Dilewati" value={importResult?.failed || 0} deltaType='inverse' />
                                <KpiCard title="Total Diproses" value={csvData.rows.length} />
                            </div>
                            {importResult && importResult.errors.length > 0 && (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Detail Kegagalan</AlertTitle>
                                    <AlertDescription>
                                        <ScrollArea className="h-24">
                                            <ul className="list-disc pl-5">
                                                {importResult.errors.map((err, i) => <li key={i} className="text-xs">{err}</li>)}
                                            </ul>
                                        </ScrollArea>
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    </div>
                )}
                
                {/* --- FOOTER --- */}
                <DialogFooter className={cn("justify-between items-center p-6 pt-2 border-t flex-shrink-0", step === 1 && "justify-end")}>
                    {step > 1 && (
                        <div className="text-xs text-muted-foreground">
                            {step === 2 && (
                                <div className="flex items-center gap-4">
                                    <span>Field Disarankan Terpenuhi: <strong>{mappingSummary.requiredProgress}</strong></span>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        {step > 1 && step < 4 && <Button variant="ghost" onClick={() => setStep(s => s - 1)}><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Button>}
                        {step < 4 && <DialogClose asChild><Button variant="outline">Batal</Button></DialogClose>}
                        {step === 1 && <Button onClick={handleNextStep} disabled={!selectedFile}>Lanjut ke Pemetaan Kolom <ArrowRight className="ml-2 h-4 w-4" /></Button>}
                        {step === 2 && <Button onClick={() => setStep(3)} disabled={!isMappingComplete}>
                            <TooltipProvider><Tooltip><TooltipTrigger asChild>{!isMappingComplete ? (<span className="flex items-center">Lanjut ke Preview <ArrowRight className="ml-2 h-4 w-4" /></span>) : <span>Lanjut ke Preview <ArrowRight className="ml-2 h-4 w-4" /></span>}</TooltipTrigger><TooltipContent><p>Harap petakan semua field wajib (*).</p></TooltipContent></Tooltip></TooltipProvider>
                            {!isMappingComplete && (
                                <Alert variant="destructive" className="mt-2 text-xs">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Wajib</AlertTitle>
                                <AlertDescription>
                                    Wajib dipetakan: {unmappedRequiredFields.map(f => f.label).join(', ')}.
                                </AlertDescription>
                                </Alert>
                            )}
                        </Button>}
                        {step === 3 && <Button onClick={handleImportFinal} disabled={isProcessing}>{isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Import Final</Button>}
                        {step === 4 && <Button onClick={() => handleClose(false)}>Selesai</Button>}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
```
  </change>
  <change>
    <file>src/app/api/admin/import-employees/route.ts</file>
    <content><![CDATA['use server';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { EmployeeProfile, UserProfile } from '@/lib/types';
import { HRP_FIELDS } from '@/lib/hrp-fields';

async function verifyAdmin(req: NextRequest) {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return { error: 'Unauthorized: Missing token.', status: 401 };
    }
    const idToken = authorization.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists() || !['super-admin', 'hrd'].includes(userDoc.data()?.role)) {
            return { error: 'Forbidden.', status: 403 };
        }
        return { uid: decodedToken.uid };
    } catch (error) {
        return { error: 'Invalid token.', status: 401 };
    }
}

export async function POST(req: NextRequest) {
    const authResult = await verifyAdmin(req);
    if (authResult.error) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { rows, mapping, customFields } = await req.json();

    const db = admin.firestore();
    const batch = db.batch();
    const results = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] as string[] };
    
    // Reverse mapping for easier lookup
    const headerToHrpField: Record<string, string> = {};
    for (const header in mapping) {
        const hrpField = mapping[header];
        if (hrpField && hrpField !== '__skip__') {
            headerToHrpField[header] = hrpField;
        }
    }

    // Process rows in chunks to avoid overwhelming the system
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const email = row[Object.keys(headerToHrpField).find(h => headerToHrpField[h] === 'email')!];

        if (!email) {
            results.failed++;
            results.errors.push(`Baris ${i + 2}: Email tidak ditemukan atau tidak dipetakan. Baris ini dilewati.`);
            continue;
        }

        try {
            const userRecord = await admin.auth().getUserByEmail(email).catch(() => null);
            if (!userRecord) {
                results.failed++;
                results.errors.push(`Baris ${i + 2}: Pengguna dengan email ${email} tidak ditemukan di sistem otentikasi. Baris ini dilewati.`);
                continue;
            }

            const employeeProfileRef = db.collection('employee_profiles').doc(userRecord.uid);
            const userRef = db.collection('users').doc(userRecord.uid);
            const existingProfileSnap = await employeeProfileRef.get();

            const payload: Partial<EmployeeProfile> & { additionalFields: Record<string, any> } = { additionalFields: {} };
            let hasData = false;

            for (const header in row) {
                const hrpFieldKey = headerToHrpField[header];
                if (hrpFieldKey) {
                    const value = row[header];
                    if (value) {
                        hasData = true;
                        if (hrpFieldKey === '__custom__') {
                           const customFieldName = customFields[header];
                           if (customFieldName) {
                               payload.additionalFields[customFieldName] = value;
                           }
                        } else {
                           (payload as any)[hrpFieldKey] = value;
                        }
                    }
                }
            }

            if (!hasData) {
                results.skipped++;
                continue;
            }
            
            payload.updatedAt = serverTimestamp() as any;

            if (existingProfileSnap.exists) {
                batch.set(employeeProfileRef, payload, { merge: true });
                results.updated++;
            } else {
                payload.uid = userRecord.uid;
                payload.createdAt = serverTimestamp() as any;
                batch.set(employeeProfileRef, payload);
                results.created++;
            }
            
            // Also update the main user document with critical info if available
            const userUpdatePayload: Partial<UserProfile> = {};
            if(payload.positionTitle) userUpdatePayload.positionTitle = payload.positionTitle;
            if(payload.division) userUpdatePayload.division = payload.division;
            if(payload.brandId) userUpdatePayload.brandId = payload.brandId;
            if(Object.keys(userUpdatePayload).length > 0) {
                 batch.update(userRef, userUpdatePayload);
            }

        } catch (e: any) {
            results.failed++;
            results.errors.push(`Baris ${i + 2} (${email}): ${e.message}`);
        }
    }

    try {
        await batch.commit();
        return NextResponse.json(results);
    } catch (e: any) {
        return NextResponse.json({ error: 'Gagal menyimpan data ke database.', details: e.message }, { status: 500 });
    }
}
```
  </change>
  <change>
    <file>src/lib/hrp-fields.ts</file>
    <content><![CDATA['use client';

export type HRPField = {
    value: string;
    label: string;
    required?: boolean;
    description?: string;
};

export const HRP_FIELD_GROUPS: Record<string, HRPField[]> = {
    "Identitas & Kontak": [
        { value: "fullName", label: "Nama Lengkap", required: true, description: "Nama lengkap karyawan sesuai KTP." },
        { value: "email", label: "Email", required: true, description: "Email utama untuk komunikasi." },
        { value: "phone", label: "Kontak (No. HP)" },
        { value: "birthPlace", label: "Tempat Lahir", description: "Kota tempat karyawan dilahirkan." },
        { value: "birthDate", label: "Tanggal Lahir", description: "Format: YYYY-MM-DD" },
        { value: "gender", label: "Jenis Kelamin", description: "Laki-laki atau Perempuan." },
        { value: "maritalStatus", label: "Status Pernikahan" },
        { value: "address", label: "Alamat", description: "Alamat lengkap saat ini." },
    ],
    "Informasi Kepegawaian": [
        { value: "employeeNumber", label: "Nomor Induk Karyawan (NIK)", required: true, description: "Nomor identifikasi unik internal perusahaan." },
        { value: "positionTitle", label: "Jabatan/Posisi", required: true },
        { value: "division", label: "Departemen/Bagian", required: true },
        { value: "brandName", label: "Nama Brand", required: true },
        { value: "managerName", label: "Nama Manajer Divisi" },
        { value: "joinDate", label: "Tanggal Mulai Bekerja", required: true, description: "Format: YYYY-MM-DD" },
        { value: "employmentType", label: "Jenis Kontrak Kerja", description: "Contoh: Tetap, Kontrak, Harian." },
        { value: "employmentStatus", label: "Status Kerja", required: true, description: "Contoh: active, probation, resigned." },
    ],
    "Data Administratif": [
        { value: "nik", label: "No. KTP/SIM", required: true, description: "Nomor Induk Kependudukan 16 digit." },
        { value: "npwp", label: "NPWP" },
        { value: "bpjsKesehatan", label: "No. BPJS Kesehatan" },
        { value: "bpjsKetenagakerjaan", label: "No. BPJS Ketenagakerjaan" },
        { value: "bankAccountNumber", label: "No. Rekening Bank" },
        { value: "bankName", label: "Nama Bank" },
    ],
    "Riwayat Pendidikan & Karier (Opsional)": [
        { value: 'education', label: 'Pendidikan Terakhir' },
        { value: 'certification', label: 'Sertifikasi' },
        { value: 'promotion', label: 'Riwayat Promosi' },
        { value: 'performanceReview', label: 'Riwayat Penilaian Kinerja' },
    ],
};

export const HRP_FIELDS: HRPField[] = Object.values(HRP_FIELD_GROUPS).flat();
export const RECOMMENDED_HRP_FIELDS = HRP_FIELDS.filter(f => f.required);

    