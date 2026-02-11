'use client';

import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { LayoutDashboard, Users, Settings } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const menuItems = [
    { href: '#', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
    { href: '#', label: 'User Management', icon: <Users className="h-4 w-4" /> },
    { href: '#', label: 'System Settings', icon: <Settings className="h-4 w-4" /> },
];

export default function SuperAdminDashboard() {
  const hasAccess = useRoleGuard('admin');

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Dashboard Super Admin" menuItems={menuItems}>
      <p>This is the main content area for the Super Admin dashboard. You can add widgets, charts, and tables here.</p>
    </DashboardLayout>
  );
}
