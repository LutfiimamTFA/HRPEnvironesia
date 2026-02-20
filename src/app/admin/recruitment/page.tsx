'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import type { Job, JobApplication, Brand } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Users } from 'lucide-react';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function RecruitmentTableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-[240px]" />
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

export default function RecruitmentJobsPage() {
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const [brandFilter, setBrandFilter] = useState<string>('all');

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') return MENU_CONFIG['hrd-recruitment'];
    return [];
  }, [userProfile]);

  const jobsQuery = useMemoFirebase(() => query(collection(firestore, 'jobs')), [firestore]);
  const { data: jobs, isLoading: isLoadingJobs, error: jobsError } = useCollection<Job>(jobsQuery);

  const applicationsQuery = useMemoFirebase(() => query(collection(firestore, 'applications')), [firestore]);
  const { data: applications, isLoading: isLoadingApps, error: appsError } = useCollection<JobApplication>(applicationsQuery);

  const brandsQuery = useMemoFirebase(() => (firestore ? collection(firestore, 'brands') : null), [firestore]);
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(brandsQuery);
  
  const applicantCounts = useMemo(() => {
    if (!applications) return new Map<string, number>();
    return applications.reduce((acc, app) => {
      acc.set(app.jobId, (acc.get(app.jobId) || 0) + 1);
      return acc;
    }, new Map<string, number>());
  }, [applications]);
  
  const brandsForFilter = useMemo(() => {
    if (!brands || !userProfile) return [];
    if (userProfile.role === 'super-admin' || !userProfile.brandId || (Array.isArray(userProfile.brandId) && userProfile.brandId.length === 0)) {
      return brands; // Super-admin and global HRD see all brands
    }
    const hrdBrands = Array.isArray(userProfile.brandId) ? userProfile.brandId : [userProfile.brandId];
    return brands.filter(brand => hrdBrands.includes(brand.id!));
  }, [brands, userProfile]);

  const jobsWithCounts = useMemo(() => {
    if (!jobs) return [];

    let permissionFilteredJobs;
    if (userProfile?.role === 'super-admin' || !userProfile?.brandId || (Array.isArray(userProfile.brandId) && userProfile.brandId.length === 0)) {
      permissionFilteredJobs = jobs;
    } else if (userProfile?.role === 'hrd') {
      const hrdBrands = Array.isArray(userProfile.brandId) ? userProfile.brandId : [userProfile.brandId];
      permissionFilteredJobs = jobs.filter(job => hrdBrands.includes(job.brandId));
    } else {
        permissionFilteredJobs = [];
    }

    const brandFilteredJobs = brandFilter && brandFilter !== 'all'
      ? permissionFilteredJobs.filter(job => job.brandId === brandFilter)
      : permissionFilteredJobs;

    return brandFilteredJobs.map(job => ({
      ...job,
      applicantCount: applicantCounts.get(job.id!) || 0
    })).sort((a, b) => b.applicantCount - a.applicantCount);
  }, [jobs, applicantCounts, userProfile, brandFilter]);
  
  const isLoading = isLoadingJobs || isLoadingApps || isLoadingBrands;
  const error = jobsError || appsError;

  if (!hasAccess || isLoading) {
    return (
      <DashboardLayout pageTitle="Recruitment" menuConfig={menuConfig}>
        <RecruitmentTableSkeleton />
      </DashboardLayout>
    );
  }
  
  if (error) {
    return (
      <DashboardLayout pageTitle="Recruitment" menuConfig={menuConfig}>
        <Alert variant="destructive">
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Recruitment: Select Job Posting" menuConfig={menuConfig}>
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
                <TableHead>Position</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total Applicants</TableHead>
                <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {jobsWithCounts.length > 0 ? (
                jobsWithCounts.map(job => (
                    <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.position}</TableCell>
                    <TableCell>{job.brandName}</TableCell>
                    <TableCell>
                      <Badge variant={
                        job.publishStatus === 'published' ? 'default' 
                        : job.publishStatus === 'closed' ? 'destructive' 
                        : 'secondary'
                      } className="capitalize">
                        {job.publishStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" /> 
                        {job.applicantCount}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/recruitment/jobs/${job.id}`}>
                            View Applicants
                          </Link>
                        </Button>
                    </TableCell>
                    </TableRow>
                ))
                ) : (
                <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                    No job postings found for the selected filter.
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
