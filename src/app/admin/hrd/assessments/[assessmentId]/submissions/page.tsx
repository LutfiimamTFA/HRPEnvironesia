'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import type { Assessment, AssessmentSession } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { MENU_CONFIG } from '@/lib/menu-config';
import { format } from 'date-fns';
import { AssessmentStatusBadge } from '@/components/dashboard/AssessmentStatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function SubmissionsTableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {[...Array(6)].map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(3)].map((_, i) => (
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

export default function AssessmentSubmissionsPage() {
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.assessmentId as string;
  const [jobFilter, setJobFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') {
        return MENU_CONFIG['hrd'];
    }
    return [];
  }, [userProfile]);
  
  const assessmentRef = useMemoFirebase(() => (assessmentId ? doc(firestore, 'assessments', assessmentId) : null), [firestore, assessmentId]);
  const { data: assessment, isLoading: isLoadingAssessment } = useDoc<Assessment>(assessmentRef);

  const sessionsQuery = useMemoFirebase(
    () => (assessmentId ? query(collection(firestore, 'assessment_sessions'), where('assessmentId', '==', assessmentId)) : null),
    [firestore, assessmentId]
  );
  const { data: sessions, isLoading: isLoadingSessions, error } = useCollection<AssessmentSession>(sessionsQuery);
  
  const { uniqueJobs, uniqueBrands } = useMemo(() => {
    if (!sessions) return { uniqueJobs: [], uniqueBrands: [] };
    const jobSet = new Set<string>();
    const brandSet = new Set<string>();
    sessions.forEach(session => {
        if(session.jobPosition) jobSet.add(session.jobPosition);
        if(session.brandName) brandSet.add(session.brandName);
    });
    return { uniqueJobs: Array.from(jobSet).sort(), uniqueBrands: Array.from(brandSet).sort() };
  }, [sessions]);

  const filteredAndSortedSessions = useMemo(() => {
    if (!sessions) return [];
    
    const filtered = sessions.filter(session => {
        const jobMatch = jobFilter === 'all' || session.jobPosition === jobFilter;
        const brandMatch = brandFilter === 'all' || session.brandName === brandFilter;
        return jobMatch && brandMatch;
    });

    return [...filtered].sort((a, b) => {
      const timeA = a.completedAt?.toMillis() || a.updatedAt.toMillis();
      const timeB = b.completedAt?.toMillis() || b.updatedAt.toMillis();
      return timeB - timeA;
    });
  }, [sessions, jobFilter, brandFilter]);

  const handleResetFilters = () => {
    setJobFilter('all');
    setBrandFilter('all');
  };

  const isLoading = isLoadingSessions || isLoadingAssessment;

  if (!hasAccess || isLoading) {
    return (
      <DashboardLayout 
        pageTitle="Loading Submissions..." 
        menuConfig={menuConfig}
      >
        <SubmissionsTableSkeleton />
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout 
        pageTitle="Error" 
        menuConfig={menuConfig}
      >
        <Alert variant="destructive">
          <AlertTitle>Error Loading Submissions</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
        pageTitle={`Submissions for: ${assessment?.name || '...'}`} 
        menuConfig={menuConfig}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/hrd/assessments')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Assessment Tools
            </Button>
            <div className="flex items-center gap-2">
                <Select value={jobFilter} onValueChange={setJobFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="All Jobs" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Jobs</SelectItem>
                        {uniqueJobs.map(job => (
                            <SelectItem key={job} value={job}>{job}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="All Brands" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Brands</SelectItem>
                        {uniqueBrands.map(brand => (
                            <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                 <Button variant="ghost" size="icon" onClick={handleResetFilters}>
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Reset Filters</span>
                </Button>
            </div>
        </div>
        
        <div className="rounded-lg border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Candidate</TableHead>
                        <TableHead>Job Position</TableHead>
                        <TableHead>Result Type</TableHead>
                        <TableHead>Completed On</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                {filteredAndSortedSessions && filteredAndSortedSessions.length > 0 ? (
                    filteredAndSortedSessions.map(session => (
                    <TableRow key={session.id}>
                        <TableCell className="font-medium">
                          {session.candidateName ?? session.candidateEmail ?? session.candidateUid}
                        </TableCell>
                        <TableCell>
                          {session.jobPosition || '-'}
                          {session.brandName && <span className="text-xs text-muted-foreground block">{session.brandName}</span>}
                        </TableCell>
                        <TableCell>
                          {session.result?.discType ? <AssessmentStatusBadge status="result" label={session.result.discType} /> : '-'}
                        </TableCell>
                        <TableCell>
                          {session.completedAt ? format(session.completedAt.toDate(), 'dd MMM yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                            <AssessmentStatusBadge status={session.hrdDecision || session.status} />
                        </TableCell>
                        <TableCell className="text-right">
                            <Button asChild variant="outline" size="sm" disabled={session.status !== 'submitted'}>
                            <Link href={`/admin/hrd/assessments/result/${session.id}`}>View</Link>
                            </Button>
                        </TableCell>
                    </TableRow>
                    ))
                ) : (
                    <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                        No submissions match the current filters.
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
