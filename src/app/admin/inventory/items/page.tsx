'use client';

import { useMemo, useState } from 'react';
import { collection, doc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { Package, Search, Plus, QrCode, Eye, Pencil, Ban, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useCanManageInventory } from '@/hooks/useCanManageInventory';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { InventoryItemFormDialog, type InventoryItemRecord } from '@/components/dashboard/InventoryItemFormDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

type ItemStatus = 'available' | 'borrowed' | 'maintenance' | 'broken' | 'lost' | 'inactive';

interface InventoryCategory {
  id: string;
  categoryName: string;
  status: 'active' | 'inactive';
}

const STATUS_META: Record<ItemStatus, { label: string; cls: string }> = {
  available: { label: 'Tersedia', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  borrowed: { label: 'Dipinjam', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  maintenance: { label: 'Maintenance', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  broken: { label: 'Rusak', cls: 'bg-red-50 text-red-700 border-red-200' },
  lost: { label: 'Hilang', cls: 'bg-red-100 text-red-800 border-red-300' },
  inactive: { label: 'Nonaktif', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const ALL_FILTER = '__all__';

function qrImageUrl(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(value)}`;
}

function formatDateTime(value: any): string {
  if (!value) return '-';
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d?.getTime?.())) return '-';
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';
}

export default function BarangPage() {
  const { allowed, loading } = useCanManageInventory();
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const itemsRef = useMemoFirebase(() => collection(firestore, 'inventory_items'), [firestore]);
  const { data: items, isLoading: loadingItems, mutate } = useCollection<InventoryItemRecord>(itemsRef, { realtime: false });

  const categoriesRef = useMemoFirebase(() => collection(firestore, 'inventory_categories'), [firestore]);
  const { data: categories } = useCollection<InventoryCategory>(categoriesRef, { realtime: false });
  const activeCategories = useMemo(() => (categories ?? []).filter((c) => c.status === 'active'), [categories]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(ALL_FILTER);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_FILTER);
  const [brandFilter, setBrandFilter] = useState<string>(ALL_FILTER);
  const [divisionFilter, setDivisionFilter] = useState<string>(ALL_FILTER);
  const [locationFilter, setLocationFilter] = useState<string>(ALL_FILTER);

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItemRecord | null>(null);
  const [detailItem, setDetailItem] = useState<InventoryItemRecord | null>(null);
  const [qrItem, setQrItem] = useState<InventoryItemRecord | null>(null);
  const [deactivateItem, setDeactivateItem] = useState<InventoryItemRecord | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const uniqueValues = (key: 'itemBrand' | 'divisionOwnerName' | 'location') =>
    Array.from(new Set((items ?? []).map((i) => (i as any)[key]).filter((v) => v && v !== '-'))).sort();

  const brandOptions = useMemo(() => uniqueValues('itemBrand'), [items]);
  const divisionOptions = useMemo(() => uniqueValues('divisionOwnerName'), [items]);
  const locationOptions = useMemo(() => uniqueValues('location'), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter((item) => {
      if (statusFilter !== ALL_FILTER && item.status !== statusFilter) return false;
      if (categoryFilter !== ALL_FILTER && item.categoryId !== categoryFilter) return false;
      if (brandFilter !== ALL_FILTER && item.itemBrand !== brandFilter) return false;
      if (divisionFilter !== ALL_FILTER && item.divisionOwnerName !== divisionFilter) return false;
      if (locationFilter !== ALL_FILTER && item.location !== locationFilter) return false;
      if (!q) return true;
      return `${item.itemName} ${item.itemCode} ${item.itemBrand} ${item.categoryName}`.toLowerCase().includes(q);
    });
  }, [items, search, statusFilter, categoryFilter, brandFilter, divisionFilter, locationFilter]);

  const openAdd = () => { setEditingItem(null); setFormOpen(true); };
  const openEdit = (item: InventoryItemRecord) => { setEditingItem(item); setFormOpen(true); };

  const handleDeactivate = async () => {
    if (!deactivateItem) return;
    setDeactivating(true);
    try {
      await updateDoc(doc(firestore, 'inventory_items', deactivateItem.id), {
        status: 'inactive',
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(firestore, 'inventory_logs'), {
        itemId: deactivateItem.id,
        action: 'deactivate',
        userUid: userProfile?.uid,
        userName: userProfile?.fullName ?? userProfile?.email,
        timestamp: serverTimestamp(),
        detail: `Barang "${deactivateItem.itemName}" (${deactivateItem.itemCode}) dinonaktifkan.`,
      });
      toast({ title: 'Barang dinonaktifkan.' });
      setDeactivateItem(null);
      mutate();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal menonaktifkan barang', description: err?.message });
    } finally {
      setDeactivating(false);
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
    <DashboardLayout pageTitle="Barang">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <Package className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Barang</h1>
              <p className="text-sm text-slate-500">Pendataan barang perusahaan. Scan Portal hanya untuk pinjam/kembalikan.</p>
            </div>
          </div>
          <Button onClick={openAdd} className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700">
            <Plus className="h-4 w-4" /> Tambah Barang
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama barang, kode, brand..." className="pl-9" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Semua Kategori" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>Semua Kategori</SelectItem>
              {activeCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.categoryName}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Semua Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>Semua Status</SelectItem>
              {Object.entries(STATUS_META).map(([key, meta]) => <SelectItem key={key} value={key}>{meta.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Semua Brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>Semua Brand</SelectItem>
              {brandOptions.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={divisionFilter} onValueChange={setDivisionFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Semua Divisi" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>Semua Divisi</SelectItem>
              {divisionOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Semua Lokasi" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>Semua Lokasi</SelectItem>
              {locationOptions.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {loadingItems ? (
              <div className="space-y-2 p-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">Tidak ada barang yang cocok.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama Barang</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Divisi</TableHead>
                    <TableHead>Lokasi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs font-mono text-slate-500">{item.itemCode}</TableCell>
                      <TableCell className="font-medium text-slate-800">{item.itemName}</TableCell>
                      <TableCell className="text-xs text-slate-500">{item.categoryName}</TableCell>
                      <TableCell className="text-xs text-slate-500">{item.itemBrand}</TableCell>
                      <TableCell className="text-xs text-slate-500">{item.divisionOwnerName}</TableCell>
                      <TableCell className="text-xs text-slate-500">{item.location}</TableCell>
                      <TableCell><Badge variant="outline" className={cn('text-[10px] font-semibold', STATUS_META[item.status as ItemStatus]?.cls)}>{STATUS_META[item.status as ItemStatus]?.label ?? item.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button size="icon" variant="ghost" title="Detail" onClick={() => setDetailItem(item)}><Eye className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" title="QR Code" onClick={() => setQrItem(item)}><QrCode className="h-4 w-4" /></Button>
                          {item.status !== 'inactive' && (
                            <Button size="icon" variant="ghost" title="Nonaktifkan" onClick={() => setDeactivateItem(item)}><Ban className="h-4 w-4 text-red-500" /></Button>
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

      <InventoryItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editingItem}
        categories={activeCategories}
        onSaved={mutate}
      />

      {/* Detail dialog */}
      <Dialog open={!!detailItem} onOpenChange={(v) => !v && setDetailItem(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>Detail Barang</DialogTitle></DialogHeader>
          {detailItem && (
            <div className="space-y-4 text-sm">
              {detailItem.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={detailItem.photoUrl} alt={detailItem.itemName} className="h-40 w-full rounded-lg border object-cover" />
              )}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Identitas</p>
                <p><span className="text-slate-400">Nama: </span>{detailItem.itemName}</p>
                <p><span className="text-slate-400">Kode: </span>{detailItem.itemCode}</p>
                <p><span className="text-slate-400">Kategori: </span>{detailItem.categoryName}</p>
                <p><span className="text-slate-400">Brand / Model: </span>{detailItem.itemBrand} / {detailItem.model}</p>
                <p><span className="text-slate-400">Serial Number: </span>{detailItem.serialNumber}</p>
                {detailItem.imei && <p><span className="text-slate-400">IMEI: </span>{detailItem.imei}</p>}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Kepemilikan & Lokasi</p>
                <p><span className="text-slate-400">Perusahaan: </span>{detailItem.companyOwnerName}</p>
                <p><span className="text-slate-400">Divisi: </span>{detailItem.divisionOwnerName}</p>
                <p><span className="text-slate-400">Lokasi: </span>{detailItem.location}</p>
                <p><span className="text-slate-400">Penanggung Jawab: </span>{detailItem.responsiblePersonName || '-'}</p>
                <p><span className="text-slate-400">Status Kepemilikan: </span>{detailItem.ownershipStatus}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Tracking</p>
                <p><span className="text-slate-400">Status: </span>{STATUS_META[detailItem.status as ItemStatus]?.label ?? detailItem.status}</p>
                <p><span className="text-slate-400">Kondisi: </span>{detailItem.condition}</p>
                <p><span className="text-slate-400">Bisa Dipinjam: </span>{detailItem.isBorrowable ? 'Ya' : 'Tidak'}</p>
                <p><span className="text-slate-400">Butuh Approval: </span>{detailItem.requiresApproval ? 'Ya' : 'Tidak'}</p>
                {detailItem.accessories && <p><span className="text-slate-400">Aksesoris: </span>{detailItem.accessories}</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR dialog */}
      <Dialog open={!!qrItem} onOpenChange={(v) => !v && setQrItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>QR Code — {qrItem?.itemName}</DialogTitle></DialogHeader>
          {qrItem && (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrImageUrl((qrItem as any).qrCodeValue ?? qrItem.id)} alt={`QR ${qrItem.itemCode}`} className="h-56 w-56 rounded-lg border" />
              <p className="text-xs text-slate-500">{qrItem.itemCode}</p>
              <Button variant="outline" className="gap-1.5" onClick={() => window.open(qrImageUrl((qrItem as any).qrCodeValue ?? qrItem.id), '_blank', 'noopener,noreferrer')}>
                Cetak / Download QR
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Deactivate confirm */}
      <AlertDialog open={!!deactivateItem} onOpenChange={(v) => !v && setDeactivateItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan barang ini?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deactivateItem?.itemName}&quot; ({deactivateItem?.itemCode}) akan ditandai nonaktif dan tidak bisa dipinjam lagi. Data barang tidak dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} disabled={deactivating}>
              {deactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Nonaktifkan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
