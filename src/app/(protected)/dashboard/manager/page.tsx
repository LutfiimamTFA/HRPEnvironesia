'use client';

import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Users, ClipboardList, CheckSquare } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const menuItems = [
  { href: '#', label: 'My Team', icon: <Users className="h-4 w-4" /> },
  { href: '#', label: 'Open Requisitions', icon: <ClipboardList className="h-4 w-4" /> },
  { href: '#', label: 'Approvals', icon: <CheckSquare className="h-4 w-4" /> },
];

export default function ManagerDashboard() {
  const hasAccess = useRoleGuard('manager');

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Dashboard Manager" menuItems={menuItems}>
      <p>This is the main content area for the Manager dashboard. View team details and manage approvals.</p>
    </DashboardLayout>
  );
}
