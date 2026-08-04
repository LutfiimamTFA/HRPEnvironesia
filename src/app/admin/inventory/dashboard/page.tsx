'use client';

import { useMemo } from 'react';
import { collection } from 'firebase/firestore';
import { Package, PackageCheck, PackageX, Wrench, ArrowLeftRight, HelpCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useCanManageInventory } from '@/hooks/useCanManageInventory';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface InventoryItem {
  itemName: string;
  itemCode: string;
  status: 'available' | 'borrowed' | 'maintenance' | 'broken' | 'lost' | 'inactive';
}

interface InventoryBorrowing {
  itemName: string;
  itemCode: string;
  borrowedByName: string;
  status: 'borrowed' | 'returned' | 'overdue';
  borrowedAt: any;
}

function formatDateTime(value: any): string {
  if (!value) return '-';
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d?.getTime?.())) return '-';
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';
}

export default function InventoryDashboardPage() {
  const { allowed, loading } = useCanManageInventory();
  const firestore = useFirestore();

  const itemsRef = useMemoFirebase(() => collection(firestore, 'inventory_items'), [firestore]);
  const { data: items, isLoading: loadingItems } = useCollection<InventoryItem>(itemsRef, { realtime: false });

  const borrowingsRef = useMemoFirebase(() => collection(firestore, 'inventory_borrowings'), [firestore]);
  const { data: borrowings, isLoading: loadingBorrowings } = useCollection<InventoryBorrowing>(borrowingsRef, { realtime: false });

  const stats = useMemo(() => {
    const counts = { available: 0, borrowed: 0, maintenance: 0, broken: 0, lost: 0, inactive: 0 };
    (items ?? []).forEach((item) => {
      if (item.status in counts) counts[item.status]++;
    });
    return counts;
  }, [items]);

  const recentBorrowings = useMemo(() => {
    return [...(borrowings ?? [])]
      .sort((a, b) => (b.borrowedAt?.toMillis?.() ?? 0) - (a.borrowedAt?.toMillis?.() ?? 0))
      .slice(0, 8);
  }, [borrowings]);

  if (loading || !allowed) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  const statusMeta: Record<string, { label: string; cls: string }> = {
    borrowed: { label: 'Dipinjam', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    returned: { label: 'Dikembalikan', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    overdue: { label: 'Terlambat', cls: 'bg-red-50 text-red-700 border-red-200' },
  };

  return (
    <DashboardLayout pageTitle="Dashboard Inventory">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
            <Package className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Dashboard Inventory</h1>
            <p className="text-sm text-slate-500">Ringkasan barang dan peminjaman. Pendataan barang dilakukan di HRP.</p>
          </div>
        </div>

        {loadingItems ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <Card><CardContent className="p-4"><PackageCheck className="h-4 w-4 text-emerald-600" /><p className="mt-2 text-[11px] text-slate-400">Tersedia</p><p className="text-lg font-bold text-slate-800">{stats.available}</p></CardContent></Card>
            <Card><CardContent className="p-4"><ArrowLeftRight className="h-4 w-4 text-amber-600" /><p className="mt-2 text-[11px] text-slate-400">Dipinjam</p><p className="text-lg font-bold text-slate-800">{stats.borrowed}</p></CardContent></Card>
            <Card><CardContent className="p-4"><Wrench className="h-4 w-4 text-blue-600" /><p className="mt-2 text-[11px] text-slate-400">Maintenance</p><p className="text-lg font-bold text-slate-800">{stats.maintenance}</p></CardContent></Card>
            <Card><CardContent className="p-4"><PackageX className="h-4 w-4 text-red-600" /><p className="mt-2 text-[11px] text-slate-400">Rusak</p><p className="text-lg font-bold text-slate-800">{stats.broken}</p></CardContent></Card>
            <Card><CardContent className="p-4"><HelpCircle className="h-4 w-4 text-red-800" /><p className="mt-2 text-[11px] text-slate-400">Hilang</p><p className="text-lg font-bold text-slate-800">{stats.lost}</p></CardContent></Card>
            <Card><CardContent className="p-4"><Package className="h-4 w-4 text-slate-400" /><p className="mt-2 text-[11px] text-slate-400">Nonaktif</p><p className="text-lg font-bold text-slate-800">{stats.inactive}</p></CardContent></Card>
          </div>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Peminjaman Terbaru</h2>
          {loadingBorrowings ? (
            <Skeleton className="h-40 w-full" />
          ) : recentBorrowings.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Belum ada peminjaman.</div>
          ) : (
            <div className="space-y-2">
              {recentBorrowings.map((b, idx) => (
                <Card key={idx}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{b.itemName} <span className="text-xs font-normal text-slate-400">({b.itemCode})</span></p>
                      <p className="text-xs text-slate-500">Dipinjam oleh {b.borrowedByName} — {formatDateTime(b.borrowedAt)}</p>
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] font-semibold', statusMeta[b.status]?.cls)}>{statusMeta[b.status]?.label ?? b.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
