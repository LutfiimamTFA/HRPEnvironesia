'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import type { JobApplication, NavigationSetting, Brand } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Eye } from 'lucide-react';
import { ALL_MENU_ITEMS, ALL_UNIQUE_MENU_ITEMS } from '@/lib/menu-config';
import { useDoc } from '@/firebase/firestore/use-doc';
import { ApplicationStatusBadge } from '@/components/recruitment/ApplicationStatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function RecruitmentTableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-[240px]" />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {[...Array(6)].map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(6)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
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
  const [brandFilter, setBrandFilter] = useState<string>('all');

  const settingsDocRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'navigation_settings', userProfile.role) : null),
    [userProfile, firestore]
  );
  const { data: navSettings, isLoading: isLoadingSettings } = useDoc<NavigationSetting>(settingsDocRef);
  
  const applicationsQuery = useMemoFirebase(
    () => {
        if (!firestore) return null;
        return query(collection(firestore, 'applications'), where('status', 'in', ['submitted', 'psychotest', 'reviewed', 'interview', 'hired', 'rejected']));
    },
    [firestore]
  );
  const { data: applications, isLoading: isLoadingApps, error } = useCollection<JobApplication>(applicationsQuery);

  const brandsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'brands') : null),
    [firestore]
  );
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(brandsQuery);

  const menuItems = useMemo(() => {
    const defaultItems = ALL_MENU_ITEMS[userProfile?.role as keyof typeof ALL_MENU_ITEMS] || [];
    if (isLoadingSettings) return defaultItems;
    if (navSettings) {
      return ALL_UNIQUE_MENU_ITEMS.filter(item => navSettings.visibleMenuItems.includes(item.label));
    }
    return defaultItems;
  }, [navSettings, isLoadingSettings, userProfile]);

  const brandsForFilter = useMemo(() => {
    if (!brands || !userProfile) return [];
    if (userProfile.role === 'super-admin' || !userProfile.brandId || (Array.isArray(userProfile.brandId) && userProfile.brandId.length === 0)) {
      return brands; // Super-admin and global HRD see all brands
    }
    const hrdBrands = Array.isArray(userProfile.brandId) ? userProfile.brandId : [userProfile.brandId];
    return brands.filter(brand => hrdBrands.includes(brand.id!));
  }, [brands, userProfile]);

  const filteredApplications = useMemo(() => {
    if (!applications || !userProfile) return [];

    let permissionFilteredApps;
    if (userProfile.role === 'super-admin' || !userProfile.brandId || (Array.isArray(userProfile.brandId) && userProfile.brandId.length === 0)) {
      permissionFilteredApps = applications;
    } else if (userProfile.role === 'hrd') {
      const hrdBrands = Array.isArray(userProfile.brandId) ? userProfile.brandId : [userProfile.brandId];
      permissionFilteredApps = applications.filter(app => hrdBrands.includes(app.brandId));
    } else {
        permissionFilteredApps = [];
    }

    const brandFilteredApps = brandFilter && brandFilter !== 'all'
      ? permissionFilteredApps.filter(app => app.brandId === brandFilter)
      : permissionFilteredApps;

    return [...brandFilteredApps].sort((a, b) => {
      const timeA = a.submittedAt?.toMillis() || a.createdAt.toMillis();
      const timeB = b.submittedAt?.toMillis() || b.createdAt.toMillis();
      return timeB - timeA;
    });
  }, [applications, userProfile, brandFilter]);
  
  const isLoading = isLoadingApps || isLoadingSettings || isLoadingBrands;

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
      <div className="space-y-4">
        <div className="flex justify-start">
            <Select value={brandFilter} onValueChange={setBrandFilter} disabled={brandsForFilter.length === 0}>
                <SelectTrigger className="w-full max-w-xs">
                    <SelectValue placeholder="Filter by brand..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Brands</SelectItem>
                    {brandsForFilter.map(brand => (
                        <SelectItem key={brand.id} value={brand.id!}>{brand.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
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
                    No submitted applications found for the selected filter.
                    </TableCell>
                </TableRow>
                )}
            </TableBody>
            </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
