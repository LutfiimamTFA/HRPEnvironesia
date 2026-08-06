'use client';

import { useState, useMemo, type ElementType, type ReactNode } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, deleteDocumentNonBlocking } from '@/firebase';
import { doc, collection, getDocs, query, where, serverTimestamp, writeBatch, type Timestamp } from 'firebase/firestore';
import type { LeavePolicy, Brand } from '@/lib/types';
import { LEAVE_POLICY_RESET_TYPE_LABEL, resolveEmployeeUid, resolveEmployeeBrandId } from '@/lib/leave-policy';
import {
  calculateLeaveBalance,
  buildLeavePolicyBalancePayload,
  isLeaveRequestForEmployee,
  getLeaveRequestEmployeeUid,
  resolveLeaveRequestDurationDays,
} from '@/lib/leave-balance';
import { chunkArray } from '@/lib/hrd-scope';
import { useHrdScopeContext } from '@/providers/hrd-scope-provider';
import { useHrdScopedBrands, useHrdScopedCollection } from '@/hooks/useHrdScopedCollection';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, Trash2, Edit, Building2, CalendarClock, Sparkles, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Badge } from '../ui/badge';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { LeavePolicyFormDialog } from './LeavePolicyFormDialog';

function SummaryBlock({ icon: Icon, label, children }: { icon: ElementType; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-sm text-slate-700 dark:text-slate-200 space-y-0.5">{children}</div>
    </div>
  );
}

function BrandChips({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-sm text-muted-foreground">Brand tidak ditemukan</span>;
  const visible = names.slice(0, 3);
  const rest = names.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((name) => <Badge key={name} variant="secondary" className="font-normal">{name}</Badge>)}
      {rest > 0 && <Badge variant="outline" className="font-normal">+{rest} lainnya</Badge>}
    </div>
  );
}

