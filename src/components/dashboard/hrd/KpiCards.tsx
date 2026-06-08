'use client';

import { cn } from '@/lib/utils';
import { Link } from '@/navigation';
import type { Kpi } from './HrdDashboardTypes';

const colorMap = {
  teal: {
    bg: 'bg-teal-50 dark:bg-teal-950/30',
    border: 'border-teal-200 dark:border-teal-800',
    iconBg: 'bg-teal-100 dark:bg-teal-900/40',
    value: 'text-teal-700 dark:text-teal-300',
    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    value: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    iconBg: 'bg-red-100 dark:bg-red-900/40',
    value: 'text-red-700 dark:text-red-300',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    value: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  },
  slate: {
    bg: 'bg-white dark:bg-slate-950/40',
    border: 'border-slate-200 dark:border-slate-800',
    iconBg: 'bg-slate-100 dark:bg-slate-800/60',
    value: 'text-slate-800 dark:text-slate-100',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
};

function KpiCard({ kpi, onClick }: { kpi: Kpi; onClick?: () => void }) {
  const colors = colorMap[kpi.color || 'slate'];
  const isClickable = kpi.href || onClick;

  const inner = (
    <div
      className={cn(
        'relative flex flex-col gap-2 rounded-xl border p-4 transition-all duration-200',
        colors.bg,
        colors.border,
        isClickable && 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg text-lg shrink-0', colors.iconBg)}>
          {kpi.icon}
        </div>
        {kpi.percentage !== undefined && (
          <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', colors.badge)}>
            {kpi.percentage}%
          </span>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight">
          {kpi.title}
        </p>
        <p className={cn('text-2xl font-bold leading-none mt-0.5', colors.value)}>
          {kpi.value}
        </p>
        {kpi.description && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 leading-tight">
            {kpi.description}
          </p>
        )}
      </div>
    </div>
  );

  if (kpi.href) {
    return <Link href={kpi.href}>{inner}</Link>;
  }

  return inner;
}

export function KpiCards({ kpis, onCardClick }: { kpis: Kpi[]; onCardClick?: (title: string) => void }) {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-10">
      {kpis.map(kpi => (
        <KpiCard
          key={kpi.title}
          kpi={kpi}
          onClick={
            !kpi.href && onCardClick
              ? () => onCardClick(kpi.title)
              : undefined
          }
        />
      ))}
    </div>
  );
}

