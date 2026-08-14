'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { collection, doc, query, serverTimestamp, where, Timestamp } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useHrdScopedBrands } from '@/hooks/useHrdScopedCollection';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { Loader2, Check } from 'lucide-react';
import type { Division, RecruitmentBatch } from '@/lib/types';

const batchFormSchema = z.object({
  batchName: z.string().min(3, 'Nama batch wajib diisi, minimal 3 karakter.'),
  // Gelombang Ke — positive integer only; z.coerce.number().int() already
  // rejects decimals (1.5 fails .int()) and non-numeric input (coerces to
  // NaN, which fails .int()), .min(1) rejects 0 and negatives.
  batchNumber: z.coerce.number().int().min(1, 'Gelombang wajib diisi, minimal 1.'),
  batchCode: z.string().min(2, 'Kode batch wajib diisi.'),
  brandId: z.string({ required_error: 'Brand wajib dipilih.' }).min(1, 'Brand wajib dipilih.'),
  divisionIds: z.array(z.string()).default([]),
  registrationStartDate: z.date({ required_error: 'Tanggal mulai pendaftaran wajib diisi.' }),
  registrationEndDate: z.date({ required_error: 'Tanggal akhir pendaftaran wajib diisi.' }),
  quota: z.coerce.number().int().min(1, 'Kuota minimal 1.'),
  description: z.string().optional().default(''),
}).refine(d => d.registrationEndDate >= d.registrationStartDate, {
  message: 'Tanggal akhir pendaftaran tidak boleh sebelum tanggal mulai.', path: ['registrationEndDate'],
});

type BatchFormValues = z.infer<typeof batchFormSchema>;

const STEP_FIELDS: Record<number, (keyof BatchFormValues)[]> = {
  1: ['batchName', 'batchNumber', 'batchCode'],
  2: ['brandId', 'divisionIds', 'registrationStartDate', 'registrationEndDate'],
  3: ['quota', 'description'],
};

const STEP_LABELS = ['Informasi Batch', 'Scope & Periode Pendaftaran', 'Kuota & Ringkasan'];

// Deterministic from year + gelombang (zero-padded to 2 digits) — e.g.
// gelombang 2, 2026 -> "MG-2026-02". Only ever runs when HRD presses "Auto";
// never auto-overwrites a manually-edited code on its own.
const generateBatchCode = (year: number, batchNumber: number) => {
  const num = String(Math.max(1, batchNumber || 1)).padStart(2, '0');
  return `MG-${year}-${num}`;
};

const emptyDefaults = (): Partial<BatchFormValues> => ({
  batchName: '', batchNumber: 1, batchCode: '',
  brandId: undefined, divisionIds: [],
  quota: 1, description: '',
  registrationStartDate: undefined, registrationEndDate: undefined,
});

interface RecruitmentBatchFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batch: RecruitmentBatch | null;
  onSaved: () => void;
}

