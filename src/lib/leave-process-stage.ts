/**
 * getLeaveProcessStage() — the single place that turns a leave_requests doc's
 * raw `status` (plus the separate replacement-confirmation state) into the
 * human-facing stage every page (Staff, Manager approval, HRD workspace)
 * must agree on. `status` alone is not enough: a doc can sit at
 * "pending_manager_review" while its named replacement hasn't confirmed yet
 * — displaying "Menunggu Persetujuan Atasan" at that point is misleading,
 * since the request hasn't actually reached the atasan's queue in spirit
 * (and per the approval-gating rules, in practice too). Replacement
 * confirmation is checked FIRST, before the manager/HRD status buckets,
 * exactly because it's the earliest gate in the real workflow.
 */
export type LeaveProcessStageKey =
  | "replacement_pending"
  | "replacement_rejected"
  | "manager_pending"
  | "hrd_pending"
  | "approved"
  | "unknown";

export type LeaveProcessStage = {
  stage: LeaveProcessStageKey;
  label: string;
  actor: string;
  hrdCanApprove: boolean;
  managerCanApprove: boolean;
};

const MANAGER_PENDING_STATUSES = new Set([
  "pending_manager",
  "pending_manager_review",
  "pending_director",
  "pending_director_review",
  "pending_supervisor",
  "menunggu_approval_atasan",
  "menunggu_persetujuan_atasan",
]);

const HRD_PENDING_STATUSES = new Set(["pending_hrd", "pending_hrd_review", "menunggu_approval_hrd"]);

const APPROVED_STATUSES = new Set(["approved", "approved_by_hrd", "disetujui", "disetujui_hrd", "active_leave", "completed"]);

export function getLeaveProcessStage(request: any): LeaveProcessStage {
  const replacementStatus =
    request?.replacementConfirmationStatus || request?.replacementConfirmation?.status || "none";
  const status = String(request?.status || "");

  if (replacementStatus === "pending") {
    return {
      stage: "replacement_pending",
      label: "Menunggu Konfirmasi Pengganti",
      actor: "Pengganti Sementara",
      hrdCanApprove: false,
      managerCanApprove: false,
    };
  }

  if (replacementStatus === "rejected") {
    return {
      stage: "replacement_rejected",
      label: "Pengganti Menolak",
      actor: "Pengaju",
      hrdCanApprove: false,
      managerCanApprove: false,
    };
  }

  if (MANAGER_PENDING_STATUSES.has(status)) {
    return {
      stage: "manager_pending",
      label: "Menunggu Persetujuan Atasan",
      actor: "Manager Divisi",
      hrdCanApprove: false,
      managerCanApprove: true,
    };
  }

  if (HRD_PENDING_STATUSES.has(status)) {
    return {
      stage: "hrd_pending",
      label: "Menunggu Verifikasi HRD",
      actor: "HRD",
      hrdCanApprove: true,
      managerCanApprove: false,
    };
  }

  if (APPROVED_STATUSES.has(status)) {
    return {
      stage: "approved",
      label: "Disetujui HRD",
      actor: "Selesai",
      hrdCanApprove: false,
      managerCanApprove: false,
    };
  }

  return {
    stage: "unknown",
    label: status || "Status tidak diketahui",
    actor: "-",
    hrdCanApprove: false,
    managerCanApprove: false,
  };
}
