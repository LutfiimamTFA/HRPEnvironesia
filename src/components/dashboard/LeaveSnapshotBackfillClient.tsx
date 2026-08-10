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
type Mismatch = {
  requestId: string;
  employeeUid: string;
  oldName: string;
  newName: string;
  oldDivisionName: string;
  newDivisionName: string;
  oldBrandName: string;
  newBrandName: string;
  status: string;
};

export function LeaveSnapshotBackfillClient() {
  const { firebaseUser } = useAuth();
  const { toast } = useToast();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');

  const [mismatches, setMismatches] = useState<Mismatch[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [scannedCount, setScannedCount] = useState<number | null>(null);
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
    authedFetch('/api/admin/leave-snapshot-backfill')
      .then((json) => setBrands(json.brands || []))
      .catch((err) => toast({ title: 'Gagal memuat daftar brand', description: err.message, variant: 'destructive' }))
      .finally(() => setBrandsLoading(false));
  }, [firebaseUser, authedFetch, toast]);

  const runScan = useCallback(
    async (brandId: string) => {
      if (!brandId) return;
      setReportLoading(true);
      setMismatches([]);
      try {
        const json = await authedFetch(`/api/admin/leave-snapshot-backfill?brandId=${encodeURIComponent(brandId)}`);
        setMismatches(json.mismatches || []);
        setScannedCount(json.meta?.scannedCount ?? null);
      } catch (err: any) {
        toast({ title: 'Gagal memindai pengajuan cuti', description: err.message, variant: 'destructive' });
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
    setApplying((prev) => ({ ...prev, [row.requestId]: true }));
    try {
      await authedFetch('/api/admin/leave-snapshot-backfill', {
        method: 'POST',
        body: JSON.stringify({ requestId: row.requestId }),
      });
      toast({
        title: 'Snapshot diperbarui',
        description: `${row.newName} — ${row.oldDivisionName} → ${row.newDivisionName}.`,
      });
      setMismatches((prev) => prev.filter((m) => m.requestId !== row.requestId));
    } catch (err: any) {
      toast({ title: 'Gagal memperbarui snapshot', description: err.message, variant: 'destructive' });
    } finally {
      setApplying((prev) => ({ ...prev, [row.requestId]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            Sinkronkan Snapshot Cuti
          </CardTitle>
          <CardDescription>
            Menyegarkan nama/brand/divisi yang tersimpan di dokumen leave_requests lama agar sesuai
            data terbaru karyawan (mis. "CBDMS" → "DTIC"). Tidak mengubah status, tanggal, durasi,
            saldo, atau keputusan approval — dan tidak ada perubahan otomatis, setiap baris harus
            dikonfirmasi manual.
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
              {scannedCount} pengajuan diperiksa, {mismatches.length} snapshot tidak sinkron.
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
            Tidak ada snapshot yang tidak sinkron di brand ini.
          </CardContent>
        </Card>
      )}

      {!reportLoading && mismatches.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Divisi Lama → Baru</TableHead>
                  <TableHead>Brand Lama → Baru</TableHead>
                  <TableHead>Status Pengajuan</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mismatches.map((row) => (
                  <TableRow key={row.requestId}>
                    <TableCell className="font-semibold">{row.newName}</TableCell>
                    <TableCell>
                      {row.oldDivisionName !== row.newDivisionName ? (
                        <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-[11px] font-semibold text-amber-700">
                          <AlertTriangle className="h-3 w-3" />
                          {row.oldDivisionName} → {row.newDivisionName}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{row.newDivisionName}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.oldBrandName !== row.newBrandName ? (
                        <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-[11px] font-semibold text-amber-700">
                          {row.oldBrandName} → {row.newBrandName}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{row.newBrandName}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{row.status}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" disabled={applying[row.requestId]} onClick={() => handleApply(row)}>
                        {applying[row.requestId] && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
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
