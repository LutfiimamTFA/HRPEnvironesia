"use client";

import { useState, useMemo, type ReactNode } from "react";
import { exportDetailXlsx, exportSummaryXlsx } from "@/lib/payroll-xlsx";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking } from "@/firebase";
import { collection, collectionGroup, where, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { format, eachDayOfInterval } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Download, AlertCircle, RotateCcw, CalendarDays, Info, Eye, FileSpreadsheet, Clock, MapPin, Briefcase, MoreVertical, CheckCircle2, XCircle, HelpCircle, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { EmployeeProfile, Brand, PayrollTemplate } from "@/lib/types";
import {
  loadTemplateWorkbook,
  writeWorkbookToBlob,
  fillPayrollTemplateSheet,
  buildPayrollTemplateDayRows,
} from "@/lib/payroll-template";
import {
  calculatePayrollPeriod,
  generatePayrollRecap,
  formatWorkMinutes,
  INDONESIA_PUBLIC_HOLIDAYS_2026,
  mergeEmployeeIdentity,
  type HolidayDetail,
  type PeriodMode,
  type PayrollRecapRow,
  type LeaveDetail,
} from "@/lib/payroll-recap";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useHrdScopedBrands, useHrdScopedCollection } from "@/hooks/useHrdScopedCollection";

type ExportStepStatus = "pending" | "active" | "done" | "error";
interface ExportStepState { label: string; status: ExportStepStatus; }

const EXPORT_STEP_LABELS = [
  "Validasi akses HRD",
  "Mengambil data absensi",
  "Mengecek Payroll Group",
  "Mengambil template Google Drive",
  "Menyalin style template",
  "Menulis data detail",
  "Mengisi total karyawan",
  "Mengisi Rekap F&A",
  "Membuat file Excel",
  "Mengunduh file",
];

function makeInitialExportSteps(): ExportStepState[] {
  return EXPORT_STEP_LABELS.map((label) => ({ label, status: "pending" as ExportStepStatus }));
}
import { HrdScopeEmptyState } from "@/components/dashboard/hrd/HrdScopeEmptyState";

const PERIOD_MODES: Array<{ value: PeriodMode; label: string }> = [
  { value: "payroll", label: "Periode Payroll (19–20)" },
  { value: "calendar", label: "Bulan Kalender" },
  { value: "custom", label: "Custom Range" },
];

// ── Late Details Modal ──────────────────────────────────────────────────────

