'use client';

import { useMemo, useState } from 'react';
import { collection } from 'firebase/firestore';
import { ArrowLeftRight, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useCanManageInventory } from '@/hooks/useCanManageInventory';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type BorrowingStatus = 'borrowed' | 'returned' | 'overdue';

interface InventoryBorrowing {
  id: string;
  itemName: string;
  itemCode: string;
  borrowedByName: string;
  borrowedAt: any;
  estimatedReturnAt: any;
  returnedAt: any;
  status: BorrowingStatus;
}

const STATUS_META: Record<BorrowingStatus, { label: string; cls: string }> = {
  borrowed: { label: 'Dipinjam', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  returned: { label: 'Dikembalikan', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  overdue: { label: 'Terlambat', cls: 'bg-red-50 text-red-700 border-red-200' },
};

function formatDateTime(value: any): string {
  if (!value) return '-';
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d?.getTime?.())) return '-';
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';
}

export default function DataPeminjamanPage() {
  const { allowed, loading } = useCanManageInventory();
  const firestore = useFirestore();

  const borrowingsRef = useMemoFirebase(() => collection(firestore, 'inventory_borrowings'), [firestore]);
  const { data: borrowings, isLoading: loadingBorrowings } = useCollection<InventoryBorrowing>(borrowingsRef, { realtime: false });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BorrowingStatus | 'all'>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...(borrowings ?? [])]
      .filter((b) => {
        if (statusFilter !== 'all' && b.status !== statusFilter) return false;
        if (!q) return true;
        return `${b.itemName} ${b.itemCode} ${b.borrowedByName}`.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.borrowedAt?.toMillis?.() ?? 0) - (a.borrowedAt?.toMillis?.() ?? 0));
  }, [borrowings, search, statusFilter]);

  if (loading || !allowed) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Data Peminjaman">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
            <ArrowLeftRight className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Data Peminjaman</h1>
            <p className="text-sm text-slate-500">Riwayat peminjaman barang oleh karyawan lewat Scan Portal.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama barang atau peminjam..." className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as BorrowingStatus | 'all')}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Semua Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              {Object.entries(STATUS_META).map(([key, meta]) => (
                <SelectItem key={key} value={key}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {loadingBorrowings ? (
              <div className="space-y-2 p-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">Belum ada data peminjaman.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Barang</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead>Peminjam</TableHead>
                    <TableHead>Tanggal Pinjam</TableHead>
                    <TableHead>Estimasi Kembali</TableHead>
                    <TableHead>Tanggal Kembali</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium text-slate-800">{b.itemName}</TableCell>
                      <TableCell className="text-xs font-mono text-slate-500">{b.itemCode}</TableCell>
                      <TableCell className="text-xs text-slate-600">{b.borrowedByName}</TableCell>
                      <TableCell className="text-xs text-slate-500">{formatDateTime(b.borrowedAt)}</TableCell>
                      <TableCell className="text-xs text-slate-500">{formatDateTime(b.estimatedReturnAt)}</TableCell>
                      <TableCell className="text-xs text-slate-500">{formatDateTime(b.returnedAt)}</TableCell>
                      <TableCell><Badge variant="outline" className={cn('text-[10px] font-semibold', STATUS_META[b.status]?.cls)}>{STATUS_META[b.status]?.label ?? b.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
