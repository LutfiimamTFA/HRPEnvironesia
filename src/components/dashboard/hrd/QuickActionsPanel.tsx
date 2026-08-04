'use client';

import { Link } from '@/navigation';
import { cn } from '@/lib/utils';

interface QuickAction {
  icon: string;
  label: string;
  href: string;
  color: string;
  hoverBg: string;
}

const actions: QuickAction[] = [
  {
    icon: '📋',
    label: 'Kelola Izin',
    href: '/admin/hrd/persetujuan-izin',
    color: 'text-blue-600 dark:text-blue-400',
    hoverBg: 'hover:bg-blue-50 dark:hover:bg-blue-950/30',
  },
  {
    icon: '🏖️',
    label: 'Kelola Cuti',
    href: '/admin/hrd/persetujuan-cuti',
    color: 'text-purple-600 dark:text-purple-400',
    hoverBg: 'hover:bg-purple-50 dark:hover:bg-purple-950/30',
  },
  {
    icon: '⏰',
    label: 'Kelola Lembur',
    href: '/admin/hrd/persetujuan-lembur',
    color: 'text-amber-600 dark:text-amber-400',
    hoverBg: 'hover:bg-amber-50 dark:hover:bg-amber-950/30',
  },
  {
    icon: '✈️',
    label: 'Kelola Dinas',
    href: '/admin/hrd/monitoring/dinas',
    color: 'text-sky-600 dark:text-sky-400',
    hoverBg: 'hover:bg-sky-50 dark:hover:bg-sky-950/30',
  },
  {
    icon: '👥',
    label: 'Direktori Karyawan',
    href: '/admin/hrd/employee-data/karyawan',
    color: 'text-slate-600 dark:text-slate-400',
    hoverBg: 'hover:bg-slate-100 dark:hover:bg-slate-800/60',
  },
  {
    icon: '📊',
    label: 'Monitoring Absen',
    href: '/admin/hrd/monitoring/absen',
    color: 'text-teal-600 dark:text-teal-400',
    hoverBg: 'hover:bg-teal-50 dark:hover:bg-teal-950/30',
  },
  {
    icon: '💰',
    label: 'Rekap Payroll',
    href: '/admin/overtime-payroll-recap',
    color: 'text-green-600 dark:text-green-400',
    hoverBg: 'hover:bg-green-50 dark:hover:bg-green-950/30',
  },
  {
    icon: '🎓',
    label: 'Pelatihan',
    href: '/admin/hrd/monitoring/pelatihan',
    color: 'text-orange-600 dark:text-orange-400',
    hoverBg: 'hover:bg-orange-50 dark:hover:bg-orange-950/30',
  },
];

export function QuickActionsPanel() {
  return (
    <div className="rounded-xl border bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 p-4">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
        Aksi Cepat
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {actions.map(action => (
          <Link
            key={action.href}
            href={action.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700',
              'py-3 px-2 text-center transition-all duration-150',
              action.hoverBg,
              'hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm'
            )}
          >
            <span className="text-2xl leading-none">{action.icon}</span>
            <span className={cn('text-xs font-medium leading-tight', action.color)}>
              {action.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
