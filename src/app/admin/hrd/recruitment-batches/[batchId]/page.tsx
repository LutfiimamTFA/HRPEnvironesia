'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { doc } from 'firebase/firestore';
import { useAuth } from '@/providers/auth-provider';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';
import type { RecruitmentBatch } from '@/lib/types';
import { useHrdScope } from '@/hooks/useHrdScope';
import { RecruitmentBatchDetailClient } from '@/components/dashboard/RecruitmentBatchDetailClient';

export default function RecruitmentBatchDetailPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = params?.batchId;
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);
  const firestore = useFirestore();
  const { isSuperAdmin, isAllCompanies, allowedBrandIds, isLoading: isScopeLoading } = useHrdScope();

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') return MENU_CONFIG['hrd'];
    return [];
  }, [userProfile]);

  const batchRef = useMemoFirebase(
    () => (batchId ? doc(firestore, 'recruitment_batches', batchId) : null),
    [firestore, batchId]
  );
  const { data: batch, isLoading: isLoadingBatch } = useDoc<RecruitmentBatch>(batchRef);

  if (!hasAccess) {
    return (
      <DashboardLayout pageTitle="Detail Batch" menuConfig={menuConfig}>
        <Skeleton className="h-96 w-full" />
      </DashboardLayout>
    );
  }

  const isLoading = isLoadingBatch || isScopeLoading;
  // Defense-in-depth UX check — the real security boundary is the
  // firestore.rules `get` rule on /recruitment_batches, which already
  // blocks this read server-side for an out-of-scope HRD. This just avoids
  // flashing a raw permission-denied state.
  const isDenied = !isLoading && batch && !isSuperAdmin && !isAllCompanies && !allowedBrandIds.includes(batch.brandId);

  return (
    <DashboardLayout pageTitle={batch?.batchName || 'Detail Batch'} menuConfig={menuConfig}>
      {isLoading ? (
        <div className="w-full min-w-0 space-y-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : isDenied || !batch ? (
        <Card className="rounded-2xl border-dashed border-2 border-slate-200 dark:border-slate-700 shadow-none">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-red-500" />
            </div>
            <p className="font-medium text-slate-700 dark:text-slate-300">
              {isDenied ? 'Anda tidak memiliki akses ke batch ini.' : 'Batch tidak ditemukan.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <RecruitmentBatchDetailClient batch={batch} />
      )}
    </DashboardLayout>
  );
}
