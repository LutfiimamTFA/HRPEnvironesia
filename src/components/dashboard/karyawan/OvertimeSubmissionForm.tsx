"use client";

/**
 * Pengajuan Lembur — manual-only, multi-pekerjaan form. No Realtime Timer,
 * no mode picker: "Buat Pengajuan Lembur" opens this directly. Deliberately
 * never reads attendance_events/tap-in/tap-out — not every employee uses Web
 * Absen (fingerprint/manual/lapangan/WFH/dinas all exist), so overtime can't
 * depend on it. Anomaly flags (src/lib/overtime-utils.ts) are advisory only
 * — atasan/HRD see them, nothing here ever blocks a submission because of
 * one.
 *
 * One submission can cover more than one distinct piece of work (jobs[]) —
 * a staff member who did two unrelated things in the same overtime window
 * no longer has to file two separate pengajuan for it.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Send, UserCheck, AlertTriangle, Upload, X, FileText,
  CheckCircle2, Info, Link as LinkIcon, PlusCircle, Trash2, Clock,
  Briefcase, History,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import {
  useFirestore, useDoc, useCollection, useMemoFirebase,
} from "@/firebase";
import { uploadFile } from "@/lib/storage/storage-adapter";
import {
  doc, addDoc, updateDoc, collection, query, where, serverTimestamp,
  Timestamp, arrayUnion,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import type { OvertimeSubmission, EmployeeProfile, Brand } from "@/lib/types";
import { resolveApprovalTarget, type DivisionMasterOrganization } from "@/lib/approval-flow";
import {
  OVERTIME_TYPE_OPTIONS, HOLIDAY_TYPE_OPTIONS, WORK_LOCATION_OPTIONS, ASSIGNMENT_TYPE_OPTIONS,
  computeOvertimeDuration, formatDurationLabel, getOvertimeTypeLabel, getHolidayTypeLabel,
  getWorkLocationLabel, getAssignmentTypeLabel, detectOvertimeAnomalies,
  getAnomalyFlagLabel, getReviewLevelFromFlags, checkOvertimeOverlap,
  getOvertimeStatusLabel, getOvertimeStatusTone, formatTimeInput, parseTimeToMinutes,
  buildTaskAssignerCandidates, getTaskAssignerSubtitle, getTaskAssignerSummaryLabel,
  getDisplayPosition, TASK_ASSIGNER_CATEGORY_LABELS, type TaskAssignerCandidate, type TaskAssignerCategory,
} from "@/lib/overtime-utils";
import { GoogleDatePicker } from "@/components/ui/google-date-picker";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  type EvidenceItem, isImageEvidence, collectOvertimeEvidence,
  EvidenceThumbnailGrid, EvidenceLightbox, openEvidenceInNewTab,
} from "./OvertimeEvidencePreview";

// Indonesian 24-jam format with a dot separator ("17.00", "21.30") —
// deliberately NOT "HH:mm" and NOT a native <input type="time">, which
// renders as a locale-dependent (often AM/PM) picker in some browsers.
// Colon-separated values are still READ fine (see overtime-utils.ts's
// lenient parseHHmmToMinutes) since older submissions were saved that way,
// but the form only ever accepts/produces the dot format going forward.
const TIME_REGEX = /^([01]\d|2[0-3])\.([0-5]\d)$/;
const TIME_FORMAT_ERROR = "Gunakan format jam 24 jam, contoh: 17.00";

function newJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const jobItemSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Judul pekerjaan wajib diisi."),
  projectOrClient: z.string().optional().default(""),
  workSummary: z.string().min(10, "Ringkasan pekerjaan wajib diisi (minimal 10 karakter)."),
  workOutput: z.string().min(10, "Output pekerjaan wajib diisi (minimal 10 karakter)."),
  estimatedDurationMinutes: z.coerce.number().min(1, "Estimasi durasi pekerjaan wajib diisi."),
  evidenceLinks: z.array(z.string().min(1)).optional().default([]),
});

const overtimeFormSchema = z
  .object({
    overtimeDate: z.date({ required_error: "Tanggal lembur harus diisi." }),
    overtimeType: z.enum(["hari_kerja", "hari_libur"], {
      required_error: "Tipe lembur harus dipilih.",
    }),
    holidayType: z.enum(["weekend", "libur_nasional", "libur_perusahaan", "cuti_bersama", "lainnya"]).optional(),
    holidayTypeOther: z.string().optional().default(""),
    startTime: z.string().regex(TIME_REGEX, TIME_FORMAT_ERROR),
    endTime: z.string().regex(TIME_REGEX, TIME_FORMAT_ERROR),
    workLocation: z.enum(["kantor", "wfh", "lapangan", "dinas", "lainnya"], {
      required_error: "Lokasi/kondisi lembur harus dipilih.",
    }),
    workLocationDetail: z.string().optional().default(""),
    taskAssignerUid: z.string().min(1, "Atasan/Koordinator pemberi tugas harus dipilih."),
    projectOrClient: z.string().optional().default(""),
    assignmentType: z.enum(
      ["terencana", "mendadak_urgent", "instruksi_atasan", "kebutuhan_operasional", "penyelesaian_deadline", "lainnya"],
      { required_error: "Jenis penugasan harus dipilih." },
    ),
    assignmentTypeOther: z.string().optional().default(""),
    jobs: z.array(jobItemSchema).min(1, "Minimal harus ada satu pekerjaan lembur."),
    overtimeReason: z.string().min(10, "Alasan lembur wajib diisi (minimal 10 karakter)."),
    declarationAccepted: z.boolean().refine((v) => v === true, {
      message: "Pernyataan kebenaran data wajib dicentang.",
    }),
  })
  .refine((data) => data.overtimeType !== "hari_libur" || !!data.holidayType, {
    message: "Jenis hari libur wajib dipilih.",
    path: ["holidayType"],
  })
  .refine((data) => data.workLocation !== "lainnya" || !!data.workLocationDetail?.trim(), {
    message: "Lokasi/kondisi lembur harus dijelaskan jika memilih Lainnya.",
    path: ["workLocationDetail"],
  })
  .refine((data) => computeOvertimeDuration(data.startTime, data.endTime).durationMinutes > 0, {
    message: "Durasi lembur harus lebih dari 0 menit.",
    path: ["endTime"],
  });

type FormValues = z.infer<typeof overtimeFormSchema>;
type JobFormValue = FormValues["jobs"][number];

interface OvertimeSubmissionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: OvertimeSubmission | null;
  employeeProfile: EmployeeProfile | null;
  brands: Brand[];
  /** This employee's OTHER own submissions — used for overlap/streak anomaly detection and "Gunakan Pengajuan Terakhir". Never sent anywhere else. */
  existingSubmissions?: OvertimeSubmission[];
  onSuccess: () => void;
  formMode: "view" | "edit";
  onRequestEdit?: () => void;
}

function toJsDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function overtimeDateKey(value: any): string {
  const d = toJsDate(value);
  return d ? format(d, "yyyy-MM-dd") : "";
}

function emptyJob(): JobFormValue {
  return { id: newJobId(), title: "", projectOrClient: "", workSummary: "", workOutput: "", estimatedDurationMinutes: 0, evidenceLinks: [] };
}

// ── overtime_submissions create-payload sanitizer ───────────────────────────
// firestore.rules validates create with request.resource.data.keys().hasOnly(
// [...]) — one field outside that whitelist and the whole write is denied.
// basePayload is built as a precise literal object (never a spread of form
// state), so nothing here SHOULD leak in, but this is a defensive backstop —
// and the debug log below makes a future whitelist/payload drift visible
// immediately instead of surfacing as a bare permission error again.
function removeUndefinedDeep(value: any): any {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedDeep);
  }
  if (
    value &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    typeof value.toDate !== "function" &&
    typeof value.isEqual !== "function" // Firestore Timestamp/FieldValue sentinels — never treat these as plain objects to recurse into.
  ) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefinedDeep(v)]),
    );
  }
  return value;
}

const FORBIDDEN_OVERTIME_CREATE_KEYS = [
  "division", "workRole", "holidayTypeOther", "isDirectSupervisor",
  "selectedAssigner", "selectedTaskAssigner", "tempFiles", "localFiles",
  "fileObjects", "rawFile", "previewUrl", "durationLabel", "validationLabel",
  "validationStatus", "formStep", "draftId", "lastSavedAt", "isSubmitting",
  "debugData", "evidenceFileObjects", "jobEvidenceFileObjects",
];

function sanitizeOvertimeCreatePayload(payload: any) {
  const cleaned = removeUndefinedDeep(payload);
  for (const key of FORBIDDEN_OVERTIME_CREATE_KEYS) {
    delete cleaned[key];
  }
  return cleaned;
}