function LateDetailsModal({
  row,
  open,
  onClose,
}: {
  row: PayrollRecapRow | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!row) return null;
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            Rincian Keterlambatan — {row.fullName}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-1">
          <p className="text-xs text-slate-500 mb-3">
            Total: <span className="font-semibold text-orange-600">{row.terlambat}×</span>{" "}
            / <span className="font-semibold text-orange-600">{row.menitTerlambat} menit</span>
          </p>
          {row.lateDetails.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Tidak ada keterlambatan</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {row.lateDetails.map((d, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {format(new Date(d.date), "d MMMM yyyy", { locale: idLocale })}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                      <Clock className="h-3 w-3" />
                      Jam masuk: {d.tapInTime}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800 text-xs"
                  >
                    Terlambat {d.lateMinutes}m
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function formatDateId(dateStr: string) {
  return format(new Date(dateStr), "d MMMM yyyy", { locale: idLocale });
}


function statusBadgeClass(status: string) {
  switch (status) {
    case "Belum Berjalan":
      return "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700";
    case "Libur Nasional":
      return "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700";
    case "Cuti Bersama":
      return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-800";
    case "Libur Perusahaan":
    case "Akhir Pekan":
      return "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700";
    case "Tepat Waktu":
    case "Hadir":
      return "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800";
    case "Terlambat":
      return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800";
    case "Izin":
      return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800";
    case "Cuti":
      return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800";
    case "Alpha":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800";
    default:
      if (status.startsWith("Dinas"))
        return "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800";
      return "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700";
  }
}

function calendarRowClass(status: string, index: number) {
  const zebra = index % 2 === 0 ? "bg-white dark:bg-slate-950/30" : "bg-slate-50/50 dark:bg-slate-900/20";
  if (status === "Alpha") return "bg-red-50/70 dark:bg-red-950/20";
  if (status === "Izin") return "bg-blue-50/70 dark:bg-blue-950/20";
  if (status === "Cuti") return "bg-purple-50/70 dark:bg-purple-950/20";
  if (status === "Tepat Waktu" || status === "Hadir") return "bg-green-50/70 dark:bg-green-950/20";
  if (status.includes("Terlambat")) return "bg-orange-50/70 dark:bg-orange-950/20";
  if (status.startsWith("Dinas")) return "bg-teal-50/70 dark:bg-teal-950/20";
  if (["Libur Nasional", "Cuti Bersama", "Libur Perusahaan", "Akhir Pekan"].includes(status))
    return "bg-slate-100/70 dark:bg-slate-900/50";
  if (status === "Belum Berjalan") return "bg-slate-50 dark:bg-slate-900/30";
  return zebra;
}


// ─── Dinas metadata helpers ────────────────────────────────────────────────

type DinasMission = { key: string; detail: LeaveDetail; index: number };
type DinasMeta = {
  byDate: Map<string, LeaveDetail>;
  indexMap: Map<string, number>;
  missions: DinasMission[];
};

function buildDinasMeta(leaveDetails: LeaveDetail[]): DinasMeta {
  const byDate = new Map<string, LeaveDetail>();
  const missionOrder: string[] = [];
  leaveDetails
    .filter(d => d.type === "Dinas")
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(d => {
      if (!byDate.has(d.date)) byDate.set(d.date, d);
      const key = d.missionId || d.spdNumber || d.periodStart || "";
      if (key && !missionOrder.includes(key)) missionOrder.push(key);
    });
  const indexMap = new Map(missionOrder.map((k, i) => [k, i + 1]));
  const seen = new Set<string>();
  const missions: DinasMission[] = [];
  leaveDetails.filter(d => d.type === "Dinas").forEach(d => {
    const key = d.missionId || d.spdNumber || d.periodStart || "";
    if (key && !seen.has(key)) { seen.add(key); missions.push({ key, detail: d, index: indexMap.get(key)! }); }
  });
  return { byDate, indexMap, missions };
}

function getMissionKey(d: LeaveDetail | undefined): string {
  return d?.missionId || d?.spdNumber || d?.periodStart || "";
}

function getDinasStatusLabel(status: string, missionIdx: number | undefined, total: number): string {
  if (!status.startsWith("Dinas") || total <= 1 || !missionIdx) return status;
  return status.replace(/^Dinas/, `Dinas ${missionIdx}`);
}

// ─── Dinas detail popover ─────────────────────────────────────────────────

function DinasDetailPopover({ detail, index, total }: { detail: LeaveDetail; index?: number; total: number }) {
  const fd = (ds: string) => { try { return format(new Date(ds), "d MMM yyyy", { locale: idLocale }); } catch { return ds; } };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm"
          className="h-5 w-5 shrink-0 rounded-full p-0 text-teal-500 hover:bg-teal-100 hover:text-teal-700 dark:text-teal-400 dark:hover:bg-teal-900/40">
          <Info className="h-3 w-3" />
          <span className="sr-only">Detail dinas</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" side="left" align="start">
        <div className="space-y-2 text-xs">
          <div className="flex items-start gap-1.5 border-b border-slate-200 pb-2 dark:border-slate-700">
            <Briefcase className="mt-0.5 h-3 w-3 shrink-0 text-teal-500" />
            <div className="min-w-0">
              {total > 1 && index && (
                <Badge className="mb-1 h-4 bg-teal-600 px-1.5 text-[10px] text-white">Dinas {index}</Badge>
              )}
              <p className="font-semibold text-slate-800 dark:text-slate-200 break-words">
                {detail.missionName || "Perjalanan Dinas"}
              </p>
            </div>
          </div>
          {detail.spdNumber && (
            <div className="flex items-start gap-1.5">
              <span className="shrink-0 font-medium text-slate-500 w-16">SPD</span>
              <span className="text-slate-700 dark:text-slate-300">{detail.spdNumber}</span>
            </div>
          )}
          {detail.periodStart && detail.periodEnd && (
            <div className="flex items-start gap-1.5">
              <span className="shrink-0 font-medium text-slate-500 w-16">Periode</span>
              <span className="text-slate-700 dark:text-slate-300">{fd(detail.periodStart)} – {fd(detail.periodEnd)}</span>
            </div>
          )}
          {detail.destination && (
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
              <span className="text-slate-700 dark:text-slate-300 break-words">{detail.destination}</span>
            </div>
          )}
          {detail.activity && (
            <div className="flex items-start gap-1.5">
              <span className="shrink-0 font-medium text-slate-500 w-16">Kegiatan</span>
              <span className="text-slate-700 dark:text-slate-300 break-words">{detail.activity}</span>
            </div>
          )}
          {detail.approvedBy && (
            <div className="flex items-start gap-1.5">
              <span className="shrink-0 font-medium text-slate-500 w-16">Disetujui</span>
              <span className="text-slate-700 dark:text-slate-300">{detail.approvedBy}</span>
            </div>
          )}
          <div className="flex items-start gap-1.5 border-t border-slate-200 pt-1.5 dark:border-slate-700">
            <span className="shrink-0 font-medium text-slate-500 w-16">Status</span>
            <span className="text-teal-600 font-medium">{detail.status}</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Dinas mission summary cards ──────────────────────────────────────────

function DinasMissionCards({ missions }: { missions: DinasMission[] }) {
  if (missions.length <= 1) return null;
  const fd = (ds: string) => { try { return format(new Date(ds), "d MMM yyyy", { locale: idLocale }); } catch { return ds; } };
  const TEAL_SHADES = ["bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800", "bg-cyan-50 border-cyan-200 dark:bg-cyan-950/30 dark:border-cyan-800"];
  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-800 dark:bg-teal-950/20">
      <p className="mb-2 text-xs font-semibold text-teal-700 dark:text-teal-300">
        {missions.length} perjalanan dinas dalam periode ini:
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {missions.map((m, i) => (
          <div key={m.key} className={`rounded-md border p-2.5 text-xs ${TEAL_SHADES[i % TEAL_SHADES.length]}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <Badge className="h-4 shrink-0 bg-teal-600 px-1.5 text-[10px] text-white">Dinas {m.index}</Badge>
              <span className="min-w-0 truncate font-semibold text-teal-800 dark:text-teal-200">
                {m.detail.missionName || "—"}
              </span>
            </div>
            {m.detail.spdNumber && <p className="text-slate-500 dark:text-slate-400 truncate">SPD: {m.detail.spdNumber}</p>}
            {m.detail.periodStart && m.detail.periodEnd && (
              <p className="text-slate-500 dark:text-slate-400">
                {fd(m.detail.periodStart)} – {fd(m.detail.periodEnd)}
              </p>
            )}
            {m.detail.destination && (
              <p className="flex items-center gap-1 text-slate-500 dark:text-slate-400 truncate">
                <MapPin className="h-2.5 w-2.5 shrink-0" />{m.detail.destination}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dinas mission row bg (different teal shade per mission) ──────────────

function dinasMissionRowClass(missionIdx: number | undefined): string {
  if (missionIdx === 2) return "bg-cyan-50/70 dark:bg-cyan-950/20";
  if (missionIdx === 3) return "bg-sky-50/70 dark:bg-sky-950/20";
  return "bg-teal-50/70 dark:bg-teal-950/20";
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
      {children}
    </div>
  );
}

function DetailTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="max-h-[52vh] overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_rgba(148,163,184,0.25)] dark:bg-slate-900">
          <TableRow>
            {headers.map(header => (
              <TableHead key={header} className="h-9 whitespace-nowrap text-[10px] font-black uppercase text-slate-500">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={rowIndex} className={`border-slate-200 dark:border-slate-800/50 ${rowIndex % 2 === 0 ? "bg-white dark:bg-slate-950/20" : "bg-slate-50/50 dark:bg-slate-900/20"}`}>
              {row.map((cell, cellIndex) => (
                <TableCell key={cellIndex} className="whitespace-nowrap py-2 text-xs text-slate-700 dark:text-slate-300">
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const CALENDAR_FILTERS = [
  { value: "Semua", label: "Semua" },
  { value: "Tepat Waktu", label: "Tepat Waktu" },
  { value: "Terlambat", label: "Terlambat" },
  { value: "Izin/Cuti/Dinas", label: "Izin/Cuti/Dinas" },
  { value: "Alpha", label: "Alpha" },
  { value: "Libur", label: "Libur" },
  { value: "Belum Berjalan", label: "Belum Berjalan" },
] as const;
type CalendarFilterValue = (typeof CALENDAR_FILTERS)[number]["value"];

function matchesCalendarFilter(status: string, filter: CalendarFilterValue) {
  if (filter === "Semua") return true;
  if (filter === "Tepat Waktu") return ["Tepat Waktu", "Dinas + Tepat Waktu"].includes(status);
  if (filter === "Terlambat") return ["Terlambat", "Dinas + Terlambat"].includes(status);
  if (filter === "Izin/Cuti/Dinas") return ["Izin", "Cuti"].includes(status) || status.startsWith("Dinas");
  if (filter === "Libur") return ["Libur Nasional", "Cuti Bersama", "Libur Perusahaan", "Akhir Pekan"].includes(status);
  if (filter === "Belum Berjalan") return ["Belum Berjalan", "Belum Tap In"].includes(status);
  return status === filter;
}

function CalendarSummaryTable({
  rows,
  filter,
  search,
  onFilterChange,
  onSearchChange,
  leaveDetails = [],
  onDecision,
}: {
  rows: PayrollRecapRow["calendarDetails"];
  filter: CalendarFilterValue;
  search: string;
  onFilterChange: (value: CalendarFilterValue) => void;
  onSearchChange: (value: string) => void;
  leaveDetails?: LeaveDetail[];
  onDecision?: (dateStr: string, eventId: string, decision: string, manualCheckoutTime?: string) => void;
}) {
  const dinasMeta = useMemo(() => buildDinasMeta(leaveDetails), [leaveDetails]);

  const filteredRows = rows.filter(row => {
    const matchesFilter = matchesCalendarFilter(row.status, filter);
    const query = search.trim().toLowerCase();
    if (!query) return matchesFilter;
    const ld = dinasMeta.byDate.get(row.date);
    const haystack = [
      formatDateId(row.date), row.dayName, row.status,
      row.tapInTime || "", row.tapOutTime || "", row.keterangan || "",
      ld?.missionName || "", ld?.spdNumber || "",
    ].join(" ").toLowerCase();
    return matchesFilter && haystack.includes(query);
  });

  return (
    <div className="space-y-3">
      {/* Filter toolbar */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
          <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Filter:</span>
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {CALENDAR_FILTERS.map(item => (
              <Button key={item.value} type="button" size="sm" variant={filter === item.value ? "default" : "outline"}
                className={`h-7 shrink-0 rounded-full px-2.5 text-[11px] ${filter === item.value ? "bg-teal-600 text-white hover:bg-teal-700" : "bg-white dark:bg-slate-950"}`}
                onClick={() => onFilterChange(item.value)}>
                {item.label}
              </Button>
            ))}
          </div>
        </div>
        <Input value={search} onChange={e => onSearchChange(e.target.value)}
          placeholder="Cari tanggal, status, keterangan, SPD..."
          className="h-8 w-full text-xs lg:w-[300px]" />
      </div>

      {/* Mission summary cards when Izin/Cuti/Dinas filter is active */}
      {filter === "Izin/Cuti/Dinas" && <DinasMissionCards missions={dinasMeta.missions} />}

      {filteredRows.length === 0 ? (
        <EmptyState>Tidak ada data kalender yang sesuai filter.</EmptyState>
      ) : (
        <div className="max-h-[52vh] overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
          <Table className="min-w-[900px]">
            <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_rgba(148,163,184,0.25)] dark:bg-slate-900">
              <TableRow>
                <TableHead className="w-10 text-center text-[10px] font-black uppercase text-slate-500">No</TableHead>
                <TableHead className="w-32 text-[10px] font-black uppercase text-slate-500">Tanggal</TableHead>
                <TableHead className="w-24 text-[10px] font-black uppercase text-slate-500">Hari</TableHead>
                <TableHead className="w-44 text-[10px] font-black uppercase text-slate-500">Status</TableHead>
                <TableHead className="w-20 text-[10px] font-black uppercase text-slate-500">Masuk</TableHead>
                <TableHead className="w-20 text-[10px] font-black uppercase text-slate-500">Pulang</TableHead>
                <TableHead className="text-[10px] font-black uppercase text-slate-500">Keterangan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((day, index) => {
                const isDinas = day.status.startsWith("Dinas");
                const dinasDetail = isDinas ? dinasMeta.byDate.get(day.date) : undefined;
                const mKey = getMissionKey(dinasDetail);
                const mIdx = mKey ? dinasMeta.indexMap.get(mKey) : undefined;
                const total = dinasMeta.missions.length;
                const badgeLabel = getDinasStatusLabel(day.status, mIdx, total);
                const rowBg = isDinas
                  ? dinasMissionRowClass(mIdx)
                  : calendarRowClass(day.status, index);

                return (
                  <TableRow key={day.date} className={`border-slate-200 transition-colors dark:border-slate-800/50 ${rowBg}`}>
                    <TableCell className="text-center text-xs tabular-nums text-slate-500">{index + 1}</TableCell>
                    <TableCell className="whitespace-nowrap py-2.5 text-xs font-medium text-slate-800 dark:text-slate-200">
                      {formatDateId(day.date)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2.5 text-xs text-slate-700 dark:text-slate-300">{day.dayName}</TableCell>
                    <TableCell className="py-2.5">
                      <Badge variant="outline" className={`whitespace-nowrap text-[11px] ${statusBadgeClass(day.status)}`}>
                        {badgeLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2.5 text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {day.tapInTime || "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2.5 text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {day.tapOutTime || "-"}
                    </TableCell>
                    {/* Keterangan: ringkas untuk dinas, truncate untuk non-dinas */}
                    <TableCell className="py-2.5">
                      {isDinas && dinasDetail ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-teal-700 dark:text-teal-300 truncate max-w-[260px]">
                            {dinasDetail.missionName
                              ? `${dinasDetail.missionName}${dinasDetail.spdNumber ? ` — ${dinasDetail.spdNumber}` : ""}`
                              : (dinasDetail.spdNumber || "Perjalanan dinas approved")}
                          </span>
                          <DinasDetailPopover detail={dinasDetail} index={mIdx} total={total} />
                        </div>
                      ) : (
                        <div className="max-w-xs flex items-start justify-between gap-1.5">
                          <div className="min-w-0">
                            <span className="line-clamp-2 text-xs leading-5 text-slate-700 dark:text-slate-300">
                              {day.keterangan || "-"}
                            </span>
                            {day.tapInTime && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${day.hasPhoto ? "border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400" : "border-slate-200 text-slate-400"}`}>
                                  {day.hasPhoto ? "Foto Ada" : "Foto Tidak Ada"}
                                </Badge>
                                {day.locationValidationStatus && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{day.locationValidationStatus}</Badge>
                                )}
                                {day.hrdReviewStatus === "needs_review" && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-400">Perlu Review</Badge>
                                )}
                                {day.conditionCategory && (
                                  <Badge className="text-[10px] px-1.5 py-0 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">{day.conditionCategory}</Badge>
                                )}
                                {!day.payrollIsFinal && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-300 text-slate-500">Belum Final</Badge>
                                )}
                              </div>
                            )}
                          </div>
                          {!day.payrollIsFinal && day.tapInEventId && onDecision && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => onDecision(day.date, day.tapInEventId!, "full_day")}>
                                  <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Setujui sebagai full day
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onDecision(day.date, day.tapInEventId!, "default_checkout")}>
                                  <Clock className="mr-2 h-3.5 w-3.5 text-teal-600" /> Setujui s.d. jam pulang default
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  const manual = window.prompt("Jam pulang manual (HH:mm)", "17:00");
                                  if (manual) onDecision(day.date, day.tapInEventId!, "manual_checkout", manual);
                                }}>
                                  <Clock className="mr-2 h-3.5 w-3.5 text-blue-600" /> Setujui dengan jam pulang manual
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => onDecision(day.date, day.tapInEventId!, "needs_clarification")}>
                                  <HelpCircle className="mr-2 h-3.5 w-3.5 text-purple-600" /> Minta klarifikasi
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onDecision(day.date, day.tapInEventId!, "rejected")} className="text-red-600 focus:text-red-600">
                                  <XCircle className="mr-2 h-3.5 w-3.5" /> Tolak / tidak dihitung
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function AttendancePayrollDetailModal({
  row,
  period,
  open,
  onClose,
  onDecision,
}: {
  row: PayrollRecapRow | null;
  period: { startDate: Date; endDate: Date };
  open: boolean;
  onClose: () => void;
  onDecision?: (dateStr: string, eventId: string, decision: string, manualCheckoutTime?: string) => void;
}) {
  const [calendarFilter, setCalendarFilter] = useState<CalendarFilterValue>("Semua");
  const [calendarSearch, setCalendarSearch] = useState("");
  if (!row) return null;
  const periodLabel = `${format(period.startDate, "d MMM yyyy", { locale: idLocale })} - ${format(period.endDate, "d MMM yyyy", { locale: idLocale })}`;
  const countedLeaveDates = new Set(
    row.calendarDetails
      .filter(d => ["Izin", "Cuti"].includes(d.status) || d.status.startsWith("Dinas"))
      .map(d => d.date)
  );
  const approvedLeaveDetails = row.leaveDetails.filter(d =>
    countedLeaveDates.has(d.date) &&
    ["approved", "disetujui", "hrd_approved", "approved_by_hrd", "approved_hrd", "approved_by_manager", "approved_by_director", "confirmed_by_staff", "validated_by_manager", "validated", "active", "in_progress", "departed", "arrived", "activity_done", "return_started", "closed", "completed", "selesai", "accepted", "active_leave", "approved_ready_to_depart", "ready_to_depart", "on_duty", "returned", "returned_pending_report", "report_submitted", "final_report_submitted"].includes(String(d.status || "").toLowerCase())
  );
  const totalTepatWaktu = row.calendarDetails.filter(d => ["Tepat Waktu", "Dinas + Tepat Waktu"].includes(d.status)).length;

  const exportDetail = () => {
    exportDetailXlsx(row, period, approvedLeaveDetails, totalTepatWaktu);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-7xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <DialogTitle className="text-lg">Detail Absensi Payroll - {row.fullName}</DialogTitle>
              <DialogDescription>Periode {periodLabel}</DialogDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-2 self-start" onClick={exportDetail}>
              <FileSpreadsheet className="h-4 w-4" />
              Export Detail
            </Button>
          </div>
        </DialogHeader>
        <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-9">
            {[
              { label: "Total Hari Kerja", value: row.hariKerja, subtext: `${row.hariKerja} hari` },
              { label: "Total Hadir", value: row.hadir, subtext: `${row.hadir} hari` },
              { label: "Tepat Waktu", value: totalTepatWaktu, subtext: `${totalTepatWaktu} hari` },
              { label: "Terlambat", value: row.terlambat, subtext: `${row.terlambat} kali` },
              { label: "Izin", value: row.izin, subtext: `${row.izin} hari` },
              { label: "Cuti", value: row.cuti, subtext: `${row.cuti} hari` },
              { label: "Dinas", value: row.dinas, subtext: `${row.dinas} hari` },
              { label: "Alpha", value: row.alpha, subtext: `${row.alpha} hari` },
              { label: "Total Menit Terlambat", value: row.menitTerlambat, subtext: `${row.menitTerlambat} menit` },
            ].map(card => (
              <div key={card.label} className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/30">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className="mt-1 text-xl font-bold leading-none text-slate-900 dark:text-white">{card.value}</p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{card.subtext}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { label: "Target Periode", value: formatWorkMinutes(row.targetPeriodeMinutes), subtext: "seluruh periode" },
              { label: "Target Berjalan", value: formatWorkMinutes(row.targetBerjalanMinutes), subtext: "s.d. hari ini" },
              { label: "Jam Aktual", value: formatWorkMinutes(row.jamAktualMinutes), subtext: "tap in–out lengkap" },
              { label: "Jam Diakui Payroll", value: formatWorkMinutes(row.jamDiakuiPayrollMinutes), subtext: "final untuk payroll" },
              {
                label: "Selisih Berjalan", value: `${row.selisihBerjalanMinutes >= 0 ? "+" : "-"}${formatWorkMinutes(Math.abs(row.selisihBerjalanMinutes))}`,
                subtext: row.selisihBerjalanMinutes < 0 ? "kurang dari target" : "sesuai/lebih target",
              },
              { label: "Hari Belum Final", value: String(row.hariBelumFinal), subtext: "belum tap out" },
              { label: "Hari Perlu Review", value: String(row.hariBelumTapOut), subtext: "sudah lewat, belum tap out" },
            ].map(card => (
              <div key={card.label} className="rounded-md border border-teal-100 bg-teal-50/50 px-3 py-2 dark:border-teal-900/40 dark:bg-teal-950/20">
                <p className="text-[10px] font-bold uppercase tracking-wide text-teal-700 dark:text-teal-400">{card.label}</p>
                <p className="mt-1 text-base font-bold leading-none text-slate-900 dark:text-white">{card.value}</p>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{card.subtext}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>Jam Diakui Payroll hanya menghitung hari dengan tap in &amp; tap out lengkap, atau yang sudah diputuskan HRD. Hari tanpa tap out tidak otomatis dihitung 8 jam.</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 px-5 py-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Rincian Tanggal</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gunakan filter chip untuk melihat tanggal tepat waktu, terlambat, izin/cuti/dinas, alpha, libur, atau belum berjalan.
            </p>
          </div>
          <CalendarSummaryTable
            rows={row.calendarDetails}
            filter={calendarFilter}
            search={calendarSearch}
            onFilterChange={setCalendarFilter}
            onSearchChange={setCalendarSearch}
            leaveDetails={row.leaveDetails}
            onDecision={onDecision}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function RekapAbsensiPayrollPage() {
  const hasAccess = useRoleGuard(["hrd", "super-admin"]);
  const firestore = useFirestore();
  const { userProfile, firebaseUser } = useAuth();
  const { toast } = useToast();

  // ── Period state ──
  const [periodMode, setPeriodMode] = useState<PeriodMode>("payroll");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  // ── Filter state ──
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedDivision, setSelectedDivision] = useState("all");
  const [searchName, setSearchName] = useState("");

  // ── Modal state ──
  const [lateDetailRow, setLateDetailRow] = useState<PayrollRecapRow | null>(null);

  // ── Data fetching (same 3 collections as Data Karyawan) ──
  // realtime:false — this is a point-in-time payroll recap, not a live dashboard.
  // Fetching once instead of holding ~10 standing onSnapshot listeners per HRD
  // session is what actually matters for quota at 300+ concurrent users; a
  // limit() here would silently truncate the recap instead of fixing anything.
  const { data: employeeProfiles, isLoading: loadingProfiles, mutate: refetchProfiles } =
    useHrdScopedCollection<EmployeeProfile>("employee_profiles", { realtime: false });

  const userConstraints = useMemo(
    () => [where("role", "in", ["karyawan", "manager"]), where("isActive", "==", true)],
    [],
  );
  const { data: users, isLoading: loadingUsers, mutate: refetchUsers } =
    useHrdScopedCollection<any>("users", { constraints: userConstraints, realtime: false });

  const { data: employeesDocs, isLoading: loadingEmployeesDocs, mutate: refetchEmployeesDocs } =
    useHrdScopedCollection<any>("employees", { realtime: false });

  const { data: brands, mutate: refetchBrands } = useHrdScopedBrands();

  // payroll_templates is never listed here — firestore.rules only grants HRD
  // a single-document `get`, not `list`. Individual templates are fetched via
  // getDoc(doc(...)) inside handleExportByTemplate, one per templateId
  // actually referenced by the brands this HRD is scoped to.

  // attendance_events is fetched UNSCOPED (not via useHrdScopedCollection),
  // same as Monitoring Absensi — real events don't reliably carry `brandId`,
  // so a server-side where("brandId","in",allowedBrandIds) filter silently
  // dropped events for employees like Daniel, showing him as Alpha in Rekap
  // Payroll while Monitoring Absensi (already fixed the same way) showed his
  // tap-in correctly. The HRD scope boundary is enforced downstream instead:
  // generateEmployeePayrollRecap only ever matches events against employees
  // already present in `mergedEmployees`, which IS brand-scoped via the
  // employee_profiles query above.
  const { data: attendanceEvents, isLoading: loadingAttendance, mutate: refetchAttendance } = useCollection<any>(
    useMemoFirebase(() => collection(firestore, "attendance_events"), [firestore]),
    { realtime: false },
  );

  const { data: attendanceSites, mutate: refetchAttendanceSites } = useHrdScopedCollection<any>("attendance_sites", { realtime: false });

  const { data: permissionRequests, mutate: refetchPermissionRequests } = useHrdScopedCollection<any>("permission_requests", { realtime: false });

  const { data: leaveRequests, mutate: refetchLeaveRequests } = useHrdScopedCollection<any>("leave_requests", { realtime: false });

  const {
    data: businessTripMissions,
    mutate: refetchBusinessTripMissions,
    isScopeConfigured,
    emptyStateMessage,
  } = useHrdScopedCollection<any>("business_trip_missions", { realtime: false });

  const { data: businessTripMembers, mutate: refetchBusinessTripMembers } = useCollection<any>(
    useMemoFirebase(() => collectionGroup(firestore, "members"), [firestore]),
    { realtime: false },
  );

  const { data: companyHolidays, mutate: refetchCompanyHolidays } = useCollection<any>(
    useMemoFirebase(() => collection(firestore, "company_holidays"), [firestore]),
    { realtime: false },
  );

  const refetchAll = () => {
    refetchProfiles();
    refetchUsers();
    refetchEmployeesDocs();
    refetchBrands();
    refetchAttendance();
    refetchAttendanceSites();
    refetchPermissionRequests();
    refetchLeaveRequests();
    refetchBusinessTripMissions();
    refetchBusinessTripMembers();
    refetchCompanyHolidays();
  };

  const isLoading = loadingProfiles || loadingUsers || loadingEmployeesDocs || loadingAttendance;

  // ── Build lookup maps: uid → user / uid → employeeDoc ──
  const { usersByUid, employeeDocsByUid } = useMemo(() => {
    const usersByUid = new Map<string, any>();
    (users ?? []).forEach(u => { if (u.uid) usersByUid.set(u.uid, u); });
    const employeeDocsByUid = new Map<string, any>();
    (employeesDocs ?? []).forEach(e => { if (e.uid) employeeDocsByUid.set(e.uid, e); });
    return { usersByUid, employeeDocsByUid };
  }, [users, employeesDocs]);

  // ── Merge employee identity (same logic as Data Karyawan) ──
  const mergedEmployees = useMemo(() => {
    if (!employeeProfiles) return [];
    return (employeeProfiles as any[]).map(profile => {
      const uid = profile.uid || profile.id;
      const user = uid ? usersByUid.get(uid) : undefined;
      const empDoc = uid ? employeeDocsByUid.get(uid) : undefined;
      return mergeEmployeeIdentity(profile, user, empDoc);
    });
  }, [employeeProfiles, usersByUid, employeeDocsByUid]);

  // ── Holiday dates ── company_holidays schema: { dateKey, name, type, appliesToBrandIds }
  const holidayDetails = useMemo<HolidayDetail[]>(() => {
    const companyHolidayDetails = (companyHolidays || []).flatMap((h: any) => {
      const dates: HolidayDetail[] = [];
      const holidayType = h.type === "national_holiday" || h.type === "collective_leave" ? h.type : "company_holiday";
      const holidayName = h.name || h.title || h.description || "Libur perusahaan";
      const appliesToBrandIds = Array.isArray(h.appliesToBrandIds) && h.appliesToBrandIds.length > 0
        ? h.appliesToBrandIds
        : ["all"];
      // dateKey ("YYYY-MM-DD") is the canonical field; `date` kept as a fallback for older docs.
      const singleDateRaw = h.dateKey || h.date;
      if (singleDateRaw) {
        dates.push({
          date: typeof singleDateRaw === 'string' ? singleDateRaw : format(singleDateRaw.toDate?.() || new Date(singleDateRaw), 'yyyy-MM-dd'),
          type: holidayType,
          name: holidayName,
          appliesToBrandIds,
        });
      }
      if (h.startDate && h.endDate) {
        try {
          const s = h.startDate.toDate?.() || new Date(h.startDate);
          const e = h.endDate.toDate?.() || new Date(h.endDate);
          eachDayOfInterval({ start: s, end: e }).forEach((d: Date) => dates.push({
            date: format(d, 'yyyy-MM-dd'),
            type: holidayType,
            name: holidayName,
            appliesToBrandIds,
          }));
        } catch { /* skip */ }
      }
      return dates;
    }).filter(Boolean);
    const byDate = new Map<string, HolidayDetail>();
    [...INDONESIA_PUBLIC_HOLIDAYS_2026, ...companyHolidayDetails].forEach(holiday => {
      byDate.set(holiday.date, holiday);
    });
    return Array.from(byDate.values());
  }, [companyHolidays]);

  // ── Active period ──
  const activePeriod = useMemo(() => {
    return calculatePayrollPeriod(
      periodMode,
      selectedYear,
      selectedMonth,
      customStartDate ? new Date(customStartDate) : undefined,
      customEndDate ? new Date(customEndDate) : undefined
    );
  }, [periodMode, selectedYear, selectedMonth, customStartDate, customEndDate]);

  // ── Generate recap ──
  const { recapRows, uniqueDivisions } = useMemo(() => {
    if (!mergedEmployees.length || !attendanceEvents || !brands) {
      return { recapRows: [], uniqueDivisions: [] };
    }

    const missionById = new Map<string, any>();
    (businessTripMissions || []).forEach((mission: any) => {
      const missionId = mission.id || mission.missionId;
      if (missionId) missionById.set(String(missionId), mission);
    });
    const enrichedBusinessTripMembers = (businessTripMembers || []).map((member: any) => {
      const mission = missionById.get(String(member.missionId || member.parentId || ""));
      return {
        ...(mission || {}),
        ...member,
        category: "dinas",
        type: "business_trip",
        startDate: member.startDate || mission?.startDate,
        endDate: member.endDate || mission?.endDate,
        missionName: member.missionName || mission?.missionName,
        destinationCity: member.destinationCity || mission?.destinationCity,
        destinationRegency: member.destinationRegency || mission?.destinationRegency,
        destinationProvince: member.destinationProvince || mission?.destinationProvince,
        destinationAddress: member.destinationAddress || mission?.destinationAddress,
        projectName: member.projectName || mission?.projectName,
        instructionNote: member.instructionNote || mission?.instructionNote,
        assignmentNumber: member.assignmentNumber || mission?.assignmentNumber,
        spdNumber: member.spdNumber || mission?.spdNumber || mission?.assignmentNumber,
      };
    });

    const mappedLeaveRequests = (leaveRequests || []).map((leave: any) => ({ ...leave, category: "cuti" }));
    const mappedMissions = (businessTripMissions || []).map((mission: any) => ({ ...mission, category: "dinas", type: "business_trip" }));

    // ── DEBUG: diagnose cuti/dinas matching ──
    console.log("[PAYROLL DEBUG] leaveRequests raw count:", (leaveRequests || []).length, "| businessTripMissions count:", (businessTripMissions || []).length, "| members subcollection count:", (businessTripMembers || []).length);
    console.log("[PAYROLL DEBUG] mergedEmployees sample:", mergedEmployees.slice(0, 3).map((e: any) => ({ name: e._resolvedName, _uid: e._uid, _docId: e._docId, _candidateIds: e._candidateIds, empNo: e.employeeNumber || e.nomorIndukKaryawan })));
    console.log("[PAYROLL DEBUG] leaveRequests full:", (leaveRequests || []).map((x: any) => ({
      id: x.id,
      employeeId: x.employeeId,
      employeeUid: x.employeeUid,
      userId: x.userId,
      uid: x.uid,
      employeeNumber: x.employeeNumber,
      nomorIndukKaryawan: x.nomorIndukKaryawan,
      employeeName: x.employeeName,
      fullName: x.fullName,
      name: x.name,
      status: x.status,
      hrdStatus: x.hrdStatus,
      approvalStatus: x.approvalStatus,
      startDate: x.startDate,
      endDate: x.endDate,
      leaveStartDate: x.leaveStartDate,
      leaveEndDate: x.leaveEndDate,
      date: x.date,
      leaveType: x.leaveType,
      reason: x.reason,
    })));
    console.log("[PAYROLL DEBUG] businessTripMissions full:", (businessTripMissions || []).map((x: any) => ({
      id: x.id,
      status: x.status,
      missionStatus: x.missionStatus,
      assignmentNumber: x.assignmentNumber,
      spdNumber: x.spdNumber,
      title: x.title,
      missionName: x.missionName,
      startDate: x.startDate,
      endDate: x.endDate,
      departureDate: x.departureDate,
      returnDate: x.returnDate,
      missionStartDate: x.missionStartDate,
      missionEndDate: x.missionEndDate,
      memberUids: x.memberUids,
      memberDetails: x.memberDetails,
      members: x.members,
      participants: x.participants,
      participantIds: x.participantIds,
      assignedEmployeeIds: x.assignedEmployeeIds,
      selectedEmployees: x.selectedEmployees,
      assignedStaff: x.assignedStaff,
      teamMembers: x.teamMembers,
      staff: x.staff,
      createdBy: x.createdBy,
      requesterUid: x.requesterUid,
    })));

    const approvedAbsences = [
      ...(permissionRequests || []),
      ...mappedLeaveRequests,
      ...mappedMissions,
      ...enrichedBusinessTripMembers,
    ];

    const allRows = generatePayrollRecap(
      mergedEmployees as any,
      activePeriod,
      attendanceEvents,
      approvedAbsences,
      brands,
      holidayDetails,
      attendanceSites || []
    );

    const divs = new Set<string>();
    allRows.forEach(r => { if (r.divisionName && r.divisionName !== '-') divs.add(r.divisionName); });

    const filtered = allRows.filter(row => {
      if (selectedBrand !== "all" && row.brandId !== selectedBrand) return false;
      if (selectedDivision !== "all" && row.divisionName !== selectedDivision) return false;
      if (searchName.trim() &&
        !row.fullName.toLowerCase().includes(searchName.toLowerCase()) &&
        !row.employeeNumber.toLowerCase().includes(searchName.toLowerCase())) return false;
      return true;
    });

    return { recapRows: filtered, uniqueDivisions: Array.from(divs).sort() };
  }, [mergedEmployees, attendanceEvents, permissionRequests, leaveRequests, businessTripMissions, businessTripMembers, brands, activePeriod, holidayDetails, attendanceSites, selectedBrand, selectedDivision, searchName]);

  // ── Summary stats ──
  const summary = useMemo(() => ({
    total: recapRows.length,
    hadir: recapRows.reduce((s, r) => s + r.hadir, 0),
    terlambat: recapRows.reduce((s, r) => s + r.terlambat, 0),
    alpha: recapRows.reduce((s, r) => s + r.alpha, 0),
    izin: recapRows.reduce((s, r) => s + r.izin, 0),
  }), [recapRows]);

  const exportPayrollSummary = () => {
    exportSummaryXlsx(recapRows, activePeriod);
  };

  // Exports using each brand's Super-Admin-mapped Excel template (never a
  // brand-name guess) — brands/{id}.payrollTemplateId + payrollSheetName.
  // `brands` here is already HRD-scoped (via useHrdScopedBrands), so this can
  // never reach a brand outside allowedBrandIds.
  const [isExportingTemplate, setIsExportingTemplate] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportSteps, setExportSteps] = useState<ExportStepState[]>(() => makeInitialExportSteps());
  const [exportErrorMessage, setExportErrorMessage] = useState<string | null>(null);
  const [showExportStepDetails, setShowExportStepDetails] = useState(false);

  const markStep = (index: number, status: ExportStepStatus) => {
    setExportSteps((prev) => prev.map((s, i) => (i === index ? { ...s, status } : i < index ? { ...s, status: "done" } : s)));
  };

  const handleExportByTemplate = async () => {
    setExportErrorMessage(null);
    setExportSteps(makeInitialExportSteps());
    setShowExportStepDetails(false);
    setExportModalOpen(true);
    setIsExportingTemplate(true);

    const fail = (stepIndex: number, message: string) => {
      markStep(stepIndex, "error");
      setExportErrorMessage(message);
    };

    try {
      // Step 1 — Validasi akses HRD
      markStep(0, "active");
      const scopedBrands = (brands || []) as Brand[];
      const targetBrands = selectedBrand === "all"
        ? scopedBrands
        : scopedBrands.filter((b) => b.id === selectedBrand);
      if (targetBrands.length === 0) {
        fail(0, "Anda tidak memiliki akses ke perusahaan ini.");
        return;
      }
      markStep(0, "done");

      // Step 2 — Mengambil data absensi (already loaded reactively into recapRows)
      markStep(1, "active");
      if (recapRows.length === 0) {
        fail(1, "Tidak ada data absensi pada periode dan filter yang dipilih.");
        return;
      }
      markStep(1, "done");

      // Step 3 — Mengambil Payroll Group & template mapping
      markStep(2, "active");
      const missingMapping = targetBrands.filter((b) => !b.payrollTemplateId || !b.payrollSheetName);
      if (missingMapping.length > 0) {
        fail(2, `Template payroll untuk ${missingMapping.map((b) => b.name).join(", ")} belum diatur. Hubungi Super Admin.`);
        return;
      }
      const byTemplate = new Map<string, Brand[]>();
      targetBrands.forEach((b) => {
        const key = b.payrollTemplateId!;
        if (!byTemplate.has(key)) byTemplate.set(key, []);
        byTemplate.get(key)!.push(b);
      });
      markStep(2, "done");

      const monthLabel = format(new Date(selectedYear, selectedMonth, 1), "MMMM_yyyy", { locale: idLocale });
      const periodTitle = `PAYROLL ${activePeriod.displayLabel.replace(/^payroll\s*/i, "").toUpperCase()}`;
      const periodRangeLabel = `${format(activePeriod.startDate, "d MMMM yyyy", { locale: idLocale })} - ${format(activePeriod.endDate, "d MMMM yyyy", { locale: idLocale })}`;
      const monthPayrollLabel = format(new Date(selectedYear, selectedMonth, 1), "MMMM yyyy", { locale: idLocale });
      // Real export timestamp, Asia/Jakarta — never hardcoded.
      const exportedAtLabel = `${new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
      }).format(new Date())} WIB`;

      for (const [templateId, brandsForTemplate] of byTemplate) {
        // Single-document read (allowed by firestore.rules for active HRD),
        // never a collection list — see the comment above the brands query.
        console.log("[PAYROLL_TEMPLATE_QUERY_DEBUG]", {
          uid: firebaseUser?.uid,
          roleKey: userProfile?.role,
          templateId,
          method: "getDoc",
          location: "attendance-payroll-recap/page.tsx:handleExportByTemplate",
        });
        const templateSnap = await getDoc(doc(firestore, "payroll_templates", templateId));
        if (!templateSnap.exists()) {
          fail(2, `Template untuk ${brandsForTemplate.map((b) => b.name).join(", ")} sudah dihapus. Hubungi Super Admin.`);
          return;
        }
        const template = { id: templateSnap.id, ...(templateSnap.data() as Omit<PayrollTemplate, "id">) };

        // Step 4 — Mengambil file template dari Google Drive
        markStep(3, "active");
        if (!firebaseUser) { fail(3, "Sesi tidak valid, silakan login ulang."); return; }
        const idToken = await firebaseUser.getIdToken();
        const response = await fetch(`/api/payroll-templates/${template.id}/download`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!response.ok) {
          const errBody = await response.json().catch(() => null);
          fail(3, errBody?.message || "Gagal mengambil file template dari Google Drive.");
          return;
        }
        const buffer = await response.arrayBuffer();
        markStep(3, "done");

        // Step 5 — Menyalin style template (loading the workbook itself
        // brings in every style/merge/column-width from the uploaded file)
        markStep(4, "active");
        const workbook = await loadTemplateWorkbook(buffer);
        markStep(4, "done");

        // Step 6 — Menulis data detail (fillPayrollTemplateSheet also builds
        // the TOTAL rows and Rekap F&A in the same pass — steps 7/8 below
        // are reported right after since there's no separate library call
        // to hang them on, not because the work hasn't happened yet).
        markStep(5, "active");
        let anyFilled = false;

        // Brands sharing one sheet (e.g. every brand in one Payroll Group)
        // MUST be filled in a single fillPayrollTemplateSheet call — that
        // function always starts writing at the template's own anchor row,
        // so calling it once per brand on the same sheet would make each
        // brand's employees overwrite the previous brand's rows instead of
        // appending after them (this was the "data kecampur" bug).
        const bySheet = new Map<string, Brand[]>();
        brandsForTemplate.forEach((b) => {
          const key = b.payrollSheetName!;
          if (!bySheet.has(key)) bySheet.set(key, []);
          bySheet.get(key)!.push(b);
        });

        for (const [sheetName, brandsForSheet] of bySheet) {
          const orderedBrandsForSheet = brandsForSheet.slice().sort((x, y) => x.name.localeCompare(y.name, "id"));
          const employees = orderedBrandsForSheet.flatMap((b) =>
            recapRows
              .filter((r) => r.brandId === b.id)
              .slice()
              .sort((x, y) => x.fullName.localeCompare(y.fullName, "id"))
              .map((row) => ({ row, days: buildPayrollTemplateDayRows(row) })),
          );
          if (employees.length === 0) continue;

          const groupIdsForSheet = new Set(orderedBrandsForSheet.map((b) => b.payrollGroupId).filter(Boolean));
          const payrollGroupLabel = groupIdsForSheet.size === 1 ? orderedBrandsForSheet[0].payrollGroupName : undefined;
          const brandNamesForSheet = orderedBrandsForSheet.map((b) => b.name);

          console.log("[SINGLE_COMPANY_EXPORT_DEBUG]", {
            brandId: orderedBrandsForSheet[0]?.id,
            brandName: orderedBrandsForSheet.map((b) => b.name).join(", "),
            payrollTemplateId: templateId,
            payrollSheetName: sheetName,
            sheetNameUsed: sheetName,
            employeeCount: employees.length,
            summaryCount: employees.length,
            firstSummary: employees[0]?.row.fullName,
          });
          if (orderedBrandsForSheet.length === 1) {
            console.log("[SINGLE_COMPANY_EMPLOYEE_DEBUG]", {
              brandId: orderedBrandsForSheet[0].id,
              brandName: orderedBrandsForSheet[0].name,
              employeeCount: employees.length,
              employeeNames: employees.map((e) => e.row.fullName),
              summaryCount: employees.length,
              summaries: employees.map((e) => ({
                fullName: e.row.fullName,
                jamDiakuiPayrollMinutes: e.row.jamDiakuiPayrollMinutes,
                jamAktualMinutes: e.row.jamAktualMinutes,
                targetPeriodeMinutes: e.row.targetPeriodeMinutes,
              })),
            });
          }

          const result = fillPayrollTemplateSheet(workbook, sheetName, employees, {
            periodTitle,
            periodRangeLabel,
            monthPayrollLabel,
            exportedAtLabel,
            companyNames: brandNamesForSheet,
            payrollGroupLabel,
          });
          if (!result.ok) {
            fail(5, `Gagal mengisi sheet "${sheetName}" untuk ${brandNamesForSheet.join(", ")}: ${result.error}`);
            return;
          }
          anyFilled = true;
        }
        markStep(5, "done");
        markStep(6, "done"); // Mengisi total karyawan
        markStep(7, "done"); // Mengisi Rekap F&A

        if (!anyFilled) continue;

        // Step 9 — Membuat file Excel
        markStep(8, "active");
        const blob = await writeWorkbookToBlob(workbook);
        markStep(8, "done");

        const codes = new Set(brandsForTemplate.map((b) => b.code || "OTHER"));
        const groupIds = new Set(brandsForTemplate.map((b) => b.payrollGroupId).filter(Boolean));
        const groupName = groupIds.size === 1 ? brandsForTemplate[0].payrollGroupName : null;
        const fileName = codes.size === 1
          ? `Payroll_${[...codes][0]}_${monthLabel}.xlsx`
          : groupName
          ? `Payroll_${groupName.replace(/\s+/g, "_")}_${monthLabel}.xlsx`
          : `Payroll_HRD_${monthLabel}.xlsx`;

        // Step 10 — Mengunduh file
        markStep(9, "active");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        markStep(9, "done");
      }

      toast({ title: "Export berhasil", description: "File payroll berhasil dibuat sesuai template dan brand yang Anda pegang." });
    } catch (error: any) {
      setExportSteps((prev) => {
        const activeIndex = prev.findIndex((s) => s.status === "active");
        const idx = activeIndex >= 0 ? activeIndex : prev.length - 1;
        return prev.map((s, i) => (i === idx ? { ...s, status: "error" } : s));
      });
      setExportErrorMessage(error.message || "Terjadi kesalahan saat export.");
      toast({ variant: "destructive", title: "Gagal export sesuai template", description: error.message });
    } finally {
      setIsExportingTemplate(false);
    }
  };

  if (!hasAccess) {
    return <DashboardLayout pageTitle="Rekap Absensi Payroll"><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  if (isLoading) {
    return <DashboardLayout pageTitle="Rekap Absensi Payroll"><Skeleton className="h-[600px] w-full" /></DashboardLayout>;
  }

  if (!isScopeConfigured) {
    return (
      <DashboardLayout pageTitle="Rekap Absensi Payroll">
        <HrdScopeEmptyState message={emptyStateMessage} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Rekap Absensi Payroll">
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Rekap Absensi Payroll
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Rekap kehadiran karyawan Web Absen
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" className="gap-2" onClick={refetchAll} title="Data ini dimuat sekali (bukan realtime) untuk menghemat kuota Firestore — klik untuk memuat ulang.">
              <RotateCcw className="h-4 w-4" />
              Muat Ulang
            </Button>
            <Button variant="outline" className="gap-2" onClick={exportPayrollSummary} disabled={recapRows.length === 0}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button
              className="gap-2"
              onClick={handleExportByTemplate}
              disabled={recapRows.length === 0 || isExportingTemplate}
              title="Export memakai template Excel resmi perusahaan (Payroll EGS/GIG), sesuai brand yang Anda pegang."
            >
              {isExportingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Export Sesuai Template Brand
            </Button>
          </div>
        </div>

        {/* ── Filter Card ── */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
          <CardContent className="pt-5 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">

              <div className="lg:col-span-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Mode</label>
                <Select value={periodMode} onValueChange={v => setPeriodMode(v as PeriodMode)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIOD_MODES.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {periodMode !== "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Bulan</label>
                  <Select value={selectedMonth.toString()} onValueChange={v => setSelectedMonth(parseInt(v))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {format(new Date(selectedYear, i, 1), "MMMM", { locale: idLocale })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {periodMode !== "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Tahun</label>
                  <Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => {
                        const y = new Date().getFullYear() - i;
                        return <SelectItem key={y} value={y.toString()}>{y}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {periodMode === "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Mulai</label>
                  <Input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="h-9 text-sm" />
                </div>
              )}

              {periodMode === "custom" && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Selesai</label>
                  <Input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="h-9 text-sm" />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Brand</label>
                {(brands?.length || 0) === 1 ? (
                  <div className="h-9 rounded-md border bg-background px-3 py-2 text-sm font-medium">
                    Perusahaan: {brands?.[0]?.name || brands?.[0]?.id}
                  </div>
                ) : (
                  <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Brand</SelectItem>
                      {brands?.map(b => (
                        <SelectItem key={b.id} value={b.id || ""}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Divisi</label>
                <Select value={selectedDivision} onValueChange={setSelectedDivision}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Divisi</SelectItem>
                    {uniqueDivisions.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 items-end sm:col-span-2 md:col-span-1">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1.5">Cari</label>
                  <Input placeholder="Nama / NIK..." value={searchName} onChange={e => setSearchName(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="shrink-0">
                  <label className="text-xs invisible block mb-1.5">&nbsp;</label>
                  <Button
                    variant="outline" size="sm" className="h-9 px-3" title="Reset filter"
                    onClick={() => {
                      setSelectedBrand("all"); setSelectedDivision("all"); setSearchName("");
                      setPeriodMode("payroll"); setSelectedMonth(new Date().getMonth());
                      setSelectedYear(new Date().getFullYear()); setCustomStartDate(""); setCustomEndDate("");
                    }}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Period Preview + disclaimer ── */}
        <div className="flex flex-col gap-1.5 px-1">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-blue-700 dark:text-blue-400">Periode Aktif:</span>{" "}
              {format(activePeriod.startDate, "d MMM yyyy", { locale: idLocale })} – {format(activePeriod.endDate, "d MMM yyyy", { locale: idLocale })}
              <span className="text-slate-400 dark:text-slate-500 ml-2 text-xs">
                ({recapRows.length} karyawan Web Absen)
              </span>
            </p>
          </div>
          {holidayDetails.length === 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>Hari kerja dihitung berdasarkan Senin–Jumat, belum termasuk kalender libur perusahaan.</span>
            </div>
          )}
        </div>

        {/* ── Summary Cards ── */}
        {recapRows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {[
              { label: "Karyawan", value: summary.total, color: "text-slate-900 dark:text-white" },
              { label: "Total Hadir", value: summary.hadir, color: "text-green-700 dark:text-green-400" },
              { label: "Terlambat", value: summary.terlambat, color: "text-orange-700 dark:text-orange-400" },
              { label: "Alpha", value: summary.alpha, color: "text-red-700 dark:text-red-400" },
              { label: "Izin", value: summary.izin, color: "text-blue-700 dark:text-blue-400" },
            ].map(card => (
              <Card key={card.label} className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Table ── */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                  <TableRow className="border-slate-200 dark:border-slate-800/50">
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 px-4 w-[220px]">Nama / NIK</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11">Brand</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11">Divisi</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Hari Kerja</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Hadir</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Terlambat</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Izin</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Cuti</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Dinas</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Alpha</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right">Total Jam</TableHead>
                    <TableHead className="text-[10px] uppercase font-black text-slate-500 h-11 text-right pr-4">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recapRows.length > 0 ? (
                    recapRows.map(row => (
                      <TableRow
                        key={row.employeeId || row.employeeNumber}
                        className="border-slate-200 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-colors"
                      >
                        <TableCell className="px-4 py-3">
                          <div className="font-medium text-sm text-slate-900 dark:text-white">{row.fullName}</div>
                          {row.employeeNumber && (
                            <div className="text-xs text-slate-500 dark:text-slate-400">NIK: {row.employeeNumber}</div>
                          )}
                          {row.isPartial && (
                            <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Partial periode</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 dark:text-slate-300">{row.brandName}</TableCell>
                        <TableCell className="text-sm text-slate-700 dark:text-slate-300">{row.divisionName}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">{row.hariKerja}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-semibold text-slate-900 dark:text-white">{row.hadir}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.terlambat > 0 ? (
                            <button
                              onClick={() => setLateDetailRow(row)}
                              title="Klik untuk lihat rincian"
                            >
                              <Badge
                                variant="outline"
                                className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800 text-xs cursor-pointer hover:bg-orange-100 transition-colors"
                              >
                                {row.terlambat}x / {row.menitTerlambat}m
                              </Badge>
                            </button>
                          ) : <span className="text-sm text-slate-400">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">
                          {row.izin || <span className="text-slate-400">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">
                          {row.cuti > 0 ? (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800 text-xs">
                              {row.cuti}
                            </Badge>
                          ) : <span className="text-slate-400">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">
                          {row.dinas > 0 ? (
                            <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800 text-xs">
                              {row.dinas}
                            </Badge>
                          ) : <span className="text-slate-400">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.alpha > 0 ? (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800">
                              {row.alpha}
                            </Badge>
                          ) : <span className="text-sm text-slate-400">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-medium text-slate-700 dark:text-slate-300">
                          <div>
                            <span className="font-semibold">{formatWorkMinutes(row.jamDiakuiPayrollMinutes)}</span>
                            <span className="text-slate-400"> / {formatWorkMinutes(row.targetBerjalanMinutes)} berjalan</span>
                          </div>
                          <div className="text-[10px] font-normal text-slate-400">
                            Target periode {formatWorkMinutes(row.targetPeriodeMinutes)}
                          </div>
                          {(row.hariBelumFinal > 0 || row.hariBelumTapOut > 0) && (
                            <div className="mt-1 flex flex-wrap justify-end gap-1">
                              {row.hariBelumTapOut > 0 && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                                  {row.hariBelumTapOut} hari perlu review
                                </Badge>
                              )}
                              {row.hariBelumFinal > row.hariBelumTapOut && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-slate-200 text-slate-500">
                                  Belum Final
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => setLateDetailRow(row)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Lihat Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-10 text-slate-500 dark:text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                          <AlertCircle className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                          <p className="text-sm">Tidak ada data karyawan Web Absen untuk periode ini</p>
                          <p className="text-xs text-slate-400">Pastikan employee_profiles sudah punya attendanceMethod = web_absen</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ── Late Details Modal ── */}
      <AttendancePayrollDetailModal
        row={lateDetailRow}
        period={activePeriod}
        open={!!lateDetailRow}
        onClose={() => setLateDetailRow(null)}
        onDecision={async (dateStr, eventId, decision, manualCheckoutTime) => {
          if (!userProfile) return;
          try {
            await setDocumentNonBlocking(
              doc(firestore, "attendance_events", eventId),
              {
                payrollDayDecision: decision,
                payrollManualCheckoutTime: decision === "manual_checkout" ? manualCheckoutTime : null,
                payrollDecisionByUid: userProfile.uid,
                payrollDecisionByName: (userProfile as any).displayName || userProfile.fullName || userProfile.email,
                payrollDecisionAt: serverTimestamp(),
              },
              { merge: true },
            );
            toast({ title: "Keputusan payroll disimpan", description: `Tanggal ${formatDateId(dateStr)} diperbarui.` });
            refetchAttendance();
          } catch (error: any) {
            toast({ variant: "destructive", title: "Gagal menyimpan keputusan", description: error.message });
          }
        }}
      />

      <Dialog open={exportModalOpen} onOpenChange={(open) => { if (!isExportingTemplate) setExportModalOpen(open); }}>
        <DialogContent
          className="sm:max-w-[420px] p-5"
          onInteractOutside={(e) => { if (isExportingTemplate) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (isExportingTemplate) e.preventDefault(); }}
        >
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base flex items-center gap-2">
              {exportErrorMessage ? (
                <><XCircle className="h-5 w-5 text-destructive" /> Export gagal</>
              ) : !isExportingTemplate ? (
                <><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Export berhasil</>
              ) : (
                "Export Sesuai Template Brand"
              )}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {exportErrorMessage
                ? `Gagal di step: ${exportSteps.find((s) => s.status === "error")?.label ?? "-"} — ${exportErrorMessage}`
                : !isExportingTemplate
                ? "File payroll berhasil dibuat."
                : "Sedang membuat file payroll..."}
            </DialogDescription>
          </DialogHeader>

          {isExportingTemplate && !exportErrorMessage && (
            <>
              <div className="flex items-center gap-3">
                <Progress
                  value={Math.round((exportSteps.filter((s) => s.status === "done").length / exportSteps.length) * 100)}
                  className="h-2 flex-1"
                />
                <span className="text-sm font-bold tabular-nums w-10 text-right">
                  {Math.round((exportSteps.filter((s) => s.status === "done").length / exportSteps.length) * 100)}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                {exportSteps.find((s) => s.status === "active")?.label ?? "Memproses..."}
              </p>
              <p className="text-xs text-muted-foreground">Memproses data absensi, template, dan rekap F&amp;A.</p>
            </>
          )}

          <button
            type="button"
            onClick={() => setShowExportStepDetails((v) => !v)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline w-fit"
          >
            {showExportStepDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Lihat detail proses
          </button>

          {showExportStepDetails && (
            <div className="space-y-1.5 max-h-56 overflow-y-auto py-1 border-t pt-2">
              {exportSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {step.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                  {step.status === "active" && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 shrink-0" />}
                  {step.status === "error" && <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                  {step.status === "pending" && <div className="h-3.5 w-3.5 rounded-full border-2 border-muted shrink-0" />}
                  <span className={
                    step.status === "done" ? "text-muted-foreground" :
                    step.status === "error" ? "text-destructive font-medium" :
                    step.status === "active" ? "font-semibold" : "text-muted-foreground/60"
                  }>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!isExportingTemplate && (
            <div className="flex justify-end pt-1">
              <Button size="sm" variant={exportErrorMessage ? "destructive" : "default"} onClick={() => setExportModalOpen(false)}>
                Tutup
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
