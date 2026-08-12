"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  FileUp,
  ShieldAlert,
  CalendarDays,
  CalendarRange,
  Clock3,
  Users2,
  Gauge,
  Building2,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type LeaveRequest } from "@/lib/types";
import {
  type ReplacementConfirmationStatus,
  getReplacementStatusBadgeClass,
} from "@/lib/leave-replacement-status";

interface LeaveDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: LeaveRequest | null;
  currentUserUid: string;
  isPendingForCurrentApprover: (req: LeaveRequest, userUid: string) => boolean;
  formatSubmissionDate: (req: LeaveRequest) => string;
  formatPeriodDate: (req: LeaveRequest) => string;
  formatDuration: (req: LeaveRequest) => string;
  getRequesterLevel: (req: LeaveRequest) => string;
  getLevelBadgeClass: (level: string) => string;
  getLevelLabel: (level: string) => string;
  getStatusBadgeClass: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getTimelineStepState: (
    req: LeaveRequest,
    step: "approval" | "hrd" | "realization",
  ) => string;
  getTimelineStepDetail: (
    req: LeaveRequest,
    step: "approval" | "hrd" | "realization",
  ) => string;
  getReplacementConfirmationStatus: (req: LeaveRequest) => ReplacementConfirmationStatus;
  getReplacementBlockMessage: (req: LeaveRequest) => string | null;
  canApproveReplacementGate: (req: LeaveRequest) => boolean;
  onRequestApprove: (req: LeaveRequest) => void;
  onRequestReject: (req: LeaveRequest) => void;
  isSaving: boolean;
}

// Never render `${name || "-"} — ${phone || "-"}` directly — with only one
// of the two fields present that produces the "-- 089xxx" / "Nama --" bug.
// This is the single place that decides how the pair is joined.
function formatEmergencyContactNamePhone(name?: string | null, phone?: string | null): string {
  const cleanName = String(name || "").trim();
  const cleanPhone = String(phone || "").trim();

  if (cleanName && cleanPhone) return `${cleanName} — ${cleanPhone}`;
  if (cleanName) return cleanName;
  if (cleanPhone) return cleanPhone;
  return "Tidak ada kontak darurat";
}

const leaveTypeLabel = (type: LeaveRequest["leaveType"]) => {
  switch (type) {
    case "tahunan":
      return "Cuti Tahunan";
    case "besar":
      return "Cuti Besar";
    case "menikah":
      return "Cuti Menikah";
    case "melahirkan":
      return "Cuti Melahirkan";
    default:
      return "Cuti Tahunan";
  }
};

