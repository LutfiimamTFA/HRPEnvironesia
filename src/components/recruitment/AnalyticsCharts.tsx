'use client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getFunnelData, getApplicantsTrend, getSourcePerformance } from '@/lib/recruitment/metrics';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';

const chartConfig = {
  applicants: { label: 'Applicants', color: 'hsl(var(--chart-1))' },
  screening: { label: 'Screening', color: 'hsl(var(--chart-2))' },
  interview: { label: 'Interview', color: 'hsl(var(--chart-3))' },
  hired: { label: 'Hired', color: 'hsl(var(--chart-4))' },
};

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function AnalyticsCharts({ applications, filters }: { applications: any[], filters: any }) {
  const funnelData = getFunnelData(applications);
  const trendData = getApplicantsTrend(applications, filters);
  const sourceData = getSourcePerformance(applications);

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Recruitment Funnel</CardTitle>
        </CardHeader>
        <CardContent>
            {/* Custom Funnel Visualization */}
            <div className="flex items-end justify-center gap-1 text-center h-48">
            {funnelData.map((stage, i) => (
                <div key={stage.stage} className="flex flex-col items-center w-32">
                <p className="text-xs font-medium">{stage.stage}</p>
                <p className="text-xl font-bold">{stage.count}</p>
                <div className="bg-primary/20 w-full rounded-t-md mt-1" style={{ height: `${stage.rate}%`}} />
                {i < funnelData.length -1 && <p className="text-xs text-muted-foreground mt-1">{funnelData[i+1].rate.toFixed(1)}%</p>}
                </div>
            ))}
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
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis />
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
        </CardContent>
      </Card>

      {/* Add other 5 charts here as placeholders */}
      <Card><CardHeader><CardTitle>Stage Distribution</CardTitle></CardHeader><CardContent><div className="h-48 flex items-center justify-center text-muted-foreground">Chart Placeholder</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Time-to-Stage Trend</CardTitle></CardHeader><CardContent><div className="h-48 flex items-center justify-center text-muted-foreground">Chart Placeholder</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Job Performance</CardTitle></CardHeader><CardContent><div className="h-48 flex items-center justify-center text-muted-foreground">Chart Placeholder</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Recruiter Workload</CardTitle></CardHeader><CardContent><div className="h-48 flex items-center justify-center text-muted-foreground">Chart Placeholder</div></CardContent></Card>
      <Card className="lg:col-span-3"><CardHeader><CardTitle>Bottleneck Analysis</CardTitle></CardHeader><CardContent><div className="h-48 flex items-center justify-center text-muted-foreground">Chart Placeholder</div></CardContent></Card>
    </div>
  );
}
