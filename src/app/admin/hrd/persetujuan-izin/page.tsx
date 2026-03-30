'use client';
import { useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { MENU_CONFIG } from '@/lib/menu-config';
import { PermissionApprovalClient } from '@/components/dashboard/approvals/PermissionApprovalClient';

export default function PersetujuanIzinHrdPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);

  if (!hasAccess) {
    return <DashboardLayout pageTitle="Persetujuan Izin"><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  return (
    <DashboardLayout pageTitle="Persetujuan & Monitoring Izin">
      <PermissionApprovalClient mode="hrd" />
    </DashboardLayout>
  );
}
