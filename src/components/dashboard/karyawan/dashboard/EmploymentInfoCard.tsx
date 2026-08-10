import Link from "next/link";
import { Info, IdCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type InfoRow = { label: string; value: string };

export type EmploymentInfoCardProps = {
  rows: InfoRow[];
  missingFields: string[];
};

/** Small "label above value" cell — used for every field in the grid so the
 * hierarchy (label small/muted, value bold/dark) stays consistent. */
function InfoCell({ label, value }: InfoRow) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

export function EmploymentInfoCard({ rows, missingFields }: EmploymentInfoCardProps) {
  return (
    <Card className="border-slate-100 dark:border-slate-800 shadow-sm">
      <CardHeader className="border-b pb-4 flex flex-row items-center gap-2.5">
        <IdCard className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
          Informasi Kepegawaian
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          {rows.map((row) => (
            <InfoCell key={row.label} label={row.label} value={row.value} />
          ))}
        </div>

        {missingFields.length > 0 && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/30 dark:bg-blue-950/20">
            <div className="flex gap-3">
              <Info className="h-5 w-5 shrink-0 text-blue-500" />
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Beberapa Data Kepegawaian Masih Perlu Dilengkapi
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    Beberapa data kepegawaian Anda masih perlu dilengkapi oleh HRD, seperti divisi,
                    atasan langsung, atau struktur penempatan. Fitur tertentu mungkin menyesuaikan
                    data ini.
                  </p>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {missingFields.map((field) => (
                    <li
                      key={field}
                      className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300"
                    >
                      {field} belum diatur
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild size="sm" variant="outline" className="rounded-lg text-xs font-semibold">
                    <Link href="/admin/karyawan/profile">Lihat Data Diri</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
