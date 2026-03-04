
'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import type { InviteBatch, Brand, UserProfile } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlusCircle, Copy, Users, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { KpiCard } from '../recruitment/KpiCard';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';

const inviteEmploymentTypes = ['magang', 'training'] as const;

const generateFormSchema = z.object({
  brandId: z.string({ required_error: 'Brand harus dipilih.' }),
  employmentType: z.enum(inviteEmploymentTypes, { required_error: 'Jenis pekerja harus dipilih.' }),
  quantity: z.coerce.number().int().min(1, 'Jumlah minimal 1.').max(100, 'Jumlah maksimal 100.'),
});

type GenerateFormValues = z.infer<typeof generateFormSchema>;

export function InviteManagementClient() {
  const { firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<InviteBatch | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const { data: inviteBatches, isLoading: isLoadingInvites } = useCollection<InviteBatch>(
    useMemoFirebase(() => collection(firestore, 'invite_batches'), [firestore])
  );
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );
  
  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateFormSchema),
    defaultValues: { quantity: 10 },
  });

  const summary = useMemo(() => {
    if (!inviteBatches) return { total: 0, used: 0, rate: 0 };
    const total = inviteBatches.reduce((sum, batch) => sum + batch.totalSlots, 0);
    const used = inviteBatches.reduce((sum, batch) => sum + batch.claimedSlots, 0);
    const rate = total > 0 ? (used / total) * 100 : 0;
    return { total, used, rate: Math.round(rate) };
  }, [inviteBatches]);
  
  const sortedBatches = useMemo(() => {
    if (!inviteBatches) return [];
    return [...inviteBatches].sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  }, [inviteBatches]);

  const handleGenerate = async (values: GenerateFormValues) => {
    if (!firebaseUser) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
      return;
    }
    setIsGenerating(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch('/api/admin/generate-invites', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to generate invite batch.');
      toast({ title: 'Batch Undangan Dibuat', description: `Satu link undangan dengan kuota ${result.totalSlots} telah dibuat.` });
      form.reset({ quantity: 10 });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal Membuat Batch', description: e.message });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleDeleteClick = (batch: InviteBatch) => {
    setBatchToDelete(batch);
    setIsDeleteConfirmOpen(true);
  };
  
  const confirmDelete = async () => {
    if (!batchToDelete || !firebaseUser) return;
    try {
      await deleteDocumentNonBlocking(doc(firestore, 'invite_batches', batchToDelete.id!));
      toast({ title: 'Batch Dihapus', description: `Batch undangan untuk ${batchToDelete.brandName} telah dihapus.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal Menghapus', description: e.message });
    } finally {
      setIsDeleteConfirmOpen(false);
      setBatchToDelete(null);
    }
  };

  const copyToClipboard = (batchId: string) => {
    const url = `${window.location.origin}/register?batch=${batchId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link Disalin!", description: "Link registrasi untuk batch ini telah disalin." });
  };

  return (
    <>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard title="Total Kuota Undangan" value={summary.total} />
          <KpiCard title="Kuota Terpakai" value={summary.used} />
          <KpiCard title="Tingkat Penggunaan" value={`${summary.rate}%`} />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Buat Batch Undangan Baru</CardTitle>
                <CardDescription>Satu link untuk banyak pengguna dengan kuota terbatas.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleGenerate)} className="space-y-4">
                    <FormField control={form.control} name="brandId" render={({ field }) => (<FormItem><FormLabel>Brand</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isLoadingBrands}><FormControl><SelectTrigger><SelectValue placeholder="Pilih brand" /></SelectTrigger></FormControl><SelectContent>{brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name="employmentType" render={({ field }) => (<FormItem><FormLabel>Jenis Pekerja</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe" /></SelectTrigger></FormControl><SelectContent>{inviteEmploymentTypes.map(type => <SelectItem key={type} value={type} className="capitalize">{type}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name="quantity" render={({ field }) => (<FormItem><FormLabel>Jumlah Kuota</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                    <Button type="submit" className="w-full" disabled={isGenerating}>
                      {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                      Generate Batch
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Daftar Batch Undangan</CardTitle>
                <CardDescription>Kelola dan pantau penggunaan link undangan yang telah dibuat.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Detail</TableHead><TableHead>Penggunaan</TableHead><TableHead>Dibuat</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {isLoadingInvites ? <TableRow><TableCell colSpan={4} className="h-24 text-center">Loading...</TableCell></TableRow>
                        : sortedBatches.length > 0 ? sortedBatches.map(batch => (
                            <TableRow key={batch.id}>
                              <TableCell>
                                <p className="font-semibold">{batch.brandName}</p>
                                <p className="text-sm text-muted-foreground capitalize">{batch.employmentType}</p>
                              </TableCell>
                              <TableCell><Badge variant="secondary">{batch.claimedSlots} / {batch.totalSlots}</Badge></TableCell>
                              <TableCell className="text-xs">{format(batch.createdAt.toDate(), 'dd MMM yyyy')}</TableCell>
                              <TableCell className="text-right">
                                <Button variant="outline" size="sm" onClick={() => copyToClipboard(batch.id!)}><Copy className="mr-2 h-3 w-3" /> Salin Link</Button>
                                <Button variant="ghost" size="icon" className="ml-2" onClick={() => handleDeleteClick(batch)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </TableCell>
                            </TableRow>
                          ))
                        : <TableRow><TableCell colSpan={4} className="h-24 text-center">Belum ada batch undangan yang dibuat.</TableCell></TableRow>
                      }
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <DeleteConfirmationDialog 
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={confirmDelete}
        itemName={`batch undangan untuk ${batchToDelete?.brandName}`}
        itemType="Batch"
      />
    </>
  );
}

    