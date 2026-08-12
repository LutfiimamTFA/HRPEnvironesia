/**
 * getReplacementConfirmationStatus() — the single place every page (Staff,
 * Manager approval, HRD workspace) must read a leave request's
 * replacement-confirmation state from. Before this existed, the manager
 * approval modal checked for a status value of "confirmed" while the write
 * path (LeaveSubmissionClient.tsx's accept/decline handlers) always writes
 * "accepted" — so a replacement who had genuinely confirmed still showed as
 * "Belum Ada Konfirmasi" in the manager's modal while the staff page
 * correctly showed "Pengganti Bersedia". Every reader must go through this
 * helper so a future field rename only has to happen in one place.
 */
export type ReplacementStatusKey = "accepted" | "declined" | "pending";
export type ReplacementStatusTone = "success" | "danger" | "warning";

export interface ReplacementConfirmationStatus {
  key: ReplacementStatusKey;
  label: string;
  tone: ReplacementStatusTone;
}

const ACCEPTED_VALUES = new Set([
  "accepted",
  "approved",
  "confirmed",
  "available",
  "bersedia",
  "pengganti_bersedia",
  "replacement_accepted",
  "handover_accepted",
]);

const DECLINED_VALUES = new Set([
  "declined",
  "rejected",
  "not_available",
  "tidak_bersedia",
  "pengganti_tidak_bersedia",
  "replacement_declined",
  "handover_declined",
]);

export function getReplacementConfirmationStatus(request: any): ReplacementConfirmationStatus {
  const rawStatus =
    request?.replacementConfirmationStatus ||
    request?.temporaryReplacementStatus ||
    request?.substituteConfirmationStatus ||
    request?.handoverConfirmationStatus ||
    request?.delegateConfirmationStatus ||
    request?.replacementStatus ||
    request?.handoverStatus ||
    request?.substituteStatus ||
    request?.replacementConfirmation?.status ||
    request?.temporaryReplacementConfirmation?.status ||
    request?.substituteConfirmation?.status ||
    "";

  const acceptedAt =
    request?.replacementAcceptedAt ||
    request?.handoverAcceptedAt ||
    request?.substituteAcceptedAt ||
    request?.replacementConfirmation?.acceptedAt ||
    request?.temporaryReplacementConfirmation?.acceptedAt ||
    request?.substituteConfirmation?.acceptedAt ||
    null;

  const declinedAt =
    request?.replacementDeclinedAt ||
    request?.handoverDeclinedAt ||
    request?.substituteDeclinedAt ||
    request?.replacementConfirmation?.declinedAt ||
    request?.temporaryReplacementConfirmation?.declinedAt ||
    request?.substituteConfirmation?.declinedAt ||
    null;

  const normalized = String(rawStatus || "").toLowerCase().trim();

  if (
    acceptedAt ||
    request?.replacementConfirmed === true ||
    request?.temporaryReplacementConfirmed === true ||
    request?.substituteConfirmed === true ||
    ACCEPTED_VALUES.has(normalized)
  ) {
    return { key: "accepted", label: "Pengganti Bersedia", tone: "success" };
  }

  if (
    declinedAt ||
    request?.replacementConfirmed === false ||
    request?.temporaryReplacementConfirmed === false ||
    request?.substituteConfirmed === false ||
    DECLINED_VALUES.has(normalized)
  ) {
    return { key: "declined", label: "Pengganti Menolak", tone: "danger" };
  }

  return { key: "pending", label: "Menunggu Konfirmasi", tone: "warning" };
}

export function getReplacementStatusBadgeClass(tone: ReplacementStatusTone): string {
  switch (tone) {
    case "success":
      return "bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400";
    case "danger":
      return "bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400";
    case "warning":
    default:
      return "bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400";
  }
}
