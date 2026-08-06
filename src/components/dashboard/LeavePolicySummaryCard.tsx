'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, CalendarClock, AlertTriangle, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { LeavePolicy, LeaveRequest } from '@/lib/types';
import { resolveEmployeeUid, resolveEmployeeBrandId, LEAVE_POLICY_RESET_TYPE_LABEL } from '@/lib/leave-policy';
import { calculateLeaveBalance } from '@/lib/leave-balance';

function formatDate(date: Date): string {
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Policy Cuti / Tipe Reset / Periode / Jatah / Terpakai / Pending / Sisa
 * Resmi / Sisa Bisa Diajukan — entirely read-only, derived live via
 * calculateLeaveBalance() (src/lib/leave-balance.ts), the same function every
 * other leave-balance display in the app calls, so this card can never drift
 * from Detail Pengajuan Cuti or any other page. There is deliberately no
 * "Simpan Saldo" / snapshot-write action here anymore — leave_policy_balances
 * writes require the doc's brandId to already satisfy hrdCanUpdateBrandData,
 * which a client-side scan-and-guess doc id can't guarantee, and there's no
 * business need for a persisted snapshot when every consumer already
 * computes the balance live. "Refresh Perhitungan" only recomputes from the
 * already-live leave_requests/leave_policies props (realtime listeners in
 * the parent) — it never writes to Firestore.
 */
export function LeavePolicySummaryCard({
  employee,
  leavePolicies,
  leaveRequests,
  brandName,
  onEdit,
}: {
  employee: any;
  leavePolicies: LeavePolicy[] | null | undefined;
  leaveRequests: LeaveRequest[] | null | undefined;
  brandName?: string;
  /** Opens the "Ubah Cuti" form (Hak Cuti Tahunan/Carry Over/etc — the only manual fields this balance depends on). Omit to render the card without an edit trigger. */
  onEdit?: () => void;
}) {
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  // refreshTick isn't read inside the calculator — it's only a dependency so
  // "Refresh Perhitungan" forces this memo to recompute with a fresh
  // asOfDate=new Date() right away, instead of waiting for one of the other
  // deps to change on its own.
  const result = useMemo(
    () => calculateLeaveBalance({ employee, leaveRequests, leavePolicies }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employee, leaveRequests, leavePolicies, refreshTick],
  );

  if (typeof window !== 'undefined') {
    console.log('[EMPLOYEE_LEAVE_BALANCE_SYNC_DEBUG]', {
      employeeName: employee?.fullName || employee?.namaLengkap || employee?.name || employee?.displayName || null,
      employeeUid: resolveEmployeeUid(employee),
      brandId: resolveEmployeeBrandId(employee),
      policy: result.found ? { id: result.policyId, name: result.policyName, resetType: result.resetType } : (result.reason === 'contract_incomplete' ? result.policy : null),
      periodStart: result.found ? result.periodStart : null,
      periodEnd: result.found ? result.periodEnd : null,
      entitlementDays: result.found ? result.entitlementDays : null,
      carryOverDays: result.found ? result.carryOverDays : null,
      usedDays: result.found ? result.usedDays : null,
      pendingDays: result.found ? result.pendingDays : null,
      remainingDays: result.found ? result.remainingDays : null,
      source: 'calculateLeaveBalance',
    });
  }

  if (!result.found && result.reason === 'no_policy') {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="h-4 w-4 shrink-0" />
          Belum ada leave policy untuk brand karyawan ini. Atur di menu Kebijakan Cuti.
        </CardContent>
      </Card>
    );
  }

  if (!result.found && result.reason === 'contract_incomplete') {
    return (
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10">
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" /> Periode kontrak belum diatur
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Policy &quot;{result.policy.name}&quot; reset per kontrak, tapi tanggal mulai/selesai kontrak karyawan ini
            belum lengkap. Sisa cuti belum dapat dihitung.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!result.found) return null;

  // No Firestore call — leaveRequests/leavePolicies already arrive via the
  // parent's realtime listeners, so `result` above is already current on
  // every render. This just gives HRD a visible "it's fresh" affordance
  // (a brief spinner + a forced recompute tick) without ever writing a
  // manual balance snapshot.
  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshTick((tick) => tick + 1);
    toast({ title: 'Perhitungan saldo cuti diperbarui.' });
    setTimeout(() => setIsRefreshing(false), 400);
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Policy Cuti</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{result.policyName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{LEAVE_POLICY_RESET_TYPE_LABEL[result.resetType]}</Badge>
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-slate-500 hover:text-purple-400 hover:bg-purple-500/10"
                onClick={onEdit}
                title="Ubah Hak Cuti / Carry Over"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Periode Cuti</p>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {formatDate(result.periodStart)} - {formatDate(result.periodEnd)}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Jatah Cuti</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{result.entitlementDays} <span className="text-xs font-normal text-muted-foreground">hari</span></p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Carry Over</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{result.carryOverDays} <span className="text-xs font-normal text-muted-foreground">hari</span></p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Terpakai</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{result.usedDays} <span className="text-xs font-normal text-muted-foreground">hari</span></p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Pending</p>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{result.pendingDays} <span className="text-xs font-normal text-muted-foreground">hari</span></p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Sisa Resmi</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{result.remainingDays} <span className="text-xs font-normal text-muted-foreground">hari</span></p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Sisa Bisa Diajukan</p>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {result.availableDays} hari {result.availableDays < result.remainingDays && '(memperhitungkan pengajuan pending)'}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Refresh Perhitungan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
