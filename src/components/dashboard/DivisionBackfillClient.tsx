'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Brand = { id: string; name: string };
type Division = { id: string; name: string };
type Mismatch = {
  uid: string;
  fullName: string;
  brandId: string;
  jobTitle: string;
  oldDivisionName: string;
  oldDivisionId: string;
};

export function DivisionBackfillClient() {
  const { firebaseUser } = useAuth();
  const { toast } = useToast();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');

  const [mismatches, setMismatches] = useState<Mismatch[]>([]);
  const [activeDivisions, setActiveDivisions] = useState<Division[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [scannedCount, setScannedCount] = useState<number | null>(null);

  // Per-row picked division (uid -> divisionId), and per-row apply-in-flight state.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState<Record<string, boolean>>({});

  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      if (!firebaseUser) throw new Error('Belum login.');
      const token = await firebaseUser.getIdToken();
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Terjadi kesalahan.');
      return json;
    },
    [firebaseUser],
  );

  useEffect(() => {
    if (!firebaseUser) return;
    setBrandsLoading(true);
    authedFetch('/api/admin/division-backfill')
      .then((json) => setBrands(json.brands || []))
      .catch((err) => toast({ title: 'Gagal memuat daftar brand', description: err.message, variant: 'destructive' }))
      .finally(() => setBrandsLoading(false));
  }, [firebaseUser, authedFetch, toast]);

  const runScan = useCallback(
    async (brandId: string) => {
      if (!brandId) return;
      setReportLoading(true);
      setMismatches([]);
      setPicked({});
      try {
        const json = await authedFetch(`/api/admin/division-backfill?brandId=${encodeURIComponent(brandId)}`);
        setMismatches(json.mismatches || []);
        setActiveDivisions(json.activeDivisions || []);
        setScannedCount(json.meta?.scannedCount ?? null);
      } catch (err: any) {
        toast({ title: 'Gagal memindai divisi', description: err.message, variant: 'destructive' });
      } finally {
        setReportLoading(false);
      }
    },
    [authedFetch, toast],
  );

  const handleBrandChange = (brandId: string) => {
    setSelectedBrandId(brandId);
    runScan(brandId);
  };

  const handleApply = async (row: Mismatch) => {
    const divisionId = picked[row.uid];
    if (!divisionId) return;
    setApplying((prev) => ({ ...prev, [row.uid]: true }));
    try {
      const json = await authedFetch('/api/admin/division-backfill', {
        method: 'POST',
        body: JSON.stringify({ uid: row.uid, brandId: row.brandId, divisionId }),
      });
      toast({
        title: 'Divisi diperbarui',
        description: `${row.fullName} dipindahkan ke ${json.divisionName}.`,
      });
      setMismatches((prev) => prev.filter((m) => m.uid !== row.uid));
    } catch (err: any) {
      toast({ title: 'Gagal menerapkan perubahan', description: err.message, variant: 'destructive' });
    } finally {
      setApplying((prev) => ({ ...prev, [row.uid]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            Backfill Divisi Karyawan
          </CardTitle>
          <CardDescription>
            Menemukan karyawan yang divisinya (mis. "CBDMS") tidak lagi ada di Master Data &gt; Brands &amp; Departments.
            Tidak ada perubahan otomatis — setiap koreksi harus dipilih dan dikonfirmasi manual per baris.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {brandsLoading ? (
            <Skeleton className="h-9 w-64" />
          ) : (
            <Select value={selectedBrandId} onValueChange={handleBrandChange}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Pilih brand untuk dipindai" />
              </SelectTrigger>
              <SelectContent>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!selectedBrandId || reportLoading}
            onClick={() => runScan(selectedBrandId)}
          >
            {reportLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Pindai Ulang
          </Button>
          {scannedCount !== null && (
            <span className="text-sm text-muted-foreground">
              {scannedCount} profil diperiksa, {mismatches.length} bermasalah.
            </span>
          )}
        </CardContent>
      </Card>

      {reportLoading && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!reportLoading && selectedBrandId && mismatches.length === 0 && scannedCount !== null && (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4 text-emerald-600" />
            Tidak ada divisi bermasalah di brand ini.
          </CardContent>
        </Card>
      )}

      {!reportLoading && mismatches.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UID</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Jabatan</TableHead>
                  <TableHead>Divisi Lama</TableHead>
                  <TableHead>Divisi Baru</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mismatches.map((row) => (
                  <TableRow key={row.uid}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{row.uid}</TableCell>
                    <TableCell>{row.fullName}</TableCell>
                    <TableCell>{row.jobTitle}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-[10px] font-semibold text-red-700">
                        <AlertTriangle className="h-3 w-3" />
                        {row.oldDivisionName}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={picked[row.uid] || 'none'}
                        onValueChange={(value) => setPicked((prev) => ({ ...prev, [row.uid]: value }))}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Pilih divisi" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" disabled>
                            Pilih divisi
                          </SelectItem>
                          {activeDivisions.map((division) => (
                            <SelectItem key={division.id} value={division.id}>
                              {division.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        disabled={!picked[row.uid] || picked[row.uid] === 'none' || applying[row.uid]}
                        onClick={() => handleApply(row)}
                      >
                        {applying[row.uid] && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                        Terapkan
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
