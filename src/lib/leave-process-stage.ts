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

// approved_by_manager/approved_by_director are legacy/defensive — the
// current manager-approval write path (manager/persetujuan-cuti/page.tsx)
// always writes "pending_hrd" on approve, never these — but older docs (or
// the pattern shared with permission/overtime approval, which DOES use
// these names) may still carry them, so they're kept here for parity with
// what the HRD workspace's "Butuh Tindakan HRD" tab already treated as
// ready-for-HRD before this file existed.
const HRD_PENDING_STATUSES = new Set([
  "pending_hrd",
  "pending_hrd_review",
  "menunggu_approval_hrd",
  "approved_by_manager",
  "approved_by_director",
]);

const APPROVED_STATUSES = new Set(["approved", "approved_by_hrd", "disetujui", "disetujui_hrd", "active_leave", "completed"]);

export function getLeaveProcessStage(request: any): LeaveProcessStage {
  const status = String(request?.status || "");

  // Legacy docs can have a replacement assigned (replacementEmployeeUid /
  // handoverEmployeeId, the older compatibility field) without ever having
  // had replacementConfirmationStatus written — those must still be treated
  // as "pending", not silently skipped to "none" (which would wrongly let
  // them read as already past this gate). "manual" is handoverEmployeeId's
  // own sentinel for "no replacement picked" (see LeaveSubmissionClient.tsx)
  // and must never count as a real assignment.
  const hasReplacement =
    Boolean(request?.replacementEmployeeUid) ||
    (Boolean(request?.handoverEmployeeId) && request.handoverEmployeeId !== "manual") ||
    Boolean(request?.replacementUid);

  const rawReplacementStatus: string =
    request?.replacementConfirmationStatus || request?.replacementConfirmation?.status || "";

  // Only infer "pending" while status hasn't progressed past the manager
  // stage yet — a request already sitting at pending_hrd/approved cleared
  // that gate somehow (however confirmation worked when it was written),
  // so inferring "pending" there would wrongly regress it backwards.
  const statusAlreadyPastManagerStage = HRD_PENDING_STATUSES.has(status) || APPROVED_STATUSES.has(status);

  const replacementStatus =
    rawReplacementStatus || (hasReplacement && !statusAlreadyPastManagerStage ? "pending" : "none");

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
