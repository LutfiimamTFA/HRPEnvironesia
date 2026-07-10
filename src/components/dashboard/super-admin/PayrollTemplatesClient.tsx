'use client';

import { useRef, useState } from 'react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import {
  useCollection, useFirestore, useMemoFirebase,
  setDocumentNonBlocking, deleteDocumentNonBlocking,
} from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import type { Brand, PayrollGroup, PayrollTemplate } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Upload, Trash2, Pencil, ChevronDown, ChevronUp, FileSpreadsheet, Users2 } from 'lucide-react';

function TemplateRow({ template, brands, onDelete }: { template: PayrollTemplate; brands: Brand[]; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const usedBy = brands.filter((b) => b.payrollTemplateId === template.id);

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3 min-w-0">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{template.name}</p>
            <p className="text-xs text-muted-foreground truncate">{template.fileName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {template.driveWebViewLink && (
            <a href={template.driveWebViewLink} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Lihat di Drive</a>
          )}
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-800 p-3 space-y-3 text-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Sheet Tersedia</p>
            <div className="flex flex-wrap gap-1">
              {template.sheetNames.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">Brand yang Memakai Template Ini</p>
            {usedBy.length === 0 ? (
              <p className="text-muted-foreground text-xs">Belum ada brand yang memakai template ini.</p>
            ) : (
              <ul className="space-y-1">
                {usedBy.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 text-xs">
                    <span className="font-medium">{b.name}</span>
                    <span className="text-muted-foreground">→ sheet</span>
                    <Badge variant="outline">{b.payrollSheetName || '-'}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BrandMappingRow({ brand, templates, groups }: { brand: Brand; templates: PayrollTemplate[]; groups: PayrollGroup[] }) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [code, setCode] = useState(brand.code || '');
  const [templateId, setTemplateId] = useState(brand.payrollTemplateId || '');
  const [sheetName, setSheetName] = useState(brand.payrollSheetName || '');
  const [templateType, setTemplateType] = useState(brand.payrollTemplateType || '');
  const [saving, setSaving] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const group = brand.payrollGroupId ? groups.find((g) => g.id === brand.payrollGroupId) : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDocumentNonBlocking(
        doc(firestore, 'brands', brand.id!),
        { code: code || null, payrollTemplateId: templateId || null, payrollSheetName: sheetName || null, payrollTemplateType: templateType || null },
        { merge: true },
      );
      toast({ title: `Mapping payroll untuk ${brand.name} disimpan.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan', description: error.message });
    } finally {
      setSaving(false);
    }
  };

  // Brands that belong to a Payroll Group inherit their mapping from there —
  // editing here would silently drift from the group until the next group
  // save overwrites it, so the row is shown read-only with a pointer instead.
  if (brand.payrollGroupId) {
    return (
      <TableRow>
        <TableCell className="font-medium">{brand.name}</TableCell>
        <TableCell colSpan={4}>
          <span className="text-xs text-muted-foreground">
            Mengikuti Payroll Group: <span className="font-medium text-foreground">{group?.name || brand.payrollGroupName || brand.payrollGroupId}</span>
            {' '}({brand.payrollSheetName || '-'})
          </span>
        </TableCell>
        <TableCell className="text-right">
          <span className="text-[11px] text-muted-foreground">Kelola di Payroll Group</span>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{brand.name}</TableCell>
      <TableCell>
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="EGS / GIG / OTHER" className="h-8 text-xs w-28" />
      </TableCell>
      <TableCell>
        <Select value={templateId} onValueChange={(v) => { setTemplateId(v); setSheetName(''); }}>
          <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Pilih template" /></SelectTrigger>
          <SelectContent>
            {templates.map((t) => <SelectItem key={t.id} value={t.id!}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select value={sheetName} onValueChange={setSheetName} disabled={!selectedTemplate}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Pilih sheet" /></SelectTrigger>
          <SelectContent>
            {(selectedTemplate?.sheetNames || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input value={templateType} onChange={(e) => setTemplateType(e.target.value.toLowerCase())} placeholder="egs / gig / default" className="h-8 text-xs w-32" />
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 text-xs">
          {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Simpan
        </Button>
      </TableCell>
    </TableRow>
  );
}

const TEMPLATE_TYPE_OPTIONS: PayrollGroup['payrollTemplateType'][] = ['egs', 'gig', 'default'];

type PayrollGroupDraft = {
  name: string;
  description: string;
  brandIds: string[];
  templateId: string;
  sheetName: string;
  templateType: PayrollGroup['payrollTemplateType'];
};

const EMPTY_GROUP_DRAFT: PayrollGroupDraft = {
  name: '',
  description: '',
  brandIds: [],
  templateId: '',
  sheetName: '',
  templateType: 'default',
};

function PayrollGroupFormCard({
  brands, templates, groups, editingGroup, onDone,
}: {
  brands: Brand[];
  templates: PayrollTemplate[];
  groups: PayrollGroup[];
  editingGroup: PayrollGroup | null;
  onDone: () => void;
}) {
  const firestore = useFirestore();
  const { userProfile, firebaseUser } = useAuth();
  const { toast } = useToast();
  const [draft, setDraft] = useState<PayrollGroupDraft>(() =>
    editingGroup
      ? {
        name: editingGroup.name,
        description: editingGroup.description || '',
        brandIds: editingGroup.brandIds || [],
        templateId: editingGroup.payrollTemplateId,
        sheetName: editingGroup.payrollSheetName,
        templateType: editingGroup.payrollTemplateType,
      }
      : EMPTY_GROUP_DRAFT,
  );
  const [saving, setSaving] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === draft.templateId);

  // Warn (non-blocking) if a checked brand already belongs to a different
  // active group — Tahap 9 validation #5. Super Admin can still proceed;
  // saving simply moves the brand into this group instead.
  const conflictingBrandNames = draft.brandIds
    .map((brandId) => {
      const conflict = groups.find((g) => g.id !== editingGroup?.id && g.isActive !== false && g.brandIds?.includes(brandId));
      if (!conflict) return null;
      const brand = brands.find((b) => b.id === brandId);
      return brand ? `${brand.name} (sudah di "${conflict.name}")` : null;
    })
    .filter((v): v is string => !!v);

  const toggleBrand = (brandId: string, checked: boolean) => {
    setDraft((prev) => ({
      ...prev,
      brandIds: checked ? Array.from(new Set([...prev.brandIds, brandId])) : prev.brandIds.filter((id) => id !== brandId),
    }));
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      toast({ variant: 'destructive', title: 'Nama Payroll Group wajib diisi.' });
      return;
    }
    if (draft.brandIds.length === 0) {
      toast({ variant: 'destructive', title: 'Pilih minimal satu brand/perusahaan anggota grup.' });
      return;
    }
    if (!draft.templateId) {
      toast({ variant: 'destructive', title: 'Pilih template payroll untuk grup ini.' });
      return;
    }
    if (!draft.sheetName) {
      toast({ variant: 'destructive', title: 'Pilih sheet payroll yang tersedia di template.' });
      return;
    }
    if (!selectedTemplate) {
      toast({ variant: 'destructive', title: 'Template yang dipilih tidak ditemukan.' });
      return;
    }
    if (!userProfile || !firebaseUser) return;

    setSaving(true);
    try {
      const groupRef = editingGroup?.id ? doc(firestore, 'payroll_groups', editingGroup.id) : doc(collection(firestore, 'payroll_groups'));
      const brandNames = draft.brandIds.map((id) => brands.find((b) => b.id === id)?.name || id);
      const now = new Date();

      const batch = writeBatch(firestore);
      batch.set(groupRef, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        brandIds: draft.brandIds,
        brandNames,
        payrollTemplateId: draft.templateId,
        payrollTemplateName: selectedTemplate.name,
        payrollSheetName: draft.sheetName,
        payrollTemplateType: draft.templateType,
        isActive: true,
        createdByUid: editingGroup?.createdByUid || userProfile.uid,
        createdByName: editingGroup?.createdByName || userProfile.fullName || userProfile.email || userProfile.uid,
        createdAt: editingGroup?.createdAt || now,
        updatedAt: now,
      }, { merge: true });

      // Cascade mapping onto every current member brand (Tahap 2).
      for (const brandId of draft.brandIds) {
        batch.set(doc(firestore, 'brands', brandId), {
          payrollGroupId: groupRef.id,
          payrollGroupName: draft.name.trim(),
          payrollTemplateId: draft.templateId,
          payrollSheetName: draft.sheetName,
          payrollTemplateType: draft.templateType,
        }, { merge: true });
      }

      // Brands removed from this group (edit case) lose the group mapping —
      // they fall back to being manually mapped again in the section above.
      const removedBrandIds = (editingGroup?.brandIds || []).filter((id) => !draft.brandIds.includes(id));
      for (const brandId of removedBrandIds) {
        batch.set(doc(firestore, 'brands', brandId), {
          payrollGroupId: null,
          payrollGroupName: null,
        }, { merge: true });
      }

      await batch.commit();
      toast({ title: `Payroll Group "${draft.name.trim()}" disimpan.`, description: `${brandNames.length} brand terhubung ke template ini.` });
      onDone();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan Payroll Group', description: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{editingGroup ? `Edit Payroll Group: ${editingGroup.name}` : 'Tambah Payroll Group Baru'}</CardTitle>
        <CardDescription>Satu grup bisa berisi banyak brand yang memakai template dan sheet payroll yang sama.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Nama Grup</Label>
            <Input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Contoh: ABC Group" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Deskripsi (opsional)</Label>
            <Input value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} placeholder="Catatan singkat" className="mt-1" />
          </div>
        </div>

        <div>
          <Label className="text-xs">Brand/Perusahaan Anggota Grup</Label>
          <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border p-3">
            {brands.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada data brand.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {brands.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((b) => (
                  <label key={b.id} className="flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted/50">
                    <Checkbox checked={draft.brandIds.includes(b.id!)} onCheckedChange={(checked) => toggleBrand(b.id!, !!checked)} />
                    <span>{b.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {conflictingBrandNames.length > 0 && (
            <Alert className="mt-2 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertDescription className="text-xs">
                Brand ini sudah masuk Payroll Group lain: {conflictingBrandNames.join(', ')}. Menyimpan akan memindahkan brand tersebut ke grup ini.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Template Payroll</Label>
            <Select value={draft.templateId} onValueChange={(v) => setDraft((p) => ({ ...p, templateId: v, sheetName: '' }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih template" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => <SelectItem key={t.id} value={t.id!}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sheet Payroll</Label>
            <Select value={draft.sheetName} onValueChange={(v) => setDraft((p) => ({ ...p, sheetName: v }))} disabled={!selectedTemplate}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih sheet" /></SelectTrigger>
              <SelectContent>
                {(selectedTemplate?.sheetNames || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipe Template</Label>
            <Select value={draft.templateType} onValueChange={(v) => setDraft((p) => ({ ...p, templateType: v as PayrollGroup['payrollTemplateType'] }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEMPLATE_TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t!}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onDone} disabled={saving}>Batal</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Simpan Payroll Group
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PayrollGroupRow({ group, onEdit, onDelete }: { group: PayrollGroup; onEdit: () => void; onDelete: () => void }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{group.name}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1 max-w-xs">
          {(group.brandNames || []).map((name) => <Badge key={name} variant="secondary" className="text-[11px]">{name}</Badge>)}
        </div>
      </TableCell>
      <TableCell className="text-sm">{group.payrollTemplateName}</TableCell>
      <TableCell className="text-sm">{group.payrollSheetName}</TableCell>
      <TableCell><Badge variant="outline">{group.payrollTemplateType}</Badge></TableCell>
      <TableCell>
        <Badge variant={group.isActive === false ? 'secondary' : 'default'}>{group.isActive === false ? 'Nonaktif' : 'Aktif'}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function PayrollTemplatesClient() {
  const firestore = useFirestore();
  const { firebaseUser } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [templateName, setTemplateName] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const { data: templates, isLoading: isLoadingTemplates, mutate: refetchTemplates } = useCollection<PayrollTemplate>(
    useMemoFirebase(() => collection(firestore, 'payroll_templates'), [firestore]),
  );
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore]),
  );
  const { data: groups, isLoading: isLoadingGroups, mutate: refetchGroups } = useCollection<PayrollGroup>(
    useMemoFirebase(() => collection(firestore, 'payroll_groups'), [firestore]),
  );
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PayrollGroup | null>(null);

  // Uploads go through /api/payroll-templates/upload — the server uploads to
  // Google Drive (service account), reads sheet names, and writes the
  // payroll_templates doc. Firebase Storage is never touched, so the bucket
  // quota this feature used to hit no longer applies.
  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast({ variant: 'destructive', title: 'Pilih file .xlsx terlebih dahulu.' });
      return;
    }
    if (!templateName.trim()) {
      toast({ variant: 'destructive', title: 'Isi nama template terlebih dahulu.' });
      return;
    }
    if (!firebaseUser) return;

    setIsUploading(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', templateName.trim());

      const response = await fetch('/api/payroll-templates/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Gagal upload template.');
      }

      toast({ title: 'Template payroll berhasil diupload ke Google Drive', description: `${result.sheetNames.length} sheet ditemukan: ${result.sheetNames.join(', ')}` });
      setTemplateName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      refetchTemplates();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal upload template', description: error.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteTemplate = async (template: PayrollTemplate) => {
    if (!confirm(`Hapus template "${template.name}"? Brand yang masih memakai template ini perlu di-mapping ulang.`)) return;
    try {
      await deleteDocumentNonBlocking(doc(firestore, 'payroll_templates', template.id!));
      toast({ title: 'Template dihapus.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus', description: error.message });
    }
  };

  const handleDeleteGroup = async (group: PayrollGroup) => {
    if (!confirm(`Hapus Payroll Group "${group.name}"? Brand anggotanya perlu dipetakan ulang secara manual.`)) return;
    try {
      const batch = writeBatch(firestore);
      batch.delete(doc(firestore, 'payroll_groups', group.id!));
      for (const brandId of group.brandIds || []) {
        batch.set(doc(firestore, 'brands', brandId), { payrollGroupId: null, payrollGroupName: null }, { merge: true });
      }
      await batch.commit();
      toast({ title: 'Payroll Group dihapus.' });
      refetchGroups();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus Payroll Group', description: error.message });
    }
  };

  const isLoading = isLoadingTemplates || isLoadingBrands || isLoadingGroups;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Template Payroll</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Upload template Excel payroll perusahaan, lalu tentukan brand mana memakai sheet mana. Export payroll HRD akan mengikuti mapping ini — tidak menebak dari nama brand.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Template Baru</CardTitle>
          <CardDescription>File .xlsx — sheet di dalamnya akan otomatis terbaca setelah upload.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <Label className="text-xs">Nama Template</Label>
            <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder='Contoh: "Payroll GIG dan EGS 2026"' className="mt-1" />
          </div>
          <div className="flex-1 w-full">
            <Label className="text-xs">File Excel (.xlsx)</Label>
            <Input ref={fileInputRef} type="file" accept=".xlsx" className="mt-1" />
          </div>
          <Button onClick={handleUpload} disabled={isUploading} className="shrink-0">
            {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Template Tersimpan</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : templates && templates.length > 0 ? (
            templates.map((t) => (
              <TemplateRow key={t.id} template={t} brands={brands || []} onDelete={() => handleDeleteTemplate(t)} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">Belum ada template diupload.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Users2 className="h-4 w-4" /> Payroll Group</CardTitle>
            <CardDescription>Satu grup bisa berisi banyak brand yang memakai template &amp; sheet payroll yang sama (mis. "ABC Group" = PT ABC, PT ABC 1-3).</CardDescription>
          </div>
          {!groupFormOpen && (
            <Button size="sm" onClick={() => { setEditingGroup(null); setGroupFormOpen(true); }}>Tambah Payroll Group</Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {groupFormOpen && (
            <PayrollGroupFormCard
              brands={brands || []}
              templates={templates || []}
              groups={groups || []}
              editingGroup={editingGroup}
              onDone={() => { setGroupFormOpen(false); setEditingGroup(null); refetchGroups(); }}
            />
          )}
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : groups && groups.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Grup</TableHead>
                    <TableHead>Brand Anggota</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Sheet</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((g) => (
                    <PayrollGroupRow
                      key={g.id}
                      group={g}
                      onEdit={() => { setEditingGroup(g); setGroupFormOpen(true); }}
                      onDelete={() => handleDeleteGroup(g)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            !groupFormOpen && <p className="text-sm text-muted-foreground text-center py-6">Belum ada Payroll Group. Brand yang belum masuk grup bisa dipetakan manual di bawah.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mapping Brand → Template Payroll</CardTitle>
          <CardDescription>Brand yang sudah masuk Payroll Group otomatis mengikuti mapping grup. Brand lain dipetakan manual di sini.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Sheet</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(brands || []).map((b) => (
                    <BrandMappingRow key={b.id} brand={b} templates={templates || []} groups={groups || []} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
