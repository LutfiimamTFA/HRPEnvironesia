import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, Info, CheckCircle2, AlertTriangle, BellRing } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "./EmptyState";
import { cn } from "@/lib/utils";

export type AlertTone = "info" | "warning" | "urgent" | "success";

export type DashboardAlert = {
  id: string;
  tone: AlertTone;
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
};

const TONE_META: Record<AlertTone, { icon: LucideIcon; classes: string; iconClasses: string }> = {
  urgent: {
    icon: AlertCircle,
    classes: "border-rose-100 bg-rose-50/60 dark:border-rose-900/30 dark:bg-rose-950/20",
    iconClasses: "text-rose-500",
  },
  warning: {
    icon: AlertTriangle,
    classes: "border-amber-100 bg-amber-50/60 dark:border-amber-900/30 dark:bg-amber-950/20",
    iconClasses: "text-amber-500",
  },
  info: {
    icon: Info,
    classes: "border-blue-100 bg-blue-50/60 dark:border-blue-900/30 dark:bg-blue-950/20",
    iconClasses: "text-blue-500",
  },
  success: {
    icon: CheckCircle2,
    classes: "border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/30 dark:bg-emerald-950/20",
    iconClasses: "text-emerald-500",
  },
};

export function EmployeeAlertsCard({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <Card className="border-slate-100 dark:border-slate-800 shadow-sm">
      <CardHeader className="border-b pb-4 flex flex-row items-center gap-2.5">
        <BellRing className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
          Pengingat &amp; Informasi
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {alerts.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Tidak ada pengingat saat ini"
            description="Semua informasi penting untuk Anda akan muncul di sini."
            compact
          />
        ) : (
          <div className="space-y-2.5">
            {alerts.map((alert) => {
              const meta = TONE_META[alert.tone];
              const Icon = meta.icon;
              return (
                <div
                  key={alert.id}
                  className={cn("flex items-start gap-3 rounded-xl border p-3.5", meta.classes)}
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.iconClasses)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{alert.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {alert.message}
                    </p>
                    {alert.actionLabel && alert.actionHref && (
                      <Link
                        href={alert.actionHref}
                        className="mt-1.5 inline-block text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {alert.actionLabel} &rarr;
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
