import Link from "next/link";
import { CalendarOff, FileText, Clock3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-0.5 text-base font-black text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

export type LeaveSummary = {
  eligible: boolean;
  allowance: number;
  used: number;
  remaining: number;
  pendingCount: number;
};

export type PermitSummary = {
  activeCount: number;
  thisMonthCount: number;
  lastStatusLabel: string;
};

export type OvertimeSummary = {
  thisMonthCount: number;
  approvedCount: number;
  pendingCount: number;
  totalHoursThisMonth: number;
};

export function LeavePermitOvertimeSummary({
  leave,
  permit,
  overtime,
}: {
  leave: LeaveSummary;
  permit: PermitSummary;
  overtime: OvertimeSummary;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Cuti */}
      <Card className="border-slate-100 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarOff className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Cuti
            </CardTitle>
          </div>
          <Button asChild size="sm" variant="ghost" className="h-7 rounded-lg text-[11px] font-semibold">
            <Link href="/admin/karyawan/pengajuan-cuti">Detail</Link>
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {leave.eligible ? (
            <>
              <Stat label="Hak Cuti" value={`${leave.allowance} hari`} />
              <Stat label="Terpakai" value={`${leave.used} hari`} />
              <Stat label="Sisa" value={`${leave.remaining} hari`} />
              <Stat label="Dalam Approval" value={`${leave.pendingCount} pengajuan`} />
            </>
          ) : (
            <>
              <Stat label="Hak Cuti" value="Belum tersedia" />
              <Stat label="Status" value="Menyesuaikan status kepegawaian" />
            </>
          )}
        </CardContent>
      </Card>

      {/* Izin */}
      <Card className="border-slate-100 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Izin
            </CardTitle>
          </div>
          <Button asChild size="sm" variant="ghost" className="h-7 rounded-lg text-[11px] font-semibold">
            <Link href="/admin/karyawan/pengajuan-izin">Detail</Link>
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Stat label="Pengajuan Aktif" value={String(permit.activeCount)} />
          <Stat label="Izin Bulan Ini" value={String(permit.thisMonthCount)} />
          <div className="col-span-2">
            <Stat label="Status Terakhir" value={permit.lastStatusLabel} />
          </div>
        </CardContent>
      </Card>

      {/* Lembur */}
      <Card className="border-slate-100 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Lembur
            </CardTitle>
          </div>
          <Button asChild size="sm" variant="ghost" className="h-7 rounded-lg text-[11px] font-semibold">
            <Link href="/admin/karyawan/pengajuan-lembur">Detail</Link>
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Stat label="Bulan Ini" value={`${overtime.thisMonthCount} pengajuan`} />
          <Stat label="Disetujui" value={String(overtime.approvedCount)} />
          <Stat label="Pending" value={String(overtime.pendingCount)} />
          <Stat label="Total Jam" value={`${overtime.totalHoursThisMonth} jam`} />
        </CardContent>
      </Card>
    </div>
  );
}
