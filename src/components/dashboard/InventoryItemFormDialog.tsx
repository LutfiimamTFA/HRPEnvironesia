'use client';

import { useEffect, useState } from 'react';
import { doc, updateDoc, addDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Loader2, Info } from 'lucide-react';
import { useAuth as useFirebaseAuth } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useStorage, useCollection, useMemoFirebase } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { Brand, Division } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface InventoryItemRecord {
  id: string;
  itemName: string;
  itemCode: string;
  categoryId: string | null;
  categoryName: string;
  itemBrand: string;
  model: string;
  serialNumber: string;
  imei: string;
  photoUrl: string;
  description: string;
  companyOwnerId: string;
  companyOwnerName: string;
  divisionOwnerId: string | null;
  divisionOwnerName: string;
  location: string;
  responsiblePersonUid: string | null;
  responsiblePersonName: string;
  ownershipStatus: string;
  purchaseDate: any;
  purchasePrice: number | null;
  fundingSource: string | null;
  vendorName: string;
  invoiceNumber: string;
  invoiceFileUrl: string;
  purchaseMethod: string;
  estimatedUsefulLife: string;
  financeNotes: string;
  status: string;
  condition: string;
  isBorrowable: boolean;
  requiresApproval: boolean;
  accessories: string;
  operationalNotes: string;
  qrCodeValue?: string;
}

interface CategoryOption {
  id: string;
  categoryName: string;
}

interface ActiveUser {
  fullName: string;
  isActive?: boolean;
}

const CONDITIONS = ['Baru', 'Baik', 'Cukup', 'Rusak Ringan', 'Rusak Berat'];
const OWNERSHIP_STATUSES = ['Aset Perusahaan', 'Barang Sewa', 'Barang Titipan', 'Barang Pinjaman Vendor', 'Barang Pribadi Karyawan', 'Lainnya'];
const FUNDING_SOURCES = ['Kas Perusahaan', 'Reimbursement', 'Dana Proyek', 'Hibah', 'Sponsor', 'Pembelian Pribadi Dialihkan ke Kantor', 'Lainnya'];
const STATUSES = ['available', 'borrowed', 'maintenance', 'broken', 'lost', 'inactive'];
const STATUS_LABEL: Record<string, string> = {
  available: 'Tersedia', borrowed: 'Dipinjam', maintenance: 'Maintenance', broken: 'Rusak', lost: 'Hilang', inactive: 'Nonaktif',
};
const NONE = '__none__';

const EMPTY_FORM = {
  itemName: '', categoryId: '', itemBrand: '', model: '', serialNumber: '', imei: '', description: '',
  companyOwnerId: '', divisionOwnerId: '', location: '', responsiblePersonUid: '', ownershipStatus: 'Aset Perusahaan',
  purchaseDate: '', purchasePrice: '', fundingSource: '', vendorName: '', invoiceNumber: '', purchaseMethod: '', estimatedUsefulLife: '', financeNotes: '',
  status: 'available', condition: 'Baik', isBorrowable: true, requiresApproval: false, accessories: '', operationalNotes: '',
};

