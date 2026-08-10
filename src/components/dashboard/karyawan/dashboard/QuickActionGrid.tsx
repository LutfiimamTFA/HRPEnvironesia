import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  CalendarOff,
  FileText,
  Clock3,
  Users,
  UserCog,
  Fingerprint,
  Receipt,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type QuickAction = {
  key: string;
  icon: LucideIcon;
  label: string;
  href?: string;
  disabledReason?: string;
};

function ActionTile({ icon: Icon, label, href, disabledReason }: Omit<QuickAction, "key">) {
  const isDisabled = !href || !!disabledReason;
  const body = (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-colors",
        isDisabled
          ? "cursor-not-allowed border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40"
          : "border-slate-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-900/50 dark:hover:bg-indigo-950/20",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl",
          isDisabled
            ? "bg-slate-100 text-slate-400 dark:bg-slate-800"
            : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span
        className={cn(
          "text-xs font-bold leading-tight",
          isDisabled ? "text-slate-400" : "text-slate-700 dark:text-slate-200",
        )}
      >
        {label}
      </span>
      {disabledReason && (
        <span className="text-[10px] font-medium leading-tight text-slate-400">{disabledReason}</span>
      )}
    </div>
  );

  if (isDisabled) {
    if (!disabledReason) return body;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{body}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px] text-xs">
          {disabledReason}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link href={href!} className="block">
      {body}
    </Link>
  );
}

export type QuickActionGridProps = {
  canSubmitAnnualLeave: boolean;
  leaveDisabledReason?: string;
};

export function QuickActionGrid({ canSubmitAnnualLeave, leaveDisabledReason }: QuickActionGridProps) {
  const actions: QuickAction[] = [
    {
      key: "cuti",
      icon: CalendarOff,
      label: "Ajukan Cuti",
      href: canSubmitAnnualLeave ? "/admin/karyawan/pengajuan-cuti" : undefined,
      disabledReason: canSubmitAnnualLeave ? undefined : leaveDisabledReason || "Belum tersedia untuk status ini",
    },
    { key: "izin", icon: FileText, label: "Ajukan Izin", href: "/admin/karyawan/pengajuan-izin" },
    { key: "lembur", icon: Clock3, label: "Ajukan Lembur", href: "/admin/karyawan/pengajuan-lembur" },
    { key: "mandat", icon: Users, label: "Mandat Pengganti", href: "/admin/karyawan/pengajuan-cuti?tab=mandat" },
    { key: "profil", icon: UserCog, label: "Update Data Diri", href: "/admin/karyawan/profile" },
    {
      key: "absen",
      icon: Fingerprint,
      label: "Absen Hari Ini",
      disabledReason: "Gunakan aplikasi Absen HRP di perangkat Anda",
    },
    { key: "slip", icon: Receipt, label: "Slip / Rekap", disabledReason: "Belum tersedia" },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <Card className="border-slate-100 dark:border-slate-800 shadow-sm">
        <CardContent className="pt-5">
          <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Aksi Cepat</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {actions.map(({ key, ...action }) => (
              <ActionTile key={key} {...action} />
            ))}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
