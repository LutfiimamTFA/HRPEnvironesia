'use client';

import { useMemo } from 'react';
import { Progress } from '@/components/ui/progress';
import { Link } from '@/navigation';
import { cn } from '@/lib/utils';
import type { UserProfile } from '@/lib/types';

interface DataCompletenessPanelProps {
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
  if (pct >= 80) return 'bg-teal-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

export function DataCompletenessPanel({ profiles, users }: DataCompletenessPanelProps) {
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

  if (!stats || profileCount === 0) {
    return (
      <div className="rounded-xl border bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 p-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
          Kelengkapan Data Karyawan
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
          Belum ada data profil karyawan.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Kelengkapan Data Karyawan
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Berdasarkan {profileCount} profil terdaftar
          </p>
        </div>
        <div className="text-right">
          <span className={cn(
            'text-2xl font-bold',
            overallPct >= 80 ? 'text-teal-600 dark:text-teal-400' :
              overallPct >= 50 ? 'text-amber-600 dark:text-amber-400' :
                'text-red-600 dark:text-red-400'
          )}>
            {overallPct}%
          </span>
          <p className="text-xs text-slate-500 dark:text-slate-400">rata-rata</p>
        </div>
      </div>

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
                <span className={cn(
                  'text-xs font-bold',
                  stat.pct >= 80 ? 'text-teal-600 dark:text-teal-400' :
                    stat.pct >= 50 ? 'text-amber-600 dark:text-amber-400' :
                      'text-red-600 dark:text-red-400'
                )}>
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
    </div>
  );
}
