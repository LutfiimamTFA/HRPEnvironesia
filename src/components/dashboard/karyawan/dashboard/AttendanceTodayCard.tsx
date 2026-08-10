import { Fingerprint, MapPin, LogIn, LogOut, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type AttendanceTodaySnapshot = {
  dateKey: string;
  status: "not_yet" | "working" | "completed";
  tapIn: { timestamp: string | null; mode: string | null; address: string | null } | null;
  tapOut: { timestamp: string | null; mode: string | null; address: string | null } | null;
};

function formatJakartaTime(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "-";
  }
}

const STATUS_META: Record<AttendanceTodaySnapshot["status"], { label: string; tone: string }> = {
  not_yet: { label: "Belum Absen", tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  working: { label: "Sedang Bekerja", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  completed: { label: "Sudah Absen Pulang", tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
};

export type AttendanceTodayCardProps = {
  isWeekend: boolean;
  isLoading: boolean;
  snapshot: AttendanceTodaySnapshot | null;
};

export function AttendanceTodayCard({ isWeekend, isLoading, snapshot }: AttendanceTodayCardProps) {
  return (
    <Card className="border-slate-100 dark:border-slate-800 shadow-sm">
      <CardHeader className="border-b pb-4 flex flex-row items-center gap-2.5">
        <Fingerprint className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
          Kehadiran Hari Ini
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5">
        {isWeekend ? (
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Hari ini tidak ada jadwal kerja aktif.
          </p>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat data kehadiran...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {snapshot?.status === "not_yet" && "Anda belum melakukan absensi hari ini."}
                {snapshot?.status === "working" &&
                  `Anda sudah tap in pukul ${formatJakartaTime(snapshot.tapIn?.timestamp ?? null)}.`}
                {snapshot?.status === "completed" &&
                  `Anda tap in ${formatJakartaTime(snapshot.tapIn?.timestamp ?? null)} dan tap out ${formatJakartaTime(snapshot.tapOut?.timestamp ?? null)}.`}
              </p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
                  STATUS_META[snapshot?.status ?? "not_yet"].tone,
                )}
              >
                {STATUS_META[snapshot?.status ?? "not_yet"].label}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                  <LogIn className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Jam Masuk</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {formatJakartaTime(snapshot?.tapIn?.timestamp ?? null)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
                  <LogOut className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Jam Pulang</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {formatJakartaTime(snapshot?.tapOut?.timestamp ?? null)}
                  </p>
                </div>
              </div>
            </div>

            {(snapshot?.tapIn?.address || snapshot?.tapOut?.address) && (
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {snapshot?.tapOut?.address || snapshot?.tapIn?.address}
                </p>
              </div>
            )}

            <p className="text-xs text-slate-400">
              Absen masuk/pulang dilakukan lewat aplikasi Absen HRP di perangkat Anda.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
