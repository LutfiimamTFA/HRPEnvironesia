'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import type { AttendanceRecord } from './HrdDashboardTypes';
import { Info } from 'lucide-react';

interface AttendanceOverviewChartProps {
  records: AttendanceRecord[];
}

export function AttendanceOverviewChart({ records }: AttendanceOverviewChartProps) {
  const chartData = useMemo(() => {
    const statusMap: Record<string, number> = {
      'Hadir': 0,
      'Belum Tap In': 0,
      'Belum Tap Out': 0,
      'Terlambat': 0,
      'Izin/Cuti': 0,
    };

    records.forEach(record => {
      if (record.flags.includes('late')) {
        statusMap['Terlambat']++;
      } else if (record.status === 'Belum Tap In') {
        statusMap['Belum Tap In']++;
      } else if (record.status === 'Belum Tap Out') {
        statusMap['Belum Tap Out']++;
      } else if (record.status === 'Cuti/Izin') {
        statusMap['Izin/Cuti']++;
      } else if (['Sedang Bekerja', 'Selesai'].includes(record.status)) {
        statusMap['Hadir']++;
      }
    });

    return Object.entries(statusMap)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [records]);

  const colors = ['#14b8a6', '#ef4444', '#f59e0b', '#f97316', '#3b82f6'];

  if (chartData.length === 0) {
    return (
      <Card className="bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-800 dark:text-slate-100">Status Kehadiran Hari Ini</CardTitle>
          <CardDescription className="text-slate-500 dark:text-slate-400">
            Distribusi status kehadiran karyawan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-center text-sm p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <Info className="h-5 w-5 mb-2" />
            <span>Belum ada data kehadiran untuk ditampilkan.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800">
      <CardHeader>
        <CardTitle className="text-slate-800 dark:text-slate-100">Status Kehadiran Hari Ini</CardTitle>
        <CardDescription className="text-slate-500 dark:text-slate-400">
          Distribusi status kehadiran {records.length} karyawan
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{}} className="h-64 w-full">
          <ResponsiveContainer width="100%" height={256}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => value}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '0.5rem',
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
