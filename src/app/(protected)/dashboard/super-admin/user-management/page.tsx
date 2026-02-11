'use client';

import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { UserManagementClient } from '@/components/dashboard/UserManagementClient';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { LayoutDashboard, Users, Settings } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const menuItems = [
  { href: '/dashboard/super-admin', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/dashboard/super-admin/user-management', label: 'User Management', icon: <Users className="h-4 w-4" /> },
  { href: '#', label: 'System Settings', icon: <Settings className="h-4 w-4" /> },
];

export default function UserManagementPage() {
  const hasAccess = useRoleGuard('super-admin');

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="User Management" menuItems={menuItems}>
      <UserManagementClient seedSecret={process.env.SEED_SECRET || ''} />
    </DashboardLayout>
  );
}