function PolicyCard({ policy, onEdit, onDelete }: { policy: LeavePolicy; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          <div className="flex items-start gap-3 lg:w-52 shrink-0">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 shrink-0">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{policy.name}</p>
              <Badge variant={policy.isActive ? 'default' : 'outline'} className="mt-1.5 text-[10px]">
                {policy.isActive ? 'Aktif' : 'Non-Aktif'}
              </Badge>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 gap-4">
            <SummaryBlock icon={Building2} label="Brand Terkait">
              <BrandChips names={policy.brandNames || []} />
            </SummaryBlock>
            <SummaryBlock icon={CalendarClock} label="Tipe Reset">
              {LEAVE_POLICY_RESET_TYPE_LABEL[policy.resetType]}
              <div className="text-xs text-muted-foreground">
                {policy.resetType === 'annual' ? '01 Jan - 31 Des tiap tahun' : 'Mengikuti masa kontrak karyawan'}
              </div>
            </SummaryBlock>
          </div>

          <div className="flex lg:flex-col gap-1.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// The two seed policies from the EGS/Greenlab business-rule spec — resolved
// by BRAND NAME against the live `brands` collection at click time (this app
// has no access to production brand ids to hardcode them). Any name that
// can't be matched is skipped with a warning rather than silently omitted.
const SEED_POLICIES: Array<{ name: string; resetType: 'annual' | 'contract'; brandNames: string[] }> = [
  {
    name: 'Greenlab Annual Leave',
    resetType: 'annual',
    brandNames: ['PT Greenlab Indo Global'],
  },
  {
    name: 'EGS Group Contract Leave',
    resetType: 'contract',
    brandNames: [
      'PT Bikin Indonesia Berdaya',
      'PT Environesia Global Saraya',
      'GreenSkill ID',
      'LSP Praktisi Lingkungan Indonesia',
    ],
  },
];

// Native Error/FirebaseError instances carry message/stack/code as
// non-enumerable-ish properties on some engines, so a plain object literal
// spread of `error` (or JSON.stringify(error) directly) can print as "{}" in
// some log pipes even though the fields are readable via property access.
// Reading each field explicitly (and JSON.stringify-ing the RESULT, not the
// error itself) guarantees a non-empty, inspectable log every time.
function serializeFirebaseError(error: any) {
  return {
    name: error?.name || null,
    code: error?.code || null,
    message: error?.message || String(error),
    stack: error?.stack || null,
    // custom FirestorePermissionError (src/firebase/errors.ts) carries a
    // structured `request` object instead of path/operation directly.
    path: error?.path || error?.docPath || error?.targetPath || error?.request?.path || null,
    operation: error?.operation || error?.method || error?.request?.method || null,
    requestResourceData: error?.requestResourceData || error?.request?.resource?.data || null,
    rawKeys: error ? Object.getOwnPropertyNames(error) : [],
    rawString: String(error),
  };
}

export function LeavePolicySettingsClient() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const { emptyStateMessage, isConfigured, isSuperAdmin, isAllCompanies, allowedBrandIds } = useHrdScopeContext();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<LeavePolicy | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const {
    data: policies,
    isLoading: isLoadingPolicies,
    mutate: refetchPolicies,
  } = useHrdScopedCollection<LeavePolicy>('leave_policies', {
    brandField: 'brandIds',
    brandFieldMode: 'array',
    realtime: false,
  });
  const { data: allBrands, isLoading: isLoadingBrands } = useHrdScopedBrands();

  // Only used to drive the "Hitung Ulang Saldo Cuti" button's disabled
  // state — the handler itself re-fetches employee_profiles/leave_requests
  // explicitly (with its own step markers) rather than reusing this hook.
  const { data: allEmployeeProfiles } = useHrdScopedCollection<any>('employee_profiles', { realtime: false });

  const effectiveBrandIds = isSuperAdmin || isAllCompanies ? null : allowedBrandIds;
  const visiblePolicies = useMemo(() => {
    if (!policies) return [];
    if (effectiveBrandIds == null) return policies;
    return policies.filter((policy) => (policy.brandIds || []).some((id) => effectiveBrandIds.includes(id)));
  }, [policies, effectiveBrandIds]);

  if (typeof window !== 'undefined' && policies) {
    console.log('[LEAVE_POLICY_SCOPE_DEBUG]', {
      currentUserUid: userProfile?.uid ?? null,
      role: (userProfile as any)?.role ?? null,
      allowedBrandIds,
      allPolicies: policies.map((p) => ({ id: p.id, name: p.name, resetType: p.resetType, brandIds: p.brandIds, isActive: p.isActive })),
      visiblePolicies: visiblePolicies.map((p) => ({ id: p.id, name: p.name, brandIds: p.brandIds })),
    });
  }

  const handleCreate = () => {
    setSelectedPolicy(null);
    setIsFormOpen(true);
  };

  const handleEdit = (policy: LeavePolicy) => {
    setSelectedPolicy(policy);
    setIsFormOpen(true);
  };

  const handleDelete = (policy: LeavePolicy) => {
    setSelectedPolicy(policy);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedPolicy?.id) return;
    try {
      await deleteDocumentNonBlocking(doc(firestore, 'leave_policies', selectedPolicy.id));
      toast({ title: 'Leave policy dihapus', description: `"${selectedPolicy.name}" telah dihapus.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal menghapus', description: e.message });
    } finally {
      setIsDeleteConfirmOpen(false);
    }
  };

  const handleSeedInitialPolicies = async () => {
    if (!userProfile || !allBrands) return;
    setIsSeeding(true);
    try {
      const batch = writeBatch(firestore);
      const missing: string[] = [];
      let createdCount = 0;

      for (const seed of SEED_POLICIES) {
        const matched = seed.brandNames.map((name) => {
          const brand = allBrands.find((b: Brand) => b.name.trim().toLowerCase() === name.trim().toLowerCase());
          if (!brand) missing.push(name);
          return brand;
        }).filter((b): b is Brand => !!b);

        if (matched.length === 0) continue;

        const docRef = doc(collection(firestore, 'leave_policies'));
        const displayName = (userProfile as any).displayName || (userProfile as any).fullName || userProfile.email || 'HRD';
        const payload: Omit<LeavePolicy, 'id'> = {
          name: seed.name,
          resetType: seed.resetType,
          brandIds: matched.map((b) => b.id!),
          brandNames: matched.map((b) => b.name),
          isActive: true,
          createdByUid: userProfile.uid,
          createdByName: displayName,
          createdAt: serverTimestamp() as Timestamp,
          updatedByUid: userProfile.uid,
          updatedByName: displayName,
          updatedAt: serverTimestamp() as Timestamp,
        };
        batch.set(docRef, payload);
        createdCount++;
      }

      if (createdCount === 0) {
        toast({ variant: 'destructive', title: 'Tidak ada policy dibuat', description: 'Tidak ada brand yang cocok ditemukan di collection brands.' });
        return;
      }

      await batch.commit();
      toast({
        title: `${createdCount} leave policy awal dibuat`,
        description: missing.length > 0 ? `Brand tidak ditemukan (dilewati): ${missing.join(', ')}` : undefined,
      });
      refetchPolicies();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Gagal membuat policy awal', description: error.message });
    } finally {
      setIsSeeding(false);
    }
  };

  // Backfill: recomputes calculateLeaveBalance() for every employee in scope
  // and upserts the result into leave_policy_balances at a DETERMINISTIC doc
  // id (`${employeeUid}_${periodKey}`) — never scanned-and-reused from an
  // existing doc, and never a raw unscoped collection() read. employee_profiles
  // and leave_requests are fetched here with EXPLICIT brandId-chunked queries
  // (not the useHrdScopedCollection hook) so every read this button performs
  // has its own step marker — firestore.rules rejects the whole query the
  // instant one chunk/field doesn't match, and without per-step markers a
  // permission-denied here and a permission-denied on the final write look
  // identical in the console. This is only ever a cache refresh — every page
  // that shows a balance already calls calculateLeaveBalance() live, so this
  // button exists purely to seed leave_policy_balances history/exports, not
  // to "fix" anything live; employee_profiles is never written to here.
  const handleRecalculateAllBalances = async () => {
    if (!userProfile) return;
    setIsRecalculating(true);
    const role = isSuperAdmin ? 'super-admin' : 'hrd';
    let step = 'init';
    let targetCollection = '';
    let targetDocPath = '';
    let lastPayload: any = null;

    try {
      const unscopedRead = isSuperAdmin || isAllCompanies;
      if (!unscopedRead && (!allowedBrandIds || allowedBrandIds.length === 0)) {
        toast({ variant: 'destructive', title: 'Akses perusahaan HRD belum diatur.' });
        return;
      }
      const effectiveBrandIds = unscopedRead ? null : allowedBrandIds;

      // ── employee_profiles ──────────────────────────────────────────────
      step = 'fetch_employee_profiles';
      targetCollection = 'employee_profiles';
      let employees: any[] = [];
      if (effectiveBrandIds == null) {
        const snap = await getDocs(collection(firestore, 'employee_profiles'));
        employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else {
        const byId = new Map<string, any>();
        for (const chunk of chunkArray(effectiveBrandIds, 10)) {
          step = 'fetch_employee_profiles_by_brand';
          const snap = await getDocs(query(collection(firestore, 'employee_profiles'), where('brandId', 'in', chunk)));
          snap.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() }));
        }
        employees = Array.from(byId.values());
      }

      // ── leave_requests ───────────────────────────────────────────────────
      step = 'fetch_leave_requests';
      targetCollection = 'leave_requests';
      let leaveRequests: any[] = [];
      if (effectiveBrandIds == null) {
        const snap = await getDocs(collection(firestore, 'leave_requests'));
        leaveRequests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } else {
        const byId = new Map<string, any>();
        for (const chunk of chunkArray(effectiveBrandIds, 10)) {
          step = 'fetch_leave_requests_by_brand';
          const snap = await getDocs(query(collection(firestore, 'leave_requests'), where('brandId', 'in', chunk)));
          snap.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() }));
        }
        leaveRequests = Array.from(byId.values());
      }

      // leave_policies is already fetched via a brandIds array-contains-any
      // scoped useHrdScopedCollection above (`policies`) — reused as-is,
      // never re-queried globally here.
      step = 'filter_scoped_employees';
      const scopedEmployees =
        effectiveBrandIds == null
          ? employees
          : employees.filter((employee) => {
              const brandId = resolveEmployeeBrandId(employee);
              return brandId != null && effectiveBrandIds.includes(brandId);
            });

      const brandNameById = new Map((allBrands || []).map((b: Brand) => [b.id, b.name]));

      let batch = writeBatch(firestore);
      let opsInBatch = 0;
      const commits: Promise<void>[] = [];
      let computedCount = 0;
      let skippedCount = 0;

      for (const employee of scopedEmployees) {
        const employeeUid = resolveEmployeeUid(employee);
        const employeeName = employee.fullName || employee.namaLengkap || employee.name || employee.displayName || 'Karyawan';
        const brandId = resolveEmployeeBrandId(employee);

        if (!brandId) {
          console.warn('[LEAVE_RECALC_SKIP_EMPLOYEE_NO_BRAND]', { employeeUid, employeeName });
          skippedCount++;
          continue;
        }

        const result = calculateLeaveBalance({ employee, leaveRequests, leavePolicies: policies });
        if (!result.found || !employeeUid) {
          skippedCount++;
          continue;
        }

        const payload = buildLeavePolicyBalancePayload({
          employeeUid,
          employeeName,
          brandId,
          brandName: brandNameById.get(brandId) || '',
          result,
        });
        const fullPayload = {
          ...payload,
          recalculatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedByUid: userProfile.uid,
          updatedByName: (userProfile as any).displayName || (userProfile as any).fullName || userProfile.email || 'HRD',
        };

        const docId = `${employeeUid}_${result.periodKey}`;
        step = 'write_leave_policy_balances';
        targetCollection = 'leave_policy_balances';
        targetDocPath = `leave_policy_balances/${docId}`;
        lastPayload = fullPayload;
        const docRef = doc(firestore, 'leave_policy_balances', docId);

        console.log('[LEAVE_RECALC_EMPLOYEE_DEBUG]', {
          employeeUid,
          employeeName,
          brandId,
          brandName: fullPayload.brandName,
          policyId: fullPayload.policyId,
          policyName: fullPayload.policyName,
          resetType: fullPayload.resetType,
          periodKey: fullPayload.periodKey,
          periodStart: fullPayload.periodStart,
          periodEnd: fullPayload.periodEnd,
          entitlementDays: fullPayload.entitlementDays,
          carryOverDays: result.carryOverDays,
          usedDays: fullPayload.usedDays,
          pendingDays: fullPayload.pendingDays,
          remainingDays: fullPayload.remainingDays,
          availableDays: fullPayload.availableDays,
          matchedLeaveRequests: leaveRequests
            .filter((r) => isLeaveRequestForEmployee(r, employee))
            .map((r) => ({
              id: r.id,
              brandId: r.brandId ?? null,
              employeeUid: getLeaveRequestEmployeeUid(r),
              status: r.status ?? null,
              approvalStatus: r.approvalStatus ?? null,
              hrdApprovalStatus: r.hrdApprovalStatus ?? null,
              durationDays: resolveLeaveRequestDurationDays(r),
            })),
          docPath: targetDocPath,
        });

        batch.set(docRef, fullPayload, { merge: true });
        opsInBatch++;
        computedCount++;

        // Firestore batch limit is 500 ops — commit and start a fresh batch well before that.
        if (opsInBatch >= 450) {
          step = 'commit_batch';
          commits.push(batch.commit());
          batch = writeBatch(firestore);
          opsInBatch = 0;
        }
      }
      if (opsInBatch > 0) {
        step = 'commit_batch';
        commits.push(batch.commit());
      }
      await Promise.all(commits);

      toast({
        title: 'Saldo cuti dihitung ulang',
        description: `${computedCount} karyawan diperbarui${skippedCount > 0 ? `, ${skippedCount} dilewati (belum ada policy aktif / kontrak belum lengkap / brand kosong)` : ''}.`,
      });
    } catch (error: any) {
      console.error(
        '[LEAVE_RECALC_PERMISSION_ERROR]',
        JSON.stringify(
          {
            ...serializeFirebaseError(error),
            step,
            targetCollection,
            targetDocPath,
            role,
            currentUserUid: userProfile?.uid,
            allowedBrandIds,
            lastPayload,
          },
          null,
          2,
        ),
      );
      toast({
        variant: 'destructive',
        title: 'Gagal menghitung ulang saldo cuti',
        description: `Step: ${step}. ${error?.message || String(error)}`,
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  if (!isSuperAdmin && isConfigured === false) {
    return (
      <Alert>
        <AlertTitle>Akses Belum Dikonfigurasi</AlertTitle>
        <AlertDescription>{emptyStateMessage}</AlertDescription>
      </Alert>
    );
  }

  const isLoading = isLoadingPolicies || isLoadingBrands;

  return (
    <>
      <div className="flex flex-row items-center justify-between mb-4 gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Kebijakan Cuti (Leave Policy)</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isSuperAdmin
              ? 'Atur jenis reset cuti (tahunan/per kontrak) untuk semua perusahaan.'
              : 'Atur jenis reset cuti (tahunan/per kontrak) untuk perusahaan yang Anda pegang.'}
          </p>
        </div>
        <div className="flex gap-2">
          {isSuperAdmin && visiblePolicies.length === 0 && !isLoading && (
            <Button variant="outline" onClick={handleSeedInitialPolicies} disabled={isSeeding}>
              {isSeeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Buat Policy Awal (Greenlab + EGS Group)
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleRecalculateAllBalances}
            disabled={isRecalculating || !allEmployeeProfiles || allEmployeeProfiles.length === 0}
            title={isSuperAdmin ? 'Hitung ulang saldo cuti semua karyawan' : 'Hitung ulang saldo cuti karyawan pada brand yang Anda pegang'}
          >
            {isRecalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Hitung Ulang Saldo Cuti
          </Button>
          <Button onClick={handleCreate} disabled={!isSuperAdmin && (allBrands?.length ?? 0) === 0}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Tambah Leave Policy
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-10 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat data policy...
        </CardContent></Card>
      ) : visiblePolicies.length > 0 ? (
        <div className="space-y-3">
          {visiblePolicies.map((policy) => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              onEdit={() => handleEdit(policy)}
              onDelete={() => handleDelete(policy)}
            />
          ))}
        </div>
      ) : (
        <Card><CardContent className="p-10 text-center text-muted-foreground">
          Belum ada leave policy yang dikonfigurasi.
        </CardContent></Card>
      )}

      <LeavePolicyFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        policy={selectedPolicy}
        brands={allBrands || []}
        policies={visiblePolicies}
        onSaved={refetchPolicies}
      />

      <DeleteConfirmationDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={confirmDelete}
        itemName={selectedPolicy?.name}
        itemType="Leave Policy"
      />
    </>
  );
}
