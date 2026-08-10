import type { LucideIcon } from "lucide-react";
import { Briefcase, CalendarClock, CalendarCheck2, CalendarOff, ListChecks, UserCheck2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { EmploymentStageInfo } from "@/lib/employee-dashboard-stage";

type SummaryTone = "indigo" | "emerald" | "amber" | "slate" | "rose";

const TONE_CLASSES: Record<SummaryTone, { bg: string; icon: string }> = {
  indigo: { bg: "bg-indigo-50 dark:bg-indigo-950/30", icon: "text-indigo-600 dark:text-indigo-400" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: "text-emerald-600 dark:text-emerald-400" },
  amber: { bg: "bg-amber-50 dark:bg-amber-950/30", icon: "text-amber-600 dark:text-amber-400" },
  slate: { bg: "bg-slate-100 dark:bg-slate-900/60", icon: "text-slate-500 dark:text-slate-400" },
  rose: { bg: "bg-rose-50 dark:bg-rose-950/30", icon: "text-rose-600 dark:text-rose-400" },
};

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "indigo",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: SummaryTone;
}) {
  const toneClasses = TONE_CLASSES[tone];
  return (
    <Card className="border-slate-100 dark:border-slate-800 shadow-sm">
      <CardContent className="flex items-start gap-3 pt-5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClasses.bg}`}>
          <Icon className={`h-5 w-5 ${toneClasses.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-1 truncate text-lg font-black text-slate-900 dark:text-white">{value}</p>
          {hint && <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export type EmployeeSummaryCardsProps = {
  stage: EmploymentStageInfo;
  tenureValue: string;
  tenureHint?: string;
  attendanceValue: string;
  attendanceHint?: string;
  leaveBalanceValue: string;
  leaveBalanceHint?: string;
  activeSubmissionsCount: number;
  completenessLabel: string;
  completenessTone: SummaryTone;
};

export function EmployeeSummaryCards({
  stage,
  tenureValue,
  tenureHint,
  attendanceValue,
  attendanceHint,
  leaveBalanceValue,
  leaveBalanceHint,
  activeSubmissionsCount,
  completenessLabel,
  completenessTone,
}: EmployeeSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <SummaryCard icon={Briefcase} label="Status Kepegawaian" value={stage.label} tone="indigo" />
      <SummaryCard icon={CalendarClock} label="Masa Kerja" value={tenureValue} hint={tenureHint} tone="slate" />
      <SummaryCard
        icon={UserCheck2}
        label="Kehadiran Bulan Ini"
        value={attendanceValue}
        hint={attendanceHint}
        tone="emerald"
      />
      <SummaryCard
        icon={CalendarOff}
        label="Sisa Cuti"
        value={leaveBalanceValue}
        hint={leaveBalanceHint}
        tone={leaveBalanceValue === "Belum tersedia" ? "slate" : "indigo"}
      />
      <SummaryCard
        icon={ListChecks}
        label="Pengajuan Aktif"
        value={String(activeSubmissionsCount)}
        hint={activeSubmissionsCount > 0 ? "Menunggu proses" : "Tidak ada yang diproses"}
        tone={activeSubmissionsCount > 0 ? "amber" : "slate"}
      />
      <SummaryCard icon={CalendarCheck2} label="Kelengkapan Data" value={completenessLabel} tone={completenessTone} />
    </div>
  );
}
