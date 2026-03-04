'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import type { Invite, Brand, UserProfile } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlusCircle, Copy, Users, CheckCircle, Percent, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { KpiCard } from '../recruitment/KpiCard';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';

const inviteEmploymentTypes = ['magang', 'training'] as const;

const generateFormSchema = z.object({
  brandId: z.string({ required_error: 'Brand harus dipilih.' }),
  employmentType: z.enum(inviteEmploymentTypes, { required_error: 'Jenis pekerja harus dipilih.' }),
  quantity: z.coerce.number().int().min(1, 'Jumlah minimal 1.').max(100, 'Jumlah maksimal 100.'),
});

type GenerateFormValues = z.infer<typeof generateFormSchema>;

interface AddMoreFormProps {
    brandId: string;
    employmentType: 'magang' | 'training';
    onGenerate: (values: GenerateFormValues) => Promise<void>;
}

function AddMoreForm({ brandId, employmentType, onGenerate }: AddMoreFormProps) {
    const [quantity, setQuantity] = useState(5);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        await onGenerate({ brandId, employmentType, quantity });
        setIsSubmitting(false);
    };

    return (
        <form onSubmit={handleSubmit} className="flex items-center gap-2 py-2">
            <Input 
                type="number" 
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                className="w-24 h-9"
                min="1"
                max="100"
            />
            <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                Tambah
            </Button>
        </form>
    );
}

