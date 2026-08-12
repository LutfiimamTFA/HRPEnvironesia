import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, Send, Info, ExternalLink } from "lucide-react";
import {
  OvertimeSubmission,
  isFinalStatus,
  isActionableStatus,
} from "@/lib/types";
import { OvertimeApprovalStatusBadge } from "./OvertimeApprovalStatusBadge";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, updateDocumentNonBlocking } from "@/firebase";
import {
  doc,
  serverTimestamp,
  collection,
  addDoc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { sendNotification, sendHrdNotification } from "@/lib/notifications";
import {
  canCurrentUserApproveOvertime,
  getOvertimeStatusLabel,
  getOvertimeAnomalyLabels,
  getOvertimeMainStatusLabel,
  getCurrentUserOvertimeRoles, getReviewerRoleDisplayLabel,
  getCurrentEmployeeProfile,
  getDisplayPosition,
  getResolvedEmployeeDivision,
  getResolvedManagerName,
  isOvertimeAfterManagerApproval,
} from "@/lib/overtime-utils";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type EvidenceItem, isImageEvidence, collectJobEvidence, collectSubmissionOnlyEvidence,
  EvidenceThumbnailGrid, EvidenceLightbox, openEvidenceInNewTab,
} from "@/components/dashboard/karyawan/OvertimeEvidencePreview";

interface ReviewOvertimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: OvertimeSubmission;
  onSuccess: () => void;
  mode: "manager" | "hrd";
  dailyTotalMinutes?: number;
  employeeMap?: Map<string, any>;
}

const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value?: string | number;
}) => (
  <div className="flex justify-between text-sm">
    <p className="text-muted-foreground">{label}</p>
    <p className="font-medium text-right">{value ?? "-"}</p>
  </div>
);

const workLocationLabels: Record<string, string> = {
  kantor: "Kantor",
  rumah_wfh: "Rumah / WFH",
  luar_kantor: "Luar Kantor",
  site_klien: "Site / Lokasi Klien",
  lainnya: "Lainnya",
  remote: "Rumah / WFH",
  site: "Site / Lokasi Klien",
};

const DAILY_LIMIT_MINUTES = 240;

type HrdApprovalChoice =
  | "full_approved_override"
  | "partial_approved"
  | "";

const getWorkLocationDisplay = (submission: OvertimeSubmission) => {
  const rawLocation =
    (submission as any).workLocation || submission.location || "kantor";
  const label =
    workLocationLabels[rawLocation] ||
    submission.workLocationLabel ||
    rawLocation;
  const detail = (submission as any).workLocationDetail?.trim?.();
  return rawLocation === "lainnya" && detail ? `${label} - ${detail}` : label;
};

