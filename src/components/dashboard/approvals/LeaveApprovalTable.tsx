"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, CheckCircle2, Search, Inbox } from "lucide-react";
import { type LeaveRequest } from "@/lib/types";
import { getReplacementConfirmationStatus, getReplacementStatusBadgeClass } from "@/lib/leave-replacement-status";

interface LeaveApprovalTableProps {
  items: LeaveRequest[];
  mode: "pending" | "history";
  title: string;
  onSelect: (req: LeaveRequest) => void;
  getRequesterLevel: (req: LeaveRequest) => string;
  getLevelBadgeClass: (level: string) => string;
  getLevelLabel: (level: string) => string;
  getStatusBadgeClass: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getRowAccentClass: (status: string) => string;
  formatDuration: (req: LeaveRequest) => string;
  formatPeriodDate: (req: LeaveRequest) => string;
  getSubmissionDateParts: (req: LeaveRequest) => { day: string; time: string };
  getPeriodDateParts: (req: LeaveRequest) => { start: string; end: string };
  hasInvalidApproverPending?: boolean;
  activeFilterCount: number;
  onResetFilters: () => void;
}

// Reusable, tab-specific table — the same component renders the "Butuh
// Persetujuan Saya" (mode="pending") and "Riwayat Keputusan" (mode="history")
// tab content so the columns, badges, and (crucially) the replacement-status
// source can never drift apart between the two views. Neither mode ever
// renders a Setujui/Tolak button — every decision happens inside the detail
// modal via onSelect.
export function LeaveApprovalTable({
  items,
  mode,
  title,
  onSelect,
  getRequesterLevel,
  getLevelBadgeClass,
  getLevelLabel,
  getStatusBadgeClass,
  getStatusLabel,
  getRowAccentClass,
  formatDuration,
  formatPeriodDate,
  getSubmissionDateParts,
  getPeriodDateParts,
  hasInvalidApproverPending,
  activeFilterCount,
  onResetFilters,
}: LeaveApprovalTableProps) {
  const actionLabel = mode === "pending" ? "Tinjau" : "Detail";

  const EmptyState = ({ compact = false }: { compact?: boolean }) => {
    const isFiltered = activeFilterCount > 0;
    const Icon = isFiltered ? Search : mode === "pending" ? CheckCircle2 : Inbox;
    const iconToneClass =
      isFiltered
        ? "bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-600"
        : mode === "pending"
          ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500"
          : "bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-600";
    const title = isFiltered
      ? "Tidak ada pengajuan cuti ditemukan."
      : mode === "pending"
        ? "Belum ada pengajuan yang menunggu persetujuan Anda."
        : "Belum ada riwayat keputusan cuti yang diproses.";
    const subtitle = isFiltered
      ? "Coba ubah filter atau pilih periode lain."
      : mode === "pending"
        ? "Semua pengajuan sudah diproses. Anda akan melihatnya di sini saat ada pengajuan baru."
        : "Riwayat keputusan yang sudah diproses akan muncul di sini.";

    return (
      <div className={`flex flex-col items-center justify-center gap-3 text-center ${compact ? "py-8" : "py-16"}`}>
        <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${iconToneClass}`}>
          <Icon className="h-6 w-6" />
        </div>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-500 max-w-xs">{subtitle}</p>
        {isFiltered && (
          <Button variant="outline" size="sm" onClick={onResetFilters} className="rounded-xl mt-1 border-slate-300 dark:border-slate-700">
            Reset Filter
          </Button>
        )}
        {mode === "pending" && hasInvalidApproverPending && (
          <p className="text-xs text-amber-600 dark:text-amber-450 mt-2">
            Pengajuan belum memiliki approver valid. Cek data atasan langsung.
          </p>
        )}
      </div>
    );
  };

  return (
    <Card className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
      <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-4 bg-slate-50 dark:bg-slate-900/50">
        <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-700 dark:text-slate-400 flex items-center gap-2">
          {title}
          <Badge className="bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-300 border border-slate-300 dark:border-slate-700 font-black text-xs rounded-full px-2.5 py-0.5">
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 bg-white dark:bg-slate-950">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto w-full">
          <Table className="w-full min-w-[1080px] border-collapse bg-white dark:bg-slate-950">
            <TableHeader className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
              <TableRow className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900">
                <TableHead className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pengaju</TableHead>
                <TableHead className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Unit Kerja</TableHead>
                <TableHead className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Jenis Cuti</TableHead>
                <TableHead className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tanggal Pengajuan</TableHead>
                <TableHead className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Periode Cuti</TableHead>
                <TableHead className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Durasi</TableHead>
                <TableHead className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pengganti Sementara</TableHead>
                <TableHead className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</TableHead>
                <TableHead className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length > 0 ? (
                items.map((r) => {
                  const subDate = getSubmissionDateParts(r);
                  const period = getPeriodDateParts(r);
                  const replacement = getReplacementConfirmationStatus(r);
                  return (
                    <TableRow
                      key={r.id}
                      onClick={() => onSelect(r)}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors border-b border-slate-200 dark:border-slate-800/80 cursor-pointer ${getRowAccentClass(r.status)}`}
                    >
                      <TableCell className="px-5 py-4 align-top text-sm">
                        <div className="space-y-1">
                          <span className="text-slate-900 dark:text-slate-100 font-bold block">{r.employeeName}</span>
                          <Badge className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${getLevelBadgeClass(getRequesterLevel(r))}`}>
                            {getLevelLabel(getRequesterLevel(r))}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-4 align-top text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <div className="space-y-0.5">
                          <p className="text-slate-900 dark:text-slate-100">{r.brandName || "-"}</p>
                          <p className="text-slate-600 dark:text-slate-400 text-xs">{r.divisionName || "-"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-4 align-top text-sm font-bold text-indigo-600 dark:text-indigo-400 capitalize">
                        Cuti{" "}
                        {r.leaveType === "tahunan"
                          ? "Tahunan"
                          : r.leaveType === "besar"
                            ? "Besar"
                            : r.leaveType === "menikah"
                              ? "Menikah"
                              : r.leaveType === "melahirkan"
                                ? "Melahirkan"
                                : "Tahunan"}
                      </TableCell>
                      <TableCell className="px-5 py-4 align-top text-sm text-slate-700 dark:text-slate-300">
                        <p className="font-semibold text-slate-900 dark:text-slate-200">{subDate.day}</p>
                        {subDate.time && <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{subDate.time}</p>}
                      </TableCell>
                      <TableCell className="px-5 py-4 align-top text-sm text-slate-700 dark:text-slate-300">
                        <p className="font-semibold text-slate-900 dark:text-slate-200">{period.start}</p>
                        <p className="text-slate-600 dark:text-slate-400 text-xs mt-0.5">{period.end}</p>
                      </TableCell>
                      <TableCell className="px-5 py-4 align-top font-bold text-slate-900 dark:text-slate-200 text-sm">
                        {formatDuration(r)}
                      </TableCell>
                      <TableCell className="px-5 py-4 align-top text-sm text-slate-700 dark:text-slate-300">
                        <p className="font-bold text-slate-900 dark:text-slate-200">{r.handoverEmployeeName || "-"}</p>
                        {r.handoverEmployeePosition && (
                          <p className="text-slate-600 dark:text-slate-400 text-xs mt-0.5">{r.handoverEmployeePosition}</p>
                        )}
                        {r.handoverEmployeeName && (
                          <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${getReplacementStatusBadgeClass(replacement.tone)}`}>
                            {replacement.label}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-4 align-top">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}>
                          {getStatusLabel(r.status)}
                        </span>
                      </TableCell>
                      <TableCell className="px-5 py-4 align-top text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant={mode === "pending" ? "outline" : "ghost"}
                          size="sm"
                          onClick={() => onSelect(r)}
                          className={
                            mode === "pending"
                              ? "rounded-xl border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold text-xs gap-1"
                              : "rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-bold text-xs gap-1"
                          }
                        >
                          <Eye className="h-3.5 w-3.5" /> {actionLabel}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9}>
                    <EmptyState />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card List */}
        <div className="block md:hidden space-y-4 px-4 py-4 bg-slate-100 dark:bg-slate-900/20">
          {items.length > 0 ? (
            items.map((r) => {
              const replacement = getReplacementConfirmationStatus(r);
              return (
                <div
                  key={r.id}
                  onClick={() => onSelect(r)}
                  className={`p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 cursor-pointer ${getRowAccentClass(r.status)}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-black text-slate-900 dark:text-slate-100 text-base">{r.employeeName}</p>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
                        {r.divisionName || "N/A"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}
                    >
                      {getStatusLabel(r.status)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs py-3 border-y border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider block mb-0.5">Jenis Cuti</span>
                      <span className="font-black text-indigo-600 dark:text-indigo-400 capitalize">
                        {r.leaveType === "tahunan"
                          ? "Cuti Tahunan"
                          : r.leaveType === "besar"
                            ? "Cuti Besar"
                            : r.leaveType === "menikah"
                              ? "Cuti Menikah"
                              : r.leaveType === "melahirkan"
                                ? "Cuti Melahirkan"
                                : "Cuti Tahunan"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Durasi</span>
                      <span className="font-bold text-slate-900 dark:text-slate-200">{formatDuration(r)}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Periode Cuti</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-300">{formatPeriodDate(r)}</span>
                    </div>
                    {r.handoverEmployeeName && (
                      <div className="col-span-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Pengganti Sementara</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-300">{r.handoverEmployeeName}</span>{" "}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${getReplacementStatusBadgeClass(replacement.tone)}`}>
                          {replacement.label}
                        </span>
                      </div>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(r);
                    }}
                    className="w-full rounded-xl flex items-center gap-2 justify-center font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2"
                  >
                    <Eye className="h-3.5 w-3.5" /> {actionLabel}
                  </Button>
                </div>
              );
            })
          ) : (
            <EmptyState compact />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
