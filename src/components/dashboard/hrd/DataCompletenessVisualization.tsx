'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Progress } from '@/components/ui/progress';
import { Link } from '@/navigation';
import { cn } from '@/lib/utils';
import type { UserProfile } from '@/lib/types';

interface DataCompletenessVisualizationProps {
  profiles?: any[] | null;
  users?: UserProfile[] | null;
}

interface FieldCheck {
  label: string;
  check: (profile: any) => boolean;
}

const fieldChecks: FieldCheck[] = [
  {
    label: 'Foto Profil',
    check: p => !!(p?.photoUrl || p?.photo),
  },
  {
    label: 'Kontak',
    check: p => !!(p?.phone || p?.phoneNumber),
  },
  {
    label: 'Alamat',
    check: p => !!(p?.address || p?.alamat),
  },
  {
    label: 'Pendidikan',
    check: p => !!(p?.education || (Array.isArray(p?.pendidikan) && p.pendidikan.length > 0)),
  },
  {
    label: 'Data Rekening',
    check: p => !!(p?.bankAccount || p?.rekening),
  },
  {
    label: 'BPJS/NPWP',
    check: p => !!(p?.bpjsNumber || p?.npwp),
  },
  {
    label: 'Data Keluarga',
    check: p => !!(
      (Array.isArray(p?.familyMembers) && p.familyMembers.length > 0) ||
      (Array.isArray(p?.keluarga) && p.keluarga.length > 0)
    ),
  },
];

function getProgressColor(pct: number): string {
  if (pct >= 80) return 'hsl(var(--chart-1))'; // teal
  if (pct >= 40) return 'hsl(var(--chart-2))'; // amber
  return 'hsl(var(--chart-3))'; // red
}

function getStatusColor(pct: number): string {
  if (pct >= 80) return 'text-teal-600 dark:text-teal-400';
  if (pct >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export function DataCompletenessVisualization({ profiles, users }: DataCompletenessVisualizationProps) {
  const stats = useMemo(() => {
    const allProfiles = profiles || [];
    const total = allProfiles.length;

    if (total === 0) return null;

    return fieldChecks.map(field => {
      const filled = allProfiles.filter(p => field.check(p)).length;
      const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
      return { label: field.label, filled, total, pct };
    });
  }, [profiles]);

  const overallPct = useMemo(() => {
    if (!stats) return 0;
    const sum = stats.reduce((acc, s) => acc + s.pct, 0);
    return Math.round(sum / stats.length);
  }, [stats]);

  const profileCount = profiles?.length || 0;

  const chartData = stats?.map(stat => ({
    name: stat.label,
    pct: stat.pct,
    filled: stat.filled,
    total: stat.total,
  })) || [];

  if (!stats || profileCount === 0) {
    return (
      <Card className="bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-800 dark:text-slate-100">Kelengkapan Data Karyawan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
            Belum ada data profil karyawan.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-slate-800 dark:text-slate-100">Kelengkapan Data Karyawan</CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Berdasarkan {profileCount} profil terdaftar
            </p>
          </div>
          <div className="text-right">
            <div className={cn('text-3xl font-bold', getStatusColor(overallPct))}>
              {overallPct}%
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">kelengkapan rata-rata</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Donut Chart */}
        <div className="h-64">
          <ChartContainer config={{}} className="w-full h-full">
            <ResponsiveContainer width="100%" height={256}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 100, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis type="number" domain={[0, 100]} stroke="hsl(var(--foreground))" className="text-xs text-slate-500 dark:text-slate-400" />
                <YAxis
                  dataKey="name"
                  type="category"
                  stroke="hsl(var(--foreground))"
                  width={100}
                  className="text-xs text-slate-500 dark:text-slate-400"
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'pct') return `${value}%`;
                    return value;
                  }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem',
                  }}
                />
                <Bar dataKey="pct" fill={getProgressColor(overallPct)}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getProgressColor(entry.pct)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>

        {/* Field Detail Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {stats.map(stat => (
            <Link
              key={stat.label}
              href="/admin/hrd/employee-data/karyawan"
              className="group block"
            >
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition-all duration-150 bg-slate-50/50 dark:bg-slate-900/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300 group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors">
                    {stat.label}
                  </span>
                  <span className={cn('text-xs font-bold', getStatusColor(stat.pct))}>
                    {stat.pct}%
                  </span>
                </div>
                <Progress
                  value={stat.pct}
                  className="h-1.5 bg-slate-200 dark:bg-slate-700"
                />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                  {stat.filled} / {stat.total} karyawan
                </p>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