export function InviteManagementClient() {
  const { firebaseUser } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [inviteToDelete, setInviteToDelete] = useState<Invite | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const { data: invites, isLoading: isLoadingInvites } = useCollection<Invite>(
    useMemoFirebase(() => collection(firestore, 'invites'), [firestore])
  );
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(
    useMemoFirebase(() => collection(firestore, 'users'), [firestore])
  );

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateFormSchema),
    defaultValues: { quantity: 10 },
  });

  const brandMap = useMemo(() => {
    if (!brands) return new Map<string, string>();
    return new Map(brands.map(brand => [brand.id!, brand.name]));
  }, [brands]);

  const userMap = useMemo(() => {
    if (!users) return new Map<string, string>();
    return new Map(users.map(user => [user.uid, user.fullName]));
  }, [users]);
  
  const groupedInvites = useMemo(() => {
    if (!invites || !brandMap) return [];
    
    const groups = new Map<string, { brandName: string, employmentType: 'magang' | 'training', invites: Invite[] }>();
    
    const sorted = [...invites].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

    sorted.forEach(invite => {
        const key = `${invite.brandId}-${invite.employmentType}`;
        if (!groups.has(key)) {
            groups.set(key, {
                brandName: brandMap.get(invite.brandId) || 'Unknown Brand',
                employmentType: invite.employmentType,
                invites: []
            });
        }
        groups.get(key)!.invites.push(invite);
    });
    
    return Array.from(groups.values());
  }, [invites, brandMap]);


  const summary = useMemo(() => {
    if (!invites) return { total: 0, used: 0, rate: 0 };
    const usedCount = invites.filter(invite => invite.usedByUid).length;
    const totalCount = invites.length;
    const rate = totalCount > 0 ? (usedCount / totalCount) * 100 : 0;
    
    return {
      total: totalCount,
      used: usedCount,
      rate: Math.round(rate),
    }
  }, [invites]);

  const getInviteStatus = (invite: Invite) => {
    if (invite.usedAt) return { label: 'Used', variant: 'secondary' } as const;
    if (!invite.isActive) return { label: 'Disabled', variant: 'destructive' } as const;
    if (invite.expiresAt.toDate() < new Date()) return { label: 'Expired', variant: 'outline' } as const;
    return { label: 'Active', variant: 'default' } as const;
  };

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
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate invites.');
      }
      toast({ title: 'Codes Generated', description: `${result.count} new invite codes have been created.` });
      form.reset({ quantity: 10 });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Generation Failed', description: e.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteClick = (invite: Invite) => {
    setInviteToDelete(invite);
    setIsDeleteConfirmOpen(true);
  };
  
  const confirmDelete = async () => {
    if (!inviteToDelete || !firebaseUser) return;

    setIsDeleting(true);
    try {
        const idToken = await firebaseUser.getIdToken();
        const res = await fetch(`/api/invites/${inviteToDelete.code}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${idToken}`,
            },
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to delete invite.');
        }

        toast({ title: 'Invite Deleted', description: `Code ${inviteToDelete.code} has been deleted.`});
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Deletion Failed', description: e.message });
    } finally {
        setIsDeleting(false);
        setIsDeleteConfirmOpen(false);
    }
  };
  
  const copyToClipboard = (code: string) => {
    const url = `${window.location.origin}/register?code=${code}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link Copied!", description: "Registration link copied to clipboard." });
  };

  return (
    <>
    <div className="space-y-6">
       <div className="grid gap-4 md:grid-cols-3">
          <KpiCard title="Total Undangan Dibuat" value={summary.total} />
          <KpiCard title="Undangan Terpakai" value={summary.used} />
          <KpiCard title="Tingkat Penggunaan" value={`${summary.rate}%`} />
       </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Buat Batch Undangan Baru</CardTitle>
              <CardDescription>Gunakan ini untuk membuat grup undangan baru untuk brand atau tipe yang belum ada.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleGenerate)} className="space-y-4">
                  <FormField control={form.control} name="brandId" render={({ field }) => (<FormItem><FormLabel>Brand</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isLoadingBrands}><FormControl><SelectTrigger><SelectValue placeholder="Pilih brand" /></SelectTrigger></FormControl><SelectContent>{brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
                  <FormField control={form.control} name="employmentType" render={({ field }) => (<FormItem><FormLabel>Jenis Pekerja</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe" /></SelectTrigger></FormControl><SelectContent>{inviteEmploymentTypes.map(type => <SelectItem key={type} value={type} className="capitalize">{type}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
                  <FormField control={form.control} name="quantity" render={({ field }) => (<FormItem><FormLabel>Jumlah</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                  <Button type="submit" className="w-full" disabled={isGenerating}>
                    {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                    Generate Batch Baru
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Grup Undangan</CardTitle>
              <CardDescription>Kelola undangan yang sudah ada per kelompok.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingInvites || isLoadingBrands ? <p>Loading...</p> : 
              groupedInvites.length > 0 ? (
                <Accordion type="multiple" className="w-full space-y-2">
                  {groupedInvites.map((group, index) => {
                    const usedCount = group.invites.filter(i => i.usedByUid).length;
                    const totalCount = group.invites.length;
                    return (
                      <AccordionItem value={`item-${index}`} key={index} className="border rounded-md">
                        <AccordionTrigger className="px-4 hover:no-underline">
                          <div className='flex-1 text-left'>
                            <p className="font-semibold">{group.brandName} - <span className="capitalize">{group.employmentType}</span></p>
                            <p className="text-sm text-muted-foreground">{usedCount} / {totalCount} terpakai</p>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-4 border-t">
                           <AddMoreForm brandId={group.invites[0].brandId} employmentType={group.employmentType} onGenerate={handleGenerate} />
                           <div className="rounded-lg border mt-4">
                            <Table>
                                <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Status</TableHead><TableHead>Used By</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {group.invites.slice(0, 5).map(invite => (
                                        <TableRow key={invite.id}>
                                            <TableCell className="font-mono text-xs">{invite.code}</TableCell>
                                            <TableCell><Badge variant={getInviteStatus(invite).variant}>{getInviteStatus(invite).label}</Badge></TableCell>
                                            <TableCell className="text-xs">{userMap.get(invite.usedByUid!) || '-'}</TableCell>
                                            <TableCell className="text-right flex justify-end gap-2">
                                              <Button variant="outline" size="sm" onClick={() => copyToClipboard(invite.code)}><Copy className="mr-2 h-3 w-3" /> Salin</Button>
                                              <Button variant="destructive" size="icon" className="h-9 w-9" onClick={() => handleDeleteClick(invite)} disabled={isDeleting}><Trash2 className="h-4 w-4" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {group.invites.length > 5 && <p className="text-xs text-muted-foreground text-center p-2">...dan {group.invites.length - 5} lainnya.</p>}
                           </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
                </Accordion>
              ) : (
                <p className="text-sm text-center text-muted-foreground py-8">Belum ada undangan yang dibuat. Silakan buat batch baru.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    <DeleteConfirmationDialog 
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={confirmDelete}
        itemName={`invite code ${inviteToDelete?.code}`}
        itemType="Code"
    />
    </>
  );
}
