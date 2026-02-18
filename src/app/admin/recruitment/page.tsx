
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { JobApplication, NavigationSetting } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Eye } from 'lucide-react';
import { ALL_MENU_ITEMS, ALL_UNIQUE_MENU_ITEMS } from '@/lib/menu-config';
import { useDoc } from '@/firebase/firestore/use-doc';
import { doc } from 'firebase/firestore';
import { ApplicationStatusBadge } from '@/components/recruitment/ApplicationStatusBadge';

function RecruitmentTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {[...Array(5)].map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function RecruitmentPage() {
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const settingsDocRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'navigation_settings', userProfile.role) : null),
    [userProfile, firestore]
  );
  const { data: navSettings, isLoading: isLoadingSettings } = useDoc<NavigationSetting>(settingsDocRef);
  
  const applicationsQuery = useMemoFirebase(
    () => query(collection(firestore, 'applications'), where('status', '!=', 'draft')),
    [firestore]
  );
  const { data: applications, isLoading: isLoadingApps, error } = useCollection<JobApplication>(applicationsQuery);

  const menuItems = useMemo(() => {
    const defaultItems = ALL_MENU_ITEMS[userProfile?.role as keyof typeof ALL_MENU_ITEMS] || [];
    if (isLoadingSettings) return defaultItems;
    if (navSettings) {
      return ALL_UNIQUE_MENU_ITEMS.filter(item => navSettings.visibleMenuItems.includes(item.label));
    }
    return defaultItems;
  }, [navSettings, isLoadingSettings, userProfile]);

  const filteredApplications = useMemo(() => {
    if (!applications || !userProfile) return [];
    
    let sortedApps = [...applications].sort((a, b) => {
        const timeA = a.submittedAt?.toMillis() || a.createdAt.toMillis();
        const timeB = b.submittedAt?.toMillis() || b.createdAt.toMillis();
        return timeB - timeA;
    });

    if (userProfile.role === 'super-admin') {
      return sortedApps;
    }
    
    if (userProfile.role === 'hrd' && userProfile.brandId) {
      const hrdBrands = Array.isArray(userProfile.brandId) ? userProfile.brandId : [userProfile.brandId];
      return sortedApps.filter(app => hrdBrands.includes(app.brandId));
    }
    
    return [];
  }, [applications, userProfile]);
  
  const isLoading = isLoadingApps || (userProfile && isLoadingSettings);

  if (!hasAccess || isLoading) {
    return (
      <DashboardLayout pageTitle="Recruitment" menuItems={menuItems}>
        <RecruitmentTableSkeleton />
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout pageTitle="Recruitment" menuItems={menuItems}>
        <Alert variant="destructive">
          <AlertTitle>Error Loading Applications</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Recruitment" menuItems={menuItems}>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredApplications.length > 0 ? (
              filteredApplications.map(app => (
                <TableRow key={app.id}>
                  <TableCell className="font-medium">{app.candidateName}</TableCell>
                  <TableCell>{app.jobPosition}</TableCell>
                  <TableCell>{app.brandName}</TableCell>
                  <TableCell>{app.submittedAt ? format(app.submittedAt.toDate(), 'dd MMM yyyy') : '-'}</TableCell>
                  <TableCell><ApplicationStatusBadge status={app.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="icon">
                      <Link href={`/admin/recruitment/${app.id}`}>
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">View Application</span>
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No submitted applications found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </DashboardLayout>
  );
}
