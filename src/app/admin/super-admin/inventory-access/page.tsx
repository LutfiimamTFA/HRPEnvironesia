'use client';

import { useMemo, useState } from 'react';
import { Package, Search, Loader2, UserPlus, UserMinus } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth as useFirebaseAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MENU_CONFIG } from '@/lib/menu-config';
import { cn } from '@/lib/utils';

interface Employee {
  uid: string;
  fullName: string;
  email: string;
  employeeNumber: string;
  role: string;
  inventoryAccessStatus: 'active' | 'inactive';
  grantedAt: any;
  grantedByName: string | null;
}

function useAuthedFetch() {
  const auth = useFirebaseAuth();
  return async (path: string, method: 'GET' | 'POST' = 'GET', body?: any) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Sesi tidak ditemukan, silakan login ulang.');
    const token = await user.getIdToken();
    const res = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message ?? 'Permintaan gagal.');
    return data;
  };
}

function formatDateTime(value: any): string {
  if (!value) return '-';
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d?.getTime?.())) return '-';
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';
}

export default function InventoryAccessPage() {
  const hasAccess = useRoleGuard('super-admin');
  const menuConfig = useMemo(() => MENU_CONFIG['super-admin'] || [], []);
  const authedFetch = useAuthedFetch();
  const { toast } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ employee: Employee; action: 'grant' | 'revoke' } | null>(null);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const data = await authedFetch('/api/admin/inventory-access/list');
      setEmployees(data.employees ?? []);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal memuat daftar karyawan', description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  // One-shot load on page open — not realtime, matches the rest of Super Admin's
  // technical tooling (data only changes when this page's actions are used).
  useMemo(() => {
    if (!hasAccess) return;
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  const filtered = employees.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${e.fullName} ${e.email} ${e.employeeNumber}`.toLowerCase().includes(q);
  });

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    const { employee, action } = confirmTarget;
    setConfirmTarget(null);
    setPendingUid(employee.uid);
    try {
      await authedFetch(`/api/admin/inventory-access/${action}`, 'POST', { uid: employee.uid });
      toast({
        title: action === 'grant'
          ? `Akses Inventory Admin diberikan kepada ${employee.fullName}.`
          : `Akses Inventory Admin dicabut dari ${employee.fullName}.`,
      });
      await loadEmployees();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Gagal memproses akses', description: err?.message });
    } finally {
      setPendingUid(null);
    }
  };

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Manajemen Akses Inventory" menuConfig={menuConfig}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
            <Package className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Manajemen Akses Inventory</h1>
              <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 text-[10px] font-semibold uppercase tracking-wide">
                Super Admin Only
              </Badge>
            </div>
            <p className="text-sm text-slate-500">
              Berikan atau cabut akses pendataan barang (Inventory Admin) untuk karyawan tertentu. Ini bukan perubahan role HRP —
              role utama karyawan (HRD, Manager, Karyawan, dst) tidak berubah.
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, email, atau kode karyawan..."
            className="pl-9"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">Tidak ada karyawan yang cocok.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Karyawan</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Kode Karyawan</TableHead>
                    <TableHead>Status Akses Inventory</TableHead>
                    <TableHead>Diberikan Oleh / Pada</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((emp) => {
                    const isActive = emp.inventoryAccessStatus === 'active';
                    const isPending = pendingUid === emp.uid;
                    return (
                      <TableRow key={emp.uid}>
                        <TableCell className="font-medium text-slate-800">{emp.fullName}</TableCell>
                        <TableCell className="text-xs text-slate-500">{emp.email}</TableCell>
                        <TableCell className="text-xs text-slate-500">{emp.employeeNumber}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px] font-semibold', isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500')}>
                            {isActive ? 'Aktif' : 'Tidak Aktif'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {isActive ? `${emp.grantedByName ?? '-'} · ${formatDateTime(emp.grantedAt)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {isActive ? (
                            <Button
                              size="sm" variant="outline" disabled={isPending}
                              className="gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => setConfirmTarget({ employee: emp, action: 'revoke' })}
                            >
                              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />} Cabut Akses
                            </Button>
                          ) : (
                            <Button
                              size="sm" variant="outline" disabled={isPending}
                              className="gap-1.5 text-xs"
                              onClick={() => setConfirmTarget({ employee: emp, action: 'grant' })}
                            >
                              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Beri Akses Inventory Admin
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!confirmTarget} onOpenChange={(v) => !v && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.action === 'grant' ? 'Beri akses Inventory Admin?' : 'Cabut akses Inventory Admin?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.action === 'grant'
                ? `${confirmTarget?.employee.fullName} akan bisa membuka menu pendataan barang (Inventory). Role HRP karyawan ini tidak berubah.`
                : `${confirmTarget?.employee.fullName} tidak akan bisa lagi membuka menu pendataan barang (Inventory). Role HRP karyawan ini tidak berubah.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {confirmTarget?.action === 'grant' ? 'Beri Akses' : 'Cabut Akses'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