export function RecruitmentBatchFormDialog({ open, onOpenChange, batch, onSaved }: RecruitmentBatchFormDialogProps) {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const { data: brands, isLoading: isLoadingBrands } = useHrdScopedBrands();
  const [isSaving, setIsSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const isEdit = Boolean(batch);
  // Registration has already closed once a batch is in "selection" — brand/
  // divisi/periode/kuota are locked from there on so already-collected
  // applicants stay meaningful. draft/open (the only other statuses reachable
  // via the Edit button) stay fully editable; closed/completed/cancelled
  // batches never reach this form at all (no Edit button shown for them).
  const isLocked = batch?.status === 'selection';

  const form = useForm<BatchFormValues>({
    resolver: zodResolver(batchFormSchema),
    defaultValues: emptyDefaults(),
  });

  useEffect(() => {
    if (!open) return;
    setCurrentStep(1);
    if (batch) {
      form.reset({
        batchName: batch.batchName,
        // Legacy batches saved before "Gelombang Ke" existed have no
        // batchNumber — fall back to 1 so editing them never crashes/shows
        // NaN; the field is optional on the type for exactly this reason.
        batchNumber: batch.batchNumber ?? 1,
        batchCode: batch.batchCode,
        brandId: batch.brandId,
        divisionIds: batch.divisionIds || [],
        quota: batch.quota,
        registrationStartDate: batch.registrationStartDate.toDate(),
        registrationEndDate: batch.registrationEndDate.toDate(),
        description: batch.description || '',
      });
    } else {
      form.reset(emptyDefaults());
    }
  }, [open, batch, form]);

  const selectedBrandId = form.watch('brandId');
  const selectedBrand = brands?.find(b => b.id === selectedBrandId);

  const divisionsQuery = useMemoFirebase(() => {
    if (!selectedBrandId) return null;
    return query(collection(firestore, 'brands', selectedBrandId, 'divisions'), where('isActive', '==', true));
  }, [selectedBrandId, firestore]);
  const { data: divisions, isLoading: isLoadingDivisions } = useCollection<Division>(divisionsQuery);

  const noDivisions = !isLoadingDivisions && !!selectedBrandId && divisions?.length === 0;

  const divisionOptions: MultiSelectOption[] = useMemo(
    () => (divisions || []).map(d => ({ value: d.id!, label: d.name })),
    [divisions]
  );
  const watchedDivisionIds = form.watch('divisionIds') || [];
  const selectedDivisionOptions = useMemo(
    () => divisionOptions.filter(o => watchedDivisionIds.includes(o.value)),
    [divisionOptions, watchedDivisionIds]
  );

  const isFirstBrandRender = useMemo(() => ({ current: true }), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isFirstBrandRender.current) { isFirstBrandRender.current = false; return; }
    form.setValue('divisionIds', []);
  }, [selectedBrandId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDivisionSelectDisabled = isLocked || !selectedBrandId || isLoadingDivisions || noDivisions;

  const handleGenerateCode = () => {
    const year = form.getValues('registrationStartDate')?.getFullYear() || new Date().getFullYear();
    const batchNumber = form.getValues('batchNumber') || 1;
    form.setValue('batchCode', generateBatchCode(year, batchNumber));
  };

  const goNext = async () => {
    const fields = STEP_FIELDS[currentStep];
    const valid = await form.trigger(fields);
    if (valid) setCurrentStep(s => Math.min(3, s + 1));
  };
  const goBack = () => setCurrentStep(s => Math.max(1, s - 1));

  const saveBatch = async () => {
    const valid = await form.trigger();
    if (!valid) {
      for (const step of [1, 2, 3]) {
        if (STEP_FIELDS[step].some(f => (form.formState.errors as any)[f])) {
          setCurrentStep(step);
          break;
        }
      }
      return;
    }
    const values = form.getValues();
    if (!userProfile) return;
    setIsSaving(true);
    try {
      const brand = brands?.find(b => b.id === values.brandId);
      const selectedDivisions = (divisions || []).filter(d => values.divisionIds.includes(d.id!));

      const ref = batch?.id
        ? doc(firestore, 'recruitment_batches', batch.id)
        : doc(collection(firestore, 'recruitment_batches'));

      const payload: Record<string, any> = {
        batchName: values.batchName,
        batchNumber: values.batchNumber,
        batchCode: values.batchCode,
        batchType: 'internship',
        batchTypeLabel: 'Magang',
        brandId: values.brandId,
        brandName: brand?.name || '',
        divisionIds: values.divisionIds,
        divisionNames: selectedDivisions.map(d => d.name),
        quota: values.quota,
        registrationStartDate: Timestamp.fromDate(values.registrationStartDate),
        registrationEndDate: Timestamp.fromDate(values.registrationEndDate),
        description: values.description || '',
        updatedAt: serverTimestamp(),
        updatedByUid: userProfile.uid,
        updatedByName: userProfile.fullName,
      };

      if (!batch) {
        // Batch Magang has no Draft/Publish concept — it's operational
        // recruitment data, not published content, so it's immediately
        // usable on save. "open" is the only status new batches ever get;
        // further transitions (Tutup Pendaftaran/Selesaikan/Batalkan) happen
        // via the dedicated status-action buttons on the list/detail pages.
        payload.status = 'open';
        payload.createdAt = serverTimestamp();
        payload.createdByUid = userProfile.uid;
        payload.createdByName = userProfile.fullName;
      }
      // On edit, `status` is deliberately omitted from the payload — this
      // form never manages status, so the existing stored value is left
      // untouched by the merge write.

      await setDocumentNonBlocking(ref, payload, { merge: true });
      toast({
        title: batch ? 'Batch Diperbarui' : 'Batch Magang Dibuat',
        description: values.batchName,
      });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan batch.', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const fmt = (d?: Date) => (d ? format(d, 'dd MMM yyyy', { locale: idLocale }) : '-');
  const values = form.watch();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="p-6 pb-0 flex-none">
          <DialogTitle className="text-xl font-semibold">{batch ? 'Edit Batch Magang' : 'Buat Batch Magang Baru'}</DialogTitle>
          <DialogDescription className="text-sm">
            Atur gelombang pendaftaran magang berdasarkan brand, divisi, periode, dan kuota.
          </DialogDescription>

          {/* Step indicator */}
          <div className="flex items-center gap-2 pt-2">
            {STEP_LABELS.map((label, i) => {
              const step = i + 1;
              const isActive = step === currentStep;
              const isDone = step < currentStep;
              return (
                <div key={label} className="flex items-center gap-2 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                      isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {isDone ? <Check className="h-3.5 w-3.5" /> : step}
                    </span>
                    <span className={`text-xs font-semibold truncate hidden sm:inline ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>{label}</span>
                  </div>
                  {step < 3 && <div className={`h-px flex-1 ${isDone ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-800'}`} />}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        {isLocked && (
          <p className="mx-6 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-400 flex-none">
            Brand, divisi, periode, dan kuota tidak dapat diubah setelah batch masuk tahap seleksi.
          </p>
        )}

        <Form {...form}>
          <form id="batch-form" onSubmit={(e) => e.preventDefault()} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

            {/* Step 1 — Informasi Batch */}
            {currentStep === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="batchName" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Nama Batch</FormLabel>
                    <FormControl><Input placeholder="cth. Magang Digital Marketing 2026" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="batchNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gelombang Ke</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} step={1} inputMode="numeric" placeholder="cth. 2" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Menentukan urutan gelombang pendaftaran program magang.</p>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="batchCode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kode Batch</FormLabel>
                    <div className="flex gap-2">
                      <FormControl><Input placeholder="cth. MG-2026-01" {...field} /></FormControl>
                      <Button type="button" variant="outline" onClick={handleGenerateCode}>Auto</Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            )}

            {/* Step 2 — Scope & Periode Pendaftaran */}
            {currentStep === 2 && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="brandId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingBrands || isLocked}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Pilih brand" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {brands?.map(b => <SelectItem key={b.id} value={b.id!}>{b.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="divisionIds" render={() => (
                    <FormItem>
                      <FormLabel>Divisi</FormLabel>
                      <FormControl>
                        <MultiSelect
                          options={divisionOptions}
                          selected={selectedDivisionOptions}
                          onChange={(opts) => form.setValue('divisionIds', opts.map(o => o.value))}
                          disabled={isDivisionSelectDisabled}
                          placeholder={
                            !selectedBrandId ? 'Pilih brand dulu'
                            : isLoadingDivisions ? 'Memuat divisi...'
                            : noDivisions ? 'Brand ini belum punya divisi aktif'
                            : 'Pilih divisi'
                          }
                        />
                      </FormControl>
                      {noDivisions && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">Brand ini belum memiliki divisi aktif. Batch tetap bisa dibuat tanpa memilih divisi.</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="registrationStartDate" render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Mulai Pendaftaran</FormLabel>
                      {/* portalled defaults to true — GoogleDatePicker's own
                          Popover already sets modal={true} to cooperate with
                          an ancestor Dialog's focus trap, so portalling it to
                          document.body is safe AND is what lets the calendar
                          escape this modal's overflow-hidden/overflow-y-auto
                          clipping instead of getting cut off. */}
                      <FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="registrationEndDate" render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Akhir Pendaftaran</FormLabel>
                      {/* portalled defaults to true — GoogleDatePicker's own
                          Popover already sets modal={true} to cooperate with
                          an ancestor Dialog's focus trap, so portalling it to
                          document.body is safe AND is what lets the calendar
                          escape this modal's overflow-hidden/overflow-y-auto
                          clipping instead of getting cut off. */}
                      <FormControl><GoogleDatePicker value={field.value} onChange={field.onChange} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
            )}

            {/* Step 3 — Kuota & Ringkasan */}
            {currentStep === 3 && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="quota" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kuota Peserta Magang</FormLabel>
                      <FormControl><Input type="number" min={1} disabled={isLocked} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catatan Internal HRD</FormLabel>
                    <FormControl><Textarea rows={3} placeholder="Catatan internal (opsional)..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Ringkasan</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <p><span className="text-slate-400">Nama:</span> <span className="font-semibold text-slate-800 dark:text-slate-100">{values.batchName || '-'}</span></p>
                    <p><span className="text-slate-400">Gelombang:</span> <span className="font-semibold text-slate-800 dark:text-slate-100">{values.batchNumber || '-'}</span></p>
                    <p><span className="text-slate-400">Kode:</span> <span className="font-semibold text-slate-800 dark:text-slate-100">{values.batchCode || '-'}</span></p>
                    <p><span className="text-slate-400">Brand:</span> <span className="font-semibold text-slate-800 dark:text-slate-100">{selectedBrand?.name || '-'}</span></p>
                    <p><span className="text-slate-400">Kuota:</span> <span className="font-semibold text-slate-800 dark:text-slate-100">{values.quota} peserta</span></p>
                    <p className="sm:col-span-2"><span className="text-slate-400">Divisi:</span> <span className="font-semibold text-slate-800 dark:text-slate-100">{selectedDivisionOptions.map(d => d.label).join(', ') || 'Semua divisi'}</span></p>
                    <p className="sm:col-span-2"><span className="text-slate-400">Periode Pendaftaran:</span> <span className="font-semibold text-slate-800 dark:text-slate-100">{fmt(values.registrationStartDate)} - {fmt(values.registrationEndDate)}</span></p>
                  </div>
                </div>
              </div>
            )}

          </form>
        </Form>

        <DialogFooter className="flex-none border-t border-slate-200 dark:border-slate-800 px-6 py-4 gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving} className="font-semibold text-sm mr-auto">
            Batal
          </Button>
          {currentStep > 1 && (
            <Button type="button" variant="outline" onClick={goBack} disabled={isSaving} className="font-semibold text-sm">
              Sebelumnya
            </Button>
          )}
          {currentStep < 3 && (
            <Button type="button" onClick={goNext} className="font-semibold text-sm">
              Selanjutnya
            </Button>
          )}
          {currentStep === 3 && (
            <Button type="button" onClick={() => saveBatch()} disabled={isSaving} className="font-semibold text-sm">
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Menyimpan...</> : (isEdit ? 'Simpan Perubahan' : 'Simpan Batch')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