export function InventoryItemFormDialog({
  open, onOpenChange, item, categories, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: InventoryItemRecord | null;
  categories: CategoryOption[];
  onSaved: () => void;
}) {
  const mode = item ? 'edit' : 'create';
  const firestore = useFirestore();
  const storage = useStorage();
  const firebaseAuth = useFirebaseAuth();
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Master data from HRP — never manual text entry for company/division.
  const brandsRef = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands } = useCollection<Brand>(brandsRef);

  const divisionsQuery = useMemoFirebase(() => {
    if (!form.companyOwnerId) return null;
    return query(collection(firestore, 'brands', form.companyOwnerId, 'divisions'), where('isActive', '==', true));
  }, [firestore, form.companyOwnerId]);
  const { data: divisions, isLoading: isLoadingDivisions } = useCollection<Division>(divisionsQuery);
  const noDivisions = !isLoadingDivisions && !!form.companyOwnerId && (divisions?.length ?? 0) === 0;

  const activeUsersRef = useMemoFirebase(
    () => query(collection(firestore, 'users'), where('isActive', '==', true)),
    [firestore],
  );
  const { data: activeUsers } = useCollection<ActiveUser>(activeUsersRef);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        itemName: item.itemName, categoryId: item.categoryId ?? '', itemBrand: item.itemBrand, model: item.model,
        serialNumber: item.serialNumber, imei: item.imei, description: item.description,
        companyOwnerId: item.companyOwnerId ?? '', divisionOwnerId: item.divisionOwnerId ?? '', location: item.location,
        responsiblePersonUid: item.responsiblePersonUid ?? '', ownershipStatus: item.ownershipStatus,
        purchaseDate: item.purchaseDate?.toDate ? item.purchaseDate.toDate().toISOString().slice(0, 10) : '',
        purchasePrice: item.purchasePrice != null ? String(item.purchasePrice) : '',
        fundingSource: item.fundingSource ?? '', vendorName: item.vendorName, invoiceNumber: item.invoiceNumber,
        purchaseMethod: item.purchaseMethod, estimatedUsefulLife: item.estimatedUsefulLife, financeNotes: item.financeNotes,
        status: item.status, condition: item.condition, isBorrowable: item.isBorrowable, requiresApproval: item.requiresApproval,
        accessories: item.accessories, operationalNotes: item.operationalNotes,
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
    setPhotoFile(null);
    setInvoiceFile(null);
  }, [open, item]);

  const update = (key: keyof typeof form, value: any) => setForm((p) => ({ ...p, [key]: value }));

  // Changing the company/brand clears the dependent division — divisions
  // belong to a specific brand, so a stale selection from a different brand
  // must never be submitted.
  const handleCompanyChange = (companyOwnerId: string) => {
    setForm((p) => ({ ...p, companyOwnerId, divisionOwnerId: '' }));
  };

  const uploadFile = async (file: File, itemId: string, kind: 'photo' | 'invoice') => {
    const path = `inventory/items/${itemId}/${kind}-${Date.now()}-${file.name}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    return getDownloadURL(fileRef);
  };

  const handleSubmit = async () => {
    if (!form.itemName.trim()) {
      toast({ variant: 'destructive', title: 'Nama Barang wajib diisi.' });
      return;
    }
    if (!form.companyOwnerId) {
      toast({ variant: 'destructive', title: 'Perusahaan/Brand Pemilik wajib diisi.' });
      return;
    }
    if (!form.location.trim()) {
      toast({ variant: 'destructive', title: 'Lokasi Penyimpanan wajib diisi.' });
      return;
    }
    setSaving(true);
    try {
      const category = categories.find((c) => c.id === form.categoryId);
      const company = brands?.find((b) => b.id === form.companyOwnerId);
      const division = form.divisionOwnerId ? divisions?.find((d) => d.id === form.divisionOwnerId) : null;
      const responsiblePerson = form.responsiblePersonUid
        ? (activeUsers ?? []).find((u: any) => u.id === form.responsiblePersonUid)
        : null;

      const payload = {
        itemName: form.itemName.trim(),
        categoryId: form.categoryId || null,
        categoryName: category?.categoryName ?? '-',
        itemBrand: form.itemBrand.trim(),
        model: form.model.trim(),
        serialNumber: form.serialNumber.trim(),
        imei: form.imei.trim(),
        description: form.description.trim(),
        companyOwnerId: form.companyOwnerId,
        companyOwnerName: company?.name ?? '-',
        divisionOwnerId: form.divisionOwnerId || null,
        divisionOwnerName: division?.name ?? '-',
        location: form.location.trim(),
        responsiblePersonUid: form.responsiblePersonUid || null,
        responsiblePersonName: responsiblePerson?.fullName ?? '',
        ownershipStatus: form.ownershipStatus,
        purchaseDate: form.purchaseDate || null,
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
        fundingSource: form.fundingSource || null,
        vendorName: form.vendorName.trim(),
        invoiceNumber: form.invoiceNumber.trim(),
        purchaseMethod: form.purchaseMethod.trim(),
        estimatedUsefulLife: form.estimatedUsefulLife.trim(),
        financeNotes: form.financeNotes.trim(),
        status: form.status,
        condition: form.condition,
        isBorrowable: form.isBorrowable,
        requiresApproval: form.requiresApproval,
        accessories: form.accessories.trim(),
        operationalNotes: form.operationalNotes.trim(),
      };

      if (mode === 'create') {
        const user = firebaseAuth.currentUser;
        if (!user) throw new Error('Sesi tidak ditemukan, silakan login ulang.');
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/inventory/items/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message ?? 'Gagal menambahkan barang.');

        if (photoFile || invoiceFile) {
          const updates: Record<string, string> = {};
          if (photoFile) updates.photoUrl = await uploadFile(photoFile, data.itemId, 'photo');
          if (invoiceFile) updates.invoiceFileUrl = await uploadFile(invoiceFile, data.itemId, 'invoice');
          await updateDoc(doc(firestore, 'inventory_items', data.itemId), { ...updates, updatedAt: serverTimestamp() });
        }

        toast({ title: `Barang berhasil ditambahkan (${data.itemCode}).` });
      } else if (item) {
        const updates: Record<string, any> = { ...payload, updatedAt: serverTimestamp() };
        if (photoFile) updates.photoUrl = await uploadFile(photoFile, item.id, 'photo');
        if (invoiceFile) updates.invoiceFileUrl = await uploadFile(invoiceFile, item.id, 'invoice');
        await updateDoc(doc(firestore, 'inventory_items', item.id), updates);
        await addDoc(collection(firestore, 'inventory_logs'), {
          itemId: item.id,
          action: 'update',
          userUid: userProfile?.uid,
          userName: userProfile?.fullName ?? userProfile?.email,
          timestamp: serverTimestamp(),
          detail: `Barang "${payload.itemName}" (${item.itemCode}) diperbarui.`,
        });
        toast({ title: 'Barang berhasil diperbarui.' });
      }

      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan barang', description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{mode === 'edit' ? 'Edit Barang' : 'Tambah Barang'}</DialogTitle></DialogHeader>

        <div className="space-y-6">
          {/* 1. Identitas Barang */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700">1. Identitas Barang</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Label>Nama Barang *</Label><Input value={form.itemName} onChange={(e) => update('itemName', e.target.value)} /></div>
              <div>
                <Label>Kategori Barang</Label>
                <Select value={form.categoryId} onValueChange={(v) => update('categoryId', v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.categoryName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Merk/Brand</Label><Input value={form.itemBrand} onChange={(e) => update('itemBrand', e.target.value)} /></div>
              <div><Label>Tipe/Model</Label><Input value={form.model} onChange={(e) => update('model', e.target.value)} /></div>
              <div><Label>Serial Number</Label><Input value={form.serialNumber} onChange={(e) => update('serialNumber', e.target.value)} /></div>
              <div><Label>IMEI (opsional)</Label><Input value={form.imei} onChange={(e) => update('imei', e.target.value)} /></div>
              <div><Label>Foto Barang</Label><Input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} /></div>
              <div className="sm:col-span-2"><Label>Deskripsi</Label><Textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={2} /></div>
            </div>
          </section>

          {/* 2. Kepemilikan & Lokasi */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700">2. Kepemilikan & Lokasi</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Perusahaan/Brand Pemilik *</Label>
                <Select value={form.companyOwnerId} onValueChange={handleCompanyChange}>
                  <SelectTrigger><SelectValue placeholder="Pilih perusahaan/brand" /></SelectTrigger>
                  <SelectContent>
                    {(brands ?? []).map((b) => <SelectItem key={b.id} value={b.id!}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Divisi Pemilik/Pengguna <span className="text-slate-400 text-xs font-normal">(opsional)</span></Label>
                {noDivisions ? (
                  <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Belum ada divisi untuk brand ini.
                  </div>
                ) : (
                  <Select
                    value={form.divisionOwnerId || NONE}
                    onValueChange={(v) => update('divisionOwnerId', v === NONE ? '' : v)}
                    disabled={!form.companyOwnerId || isLoadingDivisions}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        !form.companyOwnerId ? 'Pilih perusahaan/brand terlebih dahulu' :
                        isLoadingDivisions ? 'Memuat divisi...' :
                        'Pilih divisi (opsional)'
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Tanpa Divisi —</SelectItem>
                      {(divisions ?? []).map((d) => <SelectItem key={d.id} value={d.id!}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div><Label>Lokasi Penyimpanan *</Label><Input value={form.location} onChange={(e) => update('location', e.target.value)} /></div>
              <div>
                <Label>Penanggung Jawab <span className="text-slate-400 text-xs font-normal">(opsional)</span></Label>
                <Select value={form.responsiblePersonUid || NONE} onValueChange={(v) => update('responsiblePersonUid', v === NONE ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih karyawan" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Tidak ada —</SelectItem>
                    {(activeUsers ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Status Kepemilikan</Label>
                <Select value={form.ownershipStatus} onValueChange={(v) => update('ownershipStatus', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{OWNERSHIP_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* 3. Finance / Bukti Aset */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700">3. Finance / Bukti Aset</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Label>Tanggal Pembelian</Label><Input type="date" value={form.purchaseDate} onChange={(e) => update('purchaseDate', e.target.value)} /></div>
              <div><Label>Harga Beli</Label><Input type="number" value={form.purchasePrice} onChange={(e) => update('purchasePrice', e.target.value)} /></div>
              <div>
                <Label>Sumber Dana</Label>
                <Select value={form.fundingSource} onValueChange={(v) => update('fundingSource', v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih sumber dana" /></SelectTrigger>
                  <SelectContent>{FUNDING_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Vendor/Toko</Label><Input value={form.vendorName} onChange={(e) => update('vendorName', e.target.value)} /></div>
              <div><Label>Nomor Invoice</Label><Input value={form.invoiceNumber} onChange={(e) => update('invoiceNumber', e.target.value)} /></div>
              <div><Label>Upload Invoice/Bukti Pembelian</Label><Input type="file" onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)} /></div>
              <div><Label>Metode Pembelian</Label><Input value={form.purchaseMethod} onChange={(e) => update('purchaseMethod', e.target.value)} /></div>
              <div><Label>Estimasi Umur Aset</Label><Input value={form.estimatedUsefulLife} onChange={(e) => update('estimatedUsefulLife', e.target.value)} placeholder="contoh: 3 tahun" /></div>
              <div className="sm:col-span-2"><Label>Catatan Finance</Label><Textarea value={form.financeNotes} onChange={(e) => update('financeNotes', e.target.value)} rows={2} /></div>
            </div>
          </section>

          {/* 4. Tracking & Operasional */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700">4. Tracking & Operasional</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Status Barang</Label>
                <Select value={form.status} onValueChange={(v) => update('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Kondisi Barang</Label>
                <Select value={form.condition} onValueChange={(v) => update('condition', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3"><Label className="text-sm">Bisa Dipinjam</Label><Switch checked={form.isBorrowable} onCheckedChange={(v) => update('isBorrowable', v)} /></div>
              <div className="flex items-center justify-between rounded-lg border p-3"><Label className="text-sm">Butuh Approval</Label><Switch checked={form.requiresApproval} onCheckedChange={(v) => update('requiresApproval', v)} /></div>
              <div className="sm:col-span-2"><Label>Aksesoris Bawaan</Label><Input value={form.accessories} onChange={(e) => update('accessories', e.target.value)} placeholder="contoh: charger, tas, mouse" /></div>
              <div className="sm:col-span-2"><Label>Catatan Operasional</Label><Textarea value={form.operationalNotes} onChange={(e) => update('operationalNotes', e.target.value)} rows={2} /></div>
            </div>
            {mode === 'create' && <p className="text-xs text-slate-400">Kode Barang &amp; QR Code dibuat otomatis setelah disimpan.</p>}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan Barang
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
