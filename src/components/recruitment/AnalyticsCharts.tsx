'use client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getFunnelData, getApplicantsTrend, getSourcePerformance, getJobPerformance } from '@/lib/recruitment/metrics';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { ChartContainer, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { JobApplication, Job } from '@/lib/types';
import type { FilterState } from './RecruitmentDashboardClient';
import { Info, TrendingUp } from 'lucide-react';
import Link from 'next/link';

const chartConfig = {
  applicants: { label: 'Applicants', color: 'hsl(var(--chart-1))' },
  submitted: { label: 'Submitted', color: 'hsl(var(--chart-1))' },
  screening: { label: 'Screening', color: 'hsl(var(--chart-2))' },
  assessment: { label: 'Assessment', color: 'hsl(var(--chart-3))'},
  interview: { label: 'Interview', color: 'hsl(var(--chart-3))' },
  offer: { label: 'Offer', color: 'hsl(var(--chart-4))'},
  hired: { label: 'Hired', color: 'hsl(var(--chart-5))' },
} satisfies ChartConfig;

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function AnalyticsCharts({ applications, filters, jobs }: { applications: JobApplication[], filters: FilterState, jobs?: Job[] }) {
  const funnelData = getFunnelData(applications);
  const trendData = getApplicantsTrend(applications, filters);
  const sourceData = getSourcePerformance(applications);
  const jobPerformance = getJobPerformance(applications, jobs);

  const renderPlaceholder = (title: string) => (
     <Card>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent>
            <div className="h-48 flex items-center justify-center text-muted-foreground text-center text-sm p-4">
                <Info className="h-5 w-5 mb-2" />
                Data for this chart is not yet available in the current data model.
            </div>
        </CardContent>
    </Card>
  )

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Recruitment Funnel</CardTitle>
          <CardDescription>Number of candidates at each stage.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="flex items-end justify-center gap-1 text-center h-48 overflow-x-auto p-4">
            {funnelData.length > 0 ? funnelData.map((stage, i) => (
                <div key={stage.stage} className="flex flex-col items-center w-32 flex-shrink-0">
                    <p className="text-xs font-medium">{stage.stage}</p>
                    <p className="text-xl font-bold">{stage.count}</p>
                    <div className="w-full rounded-t-md mt-1" style={{ height: `${Math.max(5, (stage.count / funnelData[0].count) * 100)}%`, backgroundColor: COLORS[i % COLORS.length]}} />
                </div>
            )) : (
                 <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">No data for funnel.</div>
            )}
            </div>
        </CardContent>
      </Card>
      
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Applicant Trend</CardTitle>
          <CardDescription>Daily new applicants in the selected period.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <AreaChart data={trendData}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="applicants" stroke="var(--color-applicants)" fill="var(--color-applicants)" fillOpacity={0.3} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Source Performance</CardTitle>
        </CardHeader>
        <CardContent>
            {sourceData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[250px] w-full">
                    <PieChart>
                    <Pie data={sourceData} dataKey="applicants" nameKey="source" cx="50%" cy="50%" outerRadius={80} label>
                        {sourceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip content={<ChartTooltipContent />} />
                    <Legend />
                    </PieChart>
                </ChartContainer>
            ) : (
                 <div className="h-full flex items-center justify-center text-muted-foreground text-center text-sm p-4">
                    <Info className="h-5 w-5 mb-2" />
                    Data 'source' tidak tersedia di model data aplikasi.
                </div>
            )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Stage Distribution</CardTitle>
          <CardDescription>Jumlah kandidat di setiap tahap</CardDescription>
        </CardHeader>
        <CardContent>
          {funnelData.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <BarChart data={funnelData} layout="vertical">
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis dataKey="stage" type="category" tickLine={false} axisLine={false} width={100} />
                <Tooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              Tidak ada data untuk ditampilkan
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-teal-600" />
            Job Performance
          </CardTitle>
          <CardDescription>Performa lowongan berdasarkan jumlah pelamar dan hiring</CardDescription>
        </CardHeader>
        <CardContent>
          {jobPerformance.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Posisi</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Pelamar</TableHead>
                    <TableHead>Aktif</TableHead>
                    <TableHead>Interview</TableHead>
                    <TableHead>Offering</TableHead>
                    <TableHead>Hired</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobPerformance.map(job => (
                    <TableRow key={job.jobId}>
                      <TableCell className="font-medium">
                        <Link href={`/admin/recruitment?jobId=${job.jobId}`} className="text-teal-600 dark:text-teal-400 hover:underline">
                          {job.position}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{job.brand}</TableCell>
                      <TableCell className="text-center font-semibold">{job.totalApplicants}</TableCell>
                      <TableCell className="text-center">{job.activeApplicants}</TableCell>
                      <TableCell className="text-center">{job.interviewed}</TableCell>
                      <TableCell className="text-center">{job.offered}</TableCell>
                      <TableCell className="text-center font-semibold text-green-600 dark:text-green-400">{job.hired}</TableCell>
                      <TableCell className="text-center">{job.conversionRate.toFixed(1)}%</TableCell>
                      <TableCell>
                        <Badge variant={job.status === 'published' ? 'default' : 'secondary'} className="capitalize text-xs">
                          {job.status === 'published' ? 'Aktif' : 'Draft'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-center">
              <p>Tidak ada data lowongan untuk ditampilkan</p>
            </div>
          )}
        </CardContent>
      </Card>

      {renderPlaceholder("Time-to-Stage Trend")}
      {renderPlaceholder("Recruiter Workload")}
      {renderPlaceholder("Bottleneck Analysis")}
    </div>
  );
}
