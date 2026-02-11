'use client';

import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Briefcase, FileText, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const menuItems = [
  { href: '#', label: 'Recruitment', icon: <Users className="h-4 w-4" /> },
  { href: '#', label: 'Job Postings', icon: <Briefcase className="h-4 w-4" /> },
  { href: '#', label: 'Applications', icon: <FileText className="h-4 w-4" /> },
];

export default function HrdDashboard() {
  const hasAccess = useRoleGuard('hrd');

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Dashboard HRD" menuItems={menuItems}>
      <p>This is the main content area for the HRD dashboard. Manage recruitment and applications from here.</p>
    </DashboardLayout>
  );
}