const SummaryTile = ({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </p>
    <p className="mt-1 text-sm font-bold leading-5 text-slate-900">
      {value || "-"}
    </p>
  </div>
);

export function ReviewOvertimeDialog({
  open,
  onOpenChange,
  submission,
  onSuccess,
  mode,
  dailyTotalMinutes = 0,
  employeeMap = new Map(),
}: ReviewOvertimeDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showProxyDialog, setShowProxyDialog] = useState(false);
  const [proxyMethod, setProxyMethod] = useState("lisan");
  const [proxyNote, setProxyNote] = useState("");
  const [revisionNote, setRevisionNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  // Manager mode no longer opens a separate dialog just to collect a note
  // (see handleApprove/handleDecision below) — this is the inline "Catatan
  // Manager (opsional)" field shown in the main modal body instead. Kept
  // separate from hrdNotes, which stays HRD-mode-only, so the two review
  // roles' notes are never accidentally conflated.
  const [managerNoteInput, setManagerNoteInput] = useState("");
  const [hrdHours, setHrdHours] = useState(0);
  const [hrdMinutes, setHrdMinutes] = useState(0);
  const [hrdNotes, setHrdNotes] = useState("");
  const [overLimitDecision, setOverLimitDecision] =
    useState<HrdApprovalChoice>("");
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [previewFile, setPreviewFile] = useState<EvidenceItem | null>(null);

  const handleOpenEvidence = (file: EvidenceItem) => {
    if (isImageEvidence(file)) {
      setPreviewFile(file);
      return;
    }
    openEvidenceInNewTab(file, (message) => {
      toast({ variant: "destructive", title: "Gagal Membuka Bukti", description: message });
    }, submission.id);
  };

  const formatMinutesToHuman = (minutes: number): string => {
    if (!minutes) return "0 menit";
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0 && mins > 0) return `${hrs} jam ${mins} menit`;
    if (hrs > 0) return `${hrs} jam`;
    return `${mins} menit`;
  };

  useEffect(() => {
    if (open && submission) {
      const requestedMinutes = Number(
        (submission as any).durationMinutes ||
          submission.totalDurationMinutes ||
          (submission as any).totalJobDurationMinutes ||
          0,
      );
      const savedDecision = submission.overLimitDecision;
      const initialDecision: HrdApprovalChoice =
        savedDecision === "partial_approved"
          ? "partial_approved"
          : savedDecision === "full_approved" ||
              savedDecision === "full_approved_override"
            ? "full_approved_override"
            : requestedMinutes > DAILY_LIMIT_MINUTES
              ? "partial_approved"
              : "full_approved_override";
      const initialMinutes =
        submission.approvedMinutesFinal !== undefined &&
        submission.approvedMinutesFinal !== null
          ? submission.approvedMinutesFinal
          : initialDecision === "partial_approved"
            ? Math.min(requestedMinutes, DAILY_LIMIT_MINUTES)
            : requestedMinutes;
      setHrdHours(Math.floor(initialMinutes / 60));
      setHrdMinutes(initialMinutes % 60);
      setHrdNotes(submission.hrdNotes || "");
      setRevisionNote(submission.revisionNote || "");
      setRejectionReason(submission.rejectionReason || "");
      setOverLimitDecision(initialDecision);
      setManagerNoteInput(submission.managerNotes || "");
    }
  }, [open, submission]);

  const parseSafeDate = (value: any): Date | null => {
    if (!value) return null;
    if (typeof value === "object" && typeof value.toDate === "function") {
      return value.toDate();
    }
    if (typeof value === "string" || value instanceof Date) {
      return new Date(value);
    }
    return null;
  };

  const resolvedStatus =
    (submission as any).approvalStatus || submission.status || "draft";
  const isCoordinatorReview =
    mode === "manager" && resolvedStatus === "pending_coordinator";
  // Current flow submissions carry a real jobs[] array (Daftar Pekerjaan
  // Lembur — multiple distinct pieces of work per submission); older docs
  // only ever had a single taskDetails[]/tasks[] list. Map jobs[] into the
  // same {description, estimatedMinutes} shape so the existing table below
  // keeps working for both, with a richer per-job output/evidence panel
  // added separately for jobs[] submissions only.
  // submission.jobs is already properly typed as OvertimeJobItem[] on
  // OvertimeSubmission — casting through `as any` here (as this used to)
  // collapsed every downstream .map()/.reduce() on `tasks`/`jobs` to an
  // implicit `any`, which is what noImplicitAny was flagging below.
  const rawJobs = Array.isArray(submission.jobs) ? submission.jobs : [];
  const jobs = rawJobs.length > 0 ? rawJobs : null;
  const legacyTasks = (submission as any).taskDetails || (submission as any).tasks || [];
  const tasks = jobs
    ? jobs.map((job: any) => ({
        description: job.title || job.description || job.task || "Pekerjaan lembur",
        estimatedMinutes:
          job.estimatedDurationMinutes || job.estimatedMinutes || job.durationMinutes || 0,
        actualMinutes: job.actualMinutes ?? null,
      }))
    : (Array.isArray(legacyTasks) ? legacyTasks : []).map((task: any) =>
        typeof task === "string"
          ? { description: task, estimatedMinutes: 0, actualMinutes: null }
          : {
              description: task.description || task.title || task.task || "Pekerjaan lembur",
              estimatedMinutes:
                task.estimatedMinutes || task.estimatedDurationMinutes || task.durationMinutes || 0,
              actualMinutes: task.actualMinutes ?? null,
            },
      );
  const submittedDurationMinutes = Number(
    (submission as any).durationMinutes ||
      submission.totalDurationMinutes ||
      (submission as any).totalJobDurationMinutes ||
      0,
  );
  const overtimeReason =
    (submission as any).overtimeReason ||
    submission.reason ||
    (submission as any).reasonDetail ||
    "Tidak ada alasan tambahan.";
  const legacyWorkOutput =
    (submission as any).workOutput || jobs?.[0]?.workOutput || "";
  const currentEmployee = getCurrentEmployeeProfile(submission, employeeMap);
  const resolvedDivision = getResolvedEmployeeDivision(submission, employeeMap);
  const resolvedManagerName = getResolvedManagerName(submission, employeeMap);
  const currentPosition = currentEmployee
    ? getDisplayPosition(currentEmployee)
    : submission.workRole || submission.positionTitle || (submission as any).position;
  const totalEstimatedMinutes = tasks.reduce(
    (sum, task) => sum + (task.estimatedMinutes || 0),
    0,
  );
  // "Output & Bukti per Pekerjaan" above already shows each job's own
  // evidence — this is only the extra evidence attached at the submission
  // level that isn't already covered under a job, so nothing repeats.
  const submissionOnlyEvidence = collectSubmissionOnlyEvidence(submission);
  const submittedAt =
    parseSafeDate((submission as any).submittedAt ?? submission.createdAt) ||
    new Date();
  const overtimeDate =
    parseSafeDate((submission as any).overtimeDate ?? submission.date) || null;
  const managerDecisionAt = parseSafeDate(
    submission.managerDecisionAt || submission.supervisorApprovedAt,
  );
  const isFinal = isFinalStatus(resolvedStatus);

  useEffect(() => {
    if (!open || mode !== "hrd") return;
    console.log("[HRD_OVERTIME_DETAIL_MODAL_DEBUG]", {
      submissionId: submission?.id,
      employeeUid: submission?.employeeUid,
      employeeName: submission?.employeeName,
      submissionDivisionId: submission?.divisionId,
      submissionDivisionName: submission?.divisionName,
      resolvedDivision: getResolvedEmployeeDivision(submission, employeeMap),
      status: submission?.status,
      approvalStatus: (submission as any)?.approvalStatus,
      currentApprovalStep: (submission as any)?.currentApprovalStep,
      jobs: (submission as any)?.jobs,
      evidenceFiles: (submission as any)?.evidenceFiles,
      attachments: (submission as any)?.attachments,
      durationMinutes: (submission as any)?.durationMinutes,
      totalDurationMinutes: submission?.totalDurationMinutes,
    });
  }, [employeeMap, mode, open, submission]);

  const getCanActStrict = () => {
    if (isFinal) return false;
    if (!userProfile) return false;
    if (mode === "manager") {
      if (
        resolvedStatus === "pending_coordinator" ||
        resolvedStatus === "submitted" ||
        resolvedStatus === "pending_manager_review" ||
        resolvedStatus === "pending_supervisor" ||
        resolvedStatus === "pending_manager" ||
        resolvedStatus === "pending_atasan" ||
        resolvedStatus === "revision_manager"
      ) {
        return canCurrentUserApproveOvertime(submission, userProfile.uid);
      }
    }
    if (mode === "hrd") {
      return ["pending_hrd_review", "pending_hrd", "approved_by_manager", "revision_hrd", "revision_requested_by_hrd", "verified_manager"].includes(resolvedStatus);
    }
    return false;
  };

  const canAct = getCanActStrict();
  const operatorName = userProfile?.fullName || userProfile?.email || "";
  // Display only — approval rights never come from these roles directly,
  // they're derived from getCanActStrict() above. Surfaces e.g. Daniel being
  // BOTH the real atasan and the coordinator on the same submission, instead
  // of the header implying he's only one or the other.
  const reviewerRoles = mode === "manager" ? getCurrentUserOvertimeRoles(submission, userProfile?.uid) : [];
  const reviewerRoleLabel = reviewerRoles.length > 0 ? getReviewerRoleDisplayLabel(reviewerRoles) : null;
  const mainStatusLabel = getOvertimeMainStatusLabel(submission);
  const isAfterManagerApproval = isOvertimeAfterManagerApproval(submission);
  const anomalyLabels = getOvertimeAnomalyLabels(submission, userProfile?.uid);

  const isManagerOrHrd = mode === "hrd" || (userProfile && (submission.directSupervisorUid === userProfile.uid || submission.managerUid === userProfile.uid));
  const canRecordProxyApproval = resolvedStatus === "pending_coordinator" && !!isManagerOrHrd && submission.overtimeCoordinatorUid !== userProfile?.uid;

  const getApprovalStatusLabel = (status: string) => getOvertimeStatusLabel(status);

  const workLocationLabel = getWorkLocationDisplay(submission);

  const overtimeTypeLabel =
    submission.overtimeTypeLabel ||
    (submission.overtimeType === "hari_kerja"
      ? "Hari Kerja"
      : submission.overtimeType === "hari_libur"
        ? "Hari Libur"
        : submission.overtimeType === "urgent"
          ? "Urgent"
          : submission.overtimeType || "-");

  const getTimelineBadgeClass = (state: string) => {
    if (state === "Selesai") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (state === "Ditolak") return "border-red-200 bg-red-50 text-red-700";
    if (state === "Revisi") return "border-orange-200 bg-orange-50 text-orange-700";
    return "border-amber-200 bg-amber-50 text-amber-700";
  };

  const isNewFlowStatus = [
    "draft", "submitted", "pending_manager_review", "approved_by_manager",
    "pending_hrd_review", "approved_by_hrd", "rejected_by_manager",
    "rejected_by_hrd", "revision_requested", "cancelled",
  ].includes(resolvedStatus);

  // Current flow — no coordinator stage, so the timeline is a clean 4 steps.
  const newFlowTimelineSteps = [
    {
      title: "Pengajuan Dibuat",
      reviewer: submission.employeeName || submission.fullName || "Karyawan",
      state: "Selesai",
    },
    {
      title: "Validasi Atasan",
      reviewer: submission.taskAssignerName || (submission as any).overtimeCoordinatorName || submission.directSupervisorName || "Atasan",
      state:
        resolvedStatus === "submitted" || resolvedStatus === "pending_manager_review" ? "Menunggu"
        : resolvedStatus === "rejected_by_manager" ? "Ditolak"
        : resolvedStatus === "revision_requested" && submission.revisionRequestedAtStage !== "hrd" ? "Revisi"
        : ["approved_by_manager", "pending_hrd_review", "approved_by_hrd"].includes(resolvedStatus) ? "Selesai"
        : "Menunggu",
    },
    {
      title: "Verifikasi HRD",
      reviewer: submission.hrdReviewedByName || "Tim HRD",
      state:
        resolvedStatus === "pending_hrd_review" || resolvedStatus === "approved_by_manager" ? "Menunggu"
        : resolvedStatus === "rejected_by_hrd" ? "Ditolak"
        : resolvedStatus === "revision_requested" && submission.revisionRequestedAtStage === "hrd" ? "Revisi"
        : resolvedStatus === "approved_by_hrd" ? "Selesai"
        : "Menunggu",
    },
    {
      title: "Selesai",
      reviewer: getApprovalStatusLabel(resolvedStatus),
      state:
        resolvedStatus === "approved_by_hrd" ? "Selesai"
        : resolvedStatus.includes("rejected") ? "Ditolak"
        : resolvedStatus === "revision_requested" ? "Revisi"
        : "Menunggu",
    },
  ];

  const legacyTimelineSteps = [
    {
      title: "Pengajuan Dibuat",
      reviewer: submission.employeeName || submission.fullName || "Karyawan",
      state: "Selesai",
    },
    {
      title: "Review Koordinator/Pengawas",
      reviewer: (submission as any).overtimeCoordinatorName || "Koordinator/Pengawas",
      state:
        resolvedStatus === "pending_coordinator"
          ? "Menunggu"
          : resolvedStatus.includes("rejected") &&
              (submission as any).rejected_by_coordinator
            ? "Ditolak"
            : resolvedStatus.includes("revision") &&
                resolvedStatus.includes("coordinator")
              ? "Revisi"
              : submission.coordinatorApprovedAt ||
                  resolvedStatus === "pending_supervisor" ||
                  resolvedStatus === "pending_manager" ||
                  resolvedStatus === "pending_hrd" ||
                  resolvedStatus === "approved_by_manager" ||
                  resolvedStatus === "approved" ||
                  resolvedStatus === "approved_hrd"
                ? "Selesai"
                : "Menunggu",
    },
    {
      title: "Review Manager Divisi",
      reviewer:
        submission.supervisorApprovedByName ||
        submission.directSupervisorName ||
        "Manager Divisi",
      state:
        resolvedStatus === "pending_supervisor" ||
        resolvedStatus === "pending_manager"
          ? "Menunggu"
          : resolvedStatus === "revision_manager"
            ? "Revisi"
            : resolvedStatus === "rejected_manager"
              ? "Ditolak"
              : submission.supervisorApprovedAt ||
                  resolvedStatus === "pending_hrd" ||
                  resolvedStatus === "approved_by_manager" ||
                  resolvedStatus === "approved" ||
                  resolvedStatus === "approved_hrd"
                ? "Selesai"
                : "Menunggu",
    },
    {
      title: "Review HRD",
      reviewer: "Final approval",
      state:
        resolvedStatus === "pending_hrd" || resolvedStatus === "approved_by_manager"
          ? "Menunggu"
          : resolvedStatus === "revision_hrd"
            ? "Revisi"
            : resolvedStatus === "rejected_hrd"
              ? "Ditolak"
              : resolvedStatus === "approved" || resolvedStatus === "approved_hrd"
                ? "Selesai"
                : "Menunggu",
    },
    {
      title: "Selesai",
      reviewer: getApprovalStatusLabel(resolvedStatus),
      state:
        resolvedStatus === "approved" || resolvedStatus === "approved_hrd"
          ? "Selesai"
          : resolvedStatus.includes("rejected")
            ? "Ditolak"
            : resolvedStatus.includes("revision")
              ? "Revisi"
              : "Menunggu",
    },
  ];

  const approvalTimelineSteps = isNewFlowStatus ? newFlowTimelineSteps : legacyTimelineSteps;

  const handleDecision = async (
    decision: "approve" | "reject" | "revise",
    note?: string,
  ) => {
    if (!userProfile) return;
    if (!submission.id) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Submission ID tidak ditemukan.",
      });
      return;
    }

    if (!canAct) {
      toast({
        variant: "destructive",
        title: "Aksi Ditolak",
        description:
          "Pengajuan ini sudah final atau tidak lagi dapat diproses.",
      });
      return;
    }

    try {
      const submissionRef = doc(
        firestore,
        "overtime_submissions",
        submission.id!,
      );
      let payload: any = {};
      const isManagerAction = mode === "manager";
      const isCoordinatorAction =
        isManagerAction && resolvedStatus === "pending_coordinator";

      if (isManagerAction) {
        if (isCoordinatorAction) {
          const coordinatorUid = submission.overtimeCoordinatorUid;
          const managerUid = submission.managerUid || submission.directSupervisorUid || submission.supervisorUid;
          const isSame = !!(coordinatorUid && managerUid && coordinatorUid === managerUid);

          if (decision === "approve") {
            if (isSame) {
              payload = {
                approvalStatus: "pending_hrd_review",
                status: "pending_hrd_review",
                currentApprovalStep: "hrd",
                currentApproverUid: "",
                approvalTargetUid: "",
                waitingForUid: "",
                waitingForRole: "hrd",
                waitingForName: "Tim HRD",
                coordinatorDecision: "approved",
                coordinatorDecisionAt: serverTimestamp() as any,
                coordinatorDecisionBy: userProfile.uid,
                coordinatorDecisionByName: userProfile.fullName || userProfile.email || operatorName || null,
                supervisorApprovedAt: serverTimestamp() as any,
                supervisorApprovedBy: userProfile.uid,
                supervisorApprovedByName: userProfile.fullName || userProfile.email || operatorName || null,
                coordinatorNotes: note || null,
                managerNotes: note || null,
                managerDecisionAt: serverTimestamp() as any,
                managerDecision: "approved",
                managerReviewedAt: serverTimestamp() as any,
                managerReviewedBy: userProfile.uid,
                managerReviewedByName: operatorName || null,
                updatedAt: serverTimestamp() as any,
              };
            } else {
              payload = {
                approvalStatus: "pending_supervisor",
                status: "pending_supervisor",
                coordinatorDecision: "approved",
                coordinatorDecisionAt: serverTimestamp() as any,
                coordinatorDecisionBy: userProfile.uid,
                coordinatorDecisionByName: userProfile.fullName || userProfile.email || operatorName || null,
                coordinatorApprovedAt: serverTimestamp() as any,
                coordinatorApprovedBy: userProfile.uid,
                coordinatorApprovedByName: userProfile.fullName || userProfile.email || operatorName || null,
                coordinatorNotes: note || null,
              };
            }
          } else if (decision === "reject") {
            payload = {
              approvalStatus: "rejected_by_coordinator",
              status: "rejected_by_coordinator",
              rejectedAt: serverTimestamp() as any,
              rejectedBy: userProfile.uid,
              rejectionReason: note || null,
              coordinatorDecision: "rejected",
              coordinatorDecisionAt: serverTimestamp() as any,
            } as any;
          } else if (decision === "revise") {
            payload = {
              approvalStatus: "revision_requested_by_coordinator",
              status: "revision_requested_by_coordinator",
              revisionRequestedAt: serverTimestamp() as any,
              revisionRequestedBy: userProfile.uid,
              revisionNote: note || null,
              coordinatorDecision: "revision",
              coordinatorDecisionAt: serverTimestamp() as any,
            } as any;
          }
        } else {
          // Current flow (no coordinator stage) — every new submission and
          // any legacy pending_supervisor/pending_manager doc lands here.
          if (decision === "approve") {
            payload = {
              approvalStatus: "pending_hrd_review",
              status: "pending_hrd_review",
              currentApprovalStep: "hrd",
              // HRD review isn't scoped to one specific uid the way manager
              // review is (any HRD user in the brand's scope can act), so
              // there's no single uid to point currentApproverUid/
              // waitingForUid at — only the role.
              currentApproverUid: "",
              approvalTargetUid: "",
              waitingForUid: "",
              waitingForName: "Tim HRD",
              waitingForRole: "hrd",
              supervisorApprovedAt: serverTimestamp() as any,
              supervisorApprovedBy: userProfile.uid,
              supervisorApprovedByName: operatorName || null,
              managerNotes: note || null,
              managerDecisionAt: serverTimestamp() as any,
              managerDecision: "approved",
              managerReviewedAt: serverTimestamp() as any,
              managerReviewedBy: userProfile.uid,
              managerReviewedByName: operatorName || null,
              updatedAt: serverTimestamp() as any,
            };
          } else if (decision === "reject") {
            payload = {
              approvalStatus: "rejected_by_manager",
              status: "rejected_by_manager",
              rejectedAt: serverTimestamp() as any,
              rejectedBy: userProfile.uid,
              rejectionReason: note || null,
              managerDecisionAt: serverTimestamp() as any,
              managerDecision: "rejected",
              managerReviewedAt: serverTimestamp() as any,
              managerReviewedBy: userProfile.uid,
              managerReviewedByName: operatorName || null,
              managerNotes: note || null,
            };
          }
          // No "revise" case here — manager alur is Setujui/Tolak only (see
          // the footer above, which no longer renders "Minta Revisi" for
          // mode === "manager"). handleDecision("revise", ...) is only ever
          // called from the HRD branch below now.
        }
      } else {
        let status: OvertimeSubmission["status"] =
          resolvedStatus as OvertimeSubmission["status"];
        if (decision === "approve") status = "approved_by_hrd";
        else if (decision === "reject") status = "rejected_by_hrd";
        else if (decision === "revise") status = "revision_requested";

        const finalApprovedMinutes = decision === "approve" ? approvedMinutesFinal : null;
        payload = {
          status,
          approvalStatus: status,
          hrdReviewerUid: userProfile.uid,
          hrdNotes: note || null,
          hrdDecisionAt: serverTimestamp() as any,
          hrdDecision: decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "revision_requested",
          hrdReviewedAt: serverTimestamp() as any,
          hrdReviewedBy: userProfile.uid,
          hrdReviewedByName: operatorName || null,
          ...(decision === "revise" && { revisionRequestedAtStage: "hrd", revisionReason: note || null }),
          approvedMinutesFinal: finalApprovedMinutes,
          // Payroll duration audit fields
          ...(decision === "approve" && {
            isOverDailyLimit: isOverLimit,
            dailyOvertimeLimitMinutes: DAILY_LIMIT_MINUTES,
            overtimeRequestedMinutes: submittedDurationMinutes,
            overtimeApprovedMinutes: finalApprovedMinutes,
            overtimeRejectedMinutes: rejectedMinutes,
            overtimeExcessMinutes: excessMinutes,
            overLimitDecision:
              overLimitDecision || "full_approved_override",
            hrdOverLimitNote: isOverLimit ? note || null : null,
          }),
        };

        // Create payroll recap & update employee history if approved by HRD
        if (decision === "approve") {
          const payrollMonth = overtimeDate
            ? format(overtimeDate, "yyyy-MM")
            : format(new Date(), "yyyy-MM");
          const workMode = workLocationLabel;

          const taskSummary = tasks
            .map((t: any) => t.description)
            .filter(Boolean)
            .join("; ");

          const recapColRef = collection(firestore, "overtime_payroll_recaps");
          console.log("[OVERTIME_PAYROLL_RECAP_PAYLOAD_DEBUG]", {
            employeeId: submission.employeeUid || submission.uid,
            brandId: submission.brandId,
            brandName: submission.brandName,
          });
          await addDoc(recapColRef, {
            employeeId: submission.employeeUid || submission.uid!,
            employeeName: submission.employeeName || submission.fullName || "",
            brand: submission.brandName || "",
            // brandId is what firestore.rules' hrdCanReadBrandData() and the
            // HRD-scoped list query both key off — without it an HRD account
            // can never read this doc back (list/get denied), which is what
            // caused "Missing or insufficient permissions" on this collection.
            brandId: submission.brandId || "",
            brandName: submission.brandName || "",
            companyId: submission.brandId || "",
            companyName: submission.brandName || "",
            createdByUid: userProfile.uid,
            updatedByUid: userProfile.uid,
            updatedAt: serverTimestamp(),
            division: submission.divisionName || submission.division || "",
            managerId:
              submission.directSupervisorUid || submission.supervisorUid || "",
            managerName:
              submission.directSupervisorName ||
              submission.supervisorName ||
              "",
            overtimeDate: overtimeDate
              ? format(overtimeDate, "yyyy-MM-dd")
              : format(new Date(), "yyyy-MM-dd"),
            startTime: submission.startTime || "",
            endTime: submission.endTime || "",
            submittedMinutes: submittedDurationMinutes,
            estimatedMinutes: totalEstimatedMinutes,
            managerApprovedMinutes: submittedDurationMinutes,
            hrdApprovedMinutes: approvedMinutesFinal,
            overtimeRequestedMinutes: submittedDurationMinutes,
            overtimeApprovedMinutes: approvedMinutesFinal,
            overtimeRejectedMinutes: rejectedMinutes,
            location: workLocationLabel,
            workMode,
            taskSummary,
            reason: submission.reason || "",
            payrollMonth,
            payrollStatus: "pending_payroll",
            approvedByHrd: operatorName,
            approvedAt: serverTimestamp(),
            // Over-limit fields for rekap payroll
            isOverDailyLimit: isOverLimit,
            dailyOvertimeLimitMinutes: DAILY_LIMIT_MINUTES,
            overtimeExcessMinutes: excessMinutes,
            overLimitDecision:
              overLimitDecision || "full_approved_override",
            hrdOverLimitNote: isOverLimit ? (note || null) : null,
          });

          // Append to employee's overtimeHistory
          const empId = submission.employeeUid || submission.uid!;
          const historyItem = {
            date: overtimeDate ? format(overtimeDate, "yyyy-MM-dd") : "-",
            startTime: submission.startTime || "",
            endTime: submission.endTime || "",
            approvedMinutesFinal: approvedMinutesFinal,
            status: "approved_hrd",
            location: workLocationLabel,
            notes: note || "",
            timestamp: new Date().toISOString(),
          };

          await updateDoc(doc(firestore, "employees", empId), {
            overtimeHistory: arrayUnion(historyItem),
          }).catch((err) => console.error("Error employees history:", err));

          await updateDoc(doc(firestore, "employee_profiles", empId), {
            overtimeHistory: arrayUnion(historyItem),
          }).catch((err) =>
            console.error("Error employee_profiles history:", err),
          );
        }
      }

      await updateDocumentNonBlocking(submissionRef, payload);

      try {
        if (isManagerAction) {
          if (isCoordinatorAction) {
            if (decision === "approve") {
              const coordinatorUid = submission.overtimeCoordinatorUid;
              const managerUid = submission.managerUid || submission.directSupervisorUid || submission.supervisorUid;
              const isSame = !!(coordinatorUid && managerUid && coordinatorUid === managerUid);

              if (isSame) {
                await Promise.all([
                  sendHrdNotification(firestore, {
                    type: "status_update",
                    module: "employee",
                    title: "Pengajuan Lembur Diteruskan ke HRD",
                    message: `${submission.employeeName || submission.fullName} telah disetujui oleh koordinator (merangkap manager) dan menunggu review HRD.`,
                    targetType: "employee",
                    targetId: submission.id || "",
                    actionUrl: "/admin/hrd/persetujuan-lembur",
                    createdBy: userProfile.uid,
                    meta: {
                      submissionId: submission.id,
                      employeeUid: submission.employeeUid || submission.uid,
                    },
                  }),
                  sendNotification(firestore, {
                    userId: submission.employeeUid || submission.uid!,
                    type: "status_update",
                    module: "employee",
                    title: "Pengajuan Lembur Diteruskan ke HRD",
                    message:
                      "Pengajuan lembur Anda telah disetujui oleh koordinator (merangkap manager) dan sedang menunggu persetujuan HRD.",
                    targetType: "user",
                    targetId: submission.id || "",
                    actionUrl: "/admin/karyawan/pengajuan-lembur",
                    createdBy: userProfile.uid,
                  }),
                ]);
              } else {
                await Promise.all([
                  managerUid
                    ? sendNotification(firestore, {
                        userId: managerUid,
                        type: "status_update",
                        module: "employee",
                        title: "Pengajuan Lembur Diteruskan ke Manager Divisi",
                        message: note
                          ? `Koordinator menyetujui pengajuan lembur dan meneruskannya ke manager: ${note}`
                          : "Pengajuan lembur telah disetujui oleh koordinator dan sedang menunggu review manager.",
                        targetType: "user",
                        targetId: submission.id || "",
                        actionUrl: "/admin/manager/persetujuan-lembur",
                        createdBy: userProfile.uid,
                      })
                    : Promise.resolve(),
                  sendNotification(firestore, {
                    userId: submission.employeeUid || submission.uid!,
                    type: "status_update",
                    module: "employee",
                    title: "Pengajuan Lembur Diteruskan ke Manager Divisi",
                    message:
                      "Pengajuan lembur Anda telah disetujui oleh koordinator dan sedang menunggu review manager.",
                    targetType: "user",
                    targetId: submission.id || "",
                    actionUrl: "/admin/karyawan/pengajuan-lembur",
                    createdBy: userProfile.uid,
                  }),
                ]);
              }
            } else if (decision === "reject") {
              await sendNotification(firestore, {
                userId: submission.employeeUid || submission.uid!,
                type: "status_update",
                module: "employee",
                title: "Pengajuan Lembur Ditolak oleh Koordinator",
                message: note
                  ? `Koordinator menolak pengajuan lembur Anda: ${note}`
                  : "Koordinator menolak pengajuan lembur Anda.",
                targetType: "user",
                targetId: submission.id || "",
                actionUrl: "/admin/karyawan/pengajuan-lembur",
                createdBy: userProfile.uid,
              });
            } else if (decision === "revise") {
              await sendNotification(firestore, {
                userId: submission.employeeUid || submission.uid!,
                type: "status_update",
                module: "employee",
                title: "Revisi Pengajuan Lembur Diperlukan",
                message: note
                  ? `Koordinator meminta revisi: ${note}`
                  : "Koordinator meminta revisi untuk pengajuan lembur Anda.",
                targetType: "user",
                targetId: submission.id || "",
                actionUrl: "/admin/karyawan/pengajuan-lembur",
                createdBy: userProfile.uid,
              });
            }
          } else {
            if (decision === "approve") {
              await Promise.all([
                sendHrdNotification(firestore, {
                  type: "status_update",
                  module: "employee",
                  title: "Pengajuan Lembur Diteruskan ke HRD",
                  message: `${submission.employeeName || submission.fullName} telah disetujui oleh manager dan menunggu review HRD.`,
                  targetType: "employee",
                  targetId: submission.id || "",
                  actionUrl: "/admin/hrd/persetujuan-lembur",
                  createdBy: userProfile.uid,
                  meta: {
                    submissionId: submission.id,
                    employeeUid: submission.employeeUid || submission.uid,
                  },
                }),
                sendNotification(firestore, {
                  userId: submission.employeeUid || submission.uid!,
                  type: "status_update",
                  module: "employee",
                  title: "Pengajuan Lembur Diteruskan ke HRD",
                  message:
                    "Pengajuan lembur Anda telah disetujui oleh manager dan sedang menunggu persetujuan HRD.",
                  targetType: "user",
                  targetId: submission.id || "",
                  actionUrl: "/admin/karyawan/pengajuan-lembur",
                  createdBy: userProfile.uid,
                }),
              ]);
            } else if (decision === "reject") {
              await sendNotification(firestore, {
                userId: submission.employeeUid || submission.uid!,
                type: "status_update",
                module: "employee",
                title: "Pengajuan Lembur Ditolak oleh Manager Divisi",
                message: note
                  ? `Manager Divisi menolak pengajuan lembur Anda: ${note}`
                  : "Manager Divisi menolak pengajuan lembur Anda.",
                targetType: "user",
                targetId: submission.id || "",
                actionUrl: "/admin/karyawan/pengajuan-lembur",
                createdBy: userProfile.uid,
              });
            } else if (decision === "revise") {
              await sendNotification(firestore, {
                userId: submission.employeeUid || submission.uid!,
                type: "status_update",
                module: "employee",
                title: "Revisi Pengajuan Lembur Diperlukan",
                message: note
                  ? `Manager meminta revisi: ${note}`
                  : "Manager meminta revisi untuk pengajuan lembur Anda.",
                targetType: "user",
                targetId: submission.id || "",
                actionUrl: "/admin/karyawan/pengajuan-lembur",
                createdBy: userProfile.uid,
              });
            }
          }
        } else {
          const titles = {
            approve: "Pengajuan Lembur Disetujui HRD",
            reject: "Pengajuan Lembur Ditolak oleh HRD",
            revise: "HRD Meminta Revisi Pengajuan Lembur",
          };
          const messages = {
            approve:
              "HRD telah menyetujui secara final pengajuan lembur Anda untuk payroll.",
            reject: note
              ? `HRD menolak pengajuan lembur Anda: ${note}`
              : "HRD menolak pengajuan lembur Anda.",
            revise: note
              ? `HRD meminta revisi: ${note}`
              : "HRD meminta revisi untuk pengajuan lembur Anda.",
          };

          // Notify employee
          await sendNotification(firestore, {
            userId: submission.employeeUid || submission.uid!,
            type: "status_update",
            module: "employee",
            title: titles[decision],
            message: messages[decision],
            targetType: "user",
            targetId: submission.id || "",
            actionUrl: "/admin/karyawan/pengajuan-lembur",
            createdBy: userProfile.uid,
          });

          // Notify Manager who reviewed/approved it
          const managerUid =
            submission.directSupervisorUid ||
            submission.supervisorUid ||
            submission.supervisorApprovedBy;
          if (managerUid) {
            const managerTitles = {
              approve: `Lembur ${submission.employeeName || submission.fullName} Disetujui HRD`,
              reject: `Lembur ${submission.employeeName || submission.fullName} Ditolak HRD`,
              revise: `Lembur ${submission.employeeName || submission.fullName} Diminta Revisi oleh HRD`,
            };
            const managerMessages = {
              approve: `Pengajuan lembur staff Anda telah disetujui HRD dan masuk ke rekap payroll.`,
              reject: `Pengajuan lembur staff Anda ditolak oleh HRD. Catatan: ${note || "-"}`,
              revise: `Pengajuan lembur staff Anda meminta revisi oleh HRD. Catatan: ${note || "-"}`,
            };

            await sendNotification(firestore, {
              userId: managerUid,
              type: "status_update",
              module: "employee",
              title: managerTitles[decision],
              message: managerMessages[decision],
              targetType: "user",
              targetId: submission.id || "",
              actionUrl: "/admin/manager/persetujuan-lembur",
              createdBy: userProfile.uid,
            });
          }
        }
      } catch (notificationError) {
        console.error("Gagal mengirim notifikasi", notificationError);
      }

      let toastDesc = "";
      if (decision === "approve") {
        if (mode === "hrd") {
          toastDesc = "Pengajuan lembur berhasil disetujui secara final & masuk rekap payroll.";
        } else if (isCoordinatorAction) {
          const coordinatorUid = submission.overtimeCoordinatorUid;
          const managerUid = submission.managerUid || submission.directSupervisorUid || submission.supervisorUid;
          const isSame = !!(coordinatorUid && managerUid && coordinatorUid === managerUid);
          toastDesc = isSame 
            ? "Pengajuan lembur berhasil disetujui dan langsung diteruskan ke HRD."
            : "Pengajuan lembur berhasil disetujui dan diteruskan ke Manager Divisi.";
        } else {
          toastDesc = "Pengajuan lembur berhasil disetujui dan diteruskan ke HRD.";
        }
      } else {
        toastDesc = `Pengajuan telah ${decision === "reject" ? "ditolak" : "diminta revisi"}.`;
      }

      toast({
        title: "Keputusan Disimpan",
        description: toastDesc,
      });
      onSuccess();
      onOpenChange(false);
      setShowRevisionDialog(false);
      setShowRejectDialog(false);
      setRevisionNote("");
      setRejectionReason("");
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Keputusan",
        description: e.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const enteredApprovedMinutes = hrdHours * 60 + Number(hrdMinutes || 0);
  const approvedMinutesFinal =
    overLimitDecision === "full_approved_override"
      ? submittedDurationMinutes
      : enteredApprovedMinutes;
  const rejectedMinutes = Math.max(
    0,
    submittedDurationMinutes - approvedMinutesFinal,
  );
  const isDurationChanged =
    approvedMinutesFinal !== submittedDurationMinutes;
  const isOverLimit = submittedDurationMinutes > DAILY_LIMIT_MINUTES;
  const excessMinutes = Math.max(
    0,
    submittedDurationMinutes - DAILY_LIMIT_MINUTES,
  );
  const isApprovedDurationInvalid =
    approvedMinutesFinal <= 0 ||
    approvedMinutesFinal > submittedDurationMinutes;
  const isHrdNoteRequired =
    overLimitDecision === "partial_approved" ||
    (overLimitDecision === "full_approved_override" && isOverLimit) ||
    isDurationChanged;
  const partialPreviewMinutes =
    overLimitDecision === "partial_approved"
      ? approvedMinutesFinal
      : Math.min(submittedDurationMinutes, DAILY_LIMIT_MINUTES);
  const approvalChoiceLabel =
    overLimitDecision === "partial_approved"
      ? "Setujui Sebagian"
      : "Setujui Penuh";

  const handleHrdApprovalChoiceChange = (choice: HrdApprovalChoice) => {
    setOverLimitDecision(choice);
    const nextApprovedMinutes =
      choice === "partial_approved"
        ? Math.min(submittedDurationMinutes, DAILY_LIMIT_MINUTES)
        : submittedDurationMinutes;
    setHrdHours(Math.floor(nextApprovedMinutes / 60));
    setHrdMinutes(nextApprovedMinutes % 60);
    // Temporary debug — remove once footer position is confirmed stable.
    console.log("[OVERTIME_DIALOG_LAYOUT_STATE]", {
      choice,
      overLimitDecision: choice,
      isPartialApproved: choice === "partial_approved",
      isFullApproved: choice === "full_approved_override",
    });
  };

  const handleApprove = () => {
    if (mode === "hrd" && !overLimitDecision) {
      toast({
        variant: "destructive",
        title: "Pilih Jenis Persetujuan",
        description:
          "Pilih apakah durasi disetujui penuh atau disesuaikan untuk payroll.",
      });
      return;
    }
    if (mode === "hrd" && approvedMinutesFinal <= 0) {
      toast({
        variant: "destructive",
        title: "Durasi Tidak Valid",
        description:
          "Durasi yang disetujui harus lebih dari 0 menit.",
      });
      return;
    }
    if (
      mode === "hrd" &&
      approvedMinutesFinal > submittedDurationMinutes
    ) {
      toast({
        variant: "destructive",
        title: "Durasi Tidak Valid",
        description:
          "Durasi disetujui tidak boleh lebih besar dari durasi pengajuan.",
      });
      return;
    }
    if (mode === "hrd" && isHrdNoteRequired && !hrdNotes.trim()) {
      const isFullOverride =
        overLimitDecision === "full_approved_override" && isOverLimit;
      toast({
        variant: "destructive",
        title: "Catatan HRD Wajib Diisi",
        description: isFullOverride
          ? "Catatan HRD wajib diisi karena HRD menyetujui durasi melebihi acuan harian."
          : "Catatan HRD wajib diisi karena durasi payroll berbeda dari durasi pengajuan.",
      });
      return;
    }
    setShowApproveDialog(true);
  };

  const handleApproveConfirm = async () => {
    setShowApproveDialog(false);
    setIsSaving(true);
    await handleDecision("approve", mode === "hrd" ? hrdNotes : managerNoteInput);
  };

  const handleRevisionSubmit = async () => {
    const finalNote = revisionNote.trim() || hrdNotes.trim();
    if (!finalNote) {
      toast({
        variant: "destructive",
        title: "Catatan Diperlukan",
        description: "Harap isi catatan revisi.",
      });
      return;
    }
    setIsSaving(true);
    await handleDecision("revise", finalNote);
  };

  const handleRejectSubmit = async () => {
    const finalNote = rejectionReason.trim() || (mode === "hrd" ? hrdNotes.trim() : managerNoteInput.trim());
    if (!finalNote) {
      toast({
        variant: "destructive",
        title: "Alasan Diperlukan",
        description: "Harap isi alasan penolakan.",
      });
      return;
    }
    setIsSaving(true);
    await handleDecision("reject", finalNote);
  };

  const handleProxySubmit = async () => {
    if (!userProfile) return;
    if (!submission.id) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Submission ID tidak ditemukan.",
      });
      return;
    }

    const note = proxyNote.trim();
    if (!note) {
      toast({
        variant: "destructive",
        title: "Catatan Diperlukan",
        description: "Harap isi catatan konfirmasi manual.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const submissionRef = doc(firestore, "overtime_submissions", submission.id);
      
      const payload = {
        approvalStatus: "pending_supervisor",
        status: "pending_supervisor",
        coordinatorDecision: "approved_manual",
        coordinatorApprovedByProxy: true,
        coordinatorProxyApprovedBy: userProfile.uid,
        coordinatorProxyApprovedByName: userProfile.fullName || userProfile.email || operatorName || "Manager",
        coordinatorProxyNote: note,
        coordinatorProxyMethod: proxyMethod,
        coordinatorApprovedAt: serverTimestamp() as any,
        coordinatorApprovedBy: userProfile.uid,
        coordinatorApprovedByName: (submission as any).overtimeCoordinatorName || "Koordinator",
      };

      await updateDocumentNonBlocking(submissionRef, payload);

      // Send notifications
      try {
        const managerUid = submission.managerUid || submission.directSupervisorUid || submission.supervisorUid;
        await Promise.all([
          managerUid
            ? sendNotification(firestore, {
                userId: managerUid,
                type: "status_update",
                module: "employee",
                title: "Konfirmasi Koordinator Dicatat (Proxy)",
                message: `${operatorName} mencatat konfirmasi manual dari koordinator. Pengajuan kini menunggu persetujuan Anda sebagai Manager Divisi.`,
                targetType: "user",
                targetId: submission.id || "",
                actionUrl: "/admin/manager/persetujuan-lembur",
                createdBy: userProfile.uid,
              })
            : Promise.resolve(),
          sendNotification(firestore, {
            userId: submission.employeeUid || submission.uid!,
            type: "status_update",
            module: "employee",
            title: "Konfirmasi Koordinator Dicatat",
            message: `Konfirmasi manual dari koordinator telah dicatat oleh ${operatorName}. Pengajuan sedang menunggu review Manager Divisi.`,
            targetType: "user",
            targetId: submission.id || "",
            actionUrl: "/admin/karyawan/pengajuan-lembur",
            createdBy: userProfile.uid,
          }),
        ]);
      } catch (notificationError) {
        console.error("Gagal mengirim notifikasi proxy:", notificationError);
      }

      toast({
        title: "Konfirmasi Dicatat",
        description: "Konfirmasi manual koordinator berhasil disimpan. Status kini menunggu review Manager Divisi.",
      });

      onSuccess();
      onOpenChange(false);
      setShowProxyDialog(false);
      setProxyNote("");
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Konfirmasi",
        description: e.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[88vh] max-h-[88vh] w-[94vw] max-w-7xl flex-col gap-0 overflow-hidden rounded-[28px] border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-7xl [&>button]:z-30">
          {/* The base DialogContent (src/components/ui/dialog.tsx) is
              `display:grid` by default — overridden to `flex` above so this
              wrapper's own height actually resolves against a real flex
              parent instead of grid's content-sized implicit rows (which
              left blank space below a content-height-sized child).
              The wrapper itself uses grid-rows-[auto_minmax(0,1fr)_auto]
              rather than flex's min-h-0/flex-1 trick: with 3 fixed rows,
              the header/footer rows are ALWAYS sized to their own content
              and the middle row gets exactly the remainder — genuinely
              incapable of being pushed around by how tall the HRD decision
              panel's content happens to be (unlike flex-basis calculations,
              which can misbehave when box-sizing/intrinsic sizing changes
              inside a min-h-0 flex item — this is what let picking an
              overLimitDecision option shove the footer toward mid-modal). */}
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-white">
          <DialogHeader className="z-20 border-b border-slate-200 bg-gradient-to-br from-white via-emerald-50/50 to-white px-7 py-5 pr-14">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="truncate text-2xl font-bold tracking-tight text-slate-950">
                  {submission.employeeName || submission.fullName}
                </DialogTitle>
                <DialogDescription className="mt-1 truncate text-sm text-slate-600">
                  {mode === "manager"
                    ? "Tinjau detail pengajuan sebelum membuat keputusan persetujuan."
                    : "Tinjau detail pengajuan dan bukti approval sebelum memutuskan."}
                </DialogDescription>
                {mode === "manager" && reviewerRoleLabel && (
                  <p className="mt-1 truncate text-xs text-slate-600">
                    Peran Anda:{" "}
                    <span className="font-semibold text-teal-700">
                      {reviewerRoleLabel}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {canAct ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                    Menunggu Review Anda
                  </span>
                ) : (
                  <OvertimeApprovalStatusBadge
                    status={resolvedStatus as any}
                    mode={mode}
                    divisionName={resolvedDivision.divisionName}
                    labelOverride={mode === "manager" ? mainStatusLabel : undefined}
                  />
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 overscroll-contain overflow-y-auto bg-slate-50/70 px-7 py-5">
            <div className="space-y-6">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">
                Ringkasan Pengajuan
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryTile
                  label="Pengaju"
                  value={submission.employeeName || submission.fullName}
                />
                <SummaryTile
                  label="Brand / Divisi"
                  value={`${submission.brandName || "-"} / ${
                    resolvedDivision.divisionName
                  }`}
                />
                <SummaryTile
                  label="Jabatan"
                  value={currentPosition}
                />
                <SummaryTile
                  label="Tanggal Lembur"
                  value={
                    overtimeDate
                      ? format(overtimeDate, "dd MMMM yyyy", { locale: idLocale })
                      : "-"
                  }
                />
                <SummaryTile label="Tipe Lembur" value={overtimeTypeLabel} />
                <SummaryTile label="Lokasi Kerja" value={workLocationLabel} />
                <SummaryTile
                  label="Jam Lembur"
                  value={`${submission.startTime || "-"} - ${submission.endTime || "-"}`}
                />
                <SummaryTile
                  label="Durasi Pengajuan"
                  value={formatMinutesToHuman(submittedDurationMinutes)}
                />
                <SummaryTile
                  label="Koordinator/Pengawas"
                  value={(submission as any).overtimeCoordinatorName || "Koordinator"}
                />
                <SummaryTile
                  label="Status Saat Ini"
                  value={mode === "manager" ? mainStatusLabel : getApprovalStatusLabel(resolvedStatus)}
                />
              </div>

              {resolvedDivision.snapshotDivisionName &&
                resolvedDivision.snapshotDivisionName !== resolvedDivision.divisionName && (
                  <p className="text-xs text-slate-500">
                    Divisi saat ini: <span className="font-semibold text-slate-700">{resolvedDivision.divisionName}</span>
                    {" · "}Saat pengajuan dibuat: <span className="font-medium">{resolvedDivision.snapshotDivisionName}</span>
                  </p>
                )}

              {isAfterManagerApproval && (
                <Alert className="border-blue-200 bg-blue-50">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-sm text-blue-800">
                    Manager sudah menyetujui pengajuan ini. HRD akan melakukan verifikasi final untuk durasi payroll.
                  </AlertDescription>
                </Alert>
              )}

              {anomalyLabels.length > 0 && (
                <Alert className="border-amber-200 bg-amber-50">
                  <Info className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    <p className="mb-1 font-semibold">
                      {isAfterManagerApproval ? "Catatan untuk HRD:" : "Indikator Perlu Review:"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {anomalyLabels.map((label) => (
                        <span key={label} className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                          {label}
                        </span>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,0.9fr)]">
                <div className="min-w-0 space-y-5">
                <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <CardHeader className="border-b border-slate-100 px-6 py-5">
                    <CardTitle className="text-lg text-slate-950">
                      Detail Pekerjaan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 px-6 py-5">
                    {tasks.length > 0 ? (
                      <>
                        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                          <Table className="text-sm">
                            <TableHeader>
                              <TableRow className="bg-slate-50 hover:bg-slate-50">
                                <TableHead className="px-4 py-3 text-left text-xs uppercase tracking-wide text-slate-500 w-10">
                                  No
                                </TableHead>
                                <TableHead className="px-4 py-3 text-left text-xs uppercase tracking-wide text-slate-500">
                                  Uraian Tugas
                                </TableHead>
                                <TableHead className="px-4 py-3 text-right text-xs uppercase tracking-wide text-slate-500 w-32">
                                  Estimasi
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tasks.map((task, index) => (
                                <TableRow
                                  key={index}
                                  className="border-b border-slate-100 last:border-0"
                                >
                                  <TableCell className="px-4 py-3 text-xs text-slate-500">
                                    {index + 1}
                                  </TableCell>
                                  <TableCell className="px-4 py-3 text-sm leading-6 text-slate-700">
                                    {task.description || "-"}
                                  </TableCell>
                                  <TableCell className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                                    {task.estimatedMinutes || 0} menit
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="bg-emerald-50/70 font-semibold hover:bg-emerald-50/70">
                                <TableCell
                                  colSpan={2}
                                  className="px-4 py-3 text-right text-sm text-emerald-800"
                                >
                                  Total Estimasi:
                                </TableCell>
                                <TableCell className="px-4 py-3 text-right text-sm font-bold text-emerald-800">
                                  {totalEstimatedMinutes} menit
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>

                        <div className="pt-2">
                          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Total Durasi Aktual
                              </p>
                              <p className="mt-1 text-3xl font-bold text-slate-950">
                                {formatMinutesToHuman(submittedDurationMinutes)}
                              </p>
                            </div>
                            {totalEstimatedMinutes !==
                              submittedDurationMinutes && (
                              <Alert className="w-auto border-amber-200 bg-amber-50 px-3 py-2">
                                <AlertDescription className="text-xs font-semibold text-amber-800">
                                  ⚠️ Selisih:{" "}
                                  {Math.abs(
                                    totalEstimatedMinutes -
                                      submittedDurationMinutes,
                                  )}{" "}
                                  menit
                                </AlertDescription>
                              </Alert>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Tidak ada rincian tugas.
                      </p>
                    )}

                    {jobs && (
                      <div className="space-y-3">
                        <p className="text-sm font-bold text-slate-950">Output & Bukti per Pekerjaan</p>
                        {jobs.map((job, i) => (
                          <div key={job.id || i} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                            <p className="text-sm font-semibold text-slate-900">{i + 1}. {job.title}</p>
                            {job.projectOrClient && <p className="text-xs text-slate-500">{job.projectOrClient}</p>}
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Output</p>
                              <p className="text-sm text-slate-700">
                                {job.workOutput || (i === 0 ? legacyWorkOutput : "") || "-"}
                              </p>
                            </div>
                            {((job.evidenceFiles?.length || 0) + (job.evidenceLinks?.length || 0)) > 0 ? (
                              <div className="space-y-2 pt-1">
                                <EvidenceThumbnailGrid
                                  files={collectJobEvidence(job)}
                                  submissionId={submission.id}
                                  onOpen={handleOpenEvidence}
                                />
                                {(job.evidenceLinks || []).map((link, li) => (
                                  <a key={`l-${li}`} href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
                                    <ExternalLink className="h-3 w-3 shrink-0" /> {link}
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs font-semibold text-amber-600">Bukti belum lengkap untuk pekerjaan ini.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <p className="text-sm font-bold text-slate-950">
                        Alasan Lembur
                      </p>
                      <p className="mt-3 text-sm leading-7 text-slate-700">
                        {overtimeReason}
                      </p>
                    </div>

                    {!jobs && legacyWorkOutput && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-5">
                        <p className="text-sm font-bold text-slate-950">Output Pekerjaan</p>
                        <p className="mt-3 text-sm leading-7 text-slate-700">{legacyWorkOutput}</p>
                      </div>
                    )}

                    {submission.employeeNotes && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm font-bold text-slate-950">
                          Catatan Karyawan
                        </p>
                        <p className="mt-3 text-sm leading-7 text-slate-600">
                          {submission.employeeNotes}
                        </p>
                      </div>
                    )}

                    {submissionOnlyEvidence.length > 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-5">
                        <p className="text-sm font-bold text-slate-950">
                          Bukti Lembur
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Lampiran tambahan di level pengajuan — bukti per pekerjaan sudah tampil di atas.
                        </p>
                        <div className="mt-3">
                          <EvidenceThumbnailGrid
                            files={submissionOnlyEvidence}
                            submissionId={submission.id}
                            onOpen={handleOpenEvidence}
                          />
                        </div>
                      </div>
                    ) : !jobs ? (
                      <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                        Pengajuan ini belum memiliki lampiran bukti lembur.
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <CardHeader className="border-b border-slate-100 px-5 py-4">
                    <CardTitle className="text-base text-slate-950">
                      Validasi Durasi Kerja
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 px-5 py-4">
                    <InfoRow
                      label="Durasi Pengajuan"
                      value={formatMinutesToHuman(submittedDurationMinutes)}
                    />
                    <InfoRow
                      label="Estimasi Pekerjaan"
                      value={formatMinutesToHuman(totalEstimatedMinutes)}
                    />
                    <InfoRow
                      label="Selisih Durasi"
                      value={formatMinutesToHuman(
                        Math.abs(submittedDurationMinutes - totalEstimatedMinutes),
                      )}
                    />
                    {submission.approvedMinutesFinal !== undefined &&
                      submission.approvedMinutesFinal !== null && (
                        <InfoRow
                          label="Durasi Final HRD"
                          value={formatMinutesToHuman(submission.approvedMinutesFinal)}
                        />
                      )}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs">
                      {totalEstimatedMinutes !== submittedDurationMinutes ? (
                        <p className="text-amber-700">
                          ⚠️ Selisih durasi terdeteksi. Tinjau kesesuaian durasi dengan rincian pekerjaan.
                        </p>
                      ) : (
                        <p className="text-emerald-700">
                          Durasi pengajuan sesuai dengan estimasi rincian pekerjaan.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
                </div>

                <aside className="min-w-0 space-y-5">
                  {/* Over-limit warning */}
                  {isOverLimit && (
                    <Alert className="border-amber-300 bg-amber-50">
                      <AlertTitle className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                        <Info className="h-4 w-4 text-amber-600 flex-shrink-0" />
                        Melebihi Acuan Lembur 4 Jam/Hari
                      </AlertTitle>
                      <AlertDescription className="text-amber-700 text-xs mt-1 space-y-1">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2">
                          <span className="text-amber-600">Durasi pengajuan:</span>
                          <span className="font-semibold">{formatMinutesToHuman(submittedDurationMinutes)}</span>
                          {dailyTotalMinutes > submittedDurationMinutes && (
                            <>
                              <span className="text-amber-600">Total lembur hari ini:</span>
                              <span className="font-semibold">{formatMinutesToHuman(dailyTotalMinutes)}</span>
                            </>
                          )}
                          <span className="text-amber-600">Acuan maksimal:</span>
                          <span className="font-semibold">{formatMinutesToHuman(DAILY_LIMIT_MINUTES)}</span>
                          <span className="text-amber-600">Kelebihan:</span>
                          <span className="font-semibold text-red-600">+{formatMinutesToHuman(excessMinutes)}</span>
                        </div>
                        <p className="mt-2 text-amber-700">HRD perlu menentukan durasi payroll dan memberikan catatan keputusan.</p>
                      </AlertDescription>
                    </Alert>
                  )}

                  {mode === "hrd" && canAct && (
                    <Card className="rounded-3xl border border-emerald-200 bg-white shadow-sm">
                      <CardHeader className="px-5 py-4 border-b border-emerald-100">
                        <CardTitle className="text-base text-emerald-700 font-bold flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-emerald-600" />
                          Keputusan & Penyesuaian HRD
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 px-5 py-4">
                        <fieldset className="space-y-3">
                          <legend className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-700">
                            <Info className="h-3.5 w-3.5 text-emerald-600" />
                            Jenis Persetujuan Lembur
                            <span className="text-red-500">*</span>
                          </legend>

                          <label
                            className={`block cursor-pointer rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-emerald-200 ${
                              overLimitDecision === "full_approved_override"
                                ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100"
                                : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"
                            }`}
                          >
                            <input
                              type="radio"
                              name="hrd-approval-choice"
                              value="full_approved_override"
                              checked={
                                overLimitDecision ===
                                "full_approved_override"
                              }
                              onChange={() =>
                                handleHrdApprovalChoiceChange(
                                  "full_approved_override",
                                )
                              }
                              className="sr-only"
                            />
                            <div className="flex items-start gap-3">
                              <span
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                  overLimitDecision ===
                                  "full_approved_override"
                                    ? "border-emerald-600 bg-emerald-600"
                                    : "border-slate-300 bg-white"
                                }`}
                              >
                                {overLimitDecision ===
                                  "full_approved_override" && (
                                  <span className="h-2 w-2 rounded-full bg-white" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold text-slate-900">
                                  Setujui Penuh / Override Ajuan
                                </span>
                                <span className="mt-1 block text-xs leading-5 text-slate-600">
                                  Seluruh durasi yang diajukan akan dibayar.
                                </span>
                                <span className="mt-2 block rounded-lg bg-white/80 px-3 py-2 text-xs text-slate-700">
                                  Durasi dibayar: {" "}
                                  <strong>
                                    {formatMinutesToHuman(
                                      submittedDurationMinutes,
                                    )}
                                  </strong>
                                </span>
                                {isOverLimit && (
                                  <span className="mt-2 block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-800">
                                    Ini adalah override acuan lembur 4 jam/hari.
                                    HRD wajib memberi catatan.
                                  </span>
                                )}
                              </span>
                            </div>
                          </label>

                          <label
                            className={`block cursor-pointer rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-teal-200 ${
                              overLimitDecision === "partial_approved"
                                ? "border-teal-400 bg-teal-50 ring-2 ring-teal-100"
                                : "border-slate-200 bg-white hover:border-teal-200 hover:bg-teal-50/40"
                            }`}
                          >
                            <input
                              type="radio"
                              name="hrd-approval-choice"
                              value="partial_approved"
                              checked={
                                overLimitDecision === "partial_approved"
                              }
                              onChange={() =>
                                handleHrdApprovalChoiceChange(
                                  "partial_approved",
                                )
                              }
                              className="sr-only"
                            />
                            <div className="flex items-start gap-3">
                              <span
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                  overLimitDecision === "partial_approved"
                                    ? "border-teal-600 bg-teal-600"
                                    : "border-slate-300 bg-white"
                                }`}
                              >
                                {overLimitDecision ===
                                  "partial_approved" && (
                                  <span className="h-2 w-2 rounded-full bg-white" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold text-slate-900">
                                  Setujui Sebagian / Sesuaikan Durasi Payroll
                                </span>
                                <span className="mt-1 block text-xs leading-5 text-slate-600">
                                  Hanya durasi final yang disetujui HRD yang
                                  akan dibayar.
                                </span>
                                <span className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-white/80 px-3 py-2 text-xs text-slate-700">
                                  <span>Diajukan</span>
                                  <strong className="text-right">
                                    {formatMinutesToHuman(
                                      submittedDurationMinutes,
                                    )}
                                  </strong>
                                  <span>Estimasi dibayar</span>
                                  <strong className="text-right text-teal-700">
                                    {formatMinutesToHuman(
                                      partialPreviewMinutes,
                                    )}
                                  </strong>
                                </span>
                                <span className="mt-2 block text-xs font-medium text-teal-700">
                                  Selisih durasi tidak masuk payroll lembur.
                                </span>
                              </span>
                            </div>
                          </label>
                        </fieldset>

                        {overLimitDecision === "partial_approved" ? (
                          <div className="space-y-2 rounded-2xl border border-teal-200 bg-teal-50/50 p-4">
                            <Label className="text-xs font-bold uppercase tracking-wide text-teal-700">
                              Durasi Final HRD untuk Payroll
                            </Label>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <span className="text-[10px] text-slate-500">
                                  Jam
                                </span>
                                <Input
                                  type="number"
                                  min={0}
                                  value={hrdHours}
                                  onChange={(e) =>
                                    setHrdHours(
                                      Math.max(
                                        0,
                                        parseInt(e.target.value) || 0,
                                      ),
                                    )
                                  }
                                  className="bg-white focus:border-teal-500"
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] text-slate-500">
                                  Menit
                                </span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={59}
                                  value={hrdMinutes}
                                  onChange={(e) =>
                                    setHrdMinutes(
                                      Math.max(
                                        0,
                                        Math.min(
                                          59,
                                          parseInt(e.target.value) || 0,
                                        ),
                                      ),
                                    )
                                  }
                                  className="bg-white focus:border-teal-500"
                                />
                              </div>
                            </div>
                            <p className="text-xs text-slate-600">
                              Durasi dibayar: {" "}
                              <span className="font-bold text-teal-700">
                                {formatMinutesToHuman(approvedMinutesFinal)}
                              </span>{" "}
                              ({approvedMinutesFinal} menit)
                            </p>
                            {isApprovedDurationInvalid && (
                              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                                {approvedMinutesFinal <= 0
                                  ? "Durasi yang disetujui harus lebih dari 0 menit."
                                  : "Durasi disetujui tidak boleh lebih besar dari durasi pengajuan."}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                            Durasi payroll dikunci mengikuti pengajuan:{" "}
                            <strong className="text-slate-900">
                              {formatMinutesToHuman(submittedDurationMinutes)}
                            </strong>
                          </div>
                        )}

                        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                          <p className="text-xs font-bold uppercase tracking-wide text-blue-800">
                            Dampak Payroll
                          </p>
                          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                            <span className="text-slate-600">Diajukan</span>
                            <span className="text-right font-semibold text-slate-900">
                              {formatMinutesToHuman(submittedDurationMinutes)}
                            </span>
                            <span className="text-slate-600">Dibayar</span>
                            <span className="text-right font-bold text-emerald-700">
                              {formatMinutesToHuman(approvedMinutesFinal)}
                            </span>
                            <span className="text-slate-600">
                              Tidak dibayar
                            </span>
                            <span className="text-right font-bold text-red-700">
                              {formatMinutesToHuman(rejectedMinutes)}
                            </span>
                            <span className="text-slate-600">Status</span>
                            <span className="text-right font-semibold text-blue-800">
                              {overLimitDecision === "partial_approved"
                                ? "Disetujui sebagian oleh HRD"
                                : "Disetujui penuh oleh HRD"}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs uppercase tracking-wide text-slate-600 font-bold flex justify-between">
                            <span>Catatan HRD</span>
                            {isHrdNoteRequired && (
                              <span className="text-[10px] text-amber-600 font-normal">
                                Wajib diisi *
                              </span>
                            )}
                          </Label>
                          <textarea
                            value={hrdNotes}
                            onChange={(e) => setHrdNotes(e.target.value)}
                            placeholder="Berikan catatan persetujuan, penolakan, atau alasan perubahan durasi..."
                            className="w-full min-h-[90px] rounded-lg border border-slate-200 bg-white p-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                          />
                          {isHrdNoteRequired && !hrdNotes.trim() && (
                            <p className="text-[10px] text-amber-500 italic">
                              * {overLimitDecision === "full_approved_override" && isOverLimit
                                ? "Catatan HRD wajib diisi karena HRD menyetujui durasi melebihi acuan harian."
                                : "Catatan HRD wajib diisi karena durasi payroll berbeda dari durasi pengajuan."}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Realtime Timer Breakdown */}
                  {(submission as any).inputMode === 'realtime' &&
                    (submission as any).totalGrossDurationMinutes != null && (
                    <Card className="rounded-3xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-emerald-50 shadow-sm">
                      <CardHeader className="px-5 py-4 border-b border-teal-100">
                        <CardTitle className="text-base text-teal-800 flex items-center gap-2">
                          <Info className="h-4 w-4 text-teal-600" />
                          Rincian Durasi Realtime
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4 px-5 py-4 text-sm">
                        <div className="rounded-2xl border border-teal-200 bg-white p-4">
                          <p className="text-xs font-bold uppercase tracking-wide text-teal-700">
                            Durasi Bersih (yang diajukan)
                          </p>
                          <p className="mt-1 text-3xl font-bold text-teal-700">
                            {formatMinutesToHuman((submission as any).totalNetDurationMinutes ?? 0)}
                          </p>
                        </div>
                        <div className="flex justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <span className="text-muted-foreground">Durasi Kotor</span>
                          <span className="font-medium">{formatMinutesToHuman((submission as any).totalGrossDurationMinutes ?? 0)}</span>
                        </div>
                        <div className="flex justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                          <span className="text-muted-foreground">
                            Total Jeda ({((submission as any).pauseLogs?.length ?? 0)} sesi)
                          </span>
                          <span className="font-medium text-amber-600">{formatMinutesToHuman((submission as any).totalPausedDurationMinutes ?? 0)}</span>
                        </div>
                        {((submission as any).pauseLogs?.length ?? 0) > 0 && (
                          <details className="mt-2 rounded-2xl border border-teal-200 bg-white p-3">
                            <summary className="cursor-pointer text-xs font-bold text-teal-700">Lihat rincian jeda</summary>
                            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 text-xs">
                              {(submission as any).pauseLogs.map((log: any, i: number) => {
                                const startStr = log.startedAt?.toDate ?
                                  `${String(log.startedAt.toDate().getHours()).padStart(2,'0')}:${String(log.startedAt.toDate().getMinutes()).padStart(2,'0')}` : '?';
                                const endStr = log.endedAt?.toDate ?
                                  `${String(log.endedAt.toDate().getHours()).padStart(2,'0')}:${String(log.endedAt.toDate().getMinutes()).padStart(2,'0')}` : '?';
                                return (
                                  <div key={i} className="flex items-center gap-3 px-3 py-2 border-b last:border-0 bg-white">
                                    <span className="text-muted-foreground w-4">{i + 1}</span>
                                    <span className="font-medium text-slate-700">{log.reason}</span>
                                    <span className="text-muted-foreground">{startStr} – {endStr}</span>
                                    {log.note && <span className="italic text-muted-foreground">{log.note}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Audit Trail Waktu */}
                  {((submission as any).formCreatedAt || (submission as any).startTimeAdjusted || (submission as any).actualEndTime) && (
                    <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                      <CardHeader className="px-5 py-4 border-b border-slate-100">
                        <CardTitle className="text-base flex items-center gap-2 text-slate-700">
                          <Info className="h-4 w-4 text-teal-600" />
                          Audit Trail Waktu
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 px-5 py-4 text-sm">
                        {(submission as any).formCreatedAt && (
                          <InfoRow label="Form dibuka pukul" value={(submission as any).formCreatedAt} />
                        )}
                        {(submission as any).originalStartTimeAuto && (
                          <InfoRow label="Jam mulai otomatis awal" value={(submission as any).originalStartTimeAuto} />
                        )}
                        <InfoRow label="Jam mulai diajukan" value={submission.startTime} />
                        {(submission as any).startTimeAdjusted && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Penyesuaian jam mulai</span>
                              <span className="font-semibold text-amber-600">
                                {Math.abs((submission as any).startTimeAdjustmentMinutes || 0)} menit dimundurkan
                              </span>
                            </div>
                            {(submission as any).startTimeAdjustmentReason && (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                                <p className="text-xs text-amber-700 font-medium mb-0.5">Alasan penyesuaian:</p>
                                <p className="text-xs text-amber-800">{(submission as any).startTimeAdjustmentReason}</p>
                              </div>
                            )}
                          </>
                        )}
                        {!(submission as any).startTimeAdjusted && (submission as any).formCreatedAt && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Penyesuaian jam mulai</span>
                            <span className="font-medium text-teal-600">Tidak ada (sesuai otomatis)</span>
                          </div>
                        )}
                        <InfoRow label="Jam selesai estimasi" value={submission.endTime} />
                        {(submission as any).actualEndTime && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Jam selesai realisasi</span>
                            <span className={`font-semibold ${(submission as any).completionStatus === "confirmed_late" ? "text-orange-600" : "text-teal-600"}`}>
                              {(submission as any).actualEndTime}
                              {(submission as any).completionStatus === "confirmed_late" && " ⚠️"}
                            </span>
                          </div>
                        )}
                        {(submission as any).actualDurationMinutes && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Durasi realisasi</span>
                            <span className={`font-semibold ${(submission as any).actualDurationMinutes > submittedDurationMinutes ? "text-orange-600" : "text-teal-600"}`}>
                              {formatMinutesToHuman((submission as any).actualDurationMinutes)}
                            </span>
                          </div>
                        )}
                        {(submission as any).completionNote && (
                          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                            <p className="text-xs text-orange-700 font-medium mb-0.5">Catatan koreksi staff:</p>
                            <p className="text-xs text-orange-800">{(submission as any).completionNote}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <CardHeader className="border-b border-slate-100 px-5 py-4">
                      <CardTitle className="text-base text-slate-950">
                        Catatan Manager
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 px-5 py-4">
                      <InfoRow label="Disetujui oleh" value={resolvedManagerName || "Belum disetujui"} />
                      <InfoRow
                        label="Waktu persetujuan"
                        value={
                          managerDecisionAt
                            ? format(managerDecisionAt, "dd MMMM yyyy HH:mm", { locale: idLocale })
                            : "-"
                        }
                      />
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Catatan
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {submission.managerNotes || "Tidak ada catatan manager."}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <CardHeader className="border-b border-slate-100 px-5 py-4">
                      <CardTitle className="text-base text-slate-950">
                        Timeline Persetujuan
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 px-5 py-4">
                      <div className="space-y-3">
                        {approvalTimelineSteps.map((step, index) => (
                          <div
                            key={step.title}
                            className={`rounded-2xl border p-4 ${
                              step.state === "Menunggu" && canAct
                                ? "border-amber-200 bg-amber-50/70"
                                : "border-slate-200 bg-white"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                                  {index + 1}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-slate-900">
                                    {step.title}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {step.reviewer}
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${getTimelineBadgeClass(
                                  step.state,
                                )}`}
                              >
                                {step.state}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Separator className="my-2 bg-slate-200" />
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-muted-foreground">
                          Status Saat Ini
                        </span>
                        <OvertimeApprovalStatusBadge
                          status={resolvedStatus as any}
                          mode={mode}
                          labelOverride={mode === "manager" ? mainStatusLabel : undefined}
                        />
                      </div>
                      <Separator className="my-2 opacity-50" />
                      <InfoRow
                        label="Waktu Pengajuan"
                        value={format(submittedAt, "eeee, dd MMMM yyyy HH:mm", {
                          locale: idLocale,
                        })}
                      />

                      {submission.coordinatorApprovedAt && (
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <InfoRow
                            label={submission.coordinatorApprovedByProxy ? "Disetujui Koordinator (Konfirmasi Manual)" : "Disetujui Koordinator oleh"}
                            value={
                              submission.coordinatorApprovedByName ||
                              (submission as any).overtimeCoordinatorName ||
                              "Koordinator/Pengawas"
                            }
                          />
                          <InfoRow
                            label="Waktu Persetujuan Koordinator"
                            value={format(
                              parseSafeDate(submission.coordinatorApprovedAt) ||
                                new Date(),
                              "eeee, dd MMMM yyyy HH:mm",
                              { locale: idLocale },
                            )}
                          />
                          {submission.coordinatorApprovedByProxy && (
                            <div className="mt-1 space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Metode Konfirmasi:</span>
                                <span className="font-semibold text-emerald-700 capitalize">
                                  {submission.coordinatorProxyMethod === "lisan" && "🗣️ Lisan / Tatap Muka"}
                                  {submission.coordinatorProxyMethod === "whatsapp" && "💬 WhatsApp / Chat"}
                                  {submission.coordinatorProxyMethod === "telepon" && "📞 Telepon"}
                                  {submission.coordinatorProxyMethod === "manual" && "📝 Dokumen Manual"}
                                  {!["lisan", "whatsapp", "telepon", "manual"].includes(submission.coordinatorProxyMethod || "") && (submission.coordinatorProxyMethod || "-")}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Dicatat Oleh:</span>
                                <span className="font-medium text-slate-700">
                                  {submission.coordinatorProxyApprovedByName || "Atasan / HRD"}
                                </span>
                              </div>
                              {submission.coordinatorProxyNote && (
                                <div className="pt-1 border-t border-border/20 mt-1">
                                  <span className="text-muted-foreground block mb-0.5">Catatan Konfirmasi:</span>
                                  <p className="rounded-lg bg-white p-2 italic leading-relaxed text-slate-600">
                                    "{submission.coordinatorProxyNote}"
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {submission.supervisorApprovedAt && (
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <InfoRow
                            label="Disetujui Manager Divisi oleh"
                            value={
                              submission.supervisorApprovedByName ||
                              "Manager Divisi"
                            }
                          />
                          <InfoRow
                            label="Waktu Persetujuan Manager"
                            value={format(
                              parseSafeDate(submission.supervisorApprovedAt) ||
                                new Date(),
                              "eeee, dd MMMM yyyy HH:mm",
                              { locale: idLocale },
                            )}
                          />
                          <div className="flex justify-between text-sm">
                            <p className="text-muted-foreground">
                              Status Lanjutan
                            </p>
                            <p className="font-bold text-blue-500">
                              Diteruskan ke HRD
                            </p>
                          </div>
                        </div>
                      )}

                      {submission.revisionRequestedAt && (
                        <InfoRow
                          label="Revisi Diminta Pada"
                          value={format(
                            parseSafeDate(submission.revisionRequestedAt) ||
                              new Date(),
                            "eeee, dd MMMM yyyy HH:mm",
                            { locale: idLocale },
                          )}
                        />
                      )}
                      {submission.rejectedAt && (
                        <InfoRow
                          label="Ditolak Pada"
                          value={format(
                            parseSafeDate(submission.rejectedAt) || new Date(),
                            "eeee, dd MMMM yyyy HH:mm",
                            { locale: idLocale },
                          )}
                        />
                      )}
                      {submission.hrdDecisionAt && (
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <InfoRow
                            label="Keputusan Final HRD"
                            value={format(
                              parseSafeDate(submission.hrdDecisionAt) ||
                                new Date(),
                              "eeee, dd MMMM yyyy HH:mm",
                              { locale: idLocale },
                            )}
                          />
                        </div>
                      )}
                      {submission.coordinatorNotes && (
                        <div className="pt-2 border-t border-border/50 mt-2">
                          <p className="text-xs uppercase text-muted-foreground">
                            Catatan Koordinator
                          </p>
                          <p className="mt-1 text-sm leading-6 italic">
                            "{submission.coordinatorNotes}"
                          </p>
                        </div>
                      )}

                      {submission.managerNotes && (
                        <div className="pt-2">
                          <p className="text-xs uppercase text-muted-foreground">
                            Catatan Manager Divisi
                          </p>
                          <p className="mt-1 text-sm leading-6 italic">
                            "{submission.managerNotes}"
                          </p>
                        </div>
                      )}
                      {submission.hrdNotes && (
                        <div className="pt-2">
                          <p className="text-xs uppercase text-muted-foreground">
                            Catatan HRD
                          </p>
                          <p className="mt-1 text-sm leading-6 italic">
                            "{submission.hrdNotes}"
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </aside>
              </div>

              {mode === "manager" && canAct && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="manager-note-input" className="text-sm font-semibold text-slate-900">
                      Catatan Manager (opsional)
                    </Label>
                    <Textarea
                      id="manager-note-input"
                      value={managerNoteInput}
                      onChange={(e) => setManagerNoteInput(e.target.value)}
                      placeholder="Tambahkan catatan jika ada hal yang perlu diperhatikan HRD."
                      rows={2}
                      className="rounded-xl border-slate-200"
                    />
                  </div>
                  <Alert className="border-slate-200 bg-slate-50">
                    <Info className="h-4 w-4 text-slate-500" />
                    <AlertDescription className="text-sm text-slate-600">
                      Jika disetujui, pengajuan akan masuk ke HRD untuk verifikasi final dan penentuan durasi payroll.
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertTitle className="text-blue-900 dark:text-blue-100">
                  Persetujuan Digital Internal
                </AlertTitle>
                <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
                  Persetujuan ini akan tercatat sebagai approval digital
                  internal perusahaan dengan audit trail lengkap.
                </AlertDescription>
              </Alert>
            </div>
          </div>

          <div className="z-20 border-t border-slate-200 bg-white px-7 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-end gap-3 overflow-x-auto overflow-y-hidden">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="h-11 whitespace-nowrap rounded-xl border-slate-300 px-5"
              >
                Tutup
              </Button>
              {canRecordProxyApproval && (
                <Button
                  variant="secondary"
                  onClick={() => setShowProxyDialog(true)}
                  disabled={isSaving}
                  className="h-11 whitespace-nowrap rounded-xl border border-amber-200 bg-amber-50 px-5 font-semibold text-amber-700 hover:bg-amber-100"
                >
                  Catat Konfirmasi Koordinator
                </Button>
              )}
              {canAct && (
                <>
                  <Button
                    variant="destructive"
                    onClick={() => setShowRejectDialog(true)}
                    disabled={isSaving}
                    className="h-11 whitespace-nowrap rounded-xl px-5 font-semibold"
                  >
                    Tolak
                  </Button>
                  <Button
                    onClick={handleApprove}
                    disabled={isSaving}
                    className="h-11 whitespace-nowrap rounded-xl bg-emerald-600 px-6 font-semibold text-white hover:bg-emerald-700"
                  >
                    {isSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    {mode === "hrd" ? approvalChoiceLabel : "Setujui"}
                  </Button>
                </>
              )}
            </div>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approval Confirmation Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="w-[min(90vw,500px)] max-w-[500px] rounded-3xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl">
          <DialogHeader>
            <DialogTitle>
              {mode === "hrd"
                ? `${approvalChoiceLabel} untuk Payroll?`
                : "Setujui Pengajuan Lembur?"}
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              {mode === "hrd"
                ? "Pengajuan lembur ini akan disetujui secara final dan datanya dimasukkan ke rekap payroll bulanan."
                : isCoordinatorReview
                  ? (submission.overtimeCoordinatorUid === (submission.managerUid || submission.directSupervisorUid || submission.supervisorUid)
                    ? "Pengajuan ini akan disetujui sebagai Koordinator & Manager Divisi dan diteruskan ke HRD."
                    : "Pengajuan ini akan disetujui sebagai Koordinator dan diteruskan ke Manager Divisi.")
                  : "Pengajuan ini akan disetujui dan diteruskan ke HRD untuk review final."}
            </DialogDescription>
            {mode === "hrd" && (
              <div className="mt-4 p-4 rounded-2xl border border-emerald-200 bg-emerald-50 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Karyawan:</span>
                  <span className="font-bold text-slate-900">
                    {submission.employeeName || submission.fullName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Durasi Final HRD:</span>
                  <span className="font-bold text-emerald-700">
                    {formatMinutesToHuman(approvedMinutesFinal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Tidak Dibayar:</span>
                  <span className="font-bold text-red-700">
                    {formatMinutesToHuman(rejectedMinutes)}
                  </span>
                </div>
                {hrdNotes.trim() && (
                  <div className="space-y-1">
                    <span className="text-slate-600">Catatan HRD:</span>
                    <p className="italic text-slate-700">"{hrdNotes}"</p>
                  </div>
                )}
              </div>
            )}
            {mode === "manager" && managerNoteInput.trim() && (
              <div className="mt-4 p-4 rounded-2xl border border-emerald-200 bg-emerald-50 text-xs space-y-1">
                <span className="text-slate-600">Catatan Manager:</span>
                <p className="italic text-slate-700">"{managerNoteInput}"</p>
              </div>
            )}
            <p className="mt-4 text-xs text-slate-500">
              Keputusan ini akan tercatat dalam riwayat persetujuan & audit
              trail karyawan.
            </p>
          </DialogHeader>
          <DialogFooter className="mt-6 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowApproveDialog(false)}
              disabled={isSaving}
            >
              Batal
            </Button>
            <Button onClick={handleApproveConfirm} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              {mode === "hrd"
                ? approvalChoiceLabel
                : isCoordinatorReview
                  ? (submission.overtimeCoordinatorUid === (submission.managerUid || submission.directSupervisorUid || submission.supervisorUid)
                    ? "Setujui & Teruskan ke HRD"
                    : "Setujui & Teruskan ke Manager")
                  : "Setujui & Teruskan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revision Dialog */}
      <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <DialogContent className="w-[min(90vw,640px)] max-w-[640px] rounded-3xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl">
          <DialogHeader>
            <DialogTitle>Minta Revisi Pengajuan</DialogTitle>
            <DialogDescription className="text-slate-400">
              Berikan catatan revisi agar karyawan dapat memperbaiki
              pengajuannya.
            </DialogDescription>
          </DialogHeader>
          {/* Summary Section */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Karyawan:</span>
              <span className="font-semibold text-slate-900">
                {submission.employeeName || submission.fullName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tanggal Lembur:</span>
              <span className="font-semibold text-slate-900">
                {overtimeDate
                  ? format(overtimeDate, "dd MMM yyyy", { locale: idLocale })
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Durasi:</span>
              <span className="font-semibold text-slate-900">
                {formatMinutesToHuman(submission.totalDurationMinutes || 0)}
              </span>
            </div>
          </div>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="revision-note">Catatan Revisi</Label>
              <textarea
                id="revision-note"
                placeholder="Contoh: Tolong revisi jam selesai / rincian tugas / alasan lembur."
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRevisionDialog(false)}
            >
              Batal
            </Button>
            <Button
              onClick={handleRevisionSubmit}
              disabled={isSaving || !revisionNote.trim()}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Kirim Revisi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="w-[min(90vw,640px)] max-w-[640px] rounded-3xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl">
          <DialogHeader>
            <DialogTitle>Tolak Pengajuan Lembur</DialogTitle>
            <DialogDescription className="text-slate-400">
              Berikan alasan penolakan agar karyawan memahami keputusan Anda.
            </DialogDescription>
          </DialogHeader>
          {/* Summary Section */}
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Karyawan</span>
              <span className="font-semibold text-slate-900">
                {submission.employeeName || submission.fullName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tanggal Lembur</span>
              <span className="font-semibold text-slate-900">
                {overtimeDate
                  ? format(overtimeDate, "dd MMM yyyy", { locale: idLocale })
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Durasi</span>
              <span className="font-semibold text-slate-900">
                {formatMinutesToHuman(submission.totalDurationMinutes || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Lokasi</span>
              <span className="font-semibold text-slate-900">
                {workLocationLabel}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tipe</span>
              <span className="font-semibold text-slate-900">
                {overtimeTypeLabel}
              </span>
            </div>
          </div>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="rejection-reason">Alasan Penolakan</Label>
              <textarea
                id="rejection-reason"
                placeholder="Tuliskan alasan penolakan agar karyawan memahami keputusan."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(false)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectSubmit}
              disabled={isSaving || !rejectionReason.trim()}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Tolak Pengajuan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proxy/Assisted Approval Confirmation Dialog */}
      <Dialog open={showProxyDialog} onOpenChange={setShowProxyDialog}>
        <DialogContent className="w-[min(90vw,640px)] max-w-[640px] rounded-3xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <span className="text-amber-500">✍️</span> Catat Konfirmasi Manual Koordinator
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Jika Koordinator telah menyetujui secara manual/lisan (tanda tangan kertas/WhatsApp/lisan), Anda dapat meneruskan alur ke Manager Divisi dengan mencatat audit trail di bawah ini.
            </DialogDescription>
          </DialogHeader>

          {/* Summary Section */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-2.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Karyawan:</span>
              <span className="font-semibold text-slate-950">
                {submission.employeeName || submission.fullName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Koordinator Lembur:</span>
              <span className="font-semibold text-amber-400">
                {(submission as any).overtimeCoordinatorName || "Koordinator"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tanggal Lembur:</span>
              <span className="font-medium text-slate-950">
                {overtimeDate
                  ? format(overtimeDate, "dd MMMM yyyy", { locale: idLocale })
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Durasi Lembur:</span>
              <span className="font-medium text-slate-950">
                {submission.totalDurationMinutes} menit ({formatMinutesToHuman(submission.totalDurationMinutes || 0)})
              </span>
            </div>
          </div>

          <div className="space-y-4 py-3">
            <div className="grid gap-2">
              <Label htmlFor="proxy-method" className="text-sm font-semibold text-slate-700">
                Metode Konfirmasi <span className="text-amber-500">*</span>
              </Label>
              <Select value={proxyMethod} onValueChange={setProxyMethod}>
                <SelectTrigger id="proxy-method" className="w-full border-slate-200 bg-white text-slate-950 focus:border-amber-500">
                  <SelectValue placeholder="Pilih metode konfirmasi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lisan">🗣️ Lisan / Tatap Muka</SelectItem>
                  <SelectItem value="whatsapp">💬 WhatsApp / Chat</SelectItem>
                  <SelectItem value="telepon">📞 Telepon / Panggilan Suara</SelectItem>
                  <SelectItem value="manual">📝 Dokumen Manual / Tanda Tangan Kertas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="proxy-note" className="text-sm font-semibold text-slate-700">
                Catatan Konfirmasi Manual <span className="text-amber-500">*</span>
              </Label>
              <textarea
                id="proxy-note"
                placeholder="Contoh: Disetujui lisan oleh Pak Ariyan saat koordinasi lapangan. Dokumen fisik menyusul."
                value={proxyNote}
                onChange={(e) => setProxyNote(e.target.value)}
                className="min-h-[120px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>
          </div>

          <DialogFooter className="mt-4 flex justify-end gap-3 border-t border-slate-200 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowProxyDialog(false);
                setProxyNote("");
              }}
              disabled={isSaving}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Batal
            </Button>
            <Button
              onClick={handleProxySubmit}
              disabled={isSaving || !proxyNote.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white border-none"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Catat Konfirmasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EvidenceLightbox
        file={previewFile}
        submissionId={submission.id}
        onClose={() => setPreviewFile(null)}
        onError={(message) => toast({ variant: "destructive", title: "Gagal Membuka Bukti", description: message })}
      />
    </>
  );
}

