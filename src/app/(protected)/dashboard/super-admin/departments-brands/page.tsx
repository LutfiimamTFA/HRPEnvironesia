'use client';

import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { LayoutDashboard, Users, Settings, Briefcase } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { DepartmentsBrandsClient } from '@/components/dashboard/DepartmentsBrandsClient';

const menuItems = [
    { href: '/dashboard/super-admin', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
    { href: '/dashboard/super-admin/user-management', label: 'User Management', icon: <Users className="h-4 w-4" /> },
    { href: '/dashboard/super-admin/departments-brands', label: 'Departments & Brands', icon: <Briefcase className="h-4 w-4" /> },
    { href: '#', label: 'System Settings', icon: <Settings className="h-4 w-4" /> },
];

export default function DepartmentsBrandsPage() {
  const hasAccess = useRoleGuard('super-admin');

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Departments & Brands" menuItems={menuItems}>
      <DepartmentsBrandsClient />
    </DashboardLayout>
  );
}
