'use client';

import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { User, Calendar, DollarSign } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const menuItems = [
  { href: '#', label: 'My Information', icon: <User className="h-4 w-4" /> },
  { href: '#', label: 'Leave Request', icon: <Calendar className="h-4 w-4" /> },
  { href: '#', label: 'Payslips', icon: <DollarSign className="h-4 w-4" /> },
];

export default function KaryawanDashboard() {
  const hasAccess = useRoleGuard('karyawan');

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Dashboard Karyawan" menuItems={menuItems}>
      <p>This is the main content area for the Employee dashboard. Access your personal information and company resources.</p>
    </DashboardLayout>
  );
}