// Mirrors manualOvertimeCreateKeys() in firestore.rules — kept here only for
// the [OVERTIME_UNKNOWN_PAYLOAD_KEYS] debug log, not as the enforcement
// mechanism (rules remain the actual source of truth).
const ALLOWED_OVERTIME_CREATE_KEYS = new Set([
  "employeeUid", "uid", "userId", "employeeName", "employeeCode", "employeeType", "position", "jobTitle",
  "brandId", "brandName", "companyId", "companyName", "divisionId", "divisionName",
  "inputMode",
  "overtimeDate", "overtimeDateStr", "overtimeMonthKey", "overtimeDay",
  "startTime", "endTime", "startTimeMinutes", "endTimeMinutes",
  "durationMinutes", "durationHours", "totalDurationMinutes", "isCrossDay",
  "overtimeType", "overtimeTypeLabel", "holidayType", "holidayTypeLabel",
  "workLocation", "workLocationLabel", "workLocationOther", "workLocationDetail", "location", "locationDetail",
  "taskAssignerUid", "taskAssignerName", "taskAssignerRole", "taskAssignerRoleLabel",
  "taskAssignerPosition", "taskAssignerDivisionId", "taskAssignerDivisionName",
  "taskAssignerBrandId", "taskAssignerBrandName", "taskAssignerGroup",
  "overtimeCoordinatorUid", "overtimeCoordinatorName", "overtimeCoordinatorRole",
  "overtimeCoordinatorPosition", "overtimeCoordinatorEmail", "overtimeInstructionNote",
  "assignmentType", "assignmentTypeLabel", "assignmentTypeOther", "projectOrClient",
  "jobs", "tasks", "taskDetails", "totalJobDurationMinutes",
  "workSummary", "workOutput", "overtimeReason", "reason", "reasonDetail", "notes", "employeeNotes",
  "evidenceFiles", "evidenceLinks", "attachments", "attachmentUrls", "supportingEvidence", "hasSupportingEvidence",
  "declarationAccepted", "declarationAcceptedAt",
  "anomalyFlags", "reviewLevel", "reviewStatus",
  "status", "approvalStatus", "approvalLevel", "approvalFlowType", "approvalFlow",
  "currentApprovalStep", "currentApproverUid", "approvalTargetUid",
  "waitingForUid", "waitingForName", "waitingForRole",
  "directSupervisorUid", "directSupervisorName", "managerUid", "managerName", "managerDivisionName",
  "timeline", "activityLog", "createdAt", "updatedAt", "submittedAt",
  "createdByUid", "createdByName", "submittedByUid", "submittedByName",
]);

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-right">{value || "-"}</p>
    </div>
  );
}

function ToneBadge({ tone, children }: { tone: ReturnType<typeof getOvertimeStatusTone>; children: React.ReactNode }) {
  const classes: Record<string, string> = {
    neutral: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    info: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    danger: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
  };
  return <Badge variant="outline" className={`${classes[tone]} font-semibold`}>{children}</Badge>;
}

// ── Read-only detail view (existing submission) ─────────────────────────────

