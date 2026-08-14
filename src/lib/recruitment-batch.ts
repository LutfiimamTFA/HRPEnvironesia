import type { RecruitmentBatch, RecruitmentBatchStatus } from "@/lib/types";

/**
 * Batch Magang has no Draft/Publish concept — a batch is operational data
 * (a recruitment wave), not published content like a job posting, so it's
 * saved and immediately usable. "draft" only still exists as a *legacy*
 * value some older batch docs may carry from before this changed; it is
 * never written by any code path anymore. Every place that reads a batch's
 * status for display/badge/actions/filtering should normalize through this
 * first, so a legacy "draft" doc behaves exactly like "open" everywhere —
 * no bulk migration write needed, and old docs never error out.
 */
export function normalizeBatchStatus(status: RecruitmentBatchStatus): Exclude<RecruitmentBatchStatus, "draft"> {
  return status === "draft" ? "open" : status;
}

/**
 * getBatchComputedStatus() — a pure, client-side, DISPLAY-ONLY projection of
 * where a batch "should" be today based on its registration window. It
 * never writes anything, and there is no Cloud Function/cron syncing the
 * stored `status` field from it. The stored `status` remains the single
 * source of truth HRD explicitly sets via the status-transition actions;
 * this helper only powers an optional "seharusnya: X" hint badge when
 * computed != stored, so a batch that's gone stale (e.g. registration ended
 * but nobody clicked "Tutup Pendaftaran" yet) is visible to HRD without any
 * automation silently overriding their manual choice. `closed`, `completed`,
 * and `cancelled` are manual-only statuses this function never returns —
 * callers should skip the hint badge entirely when the stored status is
 * already one of those three. A Magang batch only tracks its registration
 * window — there is no program-period concept anymore, so this never reads
 * programStartDate/programEndDate.
 */
export function getBatchComputedStatus(
  batch: Pick<RecruitmentBatch, "status" | "registrationStartDate" | "registrationEndDate">
): Exclude<RecruitmentBatchStatus, "draft"> {
  const now = new Date();
  const regStart = batch.registrationStartDate.toDate();
  const regEnd = batch.registrationEndDate.toDate();

  if (now > regEnd) return "selection";
  if (now >= regStart) return "open";
  return "open";
}

export function getBatchStatusBadgeClass(status: RecruitmentBatchStatus): string {
  switch (normalizeBatchStatus(status)) {
    case "open":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
    case "selection":
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
    case "completed":
      return "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900";
    case "closed":
      return "bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900";
  }
}

export type BatchStatusActionKey = "close_registration" | "close" | "complete" | "cancel";

export interface BatchStatusAction {
  action: BatchStatusActionKey;
  toStatus: RecruitmentBatchStatus;
  label: string;
  confirmTitle: string;
  confirmLabel: string;
  tone: "primary" | "danger";
}

/**
 * The single table driving every status-transition button, on both the list
 * row and the detail page — so the two surfaces can never expose a
 * transition one of them forgot to handle. Keyed by the NORMALIZED status
 * (no "draft" key — normalize the batch's status before indexing into this).
 */
export const BATCH_STATUS_ACTIONS: Record<Exclude<RecruitmentBatchStatus, "draft">, BatchStatusAction[]> = {
  open: [
    { action: "close_registration", toStatus: "selection", label: "Tutup Pendaftaran", confirmTitle: "Konfirmasi Tutup Pendaftaran", confirmLabel: "Ya, Tutup Pendaftaran", tone: "primary" },
    { action: "cancel", toStatus: "cancelled", label: "Batalkan", confirmTitle: "Konfirmasi Batalkan Batch", confirmLabel: "Ya, Batalkan", tone: "danger" },
  ],
  selection: [
    { action: "complete", toStatus: "completed", label: "Selesaikan Batch", confirmTitle: "Konfirmasi Selesaikan Batch", confirmLabel: "Ya, Selesaikan", tone: "primary" },
    { action: "close", toStatus: "closed", label: "Tutup Batch", confirmTitle: "Konfirmasi Tutup Batch", confirmLabel: "Ya, Tutup Batch", tone: "danger" },
  ],
  closed: [],
  completed: [],
  cancelled: [],
};
