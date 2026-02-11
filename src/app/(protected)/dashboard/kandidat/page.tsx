'use client';

import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { FileText, Search, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const menuItems = [
  { href: '#', label: 'My Profile', icon: <User className="h-4 w-4" /> },
  { href: '#', label: 'Job Search', icon: <Search className="h-4 w-4" /> },
  { href: '#', label: 'My Applications', icon: <FileText className="h-4 w-4" /> },
];

export default function KandidatDashboard() {
  const hasAccess = useRoleGuard('kandidat');

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-4">
        <Skeleton className="h-[400px] w-full max-w-6xl" />
      </div>
    );
  }

  return (
    <DashboardLayout pageTitle="Dashboard Kandidat" menuItems={menuItems}>
      <p>This is the main content area for the Candidate dashboard. Manage your profile and job applications.</p>
    </DashboardLayout>
  );
}
