'use client';

import { useMemo, useState } from 'react';
import { collection, doc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Tag, Plus, Pencil, Ban, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useCanManageInventory } from '@/hooks/useCanManageInventory';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface InventoryCategory {
  id: string;
  categoryName: string;
  categoryCode: string;
  description: string;
  status: 'active' | 'inactive';
  createdAt: any;
}

function suggestCode(name: string) {
  return name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4) || 'CAT';
}

export default function KategoriBarangPage() {
  const { allowed, loading } = useCanManageInventory();
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const categoriesRef = useMemoFirebase(() => collection(firestore, 'inventory_categories'), [firestore]);
  const { data: categories, isLoading: loadingCategories, mutate } = useCollection<InventoryCategory>(categoriesRef, { realtime: false });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryCategory | null>(null);
  const [form, setForm] = useState({ categoryName: '', categoryCode: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<InventoryCategory | null>(null);

  const sorted = useMemo(
    () => [...(categories ?? [])].sort((a, b) => a.categoryName.localeCompare(b.categoryName)),
    [categories],
  );

  const openAdd = () => {
    setEditing(null);
    setForm({ categoryName: '', categoryCode: '', description: '' });
    setFormOpen(true);
  };

  const openEdit = (cat: InventoryCategory) => {
    setEditing(cat);
    setForm({ categoryName: cat.categoryName, categoryCode: cat.categoryCode, description: cat.description ?? '' });
    setFormOpen(true);
  };

  const handleNameChange = (value: string) => {
    setForm((p) => ({ ...p, categoryName: value, categoryCode: editing ? p.categoryCode : suggestCode(value) }));
  };

  const handleSave = async () => {
    if (!form.categoryName.trim()) {
      toast({ variant: 'destructive', title: 'Nama kategori wajib diisi.' });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(firestore, 'inventory_categories', editing.id), {
          categoryName: form.categoryName.trim(),
          categoryCode: form.categoryCode.trim().toUpperCase() || suggestCode(form.categoryName),
          description: form.description.trim(),
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Kategori berhasil diperbarui.' });
      } else {
        await addDoc(collection(firestore, 'inventory_categories'), {
          categoryName: form.categoryName.trim(),
          categoryCode: form.categoryCode.trim().toUpperCase() || suggestCode(form.categoryName),
          description: form.description.trim(),
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: userProfile?.uid ?? null,
        });
        toast({ title: 'Kategori berhasil ditambahkan.' });
      }
      setFormOpen(false);
      mutate();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan kategori', description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setSaving(true);
    try {
      await updateDoc(doc(firestore, 'inventory_categories', deactivateTarget.id), {
        status: 'inactive',
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Kategori dinonaktifkan.' });
      setDeactivateTarget(null);
      mutate();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal menonaktifkan kategori', description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !allowed) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Kategori Barang">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <Tag className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Kategori Barang</h1>
              <p className="text-sm text-slate-500">Master kategori untuk pendataan barang (Elektronik, Laptop, dll).</p>
            </div>
          </div>
          <Button onClick={openAdd} className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" /> Tambah Kategori
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {loadingCategories ? (
              <div className="space-y-2 p-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : sorted.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">Belum ada kategori. Klik Tambah Kategori.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama Kategori</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="text-xs font-mono text-slate-500">{cat.categoryCode}</TableCell>
                      <TableCell className="font-medium text-slate-800">{cat.categoryName}</TableCell>
                      <TableCell className="text-xs text-slate-500">{cat.description || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px] font-semibold', cat.status === 'active' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500')}>
                          {cat.status === 'active' ? 'Aktif' : 'Tidak Aktif'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => openEdit(cat)}><Pencil className="h-4 w-4" /></Button>
                          {cat.status === 'active' && (
                            <Button size="icon" variant="ghost" title="Nonaktifkan" onClick={() => setDeactivateTarget(cat)}><Ban className="h-4 w-4 text-red-500" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Kategori' : 'Tambah Kategori'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nama Kategori *</Label>
              <Input value={form.categoryName} onChange={(e) => handleNameChange(e.target.value)} placeholder="contoh: Elektronik" />
            </div>
            <div>
              <Label>Kode Kategori</Label>
              <Input value={form.categoryCode} onChange={(e) => setForm((p) => ({ ...p, categoryCode: e.target.value.toUpperCase() }))} placeholder="contoh: ELEC" />
              <p className="mt-1 text-[11px] text-slate-400">Dipakai sebagai awalan kode barang, contoh {form.categoryCode || 'ELEC'}-0001.</p>
            </div>
            <div>
              <Label>Deskripsi</Label>
              <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(v) => !v && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan kategori ini?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deactivateTarget?.categoryName}&quot; tidak akan bisa dipilih lagi untuk barang baru. Barang yang sudah memakai kategori ini tidak berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} disabled={saving}>Nonaktifkan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
