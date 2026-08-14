"use client";

import { useState, useMemo } from "react";
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
import {
  Loader2,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Circle,
  Clock,
  Edit,
  ArrowRight,
  ShieldCheck,
  FileText,
  X,
  Eye,
} from "lucide-react";
import {
  PermissionRequest,
  EmployeeProfile,
  isFinalStatus,
  isActionableStatus,
} from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";
import {
  useFirestore,
  updateDocumentNonBlocking,
  useDoc,
  useMemoFirebase,
} from "@/firebase";
import {
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { cn } from "@/lib/utils";
import {
  format,
  differenceInCalendarDays,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog as ConfirmDialog,
  DialogContent as ConfirmDialogContent,
  DialogHeader as ConfirmDialogHeader,
  DialogTitle as ConfirmDialogTitle,
  DialogDescription as ConfirmDialogDescription,
  DialogFooter as ConfirmDialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

/** Extract Google Drive fileId from a URL (handles multiple formats) */
function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  // Already a proxy URL — extract fileId param
  const proxyMatch = url.match(/[?&]fileId=([^&]+)/);
  if (proxyMatch) return proxyMatch[1];
  // Drive URL patterns
  const patterns = [/\/d\/([a-zA-Z0-9-_]+)/, /id=([a-zA-Z0-9-_]+)/];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  // Bare fileId (no slashes or common chars)
  if (/^[a-zA-Z0-9-_]{20,}$/.test(url)) return url;
  return null;
}

/** Safely converts a Firestore Timestamp or plain {seconds, nanoseconds} to Date. */
function safeToDate(t: any): Date | undefined {
  if (!t) return undefined;
  if (typeof t.toDate === "function") return t.toDate();
  if (typeof t.seconds === "number") return new Date(t.seconds * 1000);
  if (t instanceof Date) return t;
  return undefined;
}

/** Returns the internal proxy URL for an attachment string. Falls back to original if not Drive. */
function resolveAttachmentSrc(url: string): string {
  if (!url) return url;
  // Already an internal proxy URL
  if (url.startsWith("/api/")) return url;
  const fileId = extractDriveFileId(url);
  if (fileId) return `/api/storage/google-drive-preview?fileId=${fileId}`;
  return url; // Firebase Storage or other — use as-is
}

function isImageUrl(url: string): boolean {
  return (
    /\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i.test(url) || url.includes("image")
  );
}

/**
 * Parse a raw attachment (string or object) into a normalized shape
 */
function parseAttachment(raw: any, fallbackIndex = 0) {
  if (!raw) return null;
  const out: any = { raw };
  if (typeof raw === "string") {
    out.url = raw;
    out.driveFileId = extractDriveFileId(raw) || undefined;
    const parts = raw.split("/");
    out.name =
      decodeURIComponent(parts[parts.length - 1]) ||
      `Lampiran ${fallbackIndex + 1}`;
  } else if (typeof raw === "object") {
    out.id = raw.id || raw.fileId || undefined;
    out.driveFileId =
      raw.driveFileId ||
      raw.fileId ||
      raw.id ||
      raw.googleDriveFileId ||
      undefined;
    out.url =
      raw.url || raw.fileUrl || raw.downloadUrl || raw.storageUrl || undefined;
    out.name =
      raw.name ||
      raw.fileName ||
      raw.originalFileName ||
      raw.filename ||
      out.id ||
      `Lampiran ${fallbackIndex + 1}`;
    out.mimeType = raw.mimeType || raw.contentType || undefined;
  }

  // prefer internal proxy if driveFileId available
  if (out.driveFileId)
    out.proxySrc = `/api/storage/google-drive-preview?fileId=${out.driveFileId}`;
  else if (out.url) out.proxySrc = out.url;
  else out.proxySrc = undefined;

  out.isImage = out.proxySrc
    ? isImageUrl(out.proxySrc) || /image\//.test(out.mimeType || "")
    : false;
  out.isPdf =
    (out.proxySrc && /\.pdf(\?|$)/i.test(out.proxySrc)) ||
    /pdf/.test(out.mimeType || "");
  // Clean display name
  const rawName = out.name || "";
  out.cleanName = decodeURIComponent(String(rawName))
    .replace(/\?.*$/, "")
    .replace(/view$/i, "")
    .replace(/(\?|&)?usp=.*$/i, "")
    .trim();
  if (!out.cleanName) out.cleanName = `Lampiran ${fallbackIndex + 1}`;
  return out;
}

// Resolves employee identity for the review modal. Canonical source is the
// employee_profiles/{uid} doc fetched by the caller (via UID, never by name) —
// the permission_requests snapshot fields are only a fallback for cases where
// the employee profile doc is missing or a field was never backfilled onto it.
// This is what fixes stale identity (e.g. an old division snapshot like
// "CBDMS" lingering on the request doc after the employee moved to "DTIC").
function getApplicantInfo(submission: any, employeeProfile: EmployeeProfile | null) {
  const clean = (v: any) => {
    if (!v && v !== 0) return null;
    const s = String(v).trim();
    if (!s) return null;
    if (["N/A", "NA", "-", "Staf", "Staff"].includes(s)) return null;
    return s;
  };

  const ep = employeeProfile as any;
  const hrd = ep?.hrdEmploymentInfo;

  const position =
    clean(ep?.positionTitle) ||
    clean(hrd?.structuralPosition) ||
    clean(hrd?.jabatan) ||
    clean(submission._resolvedApplicantPosition) ||
    clean(submission.applicantPosition) ||
    clean(submission.positionTitle) ||
    clean(submission.requesterStructuralPosition) ||
    clean(submission.approvalFlow?.requesterStructuralPosition) ||
    null;

  const division =
    clean(hrd?.divisionName) ||
    clean(ep?.division) ||
    clean(hrd?.divisi) ||
    clean(submission._resolvedApplicantDivision) ||
    clean(submission.applicantDivisionName) ||
    clean(submission.division) ||
    null;

  const brand =
    clean(hrd?.brandName) ||
    clean(ep?.brandName) ||
    clean(hrd?.brand) ||
    clean(submission._resolvedApplicantBrand) ||
    clean(submission.applicantBrandName) ||
    clean(submission.applicantCompanyName) ||
    clean(submission.brandName) ||
    null;

  return {
    position: position || "Belum diatur",
    division: division || "Belum diatur",
    brand: brand || "Belum diatur",
  };
}

function getApplicantName(submission: any, employeeProfile: EmployeeProfile | null) {
  const ep = employeeProfile as any;
  return (
    ep?.dataDiriIdentitas?.fullName ||
    submission.fullName ||
    submission.requesterName ||
    submission.approvalFlow?.requesterName ||
    "—"
  );
}

// Same "Bentuk Izin" (jenis) / "Kategori" (reasonType) split used on the
// staff-facing PermissionSubmissionClient — kept in sync so the two views
// never disagree on what a status/category means.
const FORM_TYPE_LABELS: Record<string, string> = {
  tidak_masuk: "Tidak Masuk Kerja",
  datang_terlambat: "Datang Terlambat",
  pulang_awal: "Pulang Lebih Awal",
  keluar_kantor: "Meninggalkan Kantor",
  sakit: "Izin Sakit",
  duka: "Izin Duka Cita",
  akademik: "Izin Akademik",
  administrasi_resmi: "Administrasi Resmi",
  lainnya: "Izin Lainnya",
};

const REASON_TYPE_LABELS: Record<string, string> = {
  sakit: "Sakit",
  duka: "Duka Cita",
  urusan_keluarga: "Urusan Keluarga",
  administrasi_resmi: "Administrasi Resmi",
  akademik: "Akademik",
  transportasi: "Transportasi / Kendaraan",
  keperluan_pribadi: "Keperluan Pribadi",
  lainnya: "Lainnya",
};

function getFormReasonLabels(s: PermissionRequest) {
  const formLabel = FORM_TYPE_LABELS[s.formType || s.type] || s.formType || s.type || "—";
  const reasonLabel = REASON_TYPE_LABELS[s.reasonType || ""] || "";
  return { formLabel, reasonLabel };
}

function formatDurationLabel(s: PermissionRequest): string {
  const formType = s.formType || s.type;
  const start = safeToDate(s.startDate);
  const end = safeToDate(s.endDate);
  if (formType === "keluar_kantor") {
    const mins = s.totalDurationMinutes || 0;
    if (mins < 60) return `${mins} menit`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}j ${m}m` : `${h} jam`;
  }
  if (!start || !end) return "—";
  const days = differenceInCalendarDays(end, start) + 1;
  return days === 1 ? "1 hari" : `${days} hari`;
}

// Who the request is currently waiting on + what happens next — mirrors the
// staff-side quick-status strip so both views tell a consistent story.
function getProcessedBy(s: PermissionRequest): string | null {
  if (s.status === "pending_manager") return s.managerName || s.waitingForName || "Atasan";
  if (["approved_by_manager", "pending_hrd", "revision_hrd"].includes(s.status)) {
    return s.approvalFlow?.hrdName || "HRD";
  }
  return null;
}

function getNextStepMessage(s: PermissionRequest): string {
  switch (s.status) {
    case "draft":
      return "Pengajuan belum dikirim oleh staff.";
    case "pending_manager":
      return "Jika disetujui, pengajuan akan diteruskan ke HRD untuk validasi akhir.";
    case "approved_by_manager":
    case "pending_hrd":
    case "revision_hrd":
      return "Menunggu validasi akhir dari HRD.";
    case "rejected_manager":
      return "Pengajuan ditolak. Proses berhenti di sini — tidak diteruskan ke HRD.";
    case "rejected_hrd":
      return "Pengajuan ditolak oleh HRD. Proses berhenti di sini.";
    case "approved":
    case "closed":
    case "verified_manager":
      return "Pengajuan telah selesai diproses.";
    case "reported":
    case "returned":
      return "Pengajuan lama dari fitur pelacakan yang sudah tidak digunakan.";
    default:
      return "";
  }
}

function isHrdValidationPhase(s: PermissionRequest): boolean {
  const isHrdStep = s.currentApprovalStep === "hrd" || s.waitingForRole === "hrd" || s.waitingForName === "HRD";
  const isHrdStatus = [
    "pending_hrd",
    "pending_hrd_validation",
    "approved_by_manager",
    "verified_manager",
    "revision_hrd"
  ].includes(s.status);
  
  return isHrdStep || isHrdStatus;
}

// ─── Approval step state (drives the Alur Persetujuan stepper) ────────────────

type StepState = "done" | "active" | "revision" | "rejected" | "pending" | "skipped";

const STEP_STATE_CONFIG: Record<StepState, {
  label: string;
  icon: typeof CheckCircle2;
  dot: string;
  iconColor: string;
  card: string;
  text: string;
}> = {
  done: {
    label: "Selesai",
    icon: CheckCircle2,
    dot: "bg-emerald-100 dark:bg-emerald-900/40",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    card: "border-emerald-200/70 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-900/10",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  active: {
    label: "Menunggu Persetujuan",
    icon: Clock,
    dot: "bg-amber-100 dark:bg-amber-900/40",
    iconColor: "text-amber-600 dark:text-amber-400",
    card: "border-amber-300/70 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-900/15 ring-1 ring-amber-400/20",
    text: "text-amber-700 dark:text-amber-400",
  },
  revision: {
    label: "Perlu Revisi",
    icon: Edit,
    dot: "bg-orange-100 dark:bg-orange-900/40",
    iconColor: "text-orange-600 dark:text-orange-400",
    card: "border-orange-300/70 bg-orange-50/60 dark:border-orange-800/40 dark:bg-orange-900/15",
    text: "text-orange-700 dark:text-orange-400",
  },
  rejected: {
    label: "Ditolak",
    icon: XCircle,
    dot: "bg-red-100 dark:bg-red-900/40",
    iconColor: "text-red-600 dark:text-red-400",
    card: "border-red-300/70 bg-red-50/60 dark:border-red-800/40 dark:bg-red-900/15",
    text: "text-red-700 dark:text-red-400",
  },
  pending: {
    label: "Belum Diproses",
    icon: Circle,
    dot: "bg-muted",
    iconColor: "text-muted-foreground/50",
    card: "border-border bg-muted/20",
    text: "text-muted-foreground",
  },
  skipped: {
    label: "Tidak Diperlukan",
    icon: Circle,
    dot: "bg-muted",
    iconColor: "text-muted-foreground/30",
    card: "border-border bg-muted/10",
    text: "text-muted-foreground",
  },
};

function getManagerStepState(s: PermissionRequest): StepState {
  if (s.status === "rejected_manager") return "rejected";
  if (s.status === "revision_manager") return "revision";
  if (s.status === "pending_manager") return "active";
  return "done"; // any status past the manager stage
}

// HRD/final-approver step. Izin Keluar Kantor now follows the same
// Atasan → HRD flow as every other permission type — the only case that
// never reaches HRD is a legacy request left over from the old self-report
// tracking feature (verified_manager/reported/returned), shown as "skipped"
// rather than a misleading "belum diproses".
function getHrdStepState(s: PermissionRequest, isHrdReq: boolean): StepState {
  if (["verified_manager", "reported", "returned"].includes(s.status)) return "skipped";
  if (["pending_manager", "rejected_manager", "revision_manager", "draft"].includes(s.status)) {
    return "pending";
  }
  if (isHrdReq) {
    // Director-only flow — HRD only receives an administrative recap, never blocks.
    return s.status === "approved" || s.status === "closed" ? "done" : "pending";
  }
  if (s.status === "rejected_hrd") return "rejected";
  if (s.status === "revision_hrd") return "revision";
  if (["approved_by_manager", "pending_hrd"].includes(s.status)) return "active";
  return "done"; // approved / closed
}

const HUMAN_STATUS_LABELS: Record<
  string,
  (submission: PermissionRequest) => string
> = {
  draft: () => "Draft",
  pending_manager: (s) => `Menunggu persetujuan ${s.waitingForName || s.managerName || "Manager"}`,
  rejected_manager: () => "Ditolak",
  revision_manager: () => "Perlu Revisi",
  approved_by_manager: () => "Menunggu validasi HRD",
  pending_hrd: () => "Menunggu validasi HRD",
  rejected_hrd: () => "Ditolak",
  revision_hrd: () => "Perlu Revisi",
  approved: () => "Disetujui",
  reported: () => "Dilaporkan Keluar",
  returned: () => "Sudah Kembali",
  verified_manager: () => "Menunggu validasi HRD",
  closed: () => "Disetujui",
};

const buildTimeline = (submission: PermissionRequest, employeeProfile: EmployeeProfile | null) => {
  const items: {
    label: string;
    date?: Date;
    by?: string;
    notes?: string;
    icon?: "ok" | "warn" | "info";
  }[] = [];

  // 1. Pengajuan dibuat
  if (submission.createdAt) {
    items.push({
      label: "Pengajuan dibuat",
      date: safeToDate(submission.createdAt),
      by: getApplicantName(submission, employeeProfile),
      icon: "info",
    });
  }

  // 2. Dikirim ke manager
  if (submission.createdAt) {
    items.push({
      label: `Dikirim ke manager (${submission.managerName || "Atasan"})`,
      date: safeToDate(submission.createdAt),
      icon: "info",
    });
  }

  // 3. Manager action
  if (submission.managerDecisionAt) {
    const decDate = safeToDate(submission.managerDecisionAt);
    const mName = submission.managerName || "Manager";
    let eventLabel = `Manager ${mName} menyetujui pengajuan`;
    let icon: "ok" | "warn" = "ok";
    if (submission.status === "rejected_manager") {
      eventLabel = `Manager ${mName} menolak pengajuan`;
      icon = "warn";
    } else if (submission.status === "revision_manager") {
      eventLabel = `Manager ${mName} meminta revisi`;
      icon = "warn";
    }
    items.push({
      label: eventLabel,
      date: decDate,
      by: mName,
      notes: submission.managerNotes || undefined,
      icon,
    });

    // 4. Masuk validasi HRD (immediately after manager approval)
    if (
      ![
        "pending_manager",
        "rejected_manager",
        "revision_manager",
        "draft",
      ].includes(submission.status)
    ) {
      items.push({
        label: "Masuk validasi HRD",
        date: decDate,
        icon: "info",
      });
    }
  }

  // 5. HRD action
  if (submission.hrdDecisionAt) {
    const decDate = safeToDate(submission.hrdDecisionAt);
    let eventLabel = "HRD menyetujui pengajuan";
    let icon: "ok" | "warn" = "ok";
    if (submission.status === "rejected_hrd") {
      eventLabel = "HRD menolak pengajuan";
      icon = "warn";
    } else if (submission.status === "revision_hrd") {
      eventLabel = "HRD meminta revisi";
      icon = "warn";
    }
    items.push({
      label: eventLabel,
      date: decDate,
      notes: submission.hrdNotes || undefined,
      icon,
    });
  }

  // Deduplicate and sort by date
  const uniqueItems: typeof items = [];
  const labelsSeen = new Set<string>();
  
  const sortedRaw = items
    .filter(item => item.date)
    .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

  for (const item of sortedRaw) {
    if (!labelsSeen.has(item.label)) {
      labelsSeen.add(item.label);
      uniqueItems.push(item);
    }
  }
  
  return uniqueItems;
};

interface ReviewPermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: PermissionRequest;
  onSuccess: () => void;
  mode: "manager" | "hrd";
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

export function ReviewPermissionDialog({
  open,
  onOpenChange,
  submission,
  onSuccess,
  mode,
}: ReviewPermissionDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDecision, setConfirmDecision] = useState<"approve" | "reject" | null>(null);
  const [hrdWizardOpen, setHrdWizardOpen] = useState(false);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  // Canonical employee identity — always resolved by UID against employee_profiles,
  // never by name, so a stale snapshot on the request doc (e.g. an old division)
  // never wins over the employee's current profile.
  const { data: employeeProfile } = useDoc<EmployeeProfile>(
    useMemoFirebase(
      () => (submission.uid ? doc(firestore, "employee_profiles", submission.uid) : null),
      [firestore, submission.uid],
    ),
  );

  // We'll open attachments in a new tab via internal preview endpoint.

  const isFinal = isFinalStatus(submission.status);
  // Prevent HRD from approving their own submission
  const isHrdViewingOwnRequest = mode === "hrd" && submission.uid === userProfile?.uid;

  const canAct = useMemo(() => {
    if (isFinal) return false;
    if (isHrdViewingOwnRequest) return false;
    if (mode === "manager") {
      return isActionableStatus(submission.status, "manager");
    }
    if (mode === "hrd") {
      return isHrdValidationPhase(submission);
    }
    return false;
  }, [submission, mode, isFinal, isHrdViewingOwnRequest]);

  const canShowActions = useMemo(() => {
    if (isFinal) return false;
    if (isHrdViewingOwnRequest) return false;
    if (mode === "manager") {
      return (
        submission.waitingForUid === userProfile?.uid &&
        submission.status === "pending_manager"
      );
    }
    if (mode === "hrd") {
      return isHrdValidationPhase(submission);
    }
    return false;
  }, [submission, userProfile, mode, isFinal, isHrdViewingOwnRequest]);

  // Both manager's and HRD's confirmation dialogs collect and validate their
  // own note before calling this — there is no direct one-click decision path.
  const handleDecision = async (
    decision: "approve" | "reject" | "revise",
    note: string,
  ) => {
    if (!userProfile) return;

    if (!canAct) {
      toast({
        variant: "destructive",
        title: "Aksi Ditolak",
        description:
          "Pengajuan ini sudah final atau tidak lagi dapat diproses.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const submissionRef = doc(
        firestore,
        "permission_requests",
        submission.id!,
      );

      let status: PermissionRequest["status"] = submission.status;
      let payload: Partial<PermissionRequest> = {};
      const isManagerAction = mode === "manager";
      const isHrdRequester = submission.requesterRole === "hrd";

      const nowTs = Timestamp.now();

      if (isManagerAction) {
        // Izin Keluar Kantor follows the same Atasan → HRD flow as every
        // other permission type now — no separate "verified" terminal state.
        if (decision === "approve") {
          // HRD requesters skip the HRD validation step — director approval is final
          status = isHrdRequester ? "approved" : "approved_by_manager";
        } else if (decision === "reject") status = "rejected_manager";
        else if (decision === "revise") status = "revision_manager";

        // Build timeline entry for the decision
        const decisionEventLabel =
          decision === "approve"
            ? `${userProfile.fullName} menyetujui pengajuan`
            : decision === "reject"
              ? `${userProfile.fullName} menolak pengajuan`
              : `${userProfile.fullName} meminta revisi`;

        const updatedTimeline = [
          ...(submission.timeline || []),
          {
            event: decisionEventLabel,
            by: userProfile.fullName,
            byUid: userProfile.uid,
            at: nowTs,
            note: note || null,
          },
          ...(decision === "approve" && !isHrdRequester
            ? [
                {
                  event: "Pengajuan diteruskan ke HRD untuk validasi",
                  by: userProfile.fullName,
                  byUid: userProfile.uid,
                  at: nowTs,
                  note: null,
                },
              ]
            : []),
        ];

        payload = {
          status,
          managerReviewNote: note || null,
          managerNotes: note || null,
          managerDecisionAt: serverTimestamp() as any,
          timeline: updatedTimeline,
          // Update approval routing when manager approves
          ...(decision === "approve"
            ? isHrdRequester
              ? {
                  currentApprovalStep: "done",
                  waitingForUid: null,
                  waitingForName: null,
                }
              : {
                  currentApprovalStep: "hrd",
                  waitingForUid: null,
                  waitingForName: "HRD",
                }
            : {}),
        };
      } else {
        if (decision === "approve") status = "closed";
        else if (decision === "reject") status = "rejected_hrd";
        else if (decision === "revise") status = "revision_hrd";

        const hrdEventLabel =
          decision === "approve"
            ? "HRD memvalidasi dan menutup pengajuan"
            : decision === "reject"
              ? "HRD menolak pengajuan"
              : "HRD mengembalikan pengajuan untuk perbaikan";

        const updatedTimeline = [
          ...(submission.timeline || []),
          {
            event: hrdEventLabel,
            by: userProfile.fullName,
            byUid: userProfile.uid,
            at: nowTs,
            note: note || null,
          },
        ];

        payload = {
          status,
          hrdReviewNote: note || null,
          hrdNotes: note || null,
          hrdDecisionAt: serverTimestamp() as any,
          timeline: updatedTimeline,
          ...(decision === "approve"
            ? {
                currentApprovalStep: "done",
                waitingForUid: null,
                waitingForName: null,
              }
            : {}),
        };
      }

      await updateDocumentNonBlocking(submissionRef, payload);
      toast({
        title: "Keputusan Disimpan",
        description: `Pengajuan izin telah ${decision}.`,
      });
      onSuccess();
      setConfirmDecision(null);
      setHrdWizardOpen(false);
      onOpenChange(false);
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[calc(100vh-40px)] p-0 gap-0 flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl">
          <DialogHeader className="shrink-0 p-6 pb-4 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md border-b relative z-10 text-left">
            <DialogTitle className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Review Pengajuan Izin
            </DialogTitle>
            <DialogDescription className="sr-only">
              Tinjau detail pengajuan izin, alur persetujuan, dan riwayat status sebelum memberikan keputusan.
            </DialogDescription>
            {(() => {
              const { formLabel, reasonLabel } = getFormReasonLabels(submission);
              const applicantName = getApplicantName(submission, employeeProfile ?? null);
              return (
                <div className="pt-1">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white leading-snug">{formLabel}</p>
                  {reasonLabel && (
                    <p className="text-base text-slate-500 dark:text-slate-400 mt-0.5">{reasonLabel}</p>
                  )}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                    >
                      {(
                        HUMAN_STATUS_LABELS[submission.status] ||
                        (() => submission.status.replace(/_/g, " "))
                      )(submission)}
                    </Badge>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      Pengajuan {applicantName}
                    </span>
                  </div>
                  {submission.id && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-2 font-mono">
                      ID Pengajuan: {submission.id}
                    </p>
                  )}
                </div>
              );
            })()}
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
              {/* Ringkasan Status */}
              {(() => {
                const statusLabel = (
                  HUMAN_STATUS_LABELS[submission.status] ||
                  (() => submission.status.replace(/_/g, " "))
                )(submission);
                const processedBy = getProcessedBy(submission);
                const nextStep = getNextStepMessage(submission);
                return (
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                        Status Saat Ini
                      </p>
                      <p className="text-sm font-semibold text-foreground">{statusLabel}</p>
                    </div>
                    {processedBy && (
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                          Sedang Diproses Oleh
                        </p>
                        <p className="text-sm font-semibold text-foreground truncate">{processedBy}</p>
                      </div>
                    )}
                    {nextStep && (
                      <div className={cn("min-w-0", !processedBy && "sm:col-span-2")}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                          Langkah Berikutnya
                        </p>
                        <p className="text-sm text-foreground leading-relaxed">{nextStep}</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ── Kiri: Informasi Karyawan + Informasi Pengajuan ── */}
                <div className="space-y-6">
              <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Informasi Karyawan
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-3">
                  <InfoRow
                    label="Nama"
                    value={getApplicantName(submission, employeeProfile ?? null)}
                  />
                  {(() => {
                    const info = getApplicantInfo(submission, employeeProfile ?? null);
                    return (
                      <>
                        <InfoRow label="Jabatan" value={info.position} />
                        <InfoRow label="Divisi" value={info.division} />
                        <InfoRow label="Brand" value={info.brand} />
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Informasi Pengajuan
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-3">
                  {(() => {
                    const { formLabel, reasonLabel } = getFormReasonLabels(submission);
                    const startDt = safeToDate(submission.startDate);
                    const endDt = safeToDate(submission.endDate);
                    const formType = submission.formType || submission.type;
                    const isOfficeExitForm = formType === "keluar_kantor";
                    const multiDay = startDt && endDt && differenceInCalendarDays(endDt, startDt) > 0;
                    return (
                      <>
                        <InfoRow label="Jenis Izin" value={formLabel} />
                        {reasonLabel && <InfoRow label="Kategori" value={reasonLabel} />}
                        {startDt && (
                          <InfoRow
                            label="Tanggal"
                            value={
                              multiDay && endDt
                                ? `${format(startDt, "dd MMM yyyy", { locale: idLocale })} — ${format(endDt, "dd MMM yyyy", { locale: idLocale })}`
                                : format(startDt, "dd MMMM yyyy", { locale: idLocale })
                            }
                          />
                        )}
                        {isOfficeExitForm && startDt && endDt && (
                          <>
                            <InfoRow label="Jam Keluar" value={format(startDt, "HH:mm")} />
                            <InfoRow label="Jam Kembali" value={format(endDt, "HH:mm")} />
                          </>
                        )}
                        <InfoRow label="Durasi" value={formatDurationLabel(submission)} />
                        {(submission.reason || submission.detailedReason) && (
                          <InfoRow
                            label={isOfficeExitForm ? "Keperluan" : "Keterangan"}
                            value={submission.reason || submission.detailedReason || undefined}
                          />
                        )}
                        {submission.destination && (
                          <InfoRow label="Tujuan" value={submission.destination} />
                        )}
                        {submission.location && (
                          <InfoRow label="Lokasi" value={submission.location} />
                        )}
                        {submission.otherTitle && (
                          <InfoRow label="Judul Izin" value={submission.otherTitle} />
                        )}
                        {safeToDate(submission.createdAt) && (
                          <InfoRow
                            label="Diajukan pada"
                            value={format(safeToDate(submission.createdAt)!, "dd MMM yyyy, HH:mm", { locale: idLocale })}
                          />
                        )}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
                </div>

                {/* ── Kanan: Alur Persetujuan + Timeline ── */}
                <div className="space-y-6">
              {/* Alur Persetujuan */}
              <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Alur Persetujuan
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  {(() => {
                    const isHrdReq = submission.requesterRole === "hrd";
                    return (
                      <>
                        {isHrdReq && (
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
                            <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                              💡 Catatan Alur Khusus HRD
                            </p>
                            <p className="text-xs text-blue-800 dark:text-blue-300 mt-1">
                              Karena pengajuan ini dibuat oleh HRD, keputusan akhir berada di Direktur. HRD hanya menerima rekap administrasi setelah keputusan diberikan.
                            </p>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Step visual (vertical) */}
                  {(() => {
                    const isHrdReq = submission.requesterRole === "hrd";
                    const steps: { role: string; name: string; state: StepState; at?: Date }[] = [
                      {
                        role: "Pengaju",
                        name: getApplicantName(submission, employeeProfile ?? null),
                        state: "done",
                        at: safeToDate(submission.createdAt),
                      },
                      {
                        role: isHrdReq ? "Direktur" : "Atasan",
                        name: submission.managerName || (isHrdReq ? "Direktur" : "Belum ditentukan"),
                        state: getManagerStepState(submission),
                        at: safeToDate(submission.managerDecisionAt),
                      },
                      {
                        role: "HRD",
                        name: submission.approvalFlow?.hrdName || "HRD",
                        state: getHrdStepState(submission, isHrdReq),
                        at: isHrdReq ? undefined : safeToDate(submission.hrdDecisionAt),
                      },
                    ];
                    return (
                      <ol>
                        {steps.map((step, i) => {
                          const isLast = i === steps.length - 1;
                          const cfg = STEP_STATE_CONFIG[step.state];
                          const Icon = cfg.icon;
                          return (
                            <li key={i} className="flex gap-3">
                              <div className="flex flex-col items-center flex-shrink-0">
                                <div className={cn("h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0", cfg.dot)}>
                                  <Icon className={cn("h-4 w-4", cfg.iconColor)} />
                                </div>
                                {!isLast && <div className="w-px flex-1 bg-border/60 my-1 min-h-[20px]" />}
                              </div>
                              <div className={cn("flex-1 min-w-0 rounded-lg border p-3 mb-3", cfg.card)}>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {step.role}
                                  </p>
                                  <span className={cn("text-[11px] font-semibold", cfg.text)}>{cfg.label}</span>
                                </div>
                                <p className="text-sm font-semibold text-foreground mt-1 truncate">{step.name}</p>
                                {step.at && (
                                  <p className="text-[11px] text-muted-foreground mt-1">
                                    {format(step.at, "dd MMMM yyyy, HH:mm", { locale: idLocale })}
                                  </p>
                                )}
                                {step.state === "rejected" && step.role !== "Pengaju" && (
                                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 font-medium">
                                    {i === 2 ? "Pengajuan berhenti di tahap ini." : "HRD tidak dilanjutkan."}
                                  </p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Timeline Aktivitas */}
              <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Timeline Aktivitas
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  <div className="relative space-y-0">
                    {buildTimeline(submission, employeeProfile ?? null).map((t, i, arr) => (
                      <div key={i} className="flex gap-3 relative">
                        {/* Vertical line */}
                        {i < arr.length - 1 && (
                          <div className="absolute left-[9px] top-5 bottom-0 w-px bg-border" />
                        )}
                        {/* Dot */}
                        <div
                          className={cn(
                            "relative z-10 mt-0.5 h-5 w-5 rounded-full flex-shrink-0 flex items-center justify-center border-2",
                            t.icon === "ok"
                              ? "bg-emerald-50 border-emerald-400 dark:bg-emerald-900/30"
                              : t.icon === "warn"
                                ? "bg-red-50 border-red-400 dark:bg-red-900/30"
                                : "bg-muted border-border",
                          )}
                        >
                          <div
                            className={cn(
                              "h-2 w-2 rounded-full",
                              t.icon === "ok"
                                ? "bg-emerald-500"
                                : t.icon === "warn"
                                  ? "bg-red-500"
                                  : "bg-muted-foreground",
                            )}
                          />
                        </div>
                        {/* Content */}
                        <div className="pb-4 flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-medium text-foreground">
                              {t.label}
                            </p>
                            <p className="text-xs text-muted-foreground flex-shrink-0">
                              {t.date
                                ? format(t.date, "dd MMM yyyy, HH:mm", {
                                    locale: idLocale,
                                  })
                                : "—"}
                            </p>
                          </div>
                          {t.by && (
                            <p className="text-xs text-muted-foreground">
                              oleh {t.by}
                            </p>
                          )}
                          {t.notes && (
                            <p className="text-xs italic text-muted-foreground mt-1 bg-muted/40 rounded px-2 py-1">
                              "{t.notes}"
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {buildTimeline(submission, employeeProfile ?? null).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Belum ada aktivitas tercatat.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
                </div>
              </div>


              <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden">
                  <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 border-b border-slate-200 dark:border-slate-800">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {submission.reasonType === "sakit"
                        ? "Bukti Pendukung Sakit"
                        : "Lampiran"}
                    </CardTitle>
                  </CardHeader>
                  {submission.attachments?.length ? (
                  <CardContent className="p-5 space-y-3">
                    {submission.attachments.map((raw: any, i: number) => {
                      const a = parseAttachment(raw, i) || {
                        proxySrc: undefined,
                        name: `Lampiran ${i + 1}`,
                      };
                      const showBadge = submission.reasonType === "sakit";
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-4 p-3 border border-border rounded"
                        >
                          <div className="w-16 h-12 flex-shrink-0 overflow-hidden rounded-md bg-muted/30 flex items-center justify-center">
                            {a.isImage ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (a.driveFileId) {
                                    window.open(
                                      `/api/storage/google-drive-preview?fileId=${a.driveFileId}`,
                                      "_blank",
                                    );
                                  } else if (
                                    a.proxySrc &&
                                    a.proxySrc.startsWith(
                                      "/api/storage/google-drive-preview",
                                    )
                                  ) {
                                    window.open(a.proxySrc, "_blank");
                                  } else {
                                    toast({
                                      title:
                                        "File lampiran belum memiliki ID preview.",
                                      description:
                                        "Tidak dapat membuka preview internal.",
                                      variant: "default",
                                    });
                                  }
                                }}
                                className="w-full h-full block"
                              >
                                <img
                                  src={a.proxySrc}
                                  alt={a.name}
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            ) : (
                              <FileText className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {a.cleanName || a.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {a.mimeType ||
                                (a.isPdf
                                  ? "PDF"
                                  : a.cleanName && /\./.test(a.cleanName)
                                    ? a.cleanName.split(".").pop()
                                    : "Dokumen")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {showBadge && (
                              <Badge className="text-xs bg-rose-50 text-rose-600">
                                Bukti Pendukung Sakit
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (a.driveFileId) {
                                  window.open(
                                    `/api/storage/google-drive-preview?fileId=${a.driveFileId}`,
                                    "_blank",
                                  );
                                } else if (
                                  a.proxySrc &&
                                  a.proxySrc.startsWith(
                                    "/api/storage/google-drive-preview",
                                  )
                                ) {
                                  window.open(a.proxySrc, "_blank");
                                } else {
                                  toast({
                                    title:
                                      "File lampiran belum memiliki ID preview.",
                                    description:
                                      "File tidak tersedia untuk preview internal.",
                                    variant: "default",
                                  });
                                }
                              }}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1.5" /> Lihat
                              Lampiran
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                  ) : (
                    <CardContent className="p-5">
                      <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-6 text-center">
                        <FileText className="h-5 w-5 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">Tidak ada lampiran</p>
                      </div>
                    </CardContent>
                  )}
                </Card>

              {submission.managerNotes && (
                <Card className="border border-slate-200 dark:border-slate-800 shadow-none rounded-lg overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
                  <CardHeader className="py-2 border-b border-slate-200 dark:border-slate-800">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Catatan Reviu Manager
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <p className="text-sm italic">
                      "{submission.managerNotes}"
                    </p>
                  </CardContent>
                </Card>
              )}

              {isHrdViewingOwnRequest && (
                <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 dark:border-teal-900/40 dark:bg-teal-950/20">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="h-4 w-4 mt-0.5 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-teal-800 dark:text-teal-300">
                        Ini adalah pengajuan Anda
                      </p>
                      <p className="text-xs text-teal-700 dark:text-teal-400 mt-1">
                        {submission.status === "approved"
                          ? "Pengajuan sudah disetujui direktur dan masuk rekap administrasi HRD."
                          : "Pengajuan sedang menunggu persetujuan direktur. Rekap HRD akan diperbarui otomatis."}
                      </p>
                    </div>
                  </div>
                </div>
              )}
          </div>

          <DialogFooter className="shrink-0 p-6 border-t bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md sm:justify-between items-center gap-4">
            <Button
              variant="ghost"
              className="px-6 h-10 text-xs font-bold uppercase tracking-widest"
              onClick={() => onOpenChange(false)}
            >
              Tutup
            </Button>

            {canShowActions && mode === "manager" && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-10 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-500 hover:dark:bg-red-950/20 px-4 text-xs font-bold uppercase tracking-wider"
                  onClick={() => setConfirmDecision("reject")}
                  disabled={isSaving}
                >
                  Tolak
                </Button>
                <Button
                  className="h-10 px-8 text-xs font-bold uppercase tracking-widest text-white shadow-sm bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setConfirmDecision("approve")}
                  disabled={isSaving}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Setujui
                </Button>
              </div>
            )}

            {canShowActions && mode === "hrd" && (
              <Button
                className="h-10 px-8 text-xs font-bold uppercase tracking-widest text-white shadow-sm bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setHrdWizardOpen(true)}
                disabled={isSaving}
              >
                Verifikasi Pengajuan
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {mode === "manager" && (
        <DecisionConfirmDialog
          key={`${submission.id}-${confirmDecision ?? "closed"}`}
          decision={confirmDecision}
          submission={submission}
          employeeProfile={employeeProfile ?? null}
          isSaving={isSaving}
          onOpenChange={(open) => !open && !isSaving && setConfirmDecision(null)}
          onConfirm={(note) => {
            if (!confirmDecision) return;
            handleDecision(confirmDecision, note);
          }}
        />
      )}

      {mode === "hrd" && (
        <HrdDecisionWizard
          key={`${submission.id}-${hrdWizardOpen}`}
          open={hrdWizardOpen}
          submission={submission}
          employeeProfile={employeeProfile ?? null}
          isSaving={isSaving}
          onOpenChange={(open) => !open && !isSaving && setHrdWizardOpen(false)}
          onConfirm={(decision, note) => handleDecision(decision, note)}
        />
      )}

      {/* Attachment preview now opens internal preview endpoint in new tab; modal removed */}
    </>
  );
}

// ─── DecisionConfirmDialog (Setujui / Tolak confirmation) ─────────────────────
// Stacks on top of the review modal. Approval needs no reason at all — it's a
// plain yes/no confirmation. Rejection offers an optional reason field, never
// required, so a manager is never blocked from deciding either way.

function DecisionConfirmDialog({
  decision,
  submission,
  employeeProfile,
  isSaving,
  onOpenChange,
  onConfirm,
}: {
  decision: "approve" | "reject" | null;
  submission: PermissionRequest;
  employeeProfile: EmployeeProfile | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const isApprove = decision === "approve";

  const { formLabel } = getFormReasonLabels(submission);
  const applicantName = getApplicantName(submission, employeeProfile);
  const startDt = safeToDate(submission.startDate);
  const endDt = safeToDate(submission.endDate);
  const formType = submission.formType || submission.type;
  const periodLabel = startDt
    ? `${format(startDt, "dd MMMM yyyy", { locale: idLocale })}${
        formType === "keluar_kantor" && endDt
          ? ` • ${format(startDt, "HH:mm")}–${format(endDt, "HH:mm")}`
          : ""
      }`
    : "";

  return (
    <ConfirmDialog open={decision !== null} onOpenChange={onOpenChange}>
      <ConfirmDialogContent className="max-w-md">
        <ConfirmDialogHeader>
          <ConfirmDialogTitle>
            {isApprove ? "Setujui Pengajuan Izin?" : "Tolak Pengajuan Izin?"}
          </ConfirmDialogTitle>
          <ConfirmDialogDescription>
            Anda yakin ingin {isApprove ? "menyetujui" : "menolak"} pengajuan izin:
            <br />
            <span className="font-semibold text-foreground">{applicantName} — {formLabel}</span>
            {periodLabel && (
              <>
                <br />
                {periodLabel}
              </>
            )}
            <br />
            {isApprove
              ? "Setelah disetujui, pengajuan akan diteruskan ke HRD."
              : "Pengajuan akan dihentikan dan tidak diteruskan ke HRD."}
          </ConfirmDialogDescription>
        </ConfirmDialogHeader>

        {!isApprove && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Alasan Penolakan (Opsional)
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: Jadwal berbenturan dengan agenda tim yang wajib dihadiri."
              rows={4}
              className="resize-none text-sm"
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Jika diisi, alasan ini akan dapat dilihat oleh karyawan pada riwayat pengajuannya.
            </p>
          </div>
        )}

        <ConfirmDialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Batal
          </Button>
          <Button
            onClick={() => onConfirm(note.trim())}
            disabled={isSaving}
            className={cn(
              "text-white",
              isApprove ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700",
            )}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memproses...
              </>
            ) : isApprove ? (
              "Ya, Setujui"
            ) : (
              "Ya, Tolak"
            )}
          </Button>
        </ConfirmDialogFooter>
      </ConfirmDialogContent>
    </ConfirmDialog>
  );
}

// ─── HrdDecisionWizard (single-door, 2-step Verifikasi Pengajuan) ─────────────
// Replaces the old 3-button footer (Reviu/Revisi, Tolak, Setujui Pengajuan).
// There is no hard reject here — "not approved" always means the request is
// handed back to the staff as a revision (status revision_hrd, the existing
// field), never a terminal rejected_hrd. Step 1 picks the outcome, step 2
// confirms it (with a required note only for the revision path); Firestore
// is only touched after the step-2 confirmation.

function HrdDecisionWizard({
  open,
  submission,
  employeeProfile,
  isSaving,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  submission: PermissionRequest;
  employeeProfile: EmployeeProfile | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (decision: "approve" | "revise", note: string) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [choice, setChoice] = useState<"approve" | "revise" | null>(null);
  const [note, setNote] = useState("");

  const { formLabel } = getFormReasonLabels(submission);
  const applicantName = getApplicantName(submission, employeeProfile);
  const startDt = safeToDate(submission.startDate);
  const endDt = safeToDate(submission.endDate);
  const formType = submission.formType || submission.type;
  const periodLabel = startDt
    ? `${format(startDt, "dd MMMM yyyy", { locale: idLocale })}${
        formType === "keluar_kantor" && endDt
          ? ` • ${format(startDt, "HH:mm")}–${format(endDt, "HH:mm")}`
          : ""
      }`
    : "";

  const trimmedNote = note.trim();

  const handleClose = () => {
    if (isSaving) return;
    onOpenChange(false);
  };

  return (
    <ConfirmDialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <ConfirmDialogContent className="max-w-md">
        {step === 1 && (
          <>
            <ConfirmDialogHeader>
              <ConfirmDialogTitle>Verifikasi Pengajuan Izin</ConfirmDialogTitle>
              <ConfirmDialogDescription>
                <span className="font-semibold text-foreground">{applicantName}</span>
                <br />
                {formLabel}
                {periodLabel && (
                  <>
                    <br />
                    {periodLabel}
                  </>
                )}
              </ConfirmDialogDescription>
            </ConfirmDialogHeader>

            <div className="py-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Pilih keputusan
              </p>
              <RadioGroup
                value={choice ?? undefined}
                onValueChange={(v) => setChoice(v as "approve" | "revise")}
                className="gap-2"
              >
                <Label
                  htmlFor="hrd-choice-approve"
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors font-normal",
                    choice === "approve"
                      ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/15"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <RadioGroupItem value="approve" id="hrd-choice-approve" />
                  <span className="text-sm font-medium text-foreground">Setujui Pengajuan</span>
                </Label>
                <Label
                  htmlFor="hrd-choice-revise"
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors font-normal",
                    choice === "revise"
                      ? "border-amber-400 bg-amber-50 dark:bg-amber-900/15"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <RadioGroupItem value="revise" id="hrd-choice-revise" />
                  <span className="text-sm font-medium text-foreground">Kembalikan untuk Perbaikan</span>
                </Label>
              </RadioGroup>
            </div>

            <ConfirmDialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose}>
                Batal
              </Button>
              <Button onClick={() => setStep(2)} disabled={!choice}>
                Selanjutnya
              </Button>
            </ConfirmDialogFooter>
          </>
        )}

        {step === 2 && choice === "approve" && (
          <>
            <ConfirmDialogHeader>
              <ConfirmDialogTitle>Konfirmasi Persetujuan</ConfirmDialogTitle>
              <ConfirmDialogDescription>
                Anda akan menyetujui pengajuan:
                <br />
                <span className="font-semibold text-foreground">{applicantName}</span> — {formLabel}
                {periodLabel && (
                  <>
                    <br />
                    {periodLabel}
                  </>
                )}
                <br />
                <br />
                Setelah disetujui, status pengajuan akan diperbarui dan proses akan dilanjutkan sesuai alur persetujuan.
              </ConfirmDialogDescription>
            </ConfirmDialogHeader>
            <p className="text-sm font-medium text-foreground">Apakah Anda yakin?</p>
            <ConfirmDialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={isSaving}>
                Kembali
              </Button>
              <Button
                onClick={() => onConfirm("approve", "")}
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memproses...
                  </>
                ) : (
                  "Ya, Setujui"
                )}
              </Button>
            </ConfirmDialogFooter>
          </>
        )}

        {step === 2 && choice === "revise" && (
          <>
            <ConfirmDialogHeader>
              <ConfirmDialogTitle>Kembalikan Pengajuan untuk Perbaikan</ConfirmDialogTitle>
              <ConfirmDialogDescription>
                <span className="font-semibold text-foreground">{applicantName}</span> — {formLabel}
                {periodLabel && (
                  <>
                    <br />
                    {periodLabel}
                  </>
                )}
              </ConfirmDialogDescription>
            </ConfirmDialogHeader>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Catatan Perbaikan <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: Mohon perbaiki jam izin karena berbenturan dengan agenda meeting divisi."
                rows={4}
                className="resize-none text-sm"
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">
                Jelaskan bagian yang perlu diperbaiki agar karyawan mengetahui apa yang harus diperbarui.
              </p>
            </div>
            <ConfirmDialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={isSaving}>
                Kembali
              </Button>
              <Button
                onClick={() => onConfirm("revise", trimmedNote)}
                disabled={trimmedNote.length === 0 || isSaving}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memproses...
                  </>
                ) : (
                  "Kembalikan ke Staff"
                )}
              </Button>
            </ConfirmDialogFooter>
          </>
        )}
      </ConfirmDialogContent>
    </ConfirmDialog>
  );
}