function OvertimeSubmissionDetailView({
  submission,
  canEdit,
  onRequestEdit,
  onClose,
}: {
  submission: OvertimeSubmission;
  canEdit: boolean;
  onRequestEdit?: () => void;
  onClose: () => void;
}) {
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

  const overtimeDate = toJsDate(submission.overtimeDate);
  const jobs = submission.jobs?.length
    ? submission.jobs
    : submission.workSummary || submission.workOutput
      ? [{
          id: "legacy",
          title: "Pekerjaan Lembur",
          workSummary: submission.workSummary || submission.reason || "-",
          workOutput: submission.workOutput || "-",
          estimatedDurationMinutes: submission.totalDurationMinutes || 0,
          evidenceFiles: submission.evidenceFiles || [],
          evidenceLinks: submission.evidenceLinks || [],
        }]
      : [];
  // All evidence in one deduped list (evidenceFiles + attachments + every
  // job's evidenceFiles overlap heavily — see collectOvertimeEvidence).
  const allEvidence = collectOvertimeEvidence(submission);
  const topLevelEvidenceLinks = submission.evidenceLinks || [];
  const anomalyFlags = submission.anomalyFlags || [];

  return (
    <DialogContent className="max-w-7xl w-[94vw] max-h-[90vh] p-0 overflow-hidden flex flex-col">
      <DialogHeader className="shrink-0 border-b px-6 py-4">
        <DialogTitle className="flex items-center gap-2 flex-wrap">
          Detail Pengajuan Lembur
          <ToneBadge tone={getOvertimeStatusTone(submission.status)}>{getOvertimeStatusLabel(submission.status)}</ToneBadge>
          {submission.reviewLevel === "perlu_review" && <ToneBadge tone="warning">Perlu Review</ToneBadge>}
        </DialogTitle>
        <DialogDescription>
          {overtimeDate ? format(overtimeDate, "EEEE, dd MMMM yyyy", { locale: idLocale }) : "-"}
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* A. Ringkasan Pengajuan */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">A. Ringkasan Pengajuan</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <InfoRow label="Jam Mulai - Selesai" value={`${submission.startTime} - ${submission.endTime}${submission.isCrossDay ? " (lintas hari)" : ""}`} />
              <InfoRow label="Total Durasi Lembur" value={formatDurationLabel(submission.totalDurationMinutes)} />
              <InfoRow label="Tipe Lembur" value={submission.overtimeTypeLabel || getOvertimeTypeLabel(submission.overtimeType)} />
              {submission.overtimeType === "hari_libur" && (
                <InfoRow label="Jenis Hari Libur" value={(submission as any).holidayTypeLabel || getHolidayTypeLabel(submission.holidayType, submission.holidayTypeOther)} />
              )}
              <InfoRow label="Lokasi / Kondisi Lembur" value={submission.workLocationLabel || getWorkLocationLabel(submission.workLocation)} />
              <InfoRow label="Status" value={getOvertimeStatusLabel(submission.status)} />
              <InfoRow
                label="Pemberi Tugas"
                value={[
                  submission.taskAssignerName || submission.overtimeCoordinatorName,
                  [
                    // taskAssignerGroup is what new submissions write; legacy
                    // docs (before this field existed) still have the older
                    // isDirectSupervisor boolean, so both are checked.
                    (submission as any).taskAssignerGroup === "direct_supervisor" || submission.isDirectSupervisor ? "Atasan Langsung" : null,
                    submission.taskAssignerRoleLabel || submission.taskAssignerPosition,
                    submission.taskAssignerDivisionName,
                  ].filter(Boolean).join(" / "),
                ].filter(Boolean).join(" — ")}
              />
              <InfoRow label="Jenis Penugasan" value={getAssignmentTypeLabel(submission.assignmentType, submission.assignmentTypeOther)} />
              <InfoRow label="Project / Klien / Divisi" value={submission.projectOrClient} />
            </CardContent>
          </Card>

          {/* C. Alasan Lembur + E. Indikator Review */}
          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">C. Alasan Lembur</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm">{submission.overtimeReason || submission.reason || "-"}</p>
              </CardContent>
            </Card>

            {anomalyFlags.length > 0 && (
              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 dark:text-amber-300">E. Indikator Perlu Review</AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-400">
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {anomalyFlags.map((flag) => <ToneBadge key={flag} tone="warning">{getAnomalyFlagLabel(flag)}</ToneBadge>)}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* B. Daftar Pekerjaan */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">B. Daftar Pekerjaan Lembur ({jobs.length})</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {jobs.map((job, i) => (
                <div key={job.id || i} className="rounded-xl border p-3 space-y-2">
                  <p className="text-sm font-bold">{i + 1}. {job.title}</p>
                  {job.projectOrClient && <p className="text-xs text-muted-foreground">{job.projectOrClient}</p>}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ringkasan</p>
                    <p className="text-sm">{job.workSummary || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Output</p>
                    <p className="text-sm">{job.workOutput || "-"}</p>
                  </div>
                  <InfoRow label="Estimasi Durasi" value={formatDurationLabel(job.estimatedDurationMinutes)} />
                  {/* Thumbnails intentionally live only in section D below —
                      evidenceFiles here is the same list flattened into
                      submission.evidenceFiles, so a second thumbnail grid
                      per job showed every image twice. */}
                  {(job.evidenceFiles?.length || 0) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Bukti pekerjaan: {job.evidenceFiles!.length} file, lihat di bagian D. Bukti Pendukung.
                    </p>
                  )}
                  {(job.evidenceLinks || []).length > 0 && (
                    <div className="space-y-1 pt-1">
                      {(job.evidenceLinks || []).map((link, li) => (
                        <a key={`l-${li}`} href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-blue-600 hover:underline">
                          <LinkIcon className="h-3 w-3 shrink-0" /> {link}
                        </a>
                      ))}
                    </div>
                  )}
                  {((job.evidenceFiles?.length || 0) + (job.evidenceLinks?.length || 0)) === 0 && (
                    <p className="text-xs text-amber-600">Bukti belum lengkap untuk pekerjaan ini.</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* D. Bukti Pendukung */}
          {(allEvidence.length > 0 || topLevelEvidenceLinks.length > 0) && (
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">D. Bukti Pendukung ({allEvidence.length + topLevelEvidenceLinks.length})</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <EvidenceThumbnailGrid files={allEvidence} submissionId={submission.id} onOpen={handleOpenEvidence} />
                {topLevelEvidenceLinks.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {topLevelEvidenceLinks.map((link, i) => (
                      <a key={`tl-${i}`} href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                        <LinkIcon className="h-3.5 w-3.5 shrink-0" /> {link}
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* F. Timeline Approval */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><UserCheck className="h-4 w-4" /> F. Persetujuan Atasan</CardTitle></CardHeader>
            <CardContent>
              <InfoRow label="Keputusan" value={submission.managerDecision ? (submission.managerDecision === "approved" ? "Disetujui" : submission.managerDecision === "rejected" ? "Ditolak" : "Revisi") : "Menunggu"} />
              {submission.managerReviewedByName && <InfoRow label="Oleh" value={submission.managerReviewedByName} />}
              {submission.managerNotes && <p className="text-sm italic text-muted-foreground mt-2">"{submission.managerNotes}"</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><UserCheck className="h-4 w-4" /> F. Verifikasi HRD</CardTitle></CardHeader>
            <CardContent>
              <InfoRow label="Keputusan" value={submission.hrdDecision ? (submission.hrdDecision === "approved" ? "Disetujui" : submission.hrdDecision === "rejected" ? "Ditolak" : "Revisi") : "Menunggu"} />
              {submission.hrdReviewedByName && <InfoRow label="Oleh" value={submission.hrdReviewedByName} />}
              {submission.hrdNotes && <p className="text-sm italic text-muted-foreground mt-2">"{submission.hrdNotes}"</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      <DialogFooter className="shrink-0 border-t bg-background px-6 py-4 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>Tutup</Button>
        {canEdit && onRequestEdit && <Button variant="secondary" onClick={onRequestEdit}>Edit Pengajuan</Button>}
      </DialogFooter>

      <EvidenceLightbox
        file={previewFile}
        submissionId={submission.id}
        onClose={() => setPreviewFile(null)}
        onError={(message) => toast({ variant: "destructive", title: "Gagal Membuka Bukti", description: message })}
      />
    </DialogContent>
  );
}

// ── Manual form (create / edit) ─────────────────────────────────────────────

export function OvertimeSubmissionForm({
  open, onOpenChange, submission, employeeProfile, brands,
  existingSubmissions = [], onSuccess, formMode, onRequestEdit,
}: OvertimeSubmissionFormProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isSaving, setIsSaving] = useState(false);
  // Per-job pending file uploads — keyed by the job row's stable `id`, never
  // sent to Firestore directly (only the uploaded URLs are, on submit).
  const [jobEvidenceFileObjects, setJobEvidenceFileObjects] = useState<Record<string, File[]>>({});
  const [jobLinkDrafts, setJobLinkDrafts] = useState<Record<string, string>>({});
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const draftKey = userProfile?.uid ? `overtime-form-draft:${userProfile.uid}` : null;
  const skipNextAutosaveRef = useRef(false);
  // setIsSaving(true) below doesn't disable the submit button until the next
  // render commits, leaving a brief window where a fast double-click can
  // invoke onSubmit twice (observed as [OVERTIME_CREATE_PAYLOAD_DEBUG]
  // logging twice for one click) — this ref closes that gap synchronously.
  const submitLockRef = useRef(false);

  const staffBrandId = useMemo(() => {
    const brandId = (employeeProfile as any)?.brandId || (userProfile as any)?.brandId;
    if (!brandId) return "";
    return Array.isArray(brandId) ? brandId[0] : brandId;
  }, [employeeProfile, userProfile]);

  const staffDivisionId = useMemo(() => {
    const hrd = (employeeProfile as any)?.hrdEmploymentInfo;
    const struktur = (employeeProfile as any)?.strukturKepegawaian;
    return (
      (employeeProfile as any)?.divisionId ||
      hrd?.divisionId ||
      struktur?.divisionId ||
      (userProfile as any)?.divisionId ||
      ""
    );
  }, [employeeProfile, userProfile]);

  const staffBrandName = useMemo(() => {
    const hrd = (employeeProfile as any)?.hrdEmploymentInfo;
    return hrd?.brandName || (employeeProfile as any)?.brandName || brands.find((b) => b.id === staffBrandId)?.name || "";
  }, [employeeProfile, staffBrandId, brands]);

  // ID and name intentionally come from separate current-profile fields.
  // Never write an id into divisionName or reuse a stale submission snapshot.
  const staffDivisionName = useMemo(() => {
    const hrd = (employeeProfile as any)?.hrdEmploymentInfo;
    const struktur = (employeeProfile as any)?.strukturKepegawaian;
    return (
      (employeeProfile as any)?.divisionName ||
      hrd?.divisionName ||
      hrd?.divisi ||
      struktur?.divisionName ||
      (userProfile as any)?.divisionName ||
      (userProfile as any)?.division ||
      ""
    );
  }, [employeeProfile, userProfile]);

  const divisionNameQuery = useMemoFirebase(() => {
    if (!firestore || !staffBrandId || !staffDivisionName) return null;
    return query(collection(firestore, "brands", staffBrandId, "divisions"), where("name", "==", staffDivisionName));
  }, [firestore, staffBrandId, staffDivisionName]);
  const { data: divisionsResult } = useCollection<DivisionMasterOrganization>(divisionNameQuery);

  const divisionDocRef = useMemoFirebase(() => {
    if (!firestore || !staffBrandId || !staffDivisionId) return null;
    return doc(firestore, "brands", staffBrandId, "divisions", staffDivisionId);
  }, [firestore, staffBrandId, staffDivisionId]);
  const { data: divisionDocById } = useDoc<DivisionMasterOrganization>(divisionDocRef);

  const divisionMaster = useMemo(
    () => divisionsResult?.[0] || divisionDocById || null,
    [divisionsResult, divisionDocById],
  );

  const usersQuery = useMemoFirebase(() => (firestore ? query(collection(firestore, "users")) : null), [firestore]);
  const { data: allUsers } = useCollection<any>(usersQuery);

  // Prioritas: atasan langsung (resolveApprovalTarget) dipin di urutan
  // pertama, lalu manager divisi/project leader/koordinator/HRD lain sebagai
  // pilihan tambahan — sesuai "Prioritas opsi" pada spec Penugasan.
  const primaryTarget = useMemo(
    () => resolveApprovalTarget(employeeProfile, userProfile as any, divisionMaster),
    [employeeProfile, userProfile, divisionMaster],
  );

  // The submitting staff's own brand/division — needed to match "Rekan /
  // Staff Satu Divisi" candidates (same brand + same division, per
  // isSameDivisionStaff in overtime-utils.ts).
  const currentEmployeeForAssigner = useMemo(() => ({
    uid: userProfile?.uid,
    brandId: staffBrandId,
    divisionId: staffDivisionId || undefined,
    divisionName: staffDivisionName,
  }), [userProfile?.uid, staffBrandId, staffDivisionId, staffDivisionName]);

  const taskAssignerCandidates = useMemo(
    () => buildTaskAssignerCandidates(allUsers, userProfile?.uid, primaryTarget, currentEmployeeForAssigner),
    [primaryTarget, allUsers, userProfile, currentEmployeeForAssigner],
  );

  const taskAssignerGroups = useMemo(() => {
    const order: TaskAssignerCategory[] = ["direct_supervisor", "division_manager", "same_division_staff", "management", "hrd"];
    return order
      .map((category) => ({ category, candidates: taskAssignerCandidates.filter((c) => c.category === category) }))
      .filter((group) => group.candidates.length > 0);
  }, [taskAssignerCandidates]);

  // Fires once per dropdown open — lets us tell apart "jabatan aslinya
  // memang kosong" from "helper masih salah ambil field raw role" for each
  // candidate actually shown, using the RAW user doc (not the already-
  // resolved candidate) so rawFields reflects exactly what's on file. Also
  // logs the per-group candidate counts, including same-division staff, so
  // an empty "Rekan / Staff Satu Divisi" group can be told apart from a
  // brand/division-matching bug.
  const logAssignerPositionDebug = (openState: boolean) => {
    if (!openState) return;
    taskAssignerCandidates.forEach((c) => {
      const raw = (allUsers || []).find((u: any) => (u.uid || u.id) === c.uid) || {};
      console.log("[OVERTIME_ASSIGNER_POSITION_DEBUG]", {
        uid: c.uid,
        name: raw.fullName || raw.displayName || raw.name || c.name,
        resolvedPosition: getDisplayPosition(raw),
        rawFields: {
          jobTitle: raw.jobTitle,
          position: raw.position,
          jabatan: raw.jabatan,
          structuralPosition: raw.structuralPosition,
          role: raw.role,
          hrdJobTitle: raw.hrdEmploymentInfo?.jobTitle,
          hrdPosition: raw.hrdEmploymentInfo?.position,
          hrdJabatan: raw.hrdEmploymentInfo?.jabatan,
          hrdRole: raw.hrdEmploymentInfo?.role,
        },
      });
    });
    console.log("[OVERTIME_ASSIGNER_GROUP_DEBUG]", {
      currentEmployee: {
        uid: currentEmployeeForAssigner.uid,
        name: (userProfile as any)?.fullName || (employeeProfile as any)?.fullName,
        brandId: currentEmployeeForAssigner.brandId,
        divisionId: currentEmployeeForAssigner.divisionId,
        divisionName: currentEmployeeForAssigner.divisionName,
      },
      directSupervisorCount: taskAssignerCandidates.filter((c) => c.category === "direct_supervisor").length,
      managerCount: taskAssignerCandidates.filter((c) => c.category === "division_manager").length,
      sameDivisionStaffCount: taskAssignerCandidates.filter((c) => c.category === "same_division_staff").length,
      managementCount: taskAssignerCandidates.filter((c) => c.category === "management").length,
      hrdCount: taskAssignerCandidates.filter((c) => c.category === "hrd").length,
      sameDivisionStaffOptions: taskAssignerCandidates.filter((c) => c.category === "same_division_staff"),
    });
  };

  const buildDefaultValues = useCallback((): FormValues => {
    if (submission) {
      const jobs: JobFormValue[] = submission.jobs?.length
        ? submission.jobs.map((j) => ({
            id: j.id || newJobId(),
            title: j.title || "",
            projectOrClient: j.projectOrClient || "",
            workSummary: j.workSummary || "",
            workOutput: j.workOutput || "",
            estimatedDurationMinutes: j.estimatedDurationMinutes || 0,
            evidenceLinks: j.evidenceLinks || [],
          }))
        : [{
            id: newJobId(),
            title: "Pekerjaan Lembur",
            projectOrClient: "",
            workSummary: submission.workSummary || submission.reason || "",
            workOutput: submission.workOutput || "",
            estimatedDurationMinutes: submission.totalDurationMinutes || 0,
            evidenceLinks: submission.evidenceLinks || [],
          }];
      const normalizedOvertimeType = submission.overtimeType === "hari_libur" || submission.overtimeType === "tanggal_merah" ? "hari_libur" : "hari_kerja";
      return {
        overtimeDate: toJsDate(submission.overtimeDate) || new Date(),
        overtimeType: normalizedOvertimeType,
        holidayType: submission.holidayType || (submission.overtimeType === "tanggal_merah" ? "libur_nasional" : undefined),
        holidayTypeOther: submission.holidayTypeOther || "",
        startTime: submission.startTime || "",
        endTime: submission.endTime || "",
        workLocation: (submission.workLocation as any) || (submission.overtimeType === "dinas_lapangan" ? "dinas" : "kantor"),
        workLocationDetail: submission.workLocationDetail || submission.workLocationOther || "",
        taskAssignerUid: submission.taskAssignerUid || submission.overtimeCoordinatorUid || "",
        projectOrClient: submission.projectOrClient || "",
        assignmentType: (submission.assignmentType as any) || "terencana",
        assignmentTypeOther: submission.assignmentTypeOther || "",
        jobs,
        overtimeReason: submission.overtimeReason || submission.reason || "",
        declarationAccepted: true,
      };
    }
    return {
      overtimeType: "hari_kerja",
      holidayTypeOther: "",
      startTime: "",
      endTime: "",
      workLocation: "kantor",
      workLocationDetail: "",
      taskAssignerUid: "",
      projectOrClient: "",
      assignmentType: "terencana",
      assignmentTypeOther: "",
      jobs: [emptyJob()],
      overtimeReason: "",
      declarationAccepted: false,
    } as FormValues;
  }, [submission]);

  const form = useForm<FormValues>({
    resolver: zodResolver(overtimeFormSchema),
    mode: "onTouched",
    defaultValues: buildDefaultValues(),
  });

  const { fields: jobFields, append: appendJob, remove: removeJob } = useFieldArray({
    control: form.control,
    name: "jobs",
  });

  // ── Auto-save draft (new submissions only) ────────────────────────────────
  useEffect(() => {
    if (!open || submission || !draftKey) return;
    const raw = window.localStorage.getItem(draftKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const hasContent = parsed?.jobs?.some((j: any) => j.title || j.workSummary) || parsed?.overtimeReason;
      if (hasContent) setShowDraftPrompt(true);
    } catch {
      window.localStorage.removeItem(draftKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submission, draftKey]);

  useEffect(() => {
    if (!open || submission || !draftKey) return;
    const subscription = form.watch((values) => {
      if (skipNextAutosaveRef.current) {
        skipNextAutosaveRef.current = false;
        return;
      }
      const timeout = setTimeout(() => {
        try {
          window.localStorage.setItem(
            draftKey,
            JSON.stringify({ ...values, overtimeDate: values.overtimeDate ? values.overtimeDate.toISOString() : null }),
          );
        } catch {
          // localStorage full/unavailable — autosave is best-effort only.
        }
      }, 800);
      return () => clearTimeout(timeout);
    });
    return () => subscription.unsubscribe();
  }, [open, submission, draftKey, form]);

  const handleContinueDraft = () => {
    if (!draftKey) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        skipNextAutosaveRef.current = true;
        // buildDefaultValues() as the base guards against a draft saved by
        // an older version of this form that predates a field being added
        // — never let a stale localStorage draft reintroduce an undefined
        // value into a native input.
        form.reset({ ...buildDefaultValues(), ...parsed, overtimeDate: parsed.overtimeDate ? new Date(parsed.overtimeDate) : undefined });
      }
    } catch {
      // Corrupt draft — nothing to restore.
    }
    setShowDraftPrompt(false);
  };

  const handleDiscardDraft = () => {
    if (draftKey) window.localStorage.removeItem(draftKey);
    setShowDraftPrompt(false);
  };

  // ── "Gunakan Pengajuan Terakhir" — copies form fields only, never status/approval. ──
  const lastSubmission = useMemo(() => {
    if (!existingSubmissions?.length) return null;
    return [...existingSubmissions].sort((a, b) => {
      const at = (a as any).submittedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
      const bt = (b as any).submittedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
      return bt - at;
    })[0];
  }, [existingSubmissions]);

  const handleUseLastSubmission = () => {
    if (!lastSubmission) return;
    skipNextAutosaveRef.current = true;
    const jobs: JobFormValue[] = lastSubmission.jobs?.length
      ? lastSubmission.jobs.map((j) => ({
          id: newJobId(),
          title: j.title || "",
          projectOrClient: j.projectOrClient || "",
          workSummary: j.workSummary || "",
          workOutput: "",
          estimatedDurationMinutes: 0,
          evidenceLinks: [],
        }))
      : [{ ...emptyJob(), title: lastSubmission.workSummary ? "Pekerjaan Lembur" : "" }];
    form.reset({
      ...form.getValues(),
      overtimeType: lastSubmission.overtimeType === "hari_libur" || lastSubmission.overtimeType === "tanggal_merah" ? "hari_libur" : "hari_kerja",
      holidayType: lastSubmission.holidayType || undefined,
      holidayTypeOther: lastSubmission.holidayTypeOther || "",
      workLocation: (lastSubmission.workLocation as any) || "kantor",
      workLocationDetail: lastSubmission.workLocationDetail || lastSubmission.workLocationOther || "",
      taskAssignerUid: lastSubmission.taskAssignerUid || lastSubmission.overtimeCoordinatorUid || "",
      projectOrClient: lastSubmission.projectOrClient || "",
      assignmentType: (lastSubmission.assignmentType as any) || "terencana",
      assignmentTypeOther: lastSubmission.assignmentTypeOther || "",
      jobs,
      overtimeReason: lastSubmission.overtimeReason || lastSubmission.reason || "",
    });
    setJobEvidenceFileObjects({});
    toast({ title: "Data pengajuan terakhir digunakan", description: "Silakan perbarui tanggal, jam, output, dan bukti." });
  };

  const watchAll = form.watch();
  const durationResult = useMemo(
    () => computeOvertimeDuration(watchAll.startTime || "", watchAll.endTime || ""),
    [watchAll.startTime, watchAll.endTime],
  );

  // react-hook-form mutates its internal jobs array in place on each
  // keystroke, so `watchAll.jobs` keeps the SAME array reference across
  // renders — a useMemo keyed on that reference never re-runs, which is why
  // this total used to stay frozen at 0. useWatch subscribes directly to
  // the "jobs" path and gives back a fresh snapshot on every change, so no
  // memoization is needed (or safe) here.
  const watchedJobs = useWatch({ control: form.control, name: "jobs" }) || [];
  const totalJobDurationMinutes = watchedJobs.reduce(
    (sum, j) => sum + (Number(j?.estimatedDurationMinutes) || 0),
    0,
  );
  const jobDurationMismatch = durationResult.durationMinutes > 0 && totalJobDurationMinutes !== durationResult.durationMinutes;

  useEffect(() => {
    // Temporary debug — remove once confirmed fixed in production.
    console.log("[OVERTIME_JOB_DURATION_DEBUG]", {
      watchedJobs,
      totalJobDurationMinutes,
      overtimeDurationMinutes: durationResult.durationMinutes,
    });
  }, [watchedJobs, totalJobDurationMinutes, durationResult.durationMinutes]);

  const existingEvidenceCount = (submission?.evidenceFiles?.length || 0) + (submission?.attachments?.length || 0);
  const totalEvidenceCount = useMemo(() => {
    const jobFilesCount = Object.values(jobEvidenceFileObjects).reduce((sum, arr) => sum + arr.length, 0);
    // watchedJobs (useWatch), not watchAll.jobs — same stale-reference issue
    // as totalJobDurationMinutes above would make link-only additions
    // (no file change) fail to update this count.
    const jobLinksCount = watchedJobs.reduce((sum, j) => sum + (j?.evidenceLinks?.length || 0), 0);
    return jobFilesCount + jobLinksCount + (submission ? existingEvidenceCount : 0);
  }, [jobEvidenceFileObjects, watchedJobs, submission, existingEvidenceCount]);

  const previewAnomalies = useMemo(() => {
    if (!watchAll.overtimeDate || !watchAll.startTime || !watchAll.endTime) return [];
    const candidateKey = format(watchAll.overtimeDate, "yyyy-MM-dd");
    const others = (existingSubmissions || []).filter((s) => s.id !== submission?.id);
    const overlaps = checkOvertimeOverlap(
      { id: submission?.id, overtimeDateKey: candidateKey, startTime: watchAll.startTime, endTime: watchAll.endTime },
      others.map((s) => ({ id: s.id, overtimeDateKey: overtimeDateKey(s.overtimeDate), startTime: s.startTime, endTime: s.endTime, status: s.status })),
    );
    const recentOtherDates = others.map((s) => toJsDate(s.overtimeDate)).filter((d): d is Date => !!d);
    return detectOvertimeAnomalies({
      overtimeType: watchAll.overtimeType || "hari_kerja",
      overtimeDate: watchAll.overtimeDate,
      startTime: watchAll.startTime,
      endTime: watchAll.endTime,
      durationMinutes: durationResult.durationMinutes,
      isCrossDay: durationResult.isCrossDay,
      evidenceFiles: Object.values(jobEvidenceFileObjects).flat(),
      evidenceLinks: (watchAll.jobs || []).flatMap((j) => j.evidenceLinks || []),
      jobs: (watchAll.jobs || []).map((j) => ({
        estimatedDurationMinutes: Number(j.estimatedDurationMinutes) || 0,
        evidenceFiles: jobEvidenceFileObjects[j.id] || [],
        evidenceLinks: j.evidenceLinks || [],
      })),
      recentOtherOvertimeDates: recentOtherDates,
      overlapsAnotherSubmission: overlaps,
    });
  }, [watchAll, durationResult, jobEvidenceFileObjects, existingSubmissions, submission?.id]);

  const handleJobFileSelect = (jobId: string, files: FileList | null) => {
    if (!files) return;
    setJobEvidenceFileObjects((prev) => ({ ...prev, [jobId]: [...(prev[jobId] || []), ...Array.from(files)] }));
  };

  const removeJobFileAt = (jobId: string, index: number) => {
    setJobEvidenceFileObjects((prev) => ({ ...prev, [jobId]: (prev[jobId] || []).filter((_, i) => i !== index) }));
  };

  const addJobLink = (jobIndex: number, jobId: string) => {
    const draft = (jobLinkDrafts[jobId] || "").trim();
    if (!draft) return;
    const current = form.getValues(`jobs.${jobIndex}.evidenceLinks`) || [];
    form.setValue(`jobs.${jobIndex}.evidenceLinks`, [...current, draft], { shouldValidate: true });
    setJobLinkDrafts((prev) => ({ ...prev, [jobId]: "" }));
  };

  const removeJobLink = (jobIndex: number, linkIndex: number) => {
    const current = form.getValues(`jobs.${jobIndex}.evidenceLinks`) || [];
    form.setValue(`jobs.${jobIndex}.evidenceLinks`, current.filter((_, i) => i !== linkIndex), { shouldValidate: true });
  };

  const handleAddJob = () => {
    appendJob(emptyJob());
  };

  const handleRemoveJob = (index: number, jobId: string) => {
    removeJob(index);
    setJobEvidenceFileObjects((prev) => {
      const next = { ...prev };
      delete next[jobId];
      return next;
    });
  };

  const onSubmit = async (values: FormValues) => {
    if (!userProfile || !firestore) return;
    if (submitLockRef.current) return;

    if (totalEvidenceCount === 0) {
      toast({
        variant: "destructive",
        title: "Bukti Lembur Wajib",
        description: "Lampiran bukti lembur wajib diisi agar pengajuan dapat diverifikasi.",
      });
      return;
    }

    submitLockRef.current = true;
    setIsSaving(true);
    try {
      const duration = computeOvertimeDuration(values.startTime, values.endTime);
      const assigner = taskAssignerCandidates.find((c) => c.uid === values.taskAssignerUid);
      // A same-division-staff pick is informational ("who coordinated the
      // work") only — never an approver. The actual first-stage approval
      // still routes to the employee's real atasan langsung/manager
      // (primaryTarget), never to the picked staff colleague, regardless of
      // who was chosen as taskAssignerUid above.
      const isStaffAssigner = assigner?.category === "same_division_staff";
      const approverUid = isStaffAssigner ? (primaryTarget.approvalTargetUid || values.taskAssignerUid) : values.taskAssignerUid;
      const approver = isStaffAssigner ? taskAssignerCandidates.find((c) => c.uid === approverUid) : assigner;

      // firestore.rules' hasManualOvertimeRequiredFields() rejects a create
      // with an empty or self-referential approver — checking it here first
      // turns that into a clear Indonesian message instead of a raw
      // "Missing or insufficient permissions" from Firestore.
      if (!approverUid) {
        throw new Error("Atasan/approver lembur belum diatur. Hubungi HRD.");
      }
      if (approverUid === userProfile.uid) {
        throw new Error("Approver lembur tidak boleh diri sendiri.");
      }

      // Upload every job's pending files, keyed by job id.
      const uploadedByJob: Record<string, { name: string; url: string; mimeType?: string }[]> = {};
      for (const job of values.jobs) {
        const files = jobEvidenceFileObjects[job.id] || [];
        const uploaded: { name: string; url: string; mimeType?: string }[] = [];
        for (const file of files) {
          const path = `overtime-evidence/${userProfile.uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
          const result = await uploadFile(file, path, userProfile.uid, { category: "overtime", ownerUid: userProfile.uid, compress: false } as any);
          const fileUrl = (result as any).viewUrl || (result as any).webViewLink || (result as any).downloadUrl || "";
          if (!fileUrl) throw new Error(`Upload bukti untuk "${job.title}" gagal. Silakan unggah ulang.`);
          uploaded.push({ name: file.name, url: fileUrl, mimeType: file.type });
        }
        uploadedByJob[job.id] = uploaded;
      }

      const previousJobsById = new Map((submission?.jobs || []).map((j) => [j.id, j]));
      const jobsPayload = values.jobs.map((job) => {
        const previous = previousJobsById.get(job.id);
        return {
          id: job.id,
          title: job.title,
          projectOrClient: job.projectOrClient || null,
          workSummary: job.workSummary,
          workOutput: job.workOutput,
          estimatedDurationMinutes: Number(job.estimatedDurationMinutes) || 0,
          evidenceFiles: [...(previous?.evidenceFiles || []), ...(uploadedByJob[job.id] || [])],
          evidenceLinks: job.evidenceLinks || [],
        };
      });

      const combinedEvidenceFiles = jobsPayload.flatMap((j) => j.evidenceFiles);
      const combinedEvidenceLinks = jobsPayload.flatMap((j) => j.evidenceLinks);
      const combinedAttachments = combinedEvidenceFiles.map((f) => f.url);
      const totalJobMinutes = jobsPayload.reduce((sum, j) => sum + j.estimatedDurationMinutes, 0);

      const candidateKey = format(values.overtimeDate, "yyyy-MM-dd");
      const others = (existingSubmissions || []).filter((s) => s.id !== submission?.id);
      const overlaps = checkOvertimeOverlap(
        { id: submission?.id, overtimeDateKey: candidateKey, startTime: values.startTime, endTime: values.endTime },
        others.map((s) => ({ id: s.id, overtimeDateKey: overtimeDateKey(s.overtimeDate), startTime: s.startTime, endTime: s.endTime, status: s.status })),
      );
      const anomalyFlags = detectOvertimeAnomalies({
        overtimeType: values.overtimeType,
        overtimeDate: values.overtimeDate,
        startTime: values.startTime,
        endTime: values.endTime,
        durationMinutes: duration.durationMinutes,
        isCrossDay: duration.isCrossDay,
        evidenceFiles: combinedEvidenceFiles,
        evidenceLinks: combinedEvidenceLinks,
        jobs: jobsPayload.map((j) => ({ estimatedDurationMinutes: j.estimatedDurationMinutes, evidenceFiles: j.evidenceFiles, evidenceLinks: j.evidenceLinks })),
        recentOtherOvertimeDates: others.map((s) => toJsDate(s.overtimeDate)).filter((d): d is Date => !!d),
        overlapsAnotherSubmission: overlaps,
      });

      const employeeName = (userProfile as any).fullName || (employeeProfile as any)?.fullName || userProfile.email || "Karyawan";
      const position = (employeeProfile as any)?.hrdEmploymentInfo?.workRole || (employeeProfile as any)?.workRole || (employeeProfile as any)?.positionTitle || "";
      const firstJob = jobsPayload[0];

      const isRevisionResubmit = !!submission && submission.status === "revision_requested";

      const basePayload: Partial<OvertimeSubmission> = {
        employeeUid: userProfile.uid,
        employeeName,
        employeeCode: (employeeProfile as any)?.employeeId || (employeeProfile as any)?.nomorIndukKaryawan || "",
        brandId: staffBrandId,
        brandName: staffBrandName,
        divisionId: staffDivisionId,
        divisionName: staffDivisionName,
        position,
        overtimeDate: Timestamp.fromDate(values.overtimeDate),
        // format() reads the Date object's LOCAL (WIB) calendar fields —
        // never derive these from toISOString()/getUTCMonth(), which read
        // UTC and can push a WIB midnight-of-the-1st into the previous UTC
        // day/month. OvertimeApprovalClient.tsx's month filter matches
        // against overtimeMonthKey for exactly this reason.
        overtimeDateStr: format(values.overtimeDate, "yyyy-MM-dd"),
        overtimeMonthKey: format(values.overtimeDate, "yyyy-MM"),
        startTime: values.startTime,
        endTime: values.endTime,
        startTimeMinutes: parseTimeToMinutes(values.startTime) ?? undefined,
        endTimeMinutes: parseTimeToMinutes(values.endTime) ?? undefined,
        totalDurationMinutes: duration.durationMinutes,
        durationMinutes: duration.durationMinutes,
        durationHours: Math.round((duration.durationMinutes / 60) * 100) / 100,
        isCrossDay: duration.isCrossDay,
        overtimeType: values.overtimeType,
        overtimeTypeLabel: getOvertimeTypeLabel(values.overtimeType),
        holidayType: values.overtimeType === "hari_libur" ? values.holidayType || null : null,
        // holidayTypeOther isn't in the rules whitelist and never will be
        // whitelisted separately — the "Lainnya: <custom text>" case is
        // folded straight into the label instead of kept as its own field.
        holidayTypeLabel: values.overtimeType === "hari_libur" ? getHolidayTypeLabel(values.holidayType, values.holidayTypeOther) : null,
        workLocation: values.workLocation,
        workLocationLabel: getWorkLocationLabel(values.workLocation),
        workLocationDetail: values.workLocationDetail || null,
        workLocationOther: values.workLocationDetail || null,
        taskAssignerUid: values.taskAssignerUid,
        taskAssignerName: assigner?.name || undefined,
        taskAssignerPosition: assigner?.position || undefined,
        taskAssignerRole: assigner?.role || undefined,
        // Same-division staff get a distinct role LABEL ("Staff Satu
        // Divisi") even though the dropdown subtitle just says "Staff" —
        // the payload should make it unambiguous to approvers/audits that
        // this wasn't a manager/HRD pick.
        taskAssignerRoleLabel: assigner?.category === "same_division_staff" ? "Staff Satu Divisi" : assigner?.roleLabel || undefined,
        taskAssignerDivisionId: assigner?.divisionId || undefined,
        taskAssignerDivisionName: assigner?.divisionName || undefined,
        taskAssignerBrandId: assigner?.brandId || undefined,
        taskAssignerBrandName: assigner?.brandName || undefined,
        // isDirectSupervisor isn't in the rules whitelist — taskAssignerGroup
        // ("direct_supervisor" vs the other categories) already carries the
        // same information, so the detail view derives the "Atasan
        // Langsung" tag from that instead (see OvertimeSubmissionDetailView).
        // Never an approver by itself — approval routing (atasan -> HRD)
        // stays exactly the same regardless of this value; it's purely
        // informational for the review dialog/audit trail.
        taskAssignerGroup: assigner?.category || undefined,
        // Compat mirrors — ReviewOvertimeDialog.tsx, firestore.rules'
        // isAssignedTaskAssigner(), and OvertimeApprovalClient.tsx's tab
        // filter all check THESE "coordinator" fields for approval
        // authorization, so they must point at the real approver
        // (approverUid), never at a same-division-staff assigner.
        overtimeCoordinatorUid: approverUid || undefined,
        overtimeCoordinatorName: approver?.name || undefined,
        overtimeCoordinatorPosition: approver?.position || undefined,
        projectOrClient: values.projectOrClient || null,
        assignmentType: values.assignmentType,
        assignmentTypeOther: values.assignmentType === "lainnya" ? values.assignmentTypeOther || null : null,
        jobs: jobsPayload,
        totalJobDurationMinutes: totalJobMinutes,
        // Single-job mirrors — kept for ReviewOvertimeDialog.tsx and any
        // other reader that still expects one workSummary/workOutput pair.
        workSummary: firstJob?.workSummary || "",
        workOutput: firstJob?.workOutput || "",
        overtimeReason: values.overtimeReason,
        reason: values.overtimeReason,
        evidenceFiles: combinedEvidenceFiles,
        evidenceLinks: combinedEvidenceLinks,
        attachments: combinedAttachments,
        hasSupportingEvidence: true,
        declarationAccepted: true,
        declarationAcceptedAt: serverTimestamp() as any,
        anomalyFlags,
        reviewLevel: getReviewLevelFromFlags(anomalyFlags),
        status: "pending_manager_review",
        // Mirror of `status` — ReviewOvertimeDialog.tsx/OvertimeApprovalClient.tsx
        // read `approvalStatus || status` for display, and some legacy docs
        // only ever had approvalStatus, so both are written going forward.
        approvalStatus: "pending_manager_review",
        currentApprovalStep: "manager",
        currentApproverUid: approverUid || undefined,
        updatedAt: serverTimestamp() as any,
      };

      let submissionId = submission?.id;

      if (!submission) {
        const createPayload = sanitizeOvertimeCreatePayload({
          ...basePayload,
          submittedAt: serverTimestamp(),
          submittedByUid: userProfile.uid,
          submittedByName: employeeName,
          createdAt: serverTimestamp(),
        });

        const unknownKeys = Object.keys(createPayload).filter((key) => !ALLOWED_OVERTIME_CREATE_KEYS.has(key));
        console.log("[OVERTIME_UNKNOWN_PAYLOAD_KEYS]", unknownKeys);
        if (unknownKeys.length > 0) {
          console.warn("[OVERTIME_CREATE_BLOCKED_BY_UNKNOWN_KEYS]", unknownKeys);
        }

        // Temporary debug — remove once confirmed fixed in production.
        console.log("[OVERTIME_CREATE_PAYLOAD_DEBUG]", JSON.stringify({
          authUid: userProfile.uid,
          employeeUid: createPayload.employeeUid,
          brandId: createPayload.brandId,
          status: createPayload.status,
          approvalStatus: createPayload.approvalStatus,
          currentApprovalStep: createPayload.currentApprovalStep,
          currentApproverUid: createPayload.currentApproverUid,
          overtimeDate: createPayload.overtimeDate,
          startTime: createPayload.startTime,
          endTime: createPayload.endTime,
          durationMinutes: createPayload.durationMinutes,
          hasSupportingEvidence: createPayload.hasSupportingEvidence,
          declarationAccepted: createPayload.declarationAccepted,
          evidenceFilesLength: createPayload.evidenceFiles?.length || 0,
          evidenceLinksLength: createPayload.evidenceLinks?.length || 0,
          jobsLength: createPayload.jobs?.length || 0,
          keys: Object.keys(createPayload).sort(),
        }, null, 2));
        // Reaching this line means overtime_submissions accepted the write —
        // any error from here on (notification side-effect below) must
        // never be reported to the user as "the submission failed".
        const docRef = await addDoc(collection(firestore, "overtime_submissions"), createPayload);
        submissionId = docRef.id;
      } else {
        const editEntry = {
          updatedAt: Timestamp.now(),
          updatedByUid: userProfile.uid,
          oldStartTime: submission.startTime,
          newStartTime: values.startTime,
          oldEndTime: submission.endTime,
          newEndTime: values.endTime,
          oldDurationMinutes: submission.totalDurationMinutes,
          newDurationMinutes: duration.durationMinutes,
          oldWorkOutput: submission.workOutput || "",
          newWorkOutput: firstJob?.workOutput || "",
        };
        await updateDoc(doc(firestore, "overtime_submissions", submission.id!), {
          ...basePayload,
          ...(isRevisionResubmit ? { editHistory: arrayUnion(editEntry) } : {}),
        });
      }

      if (draftKey) window.localStorage.removeItem(draftKey);

      toast({ title: "Pengajuan Lembur Terkirim", description: "Pengajuan Anda menunggu validasi atasan." });
      onSuccess();
      onOpenChange(false);

      // Notifying the approver is a write into a DIFFERENT uid's
      // users/{uid}/notifications — firestore.rules only lets HRD/Super
      // Admin `create` there (see /users/{userId}/notifications), so a
      // karyawan can never do this directly even for their own approver.
      // That's what was throwing "Missing or insufficient permissions"
      // right after a perfectly successful overtime_submissions write. The
      // fix is a server-side route (Admin SDK bypasses rules), called here
      // in its own try/catch — the submission above already succeeded and
      // the success toast/close already ran, so a failure here is purely a
      // best-effort delivery hiccup, never something that should undo or
      // relabel the submission as failed.
      if (submissionId) {
        try {
          const auth = getAuth();
          const token = await auth.currentUser?.getIdToken();
          const res = await fetch("/api/overtime/send-notifications", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ overtimeSubmissionId: submissionId }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error || `send-notifications responded ${res.status}`);
          }
        } catch (notifError) {
          console.warn("[OVERTIME_NOTIFICATION_DELAYED]", { submissionId, error: notifError });
        }
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal Mengirim Pengajuan", description: e.message || "Terjadi kesalahan." });
    } finally {
      submitLockRef.current = false;
      setIsSaving(false);
    }
  };

  if (formMode === "view" && submission) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <OvertimeSubmissionDetailView
          submission={submission}
          canEdit={submission.status === "revision_requested" || submission.status === "draft"}
          onRequestEdit={onRequestEdit}
          onClose={() => onOpenChange(false)}
        />
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <div>
              <DialogTitle>{submission ? "Edit Pengajuan Lembur" : "Buat Pengajuan Lembur"}</DialogTitle>
              <DialogDescription>Isi seluruh bagian di bawah ini dengan lengkap dan jujur.</DialogDescription>
            </div>
            {!submission && lastSubmission && (
              <Button type="button" variant="outline" size="sm" onClick={handleUseLastSubmission} className="shrink-0 gap-1.5">
                <History className="h-3.5 w-3.5" /> Gunakan Pengajuan Terakhir
              </Button>
            )}
          </div>
        </DialogHeader>

        {showDraftPrompt && (
          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800 dark:text-blue-300">Draft Belum Terkirim</AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-400">
              <p className="mb-2">Ada draft pengajuan lembur yang belum dikirim. Lanjutkan?</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={handleContinueDraft}>Lanjutkan Draft</Button>
                <Button type="button" size="sm" variant="outline" onClick={handleDiscardDraft}>Hapus Draft</Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* A. Waktu & Kategori Lembur */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> A. Waktu & Kategori Lembur</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="overtimeDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tanggal Lembur</FormLabel>
                      <FormControl>
                        <GoogleDatePicker value={field.value} onChange={field.onChange} placeholder="Pilih tanggal" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="overtimeType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipe Lembur</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Pilih tipe lembur" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {OVERTIME_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                {watchAll.overtimeType === "hari_libur" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="holidayType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jenis Hari Libur</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Pilih jenis hari libur" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {HOLIDAY_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {watchAll.holidayType === "lainnya" && (
                      <FormField control={form.control} name="holidayTypeOther" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Jelaskan Jenis Hari Libur</FormLabel>
                          <FormControl><Input placeholder="Sebutkan" {...field} value={field.value ?? ""} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="startTime" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jam Mulai</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="Contoh: 17.00"
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const formatted = formatTimeInput(e.target.value);
                            field.onChange(formatted);
                            form.setValue("startTime", formatted, { shouldDirty: true, shouldValidate: true });
                          }}
                        />
                      </FormControl>
                      <FormDescription>Gunakan format 24 jam, contoh: 17.00</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="endTime" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jam Selesai</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="Contoh: 21.30"
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const formatted = formatTimeInput(e.target.value);
                            field.onChange(formatted);
                            form.setValue("endTime", formatted, { shouldDirty: true, shouldValidate: true });
                          }}
                        />
                      </FormControl>
                      <FormDescription>Gunakan format 24 jam, contoh: 21.30</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-700 dark:text-blue-400">
                    <div className="flex items-center gap-2 flex-wrap">
                      Total Durasi Lembur: <strong>{formatDurationLabel(durationResult.durationMinutes)}</strong>
                      {durationResult.isCrossDay && <ToneBadge tone="info">Lintas Hari</ToneBadge>}
                    </div>
                    {durationResult.isCrossDay && (
                      <p className="mt-1 text-xs">Lembur terdeteksi melewati tengah malam.</p>
                    )}
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            {/* B. Lokasi & Penugasan */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><UserCheck className="h-4 w-4" /> B. Lokasi & Penugasan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="workLocation" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lokasi / Kondisi Lembur</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Pilih lokasi/kondisi" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {WORK_LOCATION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                {watchAll.workLocation === "lainnya" && (
                  <FormField control={form.control} name="workLocationDetail" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jelaskan Lokasi/Kondisi Lembur</FormLabel>
                      <FormControl><Input placeholder="Sebutkan lokasi/kondisi lembur" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
                <FormField control={form.control} name="taskAssignerUid" render={({ field }) => {
                  return (
                  <FormItem>
                    <FormLabel>Atasan / Koordinator Pemberi Tugas</FormLabel>
                    {/* SelectValue must stay self-closing — Radix's Select.Value
                        cannot take children AND have its container used as a
                        portal/ref target at the same time ("Cannot use a ref on
                        a React element as a container ... if that element also
                        sets children text content"). The rich two-line rows
                        still render correctly because each SelectItem below
                        carries its own textValue, which Radix uses to populate
                        the trigger once selected — no manual override needed. */}
                    <Select onValueChange={field.onChange} value={field.value} onOpenChange={logAssignerPositionDebug}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih pemberi tugas" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {taskAssignerGroups.map((group) => (
                          <SelectGroup key={group.category}>
                            <SelectLabel>{TASK_ASSIGNER_CATEGORY_LABELS[group.category]}</SelectLabel>
                            {group.candidates.map((c) => (
                              <SelectItem key={c.uid} value={c.uid} textValue={getTaskAssignerSummaryLabel(c)}>
                                <div className="flex flex-col text-left">
                                  <span className="font-medium">{c.name}</span>
                                  <span className="text-xs text-muted-foreground">{getTaskAssignerSubtitle(c)}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Lembur harus jelas siapa yang menugaskan.</FormDescription>
                    <FormMessage />
                  </FormItem>
                  );
                }} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="assignmentType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jenis Penugasan</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Pilih jenis" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {ASSIGNMENT_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="projectOrClient" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project / Klien / Divisi Terkait</FormLabel>
                      <FormControl><Input placeholder="Opsional" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                {watchAll.assignmentType === "lainnya" && (
                  <FormField control={form.control} name="assignmentTypeOther" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Jelaskan Jenis Penugasan</FormLabel>
                      <FormControl><Input placeholder="Sebutkan" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
              </CardContent>
            </Card>

            {/* C. Daftar Pekerjaan Lembur */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Briefcase className="h-4 w-4" /> C. Daftar Pekerjaan Lembur</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {jobFields.map((jobField, index) => {
                  // The job's own `id` form field (stable, used as the
                  // payload's job id and to key per-job file state) —
                  // jobField.id is only RHF's internal row key, not this.
                  const jobIdValue = watchAll.jobs?.[index]?.id || jobField.id;
                  const files = jobEvidenceFileObjects[jobIdValue] || [];
                  const links = watchAll.jobs?.[index]?.evidenceLinks || [];
                  return (
                    <div key={jobField.id} className="rounded-xl border p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold">Pekerjaan {index + 1}</p>
                        {jobFields.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleRemoveJob(index, jobIdValue)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField control={form.control} name={`jobs.${index}.title`} render={({ field }) => (
                          <FormItem>
                            <FormLabel>Judul Pekerjaan</FormLabel>
                            <FormControl><Input placeholder="Cth: Revisi dashboard payroll" {...field} value={field.value ?? ""} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name={`jobs.${index}.projectOrClient`} render={({ field }) => (
                          <FormItem>
                            <FormLabel>Project / Klien / Divisi Terkait</FormLabel>
                            <FormControl><Input placeholder="Opsional" {...field} value={field.value ?? ""} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <FormField control={form.control} name={`jobs.${index}.workSummary`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ringkasan Pekerjaan</FormLabel>
                          <FormControl><Textarea rows={2} placeholder="Jelaskan pekerjaan yang dilakukan." {...field} value={field.value ?? ""} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`jobs.${index}.workOutput`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hasil / Output Pekerjaan</FormLabel>
                          <FormControl><Textarea rows={2} placeholder="Jelaskan hasil pekerjaan yang selesai atau progres yang dicapai." {...field} value={field.value ?? ""} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`jobs.${index}.estimatedDurationMinutes`} render={({ field }) => (
                        <FormItem className="max-w-xs">
                          <FormLabel>Estimasi Durasi Pekerjaan (menit)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              name={field.name}
                              ref={field.ref}
                              onBlur={field.onBlur}
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <Separator />

                      <div>
                        <FormLabel>Bukti Pekerjaan</FormLabel>
                        <label className="mt-2 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-4 text-center cursor-pointer hover:border-slate-400 transition-colors">
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Screenshot, foto lapangan, dokumen output, atau file hasil kerja</span>
                          <input type="file" multiple className="hidden" onChange={(e) => handleJobFileSelect(jobIdValue, e.target.files)} />
                        </label>
                        {files.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {files.map((f, fi) => (
                              <div key={fi} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs">
                                <span className="truncate">{f.name}</span>
                                <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeJobFileAt(jobIdValue, fi)}><X className="h-3 w-3" /></Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex gap-2">
                          <Input
                            placeholder="Link task/project/dokumen/chat instruksi..."
                            value={jobLinkDrafts[jobIdValue] || ""}
                            onChange={(e) => setJobLinkDrafts((prev) => ({ ...prev, [jobIdValue]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addJobLink(index, jobIdValue); } }}
                            className="text-xs"
                          />
                          <Button type="button" variant="outline" size="icon" onClick={() => addJobLink(index, jobIdValue)}><PlusCircle className="h-4 w-4" /></Button>
                        </div>
                        {links.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {links.map((link, li) => (
                              <div key={li} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs">
                                <span className="truncate flex items-center gap-1.5"><LinkIcon className="h-3 w-3 shrink-0" />{link}</span>
                                <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeJobLink(index, li)}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            ))}
                          </div>
                        )}
                        {files.length === 0 && links.length === 0 && (
                          <p className="mt-1.5 text-xs text-amber-600">Bukti belum lengkap untuk pekerjaan ini.</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                <Button type="button" variant="outline" className="w-full gap-1.5" onClick={handleAddJob}>
                  <PlusCircle className="h-4 w-4" /> Tambah Pekerjaan
                </Button>

                <Alert className={jobDurationMismatch ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30"}>
                  {jobDurationMismatch ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <Info className="h-4 w-4 text-blue-600" />}
                  <AlertDescription className={jobDurationMismatch ? "text-amber-700 dark:text-amber-400" : "text-blue-700 dark:text-blue-400"}>
                    Total Durasi Pekerjaan: <strong>{formatDurationLabel(totalJobDurationMinutes)}</strong>
                    {" "}(Total Durasi Lembur: {formatDurationLabel(durationResult.durationMinutes)})
                    {jobDurationMismatch && (
                      <p className="mt-1">Total durasi pekerjaan belum sesuai dengan total durasi lembur. Silakan periksa kembali pembagian waktunya.</p>
                    )}
                  </AlertDescription>
                </Alert>

                {totalEvidenceCount === 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>Lampiran bukti lembur wajib diisi agar pengajuan dapat diverifikasi.</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* D. Alasan Lembur */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> D. Alasan Lembur</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField control={form.control} name="overtimeReason" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alasan Pekerjaan Dilakukan di Luar Jam Kerja</FormLabel>
                    <FormControl><Textarea rows={3} placeholder="Jelaskan kenapa pekerjaan ini perlu dilakukan di luar jam kerja." {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            {/* E. Preview & Pernyataan */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> E. Preview & Pernyataan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border bg-slate-50 dark:bg-slate-900/40 p-4 space-y-2">
                  <InfoRow label="Tanggal Lembur" value={watchAll.overtimeDate ? format(watchAll.overtimeDate, "dd MMM yyyy", { locale: idLocale }) : "-"} />
                  <InfoRow label="Jam Mulai - Selesai" value={watchAll.startTime && watchAll.endTime ? `${watchAll.startTime} - ${watchAll.endTime}` : "-"} />
                  <InfoRow label="Total Durasi Lembur" value={formatDurationLabel(durationResult.durationMinutes)} />
                  <InfoRow label="Tipe Lembur" value={getOvertimeTypeLabel(watchAll.overtimeType)} />
                  {watchAll.overtimeType === "hari_libur" && (
                    <InfoRow label="Jenis Hari Libur" value={getHolidayTypeLabel(watchAll.holidayType, watchAll.holidayTypeOther)} />
                  )}
                  <InfoRow label="Lokasi / Kondisi Lembur" value={getWorkLocationLabel(watchAll.workLocation)} />
                  <InfoRow label="Pemberi Tugas" value={(() => {
                    const c = taskAssignerCandidates.find((c) => c.uid === watchAll.taskAssignerUid);
                    return c ? getTaskAssignerSummaryLabel(c) : undefined;
                  })()} />
                  <InfoRow label="Jumlah Pekerjaan" value={watchAll.jobs?.length || 0} />
                  <InfoRow label="Total Durasi Pekerjaan" value={formatDurationLabel(totalJobDurationMinutes)} />
                  <InfoRow label="Jumlah Bukti" value={totalEvidenceCount} />
                  <div className="flex justify-between items-center gap-4 pt-1">
                    <p className="text-sm font-semibold text-muted-foreground">Status Validasi</p>
                    {previewAnomalies.length > 0 ? <ToneBadge tone="warning">Perlu Review</ToneBadge> : <ToneBadge tone="success">Normal</ToneBadge>}
                  </div>
                  {previewAnomalies.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {previewAnomalies.map((flag) => <ToneBadge key={flag} tone="warning">{getAnomalyFlagLabel(flag)}</ToneBadge>)}
                    </div>
                  )}
                </div>

                <FormField control={form.control} name="declarationAccepted" render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 rounded-xl border p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="font-normal">
                        Saya menyatakan data lembur, waktu, pekerjaan, output, dan bukti yang saya lampirkan benar sesuai pekerjaan yang dilakukan.
                      </FormLabel>
                      <FormMessage />
                    </div>
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <DialogFooter className="sticky bottom-0 z-10 border-t bg-background/95 -mx-6 -mb-6 px-6 py-4 backdrop-blur flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>Batal</Button>
              <Button type="submit" disabled={isSaving || form.formState.isSubmitting || totalEvidenceCount === 0 || !watchAll.declarationAccepted}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Kirim Pengajuan
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
