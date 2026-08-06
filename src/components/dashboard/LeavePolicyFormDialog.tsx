'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2, Save } from 'lucide-react';
import type { LeavePolicy, Brand } from '@/lib/types';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { useHrdScopeContext } from '@/providers/hrd-scope-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '../ui/switch';
import { Checkbox } from '../ui/checkbox';

const formSchema = z.object({
  name: z.string().min(3, 'Nama policy minimal 3 karakter.'),
  resetType: z.enum(['annual', 'contract']),
  brandIds: z.array(z.string()).min(1, 'Minimal pilih satu brand.'),
  isActive: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

interface LeavePolicyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: LeavePolicy | null;
  brands: Brand[];
  /** Every policy this HRD can currently see — used for the duplicate-active-policy-per-brand check, never fetched independently here. */
  policies: LeavePolicy[];
  onSaved?: () => void;
}

function buildDefaultValues(policy: LeavePolicy | null): FormValues {
  if (!policy) {
    return {
      name: '',
      resetType: 'annual',
      brandIds: [],
      isActive: true,
    };
  }
  return {
    name: policy.name || '',
    resetType: policy.resetType,
    brandIds: policy.brandIds || [],
    isActive: policy.isActive ?? true,
  };
}

export function LeavePolicyFormDialog({ open, onOpenChange, policy, brands, policies, onSaved }: LeavePolicyFormDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const { isSuperAdmin, isAllCompanies, allowedBrandIds } = useHrdScopeContext();
  const [isSaving, setIsSaving] = useState(false);
  const mode = policy ? 'Edit' : 'Buat';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaultValues(null),
  });

  const watchedResetType = form.watch('resetType');

  useEffect(() => {
    if (!open) return;
    const initialValues = buildDefaultValues(policy);
    if (!isSuperAdmin && !isAllCompanies && brands.length === 1 && initialValues.brandIds.length === 0) {
      initialValues.brandIds = [brands[0].id!];
    }
    form.reset(initialValues);
  }, [open, policy, form, brands, isSuperAdmin, isAllCompanies]);

  const unauthorizedBrandIds = (() => {
    if (isSuperAdmin || isAllCompanies || !policy) return [];
    const policyBrandIds = policy.brandIds || [];
    return policyBrandIds.filter((id) => !allowedBrandIds.includes(id));
  })();

  const onSubmit = async (values: FormValues) => {
    if (!userProfile) return;

    const selectedBrandIds = values.brandIds || [];
    if (selectedBrandIds.length === 0) {
      toast({ variant: 'destructive', title: 'Pilih perusahaan terlebih dahulu.' });
      return;
    }

    if (!isSuperAdmin && !isAllCompanies) {
      const outOfScope = selectedBrandIds.filter((id) => !allowedBrandIds.includes(id));
      if (outOfScope.length > 0) {
        toast({
          variant: 'destructive',
          title: 'Anda tidak memiliki akses untuk mengatur perusahaan tersebut.',
        });
        return;
      }
    }

    // 1 brand = 1 active leave policy — otherwise resolveLeavePolicyForEmployee's
    // .find() would pick between two conflicting policies arbitrarily.
    if (values.isActive) {
      const conflictingPolicy = policies.find((other) => {
        if (other.id === policy?.id) return false;
        if (!other.isActive) return false;
        return selectedBrandIds.some((id) => (other.brandIds || []).includes(id));
      });
      if (conflictingPolicy) {
        toast({
          variant: 'destructive',
          title: 'Policy cuti bentrok',
          description: `Perusahaan ini sudah memiliki leave policy aktif ("${conflictingPolicy.name}"). Nonaktifkan policy lama atau edit policy yang sudah ada.`,
        });
        return;
      }
    }

    const docRef = policy ? doc(firestore, 'leave_policies', policy.id!) : doc(collection(firestore, 'leave_policies'));
    const selectedBrandNames = selectedBrandIds
      .map((id) => brands.find((b) => b.id === id)?.name)
      .filter((name): name is string => !!name);

    const displayName = (userProfile as any).displayName || (userProfile as any).fullName || userProfile.email || 'HRD';

    const payload: Omit<LeavePolicy, 'id'> = {
      name: values.name,
      resetType: values.resetType,
      brandIds: selectedBrandIds,
      brandNames: selectedBrandNames,
      isActive: values.isActive,
      createdByUid: policy ? (policy as any).createdByUid || userProfile.uid : userProfile.uid,
      createdByName: policy ? (policy as any).createdByName || displayName : displayName,
      createdAt: policy ? (policy as any).createdAt : (serverTimestamp() as Timestamp),
      updatedByUid: userProfile.uid,
      updatedByName: displayName,
      updatedAt: serverTimestamp() as Timestamp,
    };

    console.log('[LEAVE_POLICY_SAVE_DEBUG]', {
      currentUserUid: userProfile.uid,
      isSuperAdmin,
      allowedBrandIds,
      selectedBrandIds,
      selectedBrandNames,
      payload,
    });

    setIsSaving(true);
    try {
      await setDocumentNonBlocking(docRef, payload, { merge: true });
      toast({ title: policy ? 'Leave policy diperbarui.' : 'Leave policy berhasil dibuat.' });
      onSaved?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('[LEAVE_POLICY_SAVE_ERROR]', { code: error?.code, message: error?.message, payload });
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode} Leave Policy</DialogTitle>
          <DialogDescription>
            Atur jenis reset cuti untuk brand/perusahaan yang Anda pegang.
          </DialogDescription>
        </DialogHeader>

        {!isSuperAdmin && !isAllCompanies && unauthorizedBrandIds.length > 0 && (
          <p className="text-sm text-destructive">
            Policy ini mencakup brand di luar akses Anda. Hubungi Super Admin untuk memisahkan policy ini per perusahaan.
          </p>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nama Policy</FormLabel>
                <FormControl><Input placeholder="EGS Group Contract Leave" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="resetType" render={({ field }) => (
              <FormItem>
                <FormLabel>Tipe Reset</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="annual">Per Tahun (01 Januari - 31 Desember)</SelectItem>
                    <SelectItem value="contract">Per Kontrak (mengikuti masa kontrak karyawan)</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  {watchedResetType === 'annual'
                    ? 'Sisa cuti mengikuti tahun kalender dan akan reset setiap 01 Januari. Periode cuti otomatis berjalan dari 01 Januari sampai 31 Desember.'
                    : 'Sisa cuti mengikuti tanggal mulai dan selesai kontrak masing-masing karyawan. Pastikan data kontrak karyawan sudah terisi agar sisa cuti dapat dihitung.'}
                </FormDescription>
                <div className="rounded-md border border-dashed p-3 text-xs bg-muted/30">
                  <p className="font-semibold uppercase tracking-wide text-muted-foreground mb-1">Contoh Periode</p>
                  {watchedResetType === 'annual' ? (
                    <p className="text-slate-700 dark:text-slate-300">{`01 Januari ${new Date().getFullYear()} - 31 Desember ${new Date().getFullYear()}`}</p>
                  ) : (
                    <>
                      <p className="text-slate-700 dark:text-slate-300">Sesuai kontrak karyawan</p>
                      <p className="text-muted-foreground">Misal: 01 Juli 2026 - 30 Juni 2027</p>
                    </>
                  )}
                </div>
              </FormItem>
            )} />

            <FormField
              control={form.control}
              name="brandIds"
              render={() => (
                <FormItem>
                  <FormLabel>Brand Terkait</FormLabel>
                  {brands.length === 1 ? (
                    <div className="rounded-md border p-3 text-sm font-medium bg-muted/40">
                      {brands[0].name}
                      <FormDescription className="mt-1">Anda hanya memegang satu perusahaan — brand ini otomatis terpilih.</FormDescription>
                    </div>
                  ) : (
                    <div className="max-h-40 w-full rounded-md border p-4 overflow-y-auto">
                      {brands.map((brand) => (
                        <FormField key={brand.id} control={form.control} name="brandIds" render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0 mb-2">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(brand.id!)}
                                onCheckedChange={(checked) => checked
                                  ? field.onChange([...(field.value || []), brand.id!])
                                  : field.onChange((field.value || []).filter((v) => v !== brand.id!))}
                              />
                            </FormControl>
                            <FormLabel className="font-normal">{brand.name}</FormLabel>
                          </FormItem>
                        )} />
                      ))}
                    </div>
                  )}
                  <FormDescription>
                    Pilih beberapa brand hanya jika aturan cuti/reset-nya memang sama persis (mis. EGS Group).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField control={form.control} name="isActive" render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <FormLabel>Aktifkan Policy Ini</FormLabel>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
              <Button type="submit" disabled={isSaving || (!isSuperAdmin && !isAllCompanies && unauthorizedBrandIds.length > 0)}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Save className="mr-2 h-4 w-4" />
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
