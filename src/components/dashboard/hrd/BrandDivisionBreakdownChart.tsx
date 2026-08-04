'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import type { AttendanceRecord } from './HrdDashboardTypes';
import { Info } from 'lucide-react';

interface BrandDivisionBreakdownChartProps {
  records: AttendanceRecord[];
}

interface BrandData {
  name: string;
  hadir: number;
  belumTapIn: number;
  terlambat: number;
  izinCuti: number;
}

export function BrandDivisionBreakdownChart({ records }: BrandDivisionBreakdownChartProps) {
  const chartData = useMemo(() => {
    const brandMap = new Map<string, BrandData>();

    records.forEach(record => {
      const brandName = record.brandName || '-';

      if (!brandMap.has(brandName)) {
        brandMap.set(brandName, {
          name: brandName,
          hadir: 0,
          belumTapIn: 0,
          terlambat: 0,
          izinCuti: 0,
        });
      }

      const data = brandMap.get(brandName)!;

      if (record.status === 'Belum Tap In') {
        data.belumTapIn++;
      } else if (record.status === 'Cuti/Izin') {
        data.izinCuti++;
      } else if (record.flags.includes('late')) {
        data.terlambat++;
      } else if (['Sedang Bekerja', 'Selesai'].includes(record.status)) {
        data.hadir++;
      }
    });

    return Array.from(brandMap.values()).sort((a, b) =>
      (b.hadir + b.belumTapIn + b.terlambat + b.izinCuti) -
      (a.hadir + a.belumTapIn + a.terlambat + a.izinCuti)
    );
  }, [records]);

  if (chartData.length === 0) {
    return (
      <Card className="bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-800 dark:text-slate-100">Breakdown per Brand/Divisi</CardTitle>
          <CardDescription className="text-slate-500 dark:text-slate-400">
            Distribusi status kehadiran per brand atau divisi
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-center text-sm p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <Info className="h-5 w-5 mb-2" />
            <span>Belum ada data brand/divisi untuk ditampilkan.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const colors = {
    hadir: '#14b8a6',
    belumTapIn: '#ef4444',
    terlambat: '#f97316',
    izinCuti: '#3b82f6',
  };

  return (
    <Card className="bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800">
      <CardHeader>
        <CardTitle className="text-slate-800 dark:text-slate-100">Breakdown per Brand/Divisi</CardTitle>
        <CardDescription className="text-slate-500 dark:text-slate-400">
          Distribusi status kehadiran per brand atau divisi
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{}} className="h-80 w-full">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 200, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--foreground))" className="text-slate-500 dark:text-slate-400" />
              <YAxis
                dataKey="name"
                type="category"
                stroke="hsl(var(--foreground))"
                className="text-slate-500 dark:text-slate-400 text-xs"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '0.5rem',
                }}
              />
              <Legend />
              <Bar dataKey="hadir" stackId="a" fill={colors.hadir} name="Hadir" />
              <Bar dataKey="belumTapIn" stackId="a" fill={colors.belumTapIn} name="Belum Tap In" />
              <Bar dataKey="terlambat" stackId="a" fill={colors.terlambat} name="Terlambat" />
              <Bar dataKey="izinCuti" stackId="a" fill={colors.izinCuti} name="Izin/Cuti" />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
