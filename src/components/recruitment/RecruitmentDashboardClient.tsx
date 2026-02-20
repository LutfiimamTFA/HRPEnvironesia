'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlusCircle, Upload, LayoutGrid, List } from 'lucide-react';
import { GlobalFilterBar } from './GlobalFilterBar';
import { calculateKpis } from '@/lib/recruitment/metrics';
import { KpiCard } from './KpiCard';
import { CommandCenter } from './CommandCenter';
import { AnalyticsCharts } from './AnalyticsCharts';
import { CandidatesTable } from './CandidatesTable';
import { CandidatesKanban } from './CandidatesKanban';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { JobApplication, Job, UserProfile, Brand } from '@/lib/types';
import { Skeleton } from '../ui/skeleton';

export type FilterState = {
  dateRange: { from?: Date | null; to?: Date | null };
  jobIds: string[];
  recruiterIds: string[];
  stages: string[];
  brandId?: string;
};


function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-12 w-full" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-96 w-full" />
        </div>
    )
}

export function RecruitmentDashboardClient() {
    const firestore = useFirestore();
    const [view, setView] = useState('overview');
    const [candidateViewMode, setCandidateViewMode] = useState<'table' | 'kanban'>('table');
    
    // Data Fetching
    const { data: applications, isLoading: isLoadingApps } = useCollection<JobApplication>(
        useMemoFirebase(() => collection(firestore, 'applications'), [firestore])
    );
    const { data: jobs, isLoading: isLoadingJobs } = useCollection<Job>(
        useMemoFirebase(() => collection(firestore, 'jobs'), [firestore])
    );
    const { data: recruiters, isLoading: isLoadingRecruiters } = useCollection<UserProfile>(
        useMemoFirebase(() => query(collection(firestore, 'users'), where('role', 'in', ['hrd', 'super-admin'])), [firestore])
    );
    const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
        useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
    );

    const [filters, setFilters] = useState<FilterState>({
        dateRange: { from: null, to: null },
        jobIds: [],
        recruiterIds: [],
        stages: [],
        brandId: undefined,
    });

    const isLoading = isLoadingApps || isLoadingJobs || isLoadingRecruiters || isLoadingBrands;
    const isKanbanDisabled = filters.jobIds.length !== 1;

    useEffect(() => {
        // If filters change and Kanban is no longer valid, switch back to table view
        if (isKanbanDisabled && candidateViewMode === 'kanban') {
            setCandidateViewMode('table');
        }
    }, [isKanbanDisabled, candidateViewMode]);


    const filteredApplications = useMemo(() => {
        if (!applications) return [];
        return applications.filter(app => {
            const appliedDate = app.submittedAt?.toDate();
            if (filters.dateRange.from && appliedDate && appliedDate < filters.dateRange.from) return false;
            if (filters.dateRange.to && appliedDate && appliedDate > filters.dateRange.to) return false;
            if (filters.jobIds.length > 0 && !filters.jobIds.includes(app.jobId)) return false;
            if (filters.stages.length > 0 && !filters.stages.includes(app.status)) return false;
            if (filters.brandId && app.brandId !== filters.brandId) return false;
            // TODO: Implement recruiter filter once assignedRecruiterId is consistently populated
            return true;
        });
    }, [applications, filters]);

    const kpis = useMemo(() => {
        if (!filteredApplications) return null;
        return calculateKpis(filteredApplications, filters);
    }, [filteredApplications, filters]);


    if (isLoading) {
        return <DashboardSkeleton />;
    }

    return (
        <Tabs value={view} onValueChange={setView} className="w-full">
            <div className="sticky top-16 z-20 bg-background/95 backdrop-blur-sm -mx-6 px-6 -mt-6 py-4 border-b">
                 <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold tracking-tight">Recruitment Dashboard</h1>
                    <div className="flex items-center gap-2">
                        <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Export</Button>
                        {/* The Create Job button is more suited for the Job Postings page */}
                    </div>
                </div>
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="candidates">Candidates</TabsTrigger>
                    <TabsTrigger value="analytics">Analytics</TabsTrigger>
                </TabsList>
            </div>
            
            <div className="space-y-6 mt-6">
                <GlobalFilterBar
                    jobs={jobs || []}
                    recruiters={recruiters || []}
                    brands={brands || []}
                    filters={filters}
                    setFilters={setFilters}
                />

                <TabsContent value="overview" className="mt-0 space-y-6">
                    {kpis && (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                            <KpiCard title="New Applicants" value={kpis.newApplicants} />
                            <KpiCard title="Active Candidates" value={kpis.activeCandidates} />
                            <KpiCard title="In Verification" value={kpis.inScreening} />
                            <KpiCard title="Assessment Pending" value={kpis.assessmentPending} />
                            <KpiCard title="Avg. Time to Hire" value={`${kpis.avgTimeToHire} days`} />
                            {/* Placeholder KPIs for fields not yet in data model */}
                            <KpiCard title="Interviews Today" value={kpis.interviewsToday} />
                            <KpiCard title="Offers Pending" value={kpis.offersPending} />
                            <KpiCard title="Offer Acceptance Rate" value={`${kpis.offerAcceptanceRate.toFixed(1)}%`} />
                            <KpiCard title="Overdue Tasks" value={kpis.overdueCandidates} deltaType="inverse" />
                            <KpiCard title="Time to 1st Response" value={`${kpis.avgTimeToFirstResponse}d`} />
                        </div>
                    )}
                    <CommandCenter applications={filteredApplications} />
                </TabsContent>

                 <TabsContent value="candidates" className="mt-0">
                    <div className="flex justify-end items-center mb-4 gap-2">
                        <Button
                            variant={candidateViewMode === 'table' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setCandidateViewMode('table')}
                        >
                            <List className="mr-2 h-4 w-4" />
                            Table
                        </Button>
                        <Button
                            variant={candidateViewMode === 'kanban' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setCandidateViewMode('kanban')}
                            disabled={isKanbanDisabled}
                            title={isKanbanDisabled ? "Select a single job to enable Kanban view" : "Switch to Kanban view"}
                        >
                            <LayoutGrid className="mr-2 h-4 w-4" />
                            Kanban
                        </Button>
                    </div>
                    {candidateViewMode === 'table' ? (
                        <CandidatesTable applications={filteredApplications} />
                    ) : (
                        <CandidatesKanban applications={filteredApplications} />
                    )}
                </TabsContent>

                <TabsContent value="analytics" className="mt-0">
                    <AnalyticsCharts applications={filteredApplications} filters={filters} />
                </TabsContent>
            </div>
        </Tabs>
    );
}
