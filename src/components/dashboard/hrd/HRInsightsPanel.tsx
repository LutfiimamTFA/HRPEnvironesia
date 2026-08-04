'use client';

import type { Kpi } from './HrdDashboardTypes';
import { Lightbulb, AlertTriangle, CheckCircle2, Info, Clock, Bell, TrendingUp, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HRInsightsPanelProps {
  kpis: Kpi[];
  pendingIzin?: any[] | null;
  pendingCuti?: any[] | null;
  pendingLembur?: any[] | null;
  pendingDinas?: any[] | null;
  totalActive: number;
  dataCompletenessPct?: number;
  shifTime?: string;
}

type InsightLevel = 'info' | 'success' | 'warning' | 'danger';

interface Insight {
  message: string;
  level: InsightLevel;
  icon: React.ReactNode;
}

const levelConfig: Record<InsightLevel, { container: string; icon: string }> = {
  info: {
    container: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',
    icon: 'text-blue-500 dark:text-blue-400',
  },
  success: {
    container: 'bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800',
    icon: 'text-teal-600 dark:text-teal-400',
  },
  warning: {
    container: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  danger: {
    container: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800',
    icon: 'text-red-600 dark:text-red-400',
  },
};

function getKpiValue(kpis: Kpi[], title: string): number {
  const kpi = kpis.find(k => k.title === title);
  return typeof kpi?.value === 'number' ? kpi.value : 0;
}

export function HRInsightsPanel({ kpis, pendingIzin, pendingCuti, pendingLembur, pendingDinas, totalActive, dataCompletenessPct, shifTime }: HRInsightsPanelProps) {
  const hadir = getKpiValue(kpis, 'Hadir Hari Ini');
  const terlambat = getKpiValue(kpis, 'Terlambat');
  const belumTapIn = getKpiValue(kpis, 'Belum Tap In');
  const belumTapOut = getKpiValue(kpis, 'Belum Tap Out');
  const anomali = getKpiValue(kpis, 'Anomali Absensi');

  const totalPendingIzin = pendingIzin?.length || 0;
  const totalPendingCuti = pendingCuti?.length || 0;
  const totalPendingLembur = pendingLembur?.length || 0;
  const totalPendingDinas = pendingDinas?.length || 0;
  const totalPending = totalPendingIzin + totalPendingCuti + totalPendingLembur + totalPendingDinas;

  const attendanceRate = totalActive > 0 ? Math.round((hadir / totalActive) * 100) : 0;

  const insights: Insight[] = [];

  // Attendance rate insight
  if (totalActive === 0) {
    insights.push({
      message: 'Belum ada data karyawan aktif untuk hari ini.',
      level: 'info',
      icon: <Info className="h-4 w-4" />,
    });
  } else if (hadir === 0) {
    insights.push({
      message: 'Belum ada data absensi hari ini.',
      level: 'info',
      icon: <Info className="h-4 w-4" />,
    });
  } else {
    insights.push({
      message: `Kehadiran ${attendanceRate}% (${hadir}/${totalActive} karyawan hadir hari ini).`,
      level: attendanceRate >= 90 ? 'success' : attendanceRate >= 70 ? 'warning' : 'danger',
      icon: attendanceRate >= 90
        ? <CheckCircle2 className="h-4 w-4" />
        : <AlertTriangle className="h-4 w-4" />,
    });
  }

  // Belum tap in
  if (belumTapIn > 0) {
    insights.push({
      message: `${belumTapIn} karyawan belum tap in.`,
      level: belumTapIn > 5 ? 'danger' : 'warning',
      icon: <AlertTriangle className="h-4 w-4" />,
    });
  }

  // Terlambat
  if (terlambat > 0) {
    const avgLate = Math.round(
      kpis
        .filter((k: Kpi) => k.title === 'Terlambat')
        .reduce((sum, k) => sum, 0) / Math.max(1, terlambat)
    );
    insights.push({
      message: `${terlambat} karyawan terlambat (rata-rata ${avgLate} menit).`,
      level: terlambat > 3 ? 'danger' : 'warning',
      icon: <Clock className="h-4 w-4" />,
    });
  } else if (hadir > 0 && belumTapIn === 0) {
    insights.push({
      message: 'Semua karyawan datang tepat waktu.',
      level: 'success',
      icon: <CheckCircle2 className="h-4 w-4" />,
    });
  }

  // Belum tap out
  if (belumTapOut > 0) {
    insights.push({
      message: `${belumTapOut} karyawan belum tap out (melebihi jam kerja).`,
      level: 'warning',
      icon: <Clock className="h-4 w-4" />,
    });
  }

  // Anomali
  if (anomali > 0) {
    insights.push({
      message: `${anomali} anomali absensi terdeteksi.`,
      level: 'danger',
      icon: <AlertTriangle className="h-4 w-4" />,
    });
  }

  // Data completeness
  if (dataCompletenessPct !== undefined) {
    insights.push({
      message: `Kelengkapan data karyawan: ${dataCompletenessPct}%.`,
      level: dataCompletenessPct >= 80 ? 'success' : dataCompletenessPct >= 50 ? 'warning' : 'danger',
      icon: dataCompletenessPct >= 80 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />,
    });
  }

  // Pending approvals
  if (totalPending > 0) {
    const parts = [
      totalPendingIzin > 0 && `${totalPendingIzin} izin`,
      totalPendingCuti > 0 && `${totalPendingCuti} cuti`,
      totalPendingLembur > 0 && `${totalPendingLembur} lembur`,
      totalPendingDinas > 0 && `${totalPendingDinas} dinas`,
    ].filter(Boolean).join(', ');
    insights.push({
      message: `${totalPending} pengajuan menunggu: ${parts}.`,
      level: 'warning',
      icon: <Bell className="h-4 w-4" />,
    });
  } else if (hadir > 0) {
    insights.push({
      message: 'Tidak ada pengajuan menunggu persetujuan.',
      level: 'success',
      icon: <CheckCircle2 className="h-4 w-4" />,
    });
  }

  // Keep max 6 insights
  const displayInsights = insights.slice(0, 6);

  if (displayInsights.length === 0) return null;

  return (
    <div className="rounded-xl border bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">AI Insights & Analytics</h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {displayInsights.map((insight, i) => {
          const cfg = levelConfig[insight.level];
          return (
            <div
              key={i}
              className={cn(
                'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm',
                cfg.container
              )}
            >
              <span className={cn('mt-0.5 shrink-0', cfg.icon)}>{insight.icon}</span>
              <span className="text-slate-700 dark:text-slate-200 leading-snug">{insight.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
