'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Mismatch = {
  employeeUid: string;
  name: string;
  tipeKaryawan: string;
  oldEmploymentStatus: string;
  oldStatusKerja: string;
  oldHrdEmploymentStatus: string;
  oldHrdStatusKerja: string;
  oldUserEmploymentStage: string;
  newStatusLabel: string;
};

export function EmployeeTypeStatusBackfillClient() {
  const { firebaseUser } = useAuth();
  const { toast } = useToast();

  const [mismatches, setMismatches] = useState<Mismatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<{ scannedCount: number; kontrakCount: number } | null>(null);
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

  const runScan = useCallback(async () => {
    setLoading(true);
    try {
      const json = await authedFetch('/api/admin/employee-type-status-backfill');
      setMismatches(json.mismatches || []);
      setMeta(json.meta || null);
    } catch (err: any) {
      toast({ title: 'Gagal memindai data karyawan', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [authedFetch, toast]);

  useEffect(() => {
    if (!firebaseUser) return;
    runScan();
  }, [firebaseUser, runScan]);

  const handleApply = async (row: Mismatch) => {
    setApplying((prev) => ({ ...prev, [row.employeeUid]: true }));
    try {
      await authedFetch('/api/admin/employee-type-status-backfill', {
        method: 'POST',
        body: JSON.stringify({ employeeUid: row.employeeUid }),
      });
      toast({
        title: 'Status kepegawaian diperbarui',
        description: `${row.name} — probation → active / contract.`,
      });
      setMismatches((prev) => prev.filter((m) => m.employeeUid !== row.employeeUid));
    } catch (err: any) {
      toast({ title: 'Gagal memperbarui status', description: err.message, variant: 'destructive' });
    } finally {
      setApplying((prev) => ({ ...prev, [row.employeeUid]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            Sinkronkan Status Kepegawaian
          </CardTitle>
          <CardDescription>
            Mencari karyawan yang Tipe Karyawan-nya sudah <strong>Kontrak</strong> tapi masih membawa
            status lama <strong>Probation</strong> di employmentStatus/statusKerja (top-level, nested
            hrdEmploymentInfo, atau users.employmentStage) — penyebab Dashboard Staff masih menampilkan
            &quot;Probation&quot; walau HRD sudah mengubah tipe menjadi Kontrak. Tidak mengubah Tipe
            Karyawan itu sendiri, dan tidak menyentuh karyawan yang memang masih Probation — setiap
            baris harus dikonfirmasi manual.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" disabled={loading} onClick={runScan}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Pindai Ulang
          </Button>
          {meta && (
            <span className="text-sm text-muted-foreground">
              {meta.scannedCount} profil diperiksa, {meta.kontrakCount} bertipe Kontrak,{' '}
              {mismatches.length} status tidak sinkron.
            </span>
          )}
        </CardContent>
      </Card>

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!loading && meta && mismatches.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4 text-emerald-600" />
            Tidak ada status kepegawaian yang tidak sinkron.
          </CardContent>
        </Card>
      )}

      {!loading && mismatches.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Tipe Karyawan</TableHead>
                  <TableHead>Status Lama</TableHead>
                  <TableHead>Status Baru</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mismatches.map((row) => (
                  <TableRow key={row.employeeUid}>
                    <TableCell className="font-semibold">{row.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] font-semibold">
                        {row.tipeKaryawan}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>employmentStatus: {row.oldEmploymentStatus}</div>
                      <div>statusKerja: {row.oldStatusKerja}</div>
                      <div>hrd.employmentStatus: {row.oldHrdEmploymentStatus}</div>
                      <div>hrd.statusKerja: {row.oldHrdStatusKerja}</div>
                      <div>users.employmentStage: {row.oldUserEmploymentStage}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700">
                        {row.newStatusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" disabled={applying[row.employeeUid]} onClick={() => handleApply(row)}>
                        {applying[row.employeeUid] && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
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