export function LeaveDetailModal({
  isOpen,
  onClose,
  request,
  currentUserUid,
  isPendingForCurrentApprover,
  formatSubmissionDate,
  formatPeriodDate,
  formatDuration,
  getRequesterLevel,
  getLevelBadgeClass,
  getLevelLabel,
  getStatusBadgeClass,
  getStatusLabel,
  getTimelineStepState,
  getTimelineStepDetail,
  getReplacementConfirmationStatus,
  getReplacementBlockMessage,
  canApproveReplacementGate,
  onRequestApprove,
  onRequestReject,
  isSaving,
}: LeaveDetailModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !request || !mounted) return null;

  const isPending = isPendingForCurrentApprover(request, currentUserUid);
  const isManagerApplicant = getRequesterLevel(request) !== "division_manager";
  const approvalStepLabel = isManagerApplicant
    ? `Persetujuan Manager Divisi (${request.managerName || "Atasan Langsung"})`
    : `Persetujuan Direktur/Manajemen`;

  // Single source of truth for the replacement's confirmation state — the
  // same helper the table and the staff page read, so this can never again
  // show "Belum Ada Konfirmasi" while the staff page shows "Pengganti
  // Bersedia" (that mismatch was caused by this modal previously checking
  // for a status value of "confirmed" that the write path never actually
  // writes — it writes "accepted").
  const replacementStatus = getReplacementConfirmationStatus(request);
  const replacementBlockMessage = getReplacementBlockMessage(request);
  const canApprove = canApproveReplacementGate(request);
  const replacementStatusBadgeClass = getReplacementStatusBadgeClass(replacementStatus.tone);

  const timelineDotClass = (state: string) => {
    switch (state) {
      case "completed":
        return "bg-emerald-500";
      case "current":
        return "bg-amber-500 animate-pulse";
      case "rejected":
        return "bg-red-500";
      case "revision":
        return "bg-orange-500";
      default:
        return "bg-slate-300 dark:bg-slate-700";
    }
  };

  const getTimelineStepLabel = (step: "approval" | "hrd" | "realization") => {
    if (step === "approval") return approvalStepLabel;
    if (step === "hrd") return "Verifikasi & Approval HRD";
    return "Realisasi Cuti";
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest">
      {children}
    </p>
  );

  // Mini overview cards — a manager should be able to catch the essentials
  // at a glance right under the header, before reading any detailed
  // section. "Pengganti" always reads through the same
  // getReplacementConfirmationStatus() result as section C and the table,
  // so this card can never disagree with the rest of the page.
  const miniCards = [
    {
      key: "status",
      label: "Status Saat Ini",
      icon: Gauge,
      value: getStatusLabel(request.status),
      valueClassName: "text-sm",
    },
    {
      key: "leaveType",
      label: "Jenis Cuti",
      icon: CalendarDays,
      value: leaveTypeLabel(request.leaveType),
      valueClassName: "text-sm",
    },
    {
      key: "duration",
      label: "Durasi",
      icon: Clock3,
      value: formatDuration(request),
      valueClassName: "text-sm",
    },
    {
      key: "replacement",
      label: "Pengganti",
      icon: Users2,
      value: request.handoverEmployeeName ? replacementStatus.label : "-",
      valueClassName: "text-sm truncate",
    },
    {
      key: "period",
      label: "Periode Cuti",
      icon: CalendarRange,
      value: formatPeriodDate(request),
      valueClassName: "text-xs",
    },
    {
      key: "brandDivision",
      label: "Brand / Divisi",
      icon: Building2,
      value: `${request.brandName || "-"} / ${request.divisionName || "-"}`,
      valueClassName: "text-xs truncate",
    },
  ];

  // z-40 — deliberately BELOW the shared shadcn Dialog's z-50 (see
  // components/ui/dialog.tsx). The Setujui/Tolak confirmation dialog is a
  // shadcn Dialog opened on top of this modal while it's still open; with
  // this modal previously at z-[9999] its own backdrop painted over the
  // confirmation dialog's overlay+content, so clicking Setujui/Tolak just
  // showed a dark screen with nothing on it. z-40 still comfortably beats
  // ordinary page content (z-auto/low z-index), so this modal still renders
  // above the table/filters as before.
  return createPortal(
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
      {/* Box Modal — fixed height + flex-col so the sticky footer never gets
          pushed off-screen and the body is the only scrollable region. */}
      <div className="w-full max-w-6xl h-[85vh] max-h-[85vh] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden flex flex-col text-slate-900 dark:text-slate-100 shadow-xl">
        {/* Header — shrink */}
        <div className="shrink-0 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-6 py-5 z-20">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                  Tinjau Pengajuan Cuti
                </span>
                <Badge
                  variant="outline"
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStatusBadgeClass(request.status)}`}
                >
                  {getStatusLabel(request.status)}
                </Badge>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                {request.employeeName}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400 font-semibold">
                <Badge
                  className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${getLevelBadgeClass(
                    getRequesterLevel(request),
                  )}`}
                >
                  {getLevelLabel(getRequesterLevel(request))}
                </Badge>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="font-bold text-slate-900 dark:text-slate-200">
                  {leaveTypeLabel(request.leaveType)}
                </span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                  {formatDuration(request)}
                </span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span>{request.brandName || "-"} / {request.divisionName || "-"}</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mini overview cards — shrink */}
        <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {miniCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.key}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3 flex items-start gap-2.5 min-w-0"
                >
                  <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">
                      {card.label}
                    </p>
                    <p className={`font-semibold text-slate-900 dark:text-slate-100 ${card.valueClassName}`}>
                      {card.value}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Body — scroll */}
        <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-5">
          {/* A. Informasi Pengajuan */}
          <div className="space-y-2">
            <SectionTitle>A. Ringkasan Pengajuan</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-1">
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Jenis Cuti
                </p>
                <p className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                  {leaveTypeLabel(request.leaveType)}
                </p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-1">
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Brand / Divisi
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-200">
                  {request.brandName || "-"} / {request.divisionName || "-"}
                </p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-1">
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Waktu Pengajuan
                </p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {formatSubmissionDate(request)}
                </p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-1">
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Periode Cuti
                </p>
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {formatPeriodDate(request)}
                </p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-1 md:col-span-2">
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Durasi
                </p>
                <p className="text-sm font-black text-slate-900 dark:text-slate-100">
                  {formatDuration(request)}
                </p>
              </div>
            </div>
          </div>

          {/* B. Detail Cuti */}
          <div className="space-y-2">
            <SectionTitle>B. Alasan &amp; Alamat Selama Cuti</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Alamat Selama Cuti
                </p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 h-full">
                  {request.leaveAddress || "-"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Catatan / Alasan Pengajuan
                </p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 h-full">
                  {request.reason || "-"}
                </p>
              </div>
            </div>
            {request.attachmentUrl && (
              <Button
                variant="outline"
                asChild
                className="w-full rounded-xl border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <a href={request.attachmentUrl} target="_blank" rel="noopener noreferrer">
                  <FileUp className="mr-2 h-4 w-4" /> Lihat Dokumen Pendukung
                </a>
              </Button>
            )}
          </div>

          {/* C. Delegasi / Handover */}
          <div className="p-4 bg-indigo-50 dark:bg-indigo-950/10 rounded-2xl border border-indigo-200 dark:border-indigo-900/20 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">
                C. Delegasi / Handover
              </p>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${replacementStatusBadgeClass}`}>
                {replacementStatus.label}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase">
                  Pengganti Sementara
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-200 mt-1">
                  {request.handoverEmployeeName || "-"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase">
                  Jabatan Pengganti
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-200 mt-1">
                  {request.handoverEmployeePosition || "-"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase">
                  Kontak Darurat
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-200 mt-1">
                  {formatEmergencyContactNamePhone(request.emergencyContactName, request.emergencyContactPhone)}
                </p>
              </div>
            </div>
            <div className="space-y-1 pt-2 border-t border-indigo-200 dark:border-indigo-900/10">
              <p className="text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                Catatan Serah Terima Tugas
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-300 bg-indigo-100/30 dark:bg-slate-950/50 p-3 rounded-lg border border-indigo-200 dark:border-slate-800/80">
                {request.handoverNotes || "-"}
              </p>
            </div>
            {replacementBlockMessage && (
              <div className="flex items-start gap-2 pt-2 border-t border-indigo-200 dark:border-indigo-900/10 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{replacementBlockMessage}</span>
              </div>
            )}
          </div>

          {/* D. Timeline Approval */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800/80 space-y-4">
            <SectionTitle>D. Timeline Approval</SectionTitle>
            <div className="relative pl-6 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-300 dark:before:bg-slate-800">
              <div className="relative">
                <div className="absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full bg-emerald-500 ring-4 ring-slate-50 dark:ring-slate-900" />
                <div className="text-xs font-bold text-slate-900 dark:text-slate-200">
                  Pengajuan Dibuat
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-500 font-medium mt-0.5">
                  {formatSubmissionDate(request)}
                </div>
              </div>

              {/* Konfirmasi Pengganti — reads the exact same
                  replacementStatus as section C and the mini card above, so
                  this step can never say "Menunggu" while the rest of the
                  modal already reads "Pengganti Bersedia". */}
              {request.handoverEmployeeName && (
                <div className="relative">
                  <div
                    className={`absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full ring-4 ring-slate-50 dark:ring-slate-900 ${timelineDotClass(
                      replacementStatus.key === "accepted"
                        ? "completed"
                        : replacementStatus.key === "declined"
                          ? "rejected"
                          : "current",
                    )}`}
                  />
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-200">
                    Konfirmasi Pengganti
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                    {replacementStatus.label}
                  </div>
                </div>
              )}

              {(["approval", "hrd", "realization"] as const).map((step) => {
                const state = getTimelineStepState(request, step);
                const detail = getTimelineStepDetail(request, step);
                const label = getTimelineStepLabel(step);

                return (
                  <div key={step} className="relative">
                    <div
                      className={`absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full ring-4 ring-slate-50 dark:ring-slate-900 ${timelineDotClass(
                        state,
                      )}`}
                    />
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-200">
                      {label}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                      {detail}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* E. Keputusan Manager — informational only; the actual Setujui/
              Tolak buttons live exclusively in the sticky footer below, never
              here, so a decision can never be triggered from inside the
              scrollable body. */}
          {isPending && (
            <div className="space-y-2">
              <SectionTitle>E. Keputusan Manager</SectionTitle>
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 text-sm text-slate-600 dark:text-slate-400">
                Setelah meninjau seluruh informasi di atas, gunakan tombol{" "}
                <span className="font-bold text-red-600 dark:text-red-400">Tolak</span> atau{" "}
                <span className="font-bold text-emerald-600 dark:text-emerald-400">Setujui</span>{" "}
                pada bagian bawah untuk memberikan keputusan. Anda dapat menambahkan catatan pada dialog konfirmasi.
              </div>
            </div>
          )}
        </div>

        {/* Footer — shrink, sticky at the bottom of the flex column. All
            decisions happen here only — never from the table or scattered
            in the body. */}
        <div className="shrink-0 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:justify-end gap-2 z-20">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="h-10 rounded-xl font-bold border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Tutup
          </Button>
          {isPending && (
            <>
              <Button
                onClick={() => onRequestReject(request)}
                disabled={isSaving}
                className="h-10 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 gap-1.5"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Tolak
              </Button>
              <Button
                onClick={() => onRequestApprove(request)}
                disabled={isSaving || !canApprove}
                title={!canApprove ? (replacementBlockMessage || undefined) : undefined}
                className="h-10 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 gap-1.5"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Setujui
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
