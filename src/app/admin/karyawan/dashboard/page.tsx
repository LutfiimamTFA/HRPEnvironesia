"use client";

import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeDashboardClient } from "@/components/dashboard/karyawan/dashboard/EmployeeDashboardClient";

export default function KaryawanDashboardPage() {
  const hasAccess = useRoleGuard("karyawan");

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return <EmployeeDashboardClient />;
}
