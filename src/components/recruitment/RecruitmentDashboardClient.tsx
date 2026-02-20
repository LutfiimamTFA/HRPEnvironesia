'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlusCircle, Upload } from 'lucide-react';
import { GlobalFilterBar } from './GlobalFilterBar';
import { mockApplications, mockJobs, mockRecruiters } from '@/lib/recruitment/mock';
import { calculateKpis } from '@/lib/recruitment/metrics';
import { KpiCard } from './KpiCard';
import { CommandCenter } from './CommandCenter';
import { AnalyticsCharts } from './AnalyticsCharts';
import { CandidatesTable } from './CandidatesTable';

export function RecruitmentDashboardClient() {
    const [view, setView] = useState('overview');
    // TODO: Implement filter state management
    const filters = { dateRange: {} }; 
    const kpis = calculateKpis(mockApplications, filters);

    return (
        <Tabs value={view} onValueChange={setView} className="w-full">
            {/* Sticky Header */}
            <div className="sticky top-16 z-20 bg-background/95 backdrop-blur-sm -mx-6 px-6 -mt-6 py-4 border-b">
                 <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold tracking-tight">Recruitment Overview</h1>
                    <div className="flex items-center gap-2">
                        <Button variant="outline"><Upload className="mr-2" /> Export</Button>
                        <Button><PlusCircle className="mr-2" /> Create Job</Button>
                    </div>
                </div>
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
                    <TabsTrigger value="candidates">Candidates</TabsTrigger>
                    <TabsTrigger value="analytics">Analytics</TabsTrigger>
                </TabsList>
            </div>
            
            <div className="space-y-6 mt-6">
                <GlobalFilterBar />

                <TabsContent value="overview" className="mt-0 space-y-6">
                    {/* KPI Cards */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        <KpiCard title="New Applicants" value={kpis.newApplicants} delta="+10.5%" />
                        <KpiCard title="Active Candidates" value={kpis.activeCandidates} />
                        <KpiCard title="In Screening" value={kpis.inScreening} />
                        <KpiCard title="Interviews Today" value={kpis.interviewsToday} />
                        <KpiCard title="Assessment Pending" value={kpis.assessmentPending} />
                        <KpiCard title="Offers Pending" value={kpis.offersPending} />
                        <KpiCard title="Offer Acceptance Rate" value={`${kpis.offerAcceptanceRate.toFixed(1)}%`} delta="-2.1%" />
                        <KpiCard title="Avg. Time to Hire" value={`${kpis.avgTimeToHire} days`} />
                        <KpiCard title="Overdue Tasks" value={kpis.overdueCandidates} deltaType="inverse" delta="+3" />
                        <KpiCard title="Interviews Today" value={kpis.interviewsToday} />
                        <KpiCard title="Time to 1st Response" value={`${kpis.avgTimeToFirstResponse}d`} />
                    </div>
                    <CommandCenter applications={mockApplications} />
                </TabsContent>

                 <TabsContent value="pipeline" className="mt-0">
                    <p>Kanban board will be here.</p>
                    {/* <CandidatesPipeline /> */}
                </TabsContent>

                 <TabsContent value="candidates" className="mt-0">
                    <CandidatesTable applications={mockApplications} />
                </TabsContent>

                <TabsContent value="analytics" className="mt-0">
                    <AnalyticsCharts applications={mockApplications} filters={filters} />
                </TabsContent>
            </div>
        </Tabs>
    );
}
