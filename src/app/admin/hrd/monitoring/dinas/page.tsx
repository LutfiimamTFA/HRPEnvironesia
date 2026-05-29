"use client";

import { useMemo } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { MENU_CONFIG } from "@/lib/menu-config";
import { HRDMonitoringClient } from "@/components/dashboard/dinas/HRDMonitoringClient";

export default function DinasPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(["hrd", "super-admin"]);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === "super-admin") return MENU_CONFIG["super-admin"];
    if (userProfile?.role === "hrd") return MENU_CONFIG["hrd"];
    return [];
  }, [userProfile]);

  if (!hasAccess) return null;

  return (
    <DashboardLayout pageTitle="Monitoring Dinas" menuConfig={menuConfig}>
      <HRDMonitoringClient />
    </DashboardLayout>
  );
}
