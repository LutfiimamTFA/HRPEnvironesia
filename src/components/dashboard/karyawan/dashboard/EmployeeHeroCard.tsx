import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { EmploymentStageInfo } from "@/lib/employee-dashboard-stage";

type EmployeeHeroCardProps = {
  fullName: string;
  positionLabel: string;
  stage: EmploymentStageInfo;
  brandLabel: string;
  divisionLabel?: string;
  profileCompletionPercentage: number;
};

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function EmployeeHeroCard({
  fullName,
  positionLabel,
  stage,
  brandLabel,
  divisionLabel,
  profileCompletionPercentage,
}: EmployeeHeroCardProps) {
  const firstName = fullName.trim().split(/\s+/)[0] || fullName;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 p-6 sm:p-8 text-white shadow-xl dark:border-indigo-900/40">
      {/* Soft decorative glow — kept subtle so text stays the focus, not the background. */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-64 w-64 rounded-full bg-violet-400/10 blur-3xl" />

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-3">
          <p className="text-[11px] font-black uppercase tracking-widest text-indigo-100/80">
            Portal Karyawan
          </p>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Halo, {firstName}!</h1>
          <p className="max-w-xl text-sm leading-relaxed text-indigo-50/90">
            Selamat datang di portal karyawan. Di sini Anda dapat memantau status kepegawaian,
            absensi, cuti, izin, lembur, dan pembaruan data diri.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge className="rounded-lg border-none bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/25">
              {positionLabel}
            </Badge>
            <Badge className="rounded-lg border-none bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/25">
              {stage.label}
            </Badge>
            <Badge className="rounded-lg border-none bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/25">
              {brandLabel}
            </Badge>
            {divisionLabel && (
              <Badge className="rounded-lg border-none bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/25">
                {divisionLabel}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-3 sm:items-end">
          <Avatar className="h-16 w-16 border-2 border-white/30 shadow-lg">
            <AvatarFallback className="bg-white/15 text-lg font-black text-white backdrop-blur-md">
              {getInitials(fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="w-40 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-50/90">
              <span>Profil</span>
              <span>{profileCompletionPercentage}% lengkap</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all"
                style={{ width: `${Math.max(0, Math.min(100, profileCompletionPercentage))}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
