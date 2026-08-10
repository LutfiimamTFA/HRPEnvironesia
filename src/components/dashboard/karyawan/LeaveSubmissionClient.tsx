"use client";

import { useState, useMemo, useEffect } from "react";
import { getAuth } from "firebase/auth";
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  setDocumentNonBlocking,
  updateDocumentNonBlocking,
  useDoc,
} from "@/firebase";
import {
  collection,
  query,
  where,
  doc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  PlusCircle,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  CalendarOff,
  AlertTriangle,
  User,
  Landmark,
  Send,
  Info,
  ShieldCheck,
  X,
  FileUp,
  Phone,
  Repeat,
} from "lucide-react";
import {
  format,
  differenceInCalendarDays,
  eachDayOfInterval,
  isSaturday,
  isSunday,
  addDays,
  startOfDay,
  endOfDay,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSearchParams } from "next/navigation";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { GoogleDatePicker } from "@/components/ui/google-date-picker";
import { uploadFile } from "@/lib/storage/storage-adapter";
import { validateStorageFile, compressImage } from "@/lib/storage-utils";
import {
  checkLeaveEligibility,
  calculateLeaveDuration,
  parseContractDurationMonths,
} from "@/lib/leave-utils";
import {
  resolveApprovalTarget,
  type DivisionMasterOrganization,
} from "@/lib/approval-flow";
import {
  type EmployeeProfile,
  type LeaveRequest,
  type LeaveBalance,
  type UserProfile,
} from "@/lib/types";
import { getLeaveProcessStage } from "@/lib/leave-process-stage";
import type { LeaveBalanceResult } from "@/lib/leave-balance";

import { LeaveDetailModalClient } from "@/components/ui/LeaveDetailModalClient";

// Validation helpers
function isAtLeast14DaysAhead(startDate: Date): boolean {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    // Minimum date must be at least 14 days from today
    const minimumDate = addDays(today, 14);
    return start >= minimumDate;
  } catch {
    return false;
  }
}

function getMinimumLeaveDate(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return addDays(today, 14);
}

// firestore.rules only lets the owner UPDATE a leave_requests doc while its
// status is pending_* / revision_requested* (see the isLeaveRequestOwner
// branch of the update rule) — but editing the actual form fields must be
// gated further: while a request is still pending_manager_review /
// pending_director_review / etc. it's awaiting someone else's decision, and
// letting the employee silently rewrite it out from under that decision is
// exactly the class of bug that produced the "Ubah" button appearing on
// pending_manager_review. Editing is only meaningful — and only intended —
// once an approver has explicitly kicked it back for revision.
function canEmployeeEditLeaveRequest(status: string): boolean {
  return [
    "revision_requested",
    "revision_requested_by_manager",
    "revision_requested_by_director",
    "revision_requested_by_hrd",
  ].includes(status);
}

// Cancelling is allowed for any status still awaiting a decision (pending_*)
// plus already-approved/active leave — matches what handleCancel actually
// writes (status -> "cancelled"), which firestore.rules' update rule allows
// for the owner regardless of the doc's current status.
function canEmployeeCancelLeaveRequest(status: string): boolean {
  return status.startsWith("pending_") || status === "menunggu_approval_atasan" || status === "approved" || status === "active_leave";
}

function normalizeStatus(status: string | null | undefined): string {
  return String(status || "").trim().toLowerCase();
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const LEAVE_PENDING_STATUSES = [
  "pending",
  "pending_approval",
  "pending_manager",
  "pending_manager_review",
  "pending_supervisor",
  "pending_director",
  "pending_director_review",
  "pending_hrd",
  "pending_hrd_review",
  "menunggu_approval_atasan",
  "menunggu_persetujuan_atasan",
];

const LEAVE_APPROVED_STATUSES = [
  "approved",
  "approved_by_hrd",
  "disetujui",
  "disetujui_hrd",
];

// A karyawan may not open a new "Ajukan Cuti" while an EARLIER request of
// theirs is either still awaiting a decision, or already approved for a
// period that hasn't finished yet — otherwise two overlapping cuti tahunan
// could both be active/pending at once. rejected/cancelled/completed never
// block: those are settled and don't reserve any days.
function isLeaveRequestBlockingNewSubmission(request: LeaveRequest, today: Date): boolean {
  const status = normalizeStatus((request as any).status);

  if (LEAVE_PENDING_STATUSES.includes(status)) return true;

  if (LEAVE_APPROVED_STATUSES.includes(status)) {
    const endDate = toDate((request as any).endDate);
    return !!endDate && endOfDay(endDate) >= startOfDay(today);
  }

  return false;
}

// Notifying the requester that their named replacement accepted/declined is
// a write into a DIFFERENT uid's users/{uid}/notifications — firestore.rules
// only lets HRD/Super Admin `create` there, so this can't be a client-side
// addDoc (same constraint as the leave-submission notifications; see
// /api/leave/send-notifications). The route re-derives the requester uid
// from the leave_requests doc itself after verifying the caller is the
// doc's own assigned replacement, so it can't be used to notify arbitrary
// accounts.
async function notifyReplacementDecision(
  leaveRequestId: string,
  decision: "accepted" | "rejected",
  replacementName: string,
) {
  const auth = getAuth();
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch("/api/leave/send-notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ leaveRequestId, action: "replacement_decision", decision, replacementName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `send-notifications responded ${res.status}`);
  }
}

function cleanUndefinedFields<T extends object>(obj: T): Partial<T> {
  const clean: any = {};
  Object.keys(obj).forEach((key) => {
    const val = (obj as any)[key];
    if (val === undefined) {
      // Omit completely
    } else if (
      val !== null &&
      typeof val === "object" &&
      !(val instanceof Date) &&
      !(val instanceof Timestamp)
    ) {
      clean[key] = cleanUndefinedFields(val);
    } else {
      clean[key] = val;
    }
  });
  return clean;
}

const formSchema = z
  .object({
    leaveType: z.enum(["tahunan", "besar", "menikah", "melahirkan"], {
      required_error: "Jenis cuti wajib dipilih.",
    }),
    startDate: z.date({ required_error: "Tanggal mulai cuti wajib diisi." }),
    endDate: z.date({ required_error: "Tanggal selesai cuti wajib diisi." }),
    leaveAddress: z
      .string()
      .min(10, "Alamat selama cuti wajib diisi (minimal 10 karakter)."),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
    // "none" is a sentinel (never a real uid) for "no colleague available to
    // pick" — Radix Select rejects an empty-string SelectItem value.
    replacementEmployeeUid: z
      .string()
      .min(1, "Pengganti sementara wajib dipilih."),
    handoverNotes: z
      .string()
      .min(10, "Catatan serah terima tugas wajib diisi (minimal 10 karakter)."),
    attachment: z.any().optional(),
  })
  .superRefine((data, ctx) => {
    // Check H-14 rule for start date
    if (!isAtLeast14DaysAhead(data.startDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startDate"],
        message:
          "Pengajuan cuti tahunan minimal dilakukan H-14 sebelum tanggal mulai cuti. Silakan pilih tanggal mulai cuti yang lebih sesuai.",
      });
    }

    // Check end date is not before start date
    if (data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

export function LeaveSubmissionClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  // Sidebar menu stays a single "Pengajuan Cuti" entry — the split into
  // "Pengajuan Saya" / "Mandat Pengganti Sementara" lives entirely inside
  // this page as tabs. ?tab=mandat lets a leave-replacement notification
  // deep-link straight into the right tab.
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"saya" | "mandat">(
    searchParams?.get("tab") === "mandat" ? "mandat" : "saya",
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(
    null,
  );
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isInitializingBalance, setIsInitializingBalance] = useState(false);

  // "Pengganti Sementara" candidates — colleagues in the same brand+division.
  // A plain karyawan account can't `list` employee_profiles directly
  // (firestore.rules only grants that to HRD/Super Admin — see the comment
  // further down where the old free-text handover input used to live), so
  // this goes through a server route using the Admin SDK instead.
  type ReplacementCandidate = {
    uid: string;
    fullName: string;
    jobTitle: string;
    brandId: string;
    brandName: string;
    divisionId: string;
    divisionName: string;
  };
  const [replacementCandidates, setReplacementCandidates] = useState<ReplacementCandidate[]>([]);
  const [isLoadingReplacementCandidates, setIsLoadingReplacementCandidates] = useState(false);

  // Live leave balance — calculateLeaveBalance() run server-side (Admin SDK,
  // via /api/leave/my-balance) against employee_profiles + leave_policies +
  // leave_requests, the exact same calculator every other page (Detail
  // Karyawan, HRD workspace) uses. Replaces the old leave_balances doc as
  // the number source so this card can never drift from what HRD sees.
  const [myLiveLeaveBalance, setMyLiveLeaveBalance] = useState<LeaveBalanceResult | null>(null);
  const [isLoadingLiveBalance, setIsLoadingLiveBalance] = useState(true);

  // Fetch employee profile to read hrdEmploymentInfo
  const { data: employeeProfile, isLoading: isLoadingProfile } =
    useDoc<EmployeeProfile>(
      useMemoFirebase(
        () =>
          userProfile
            ? doc(firestore, "employee_profiles", userProfile.uid)
            : null,
        [userProfile, firestore],
      ),
    );

  const brandId = useMemo(() => {
    if (!employeeProfile?.brandId) return "";
    return Array.isArray(employeeProfile.brandId)
      ? employeeProfile.brandId[0]
      : employeeProfile.brandId;
  }, [employeeProfile?.brandId]);

  // Top-level employee_profiles.divisionId first — Ubah Struktur Kepegawaian
  // writes divisionId/divisionName/brandId/brandName to the TOP LEVEL of the
  // doc on every structural move (see the "Sync root profile" block in
  // employee-data/karyawan/[id]/page.tsx's handleSaveHrd); hrdEmploymentInfo's
  // copy of the same field is only touched by other forms and can lag behind
  // an actual division transfer. `.division` (no "Id") isn't a real field
  // this app ever writes — reading it first was silently always falling
  // through to the possibly-stale hrdEmploymentInfo value below.
  const divisionId = useMemo(() => {
    return (
      (employeeProfile as any)?.divisionId ||
      employeeProfile?.hrdEmploymentInfo?.divisionId ||
      employeeProfile?.hrdEmploymentInfo?.divisionName ||
      ""
    );
  }, [
    (employeeProfile as any)?.divisionId,
    employeeProfile?.hrdEmploymentInfo?.divisionId,
    employeeProfile?.hrdEmploymentInfo?.divisionName,
  ]);

  const divisionDocRef = useMemoFirebase(() => {
    if (!firestore || !brandId || !divisionId) return null;
    return doc(firestore, "brands", brandId, "divisions", divisionId);
  }, [firestore, brandId, divisionId]);

  const { data: divisionMasterRaw } =
    useDoc<DivisionMasterOrganization>(divisionDocRef);

  // Brand-level fallback for staff without a division
  const brandDocRef = useMemoFirebase(() => {
    if (!firestore || !brandId || divisionMasterRaw) return null;
    return doc(firestore, "brands", brandId);
  }, [firestore, brandId, divisionMasterRaw]);
  const { data: brandDoc } = useDoc<any>(brandDocRef);

  const divisionMaster = useMemo((): DivisionMasterOrganization | null => {
    if (divisionMasterRaw) return divisionMasterRaw;
    if (brandDoc?.brandManagerId) {
      return {
        managerId: brandDoc.brandManagerId,
        managerName: brandDoc.brandManagerName || null,
        managerDirectSupervisorId: brandDoc.brandManagerDirectorId || null,
        managerDirectSupervisorName: brandDoc.brandManagerDirectorName || null,
      } as DivisionMasterOrganization;
    }
    return null;
  }, [divisionMasterRaw, brandDoc]);

  // Fetch balance
  const balanceDocRef = useMemoFirebase(() => {
    return userProfile
      ? doc(firestore, "leave_balances", userProfile.uid)
      : null;
  }, [userProfile, firestore]);
  const {
    data: leaveBalance,
    isLoading: isLoadingBalance,
    mutate: mutateBalance,
  } = useDoc<LeaveBalance>(balanceDocRef);


  // Fetch requests submitted by current user only — never a global list.
  // employeeUid is the PRIMARY ownership field (it's the actual Firebase
  // Auth UID, and the one firestore.rules' isLeaveRequestOwner() checks
  // first) — employeeId historically stored the same uid value on old docs
  // but is really meant for an internal employee code, and is kept here only
  // as a compatibility fallback for documents written before employeeUid
  // existed. requesterUid/uid are additional alternate owner fields some
  // older writes used. Each field gets its own scoped query, merged by doc
  // id — never an unfiltered collection(...) query, which is what
  // firestore.rules rejects outright for a karyawan account.
  const employeeUidQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, "leave_requests"), where("employeeUid", "==", userProfile.uid));
  }, [userProfile?.uid, firestore]);
  const requesterUidQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, "leave_requests"), where("requesterUid", "==", userProfile.uid));
  }, [userProfile?.uid, firestore]);
  const uidQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, "leave_requests"), where("uid", "==", userProfile.uid));
  }, [userProfile?.uid, firestore]);
  const userIdQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, "leave_requests"), where("userId", "==", userProfile.uid));
  }, [userProfile?.uid, firestore]);
  // Compatibility-only: old documents that predate employeeUid/requesterUid/uid.
  const employeeIdQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, "leave_requests"), where("employeeId", "==", userProfile.uid));
  }, [userProfile?.uid, firestore]);

  const { data: byEmployeeUid, isLoading: isLoadingByEmployeeUid, mutate: mutateByEmployeeUid } = useCollection<LeaveRequest>(employeeUidQuery);
  const { data: byRequesterUid, isLoading: isLoadingByRequesterUid, mutate: mutateByRequesterUid } = useCollection<LeaveRequest>(requesterUidQuery);
  const { data: byUid, isLoading: isLoadingByUid, mutate: mutateByUid } = useCollection<LeaveRequest>(uidQuery);
  const { data: byUserId, isLoading: isLoadingByUserId, mutate: mutateByUserId } = useCollection<LeaveRequest>(userIdQuery);
  const { data: byEmployeeId, isLoading: isLoadingByEmployeeId, mutate: mutateByEmployeeId } = useCollection<LeaveRequest>(employeeIdQuery);

  useEffect(() => {
    if (!userProfile?.uid) return;
    const role = userProfile.role;
    const roleStr = String(role);
    const queryMode =
      roleStr === "super-admin" || roleStr === "super_admin"
        ? "global"
        : roleStr === "hrd"
          ? "brand_scoped"
          : "employee_scoped";
    console.log("[LEAVE_REQUEST_QUERY_DEBUG]", {
      component: "LeaveSubmissionClient",
      uid: userProfile.uid,
      email: userProfile.email,
      roleKey: role,
      queryMode: "employee",
      fieldUsed: "employeeUid",
      fallbackFieldsUsed: ["requesterUid", "uid", "userId", "employeeId"],
    });
    // This component only ever runs the employee-scoped path below (it's
    // the karyawan-facing "Pengajuan Cuti" page, not an HRD/manager one) —
    // logged in the exact shape requested so a permission-denied report can
    // be checked against it directly.
    console.log("[LEAVE_REQUEST_QUERY_SCOPE_DEBUG]", {
      currentUserUid: userProfile.uid,
      role,
      queryMode,
    });
  }, [userProfile?.uid, userProfile?.email, userProfile?.role]);

  const isLoadingRequests = isLoadingByEmployeeUid || isLoadingByRequesterUid || isLoadingByUid || isLoadingByUserId || isLoadingByEmployeeId;
  const mutateRequests = () => { mutateByEmployeeUid(); mutateByRequesterUid(); mutateByUid(); mutateByUserId(); mutateByEmployeeId(); };

  // Requests where the current user is the NAMED replacement (not the
  // owner) — allowed by firestore.rules' isAssignedReplacement(), a
  // separate grant from isLeaveRequestOwner() above. Requires that rule to
  // actually be deployed — if either of these queries is the one throwing
  // permission-denied while the employeeUid/requesterUid/etc queries above
  // succeed, that's the signal it's a rules-deployment gap, not a frontend
  // scoping bug (both are already scoped by a single field == uid filter,
  // never a bare collection() call). handoverEmployeeId is the older
  // compatibility field — it's always set to the same uid as
  // replacementEmployeeUid on current writes, but is queried separately (and
  // merged below, same pattern as the ownership queries above) in case any
  // doc only ever had the legacy field populated. Speculative field names
  // with no actual usage anywhere in this codebase (e.g.
  // temporaryReplacementUid) are intentionally NOT queried — firestore.rules
  // can only prove a list query safe when the filtered field is one
  // isAssignedReplacement() actually checks, so querying a field the rule
  // doesn't know about would just get rejected outright for every user.
  const replacementByUidQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, "leave_requests"), where("replacementEmployeeUid", "==", userProfile.uid));
  }, [userProfile?.uid, firestore]);
  const replacementByHandoverIdQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, "leave_requests"), where("handoverEmployeeId", "==", userProfile.uid));
  }, [userProfile?.uid, firestore]);
  const {
    data: replacementByUid,
    error: replacementByUidError,
    mutate: mutateReplacementByUid,
  } = useCollection<LeaveRequest>(replacementByUidQuery);
  const {
    data: replacementByHandoverId,
    error: replacementByHandoverIdError,
    mutate: mutateReplacementByHandoverId,
  } = useCollection<LeaveRequest>(replacementByHandoverIdQuery);

  const mutateReplacementRequests = () => {
    mutateReplacementByUid();
    mutateReplacementByHandoverId();
  };

  // Merged mandate list — the "Mandat Pengganti Sementara" section reads
  // this, never either query alone, so a doc only reachable via the legacy
  // handoverEmployeeId field still shows up.
  const replacementRequests = useMemo(() => {
    const byId = new Map<string, LeaveRequest>();
    for (const r of [...(replacementByUid || []), ...(replacementByHandoverId || [])]) {
      if (r.id) byId.set(r.id, r);
    }
    return Array.from(byId.values()).sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bTime - aTime;
    });
  }, [replacementByUid, replacementByHandoverId]);

  const replacementRequestsError = replacementByUidError || replacementByHandoverIdError;

  useEffect(() => {
    if (replacementByUidError) {
      console.error("[LEAVE_REQUEST_QUERY_SCOPE_DEBUG] replacementEmployeeUid query failed", {
        currentUserUid: userProfile?.uid,
        queryField: "replacementEmployeeUid",
        error: replacementByUidError,
      });
    }
    if (replacementByHandoverIdError) {
      console.error("[LEAVE_REQUEST_QUERY_SCOPE_DEBUG] handoverEmployeeId query failed", {
        currentUserUid: userProfile?.uid,
        queryField: "handoverEmployeeId",
        error: replacementByHandoverIdError,
      });
    }
  }, [replacementByUidError, replacementByHandoverIdError, userProfile?.uid]);

  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isConfirmingReplacement, setIsConfirmingReplacement] = useState(false);

  // "Ganti Pengganti" — offered on the owner's own request once its named
  // replacement has declined. Open state doubles as the target request.
  const [changingReplacementRequest, setChangingReplacementRequest] = useState<LeaveRequest | null>(null);
  const [newReplacementUid, setNewReplacementUid] = useState<string>("none");
  const [isChangingReplacement, setIsChangingReplacement] = useState(false);

  const handleAcceptReplacement = async (req: LeaveRequest) => {
    if (!userProfile || !firestore || !req.id) return;
    setIsConfirmingReplacement(true);
    try {
      await updateDocumentNonBlocking(doc(firestore, "leave_requests", req.id), {
        replacementConfirmation: {
          status: "accepted",
          label: "Pengganti bersedia",
          acceptedAt: serverTimestamp(),
          acceptedByUid: userProfile.uid,
          acceptedByName: userProfile.fullName,
          signatureType: "electronic_confirmation",
          message: "Pengganti sementara telah menyatakan bersedia.",
          confirmedByUid: userProfile.uid,
          confirmedByName: userProfile.fullName,
          confirmedAt: serverTimestamp(),
          confirmationSource: "employee_portal",
          confirmationType: "electronic_signature_substitute",
        },
        // Top-level mirror — firestore.rules' isReplacementConfirming() and
        // other readers check replacementConfirmationStatus directly, not
        // just the nested replacementConfirmation.status.
        replacementConfirmationStatus: "accepted",
        replacementConfirmedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      try {
        await notifyReplacementDecision(req.id, "accepted", userProfile.fullName);
      } catch (notifErr) {
        console.warn("[LEAVE_NOTIFICATION_DELAYED]", { requestId: req.id, decision: "accepted", error: notifErr });
      }
      toast({ title: "Konfirmasi Terkirim", description: "Mandat pengganti berhasil dikonfirmasi." });
      mutateReplacementRequests();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal Konfirmasi", description: e.message });
    } finally {
      setIsConfirmingReplacement(false);
    }
  };

  const handleRejectReplacement = async (req: LeaveRequest) => {
    if (!userProfile || !firestore || !req.id) return;
    if (!rejectReason.trim() || rejectReason.trim().length < 5) {
      toast({
        variant: "destructive",
        title: "Alasan Wajib Diisi",
        description: "Tuliskan alasan tidak dapat menjadi pengganti sementara.",
      });
      return;
    }
    setIsConfirmingReplacement(true);
    try {
      await updateDocumentNonBlocking(doc(firestore, "leave_requests", req.id), {
        replacementConfirmation: {
          status: "rejected",
          label: "Pengganti menolak",
          rejectedAt: serverTimestamp(),
          rejectedByUid: userProfile.uid,
          rejectedByName: userProfile.fullName,
          rejectionReason: rejectReason.trim(),
          signatureType: "electronic_confirmation",
          message: "Pengganti sementara tidak bersedia.",
          confirmedByUid: userProfile.uid,
          confirmedByName: userProfile.fullName,
          confirmedAt: serverTimestamp(),
          confirmationSource: "employee_portal",
          confirmationType: "electronic_signature_substitute",
        },
        replacementConfirmationStatus: "rejected",
        replacementRejectedAt: serverTimestamp(),
        replacementRejectionReason: rejectReason.trim(),
        updatedAt: serverTimestamp(),
      });
      try {
        await notifyReplacementDecision(req.id, "rejected", userProfile.fullName);
      } catch (notifErr) {
        console.warn("[LEAVE_NOTIFICATION_DELAYED]", { requestId: req.id, decision: "rejected", error: notifErr });
      }
      toast({ title: "Konfirmasi Terkirim", description: "Mandat pengganti berhasil ditolak." });
      setRejectingRequestId(null);
      setRejectReason("");
      mutateReplacementRequests();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal Konfirmasi", description: e.message });
    } finally {
      setIsConfirmingReplacement(false);
    }
  };

  // Requester swaps in a new replacement after the previous one declined —
  // only ever touches the replacement/handover fields (see the payload
  // below), never dates, status, or any approval-routing field, so this
  // can't be used to smuggle a change into anything that actually needs a
  // revision request instead.
  const handleChangeReplacement = async () => {
    if (!changingReplacementRequest?.id || !firestore || !userProfile) return;
    if (newReplacementUid === "none" || !newReplacementUid) {
      toast({ variant: "destructive", title: "Pengganti Belum Dipilih", description: "Silakan pilih pengganti dari daftar." });
      return;
    }
    const candidate = replacementCandidates.find((c) => c.uid === newReplacementUid);
    if (!candidate) {
      toast({ variant: "destructive", title: "Pengganti Tidak Valid", description: "Data pengganti sudah berubah. Silakan pilih ulang." });
      return;
    }

    setIsChangingReplacement(true);
    try {
      const docRef = doc(firestore, "leave_requests", changingReplacementRequest.id);
      await updateDoc(docRef, {
        replacementEmployeeUid: candidate.uid,
        replacementEmployeeName: candidate.fullName,
        replacementEmployeePosition: candidate.jobTitle,
        replacementEmployeeDivisionId: candidate.divisionId,
        replacementEmployeeDivisionName: candidate.divisionName,
        replacementEmployeeBrandId: candidate.brandId,
        replacementEmployeeBrandName: candidate.brandName,
        handoverEmployeeId: candidate.uid,
        handoverEmployeeName: candidate.fullName,
        handoverEmployeePosition: candidate.jobTitle,
        replacementConfirmation: {
          status: "pending",
          label: "Menunggu konfirmasi pengganti",
          requestedAt: serverTimestamp(),
          requestedByUid: userProfile.uid,
          requestedByName: userProfile.fullName,
          replacementUid: candidate.uid,
          replacementName: candidate.fullName,
          replacementPosition: candidate.jobTitle || "-",
          replacementDivision: candidate.divisionName || "-",
          message: "Anda ditunjuk sebagai pengganti sementara untuk pengajuan cuti ini.",
        },
        replacementConfirmationStatus: "pending",
        updatedAt: serverTimestamp(),
      });

      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/leave/send-notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ leaveRequestId: changingReplacementRequest.id, action: "replacement_reassigned" }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody?.error || `send-notifications responded ${res.status}`);
        }
      } catch (notifErr) {
        console.warn("[LEAVE_NOTIFICATION_DELAYED]", { requestId: changingReplacementRequest.id, action: "replacement_reassigned", error: notifErr });
      }

      toast({ title: "Pengganti Diperbarui", description: `Pengganti sementara diganti menjadi ${candidate.fullName}.` });
      setChangingReplacementRequest(null);
      setNewReplacementUid("none");
      mutateRequests();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal Mengganti Pengganti", description: e.message });
    } finally {
      setIsChangingReplacement(false);
    }
  };

  const pendingReplacementRequests = useMemo(
    () => (replacementRequests || []).filter((r) => (r as any).replacementConfirmation?.status === "pending"),
    [replacementRequests],
  );

  // Mandate entries actually renderable in the "Mandat Pengganti Sementara"
  // section — a doc can match the replacement queries above without ever
  // having had replacementConfirmation set (shouldn't normally happen, but
  // defensive), so this is the real "is the section empty" signal.
  const replacementMandateEntries = useMemo(
    () => (replacementRequests || []).filter((r) => Boolean((r as any).replacementConfirmation)),
    [replacementRequests],
  );

  // Eligibility to SUBMIT annual leave is a separate concern from eligibility
  // to RECEIVE a replacement mandate. Magang/probation/training don't get
  // cuti tahunan, but they can absolutely be named as someone else's
  // temporary replacement and confirm/decline it — that confirmation is
  // sourced from a colleague's request they're named on, not from anything
  // requiring their own leave entitlement. Never use this to gate the
  // mandate section below.
  const leaveEligibility = useMemo(
    () => checkLeaveEligibility(userProfile, employeeProfile),
    [userProfile, employeeProfile],
  );
  const canSubmitAnnualLeave = leaveEligibility.isEligible;

  const sortedRequests = useMemo(() => {
    const merged = new Map<string, LeaveRequest>();
    for (const r of [...(byEmployeeUid || []), ...(byRequesterUid || []), ...(byUid || []), ...(byUserId || []), ...(byEmployeeId || [])]) {
      if (r.id) merged.set(r.id, r);
    }
    return Array.from(merged.values()).sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bTime - aTime;
    });
  }, [byEmployeeUid, byRequesterUid, byUid, byUserId, byEmployeeId]);

  // The earliest of the user's own requests that's still pending approval,
  // or approved with a period that hasn't ended yet — presence of this
  // blocks opening a new "Ajukan Cuti" at all, client-side. onSubmit
  // re-derives this itself right before the write too (a disabled button
  // isn't enough insurance against a stale tab or a race).
  const activeBlockingLeave = useMemo(
    () => sortedRequests.find((r) => isLeaveRequestBlockingNewSubmission(r, new Date())) || null,
    [sortedRequests],
  );

  const canCreateNewLeave =
    canSubmitAnnualLeave &&
    !activeBlockingLeave &&
    (myLiveLeaveBalance?.found ? myLiveLeaveBalance.availableDays : 0) > 0;

  // Self-healing / automatic balance initialization via secure API route
  useEffect(() => {
    if (
      isLoadingProfile ||
      isLoadingBalance ||
      leaveBalance ||
      isInitializingBalance ||
      !userProfile ||
      !firestore
    )
      return;

    const initializeQuota = async () => {
      setIsInitializingBalance(true);
      try {
        const eligibility = checkLeaveEligibility(userProfile, employeeProfile);
        if (!eligibility.isEligible) {
          setIsInitializingBalance(false);
          return;
        }

        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          throw new Error("Sesi login Anda tidak valid.");
        }

        const res = await fetch("/api/leave/initialize-balance", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data.error || "Gagal melakukan inisialisasi kuota cuti.",
          );
        }

        mutateBalance();
        toast({
          title: "Inisialisasi Berhasil",
          description: `Jatah cuti tahunan Anda telah diatur sebesar ${data.balance?.annualAllowance || eligibility.allowance} Hari.`,
        });
      } catch (e: any) {
        console.error("Failed to initialize leave balance:", e);
      } finally {
        setIsInitializingBalance(false);
      }
    };

    initializeQuota();
  }, [
    isLoadingProfile,
    isLoadingBalance,
    leaveBalance,
    userProfile,
    employeeProfile,
    firestore,
    isInitializingBalance,
    mutateBalance,
    toast,
  ]);

  // Fetch "Pengganti Sementara" candidates once the form dialog (or the
  // "Ganti Pengganti" dialog) opens — a server route (Admin SDK), not a
  // client Firestore query, since a plain karyawan account can't list
  // employee_profiles.
  useEffect(() => {
    if ((!isFormOpen && !changingReplacementRequest) || !userProfile) return;
    let cancelled = false;
    const fetchCandidates = async () => {
      setIsLoadingReplacementCandidates(true);
      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error("Sesi login Anda tidak valid.");
        const res = await fetch("/api/leave/replacement-candidates", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal memuat daftar pengganti sementara.");
        if (!cancelled) {
          setReplacementCandidates(data.candidates || []);
          console.log("[LEAVE_REPLACEMENT_CANDIDATES_DEBUG]", {
            currentEmployee: {
              uid: userProfile?.uid,
              fullName: userProfile?.fullName,
            },
            currentDivisionId: divisionId,
            currentDivisionName:
              employeeProfile?.hrdEmploymentInfo?.divisionName || employeeProfile?.hrdEmploymentInfo?.divisi,
            rawEmployeesCount: data.meta?.rawEmployeesCount ?? null,
            excludedInvalidNameCount: data.meta?.excludedInvalidNameCount ?? null,
            candidates: data.candidates || [],
          });
        }
      } catch (e: any) {
        console.error("Failed to fetch replacement candidates:", e);
        if (!cancelled) setReplacementCandidates([]);
      } finally {
        if (!cancelled) setIsLoadingReplacementCandidates(false);
      }
    };
    fetchCandidates();
    return () => {
      cancelled = true;
    };
  }, [isFormOpen, changingReplacementRequest, userProfile]);

  useEffect(() => {
    if (!userProfile) return;
    let cancelled = false;
    (async () => {
      setIsLoadingLiveBalance(true);
      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error("Sesi login Anda tidak valid.");
        const res = await fetch("/api/leave/my-balance", { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal memuat saldo cuti.");
        if (!cancelled) setMyLiveLeaveBalance(data.balance);
      } catch (e) {
        console.error("Failed to fetch live leave balance:", e);
        if (!cancelled) setMyLiveLeaveBalance(null);
      } finally {
        if (!cancelled) setIsLoadingLiveBalance(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userProfile]);

  // Form setup
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      leaveType: "tahunan",
      startDate: new Date(),
      endDate: new Date(),
      leaveAddress: "",
      replacementEmployeeUid: "",
      handoverNotes: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
    },
  });

  const watchLeaveType = form.watch("leaveType");
  const watchStartDate = form.watch("startDate");
  const watchEndDate = form.watch("endDate");
  const watchReplacementEmployeeUid = form.watch("replacementEmployeeUid");

  const selectedReplacement = useMemo(
    () => replacementCandidates.find((c) => c.uid === watchReplacementEmployeeUid) || null,
    [replacementCandidates, watchReplacementEmployeeUid],
  );

  const durationDays = useMemo(() => {
    if (!watchStartDate || !watchEndDate || watchEndDate < watchStartDate)
      return 0;
    return calculateLeaveDuration(watchStartDate, watchEndDate);
  }, [watchStartDate, watchEndDate]);

  const validationResult = useMemo(() => {
    if (!watchStartDate || !watchEndDate) {
      return {
        isValid: false,
        warning: "Silakan pilih tanggal mulai dan selesai cuti.",
        errorField: null,
        dur: 0,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(watchStartDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(watchEndDate);
    end.setHours(0, 0, 0, 0);

    // 0. Eligibility Cuti Tahunan Check
    if (watchLeaveType === "tahunan") {
      const eligibility = checkLeaveEligibility(userProfile, employeeProfile);
      if (!eligibility.isEligible) {
        return {
          isValid: false,
          warning:
            "Status kepegawaian Anda tidak eligible untuk mengajukan Cuti Tahunan.",
          errorField: "leaveType" as const,
          dur: 0,
        };
      }
    }

    // 1. Pilih tanggal lampau
    if (start < today) {
      return {
        isValid: false,
        warning: "Tanggal cuti tidak boleh sebelum hari ini.",
        errorField: "startDate" as const,
        dur: 0,
      };
    }

    // 2. Check H-14 rule (at least 14 calendar days ahead)
    if (!isAtLeast14DaysAhead(watchStartDate)) {
      return {
        isValid: false,
        warning: "Pengajuan cuti minimal diajukan H-14 sebelum tanggal mulai cuti.",
        errorField: "startDate" as const,
        dur: 0,
      };
    }

    // 4. Selesai < Mulai
    if (end < start) {
      return {
        isValid: false,
        warning: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
        errorField: "endDate" as const,
        dur: 0,
      };
    }

    const dur = calculateLeaveDuration(watchStartDate, watchEndDate);

    // 5. Cuti tahunan maksimal 5 hari kerja
    if (watchLeaveType === "tahunan" && dur > 5) {
      return {
        isValid: false,
        warning:
          "Maksimal cuti tahunan dalam satu pengajuan adalah 5 hari kerja.",
        errorField: "endDate" as const,
        dur,
      };
    }

    // 6. Saldo tidak cukup (hanya untuk Cuti Tahunan)
    if (watchLeaveType === "tahunan") {
      const currentBal = myLiveLeaveBalance?.found ? myLiveLeaveBalance.availableDays : 0;
      if (dur > currentBal) {
        return {
          isValid: false,
          warning: "Sisa saldo cuti tidak mencukupi.",
          errorField: "endDate" as const,
          dur,
        };
      }
    }

    // 7. Overlap
    if (sortedRequests) {
      const isOverlap = sortedRequests.some((r) => {
        if (selectedRequest && r.id === selectedRequest.id) return false;
        if (
          r.status === "cancelled" ||
          r.status.includes("rejected") ||
          r.status === "completed"
        )
          return false;
        const startA = start.getTime();
        const endA = end.getTime();
        const startB = r.startDate.toDate().getTime();
        const endB = r.endDate.toDate().getTime();
        return startA <= endB && startB <= endA;
      });

      if (isOverlap) {
        return {
          isValid: false,
          warning: "Tanggal cuti bertabrakan dengan pengajuan cuti lain.",
          errorField: "startDate" as const,
          dur,
        };
      }
    }

    // 8. Semua valid
    return {
      isValid: true,
      warning: `Pengajuan valid. Cuti akan diajukan untuk ${dur} hari kerja.`,
      errorField: null,
      dur,
    };
  }, [
    watchLeaveType,
    watchStartDate,
    watchEndDate,
    leaveBalance,
    sortedRequests,
    selectedRequest,
    userProfile,
    employeeProfile,
  ]);

  // Same-division overlap warning — DISABLED client-side. This used to run
  // where("divisionName","==",division) across ALL of leave_requests, which
  // is a list query that can return other employees' documents. Firestore
  // rules correctly restrict a karyawan account to reading only their own
  // leave_requests docs, so that query was rejected outright with
  // permission-denied for every employee, not just filtered down — Firestore
  // denies a list query entirely if any potential result fails the rule,
  // it doesn't silently drop the disallowed docs. Showing this warning again
  // would require a server-side API (using the Admin SDK, which isn't bound
  // by these rules) rather than a direct client Firestore query.
  const [divisionOverlapWarning, setDivisionOverlapWarning] = useState<
    string | null
  >(null);

  const handleCreate = () => {
    // Defense-in-depth on top of the disabled button — never let the modal
    // itself open while a blocking leave exists, no matter what triggered
    // this call.
    if (!canCreateNewLeave) return;
    setSelectedRequest(null);
    form.reset({
      leaveType: "tahunan",
      startDate: new Date(),
      endDate: new Date(),
      leaveAddress: "",
      replacementEmployeeUid: "",
      handoverNotes: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
    });
    setIsFormOpen(true);
  };

  // Single place that closes the form modal — used by the Batal button, the
  // Dialog's own onOpenChange(false), and after a successful create/update.
  // Without this, selectedRequest can linger after the modal closes (e.g.
  // user cancels an edit), so the NEXT "Ajukan Cuti" click would silently
  // reopen in edit mode against the wrong request.
  const closeLeaveForm = () => {
    setIsFormOpen(false);
    setSelectedRequest(null);
    form.reset({
      leaveType: "tahunan",
      startDate: new Date(),
      endDate: new Date(),
      leaveAddress: "",
      replacementEmployeeUid: "",
      handoverNotes: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
    });
  };

  const handleViewDetails = (req: LeaveRequest) => {
    setSelectedRequest(req);
    setIsDetailOpen(true);
  };

  const handleAction = (action: "edit", req: LeaveRequest) => {
    setSelectedRequest(req);
    form.reset({
      leaveType: req.leaveType || "tahunan",
      startDate: req.startDate.toDate(),
      endDate: req.endDate.toDate(),
      leaveAddress: req.leaveAddress || "",
      replacementEmployeeUid: (req as any).replacementEmployeeUid || req.handoverEmployeeId || "",
      handoverNotes: req.handoverNotes || "",
      emergencyContactName: req.emergencyContactName,
      emergencyContactPhone: req.emergencyContactPhone,
    });
    setIsFormOpen(true);
  };

  const handleCancel = async (req: LeaveRequest) => {
    if (!firestore) return;
    if (!confirm("Apakah Anda yakin ingin membatalkan pengajuan cuti ini?"))
      return;

    try {
      const reqRef = doc(firestore, "leave_requests", req.id!);
      const batch = writeBatch(firestore);

      // Change status to cancelled
      batch.update(reqRef, {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });

      // Employee cannot edit/update leave_balances directly due to Firestore Security Rules.
      // Quota updates are handled by HRD / Super Admin or an API server.

      await batch.commit();
      toast({ title: "Pengajuan Cuti Dibatalkan" });
      mutateRequests();
      mutateBalance();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Gagal Membatalkan Cuti",
        description: e.message,
      });
    }
  };

  const onSubmit = async (values: FormValues) => {
    // Extra insurance on top of the submit button's disabled={isSaving} —
    // a form re-submit (e.g. a stray Enter keypress before the disabled
    // state re-renders) must never create a second leave_requests doc.
    if (isSaving) return;
    // myLiveLeaveBalance (calculateLeaveBalance(), the same source every
    // other page reads) gates submission now — not the legacy leave_balances
    // doc, which may not exist for this employee at all even though their
    // live-calculated balance is perfectly valid.
    if (!userProfile || !firestore || !myLiveLeaveBalance?.found) return;

    // Re-validate the double-submission block right before create — the
    // disabled button/hidden dialog is only a UX nicety, not the real
    // guard. sortedRequests is a live query result, so this catches a
    // stale tab, a race with another device, or a status that changed
    // while this modal was open. Editing an existing request (revision
    // resubmit) doesn't reserve a NEW period, so it's exempt.
    if (!selectedRequest) {
      const latestBlockingLeave = sortedRequests.find((r) =>
        isLeaveRequestBlockingNewSubmission(r, new Date()),
      );
      if (latestBlockingLeave) {
        toast({
          variant: "destructive",
          title: "Masih Ada Cuti Aktif",
          description: "Anda masih memiliki pengajuan cuti yang sedang aktif atau diproses.",
        });
        return;
      }
    }

    // Use our centralized, strict validationResult check as final guard
    if (!validationResult.isValid) {
      toast({
        variant: "destructive",
        title: "Validasi Gagal",
        description:
          validationResult.warning ||
          "Silakan periksa kembali isian tanggal pengajuan cuti Anda.",
      });
      return;
    }

    // Guard against a replacement that's no longer valid (e.g. moved
    // divisions or was deactivated while this modal was open) — never trust
    // a stale selection silently.
    if (
      values.replacementEmployeeUid !== "none" &&
      !replacementCandidates.some((c) => c.uid === values.replacementEmployeeUid)
    ) {
      toast({
        variant: "destructive",
        title: "Pengganti Tidak Valid",
        description: "Data pengganti sementara sudah berubah. Silakan pilih ulang pengganti.",
      });
      return;
    }

    const hrdInfo = employeeProfile?.hrdEmploymentInfo || {};
    if (!employeeProfile) {
      toast({
        variant: "destructive",
        title: "Data Profil Tidak Lengkap",
        description: "Profil kepegawaian belum tersedia. Hubungi HRD.",
      });
      return;
    }

    const approvalTarget = resolveApprovalTarget(
      employeeProfile,
      userProfile,
      divisionMaster,
    );
    if (!approvalTarget.approvalTargetUid) {
      toast({
        variant: "destructive",
        title: "Atasan Tidak Valid",
        description: "Atasan persetujuan belum diatur. Hubungi HRD untuk melengkapi struktur organisasi.",
      });
      return;
    }
    // Defense-in-depth on top of resolveApprovalTarget's own self-checks —
    // firestore.rules' create rule (and any stricter deployed version) must
    // never see an approver equal to the requester.
    if (approvalTarget.approvalTargetUid === userProfile.uid) {
      toast({
        variant: "destructive",
        title: "Atasan Tidak Valid",
        description: "Atasan tidak boleh sama dengan pengaju cuti. Hubungi HRD untuk memperbaiki struktur organisasi.",
      });
      return;
    }

    // brandId is required by the leave_requests create rule and must never
    // be silently sent as "" — the old inline resolution only looked at
    // employeeProfile.brandId, missing brandId/companyId nested under
    // hrdEmploymentInfo on profiles that only have it there.
    const resolvedBrandId =
      (Array.isArray(employeeProfile?.brandId) ? employeeProfile.brandId[0] : employeeProfile?.brandId) ||
      (employeeProfile as any)?.companyId ||
      employeeProfile?.hrdEmploymentInfo?.brandId ||
      (employeeProfile?.hrdEmploymentInfo as any)?.companyId ||
      "";
    if (!resolvedBrandId) {
      toast({
        variant: "destructive",
        title: "Data Perusahaan Tidak Lengkap",
        description: "Brand/perusahaan karyawan belum diatur. Hubungi HRD.",
      });
      return;
    }

    setIsSaving(true);
    let attachmentUrl = "";
    try {
      if (values.attachment instanceof File) {
        const validation = validateStorageFile(values.attachment);
        if (!validation.isValid) {
          toast({
            variant: "destructive",
            title: "Lampiran Gagal",
            description: validation.message,
          });
          setIsSaving(false);
          return;
        }

        const compressed = await compressImage(values.attachment);
        const filePath = `leave-attachments/${userProfile.uid}/${Date.now()}-${compressed.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
        const uploadResult = await uploadFile(
          compressed,
          filePath,
          userProfile.uid,
          {
            category: "leave",
            ownerUid: userProfile.uid,
            compress: false,
          },
        );
        attachmentUrl =
          uploadResult.webViewLink || uploadResult.downloadUrl || "";
      } else if (typeof values.attachment === "string") {
        attachmentUrl = values.attachment;
      }

      const submissionDateVal = new Date();

      const formattedSubmissionTime = format(
        submissionDateVal,
        "EEEE, dd MMMM yyyy 'pukul' HH:mm",
        { locale: idLocale },
      );
      const formattedStartDate = format(
        values.startDate,
        "EEEE, dd MMMM yyyy",
        { locale: idLocale },
      );
      const formattedEndDate = format(values.endDate, "EEEE, dd MMMM yyyy", {
        locale: idLocale,
      });

      const structuralPosition =
        employeeProfile?.hrdEmploymentInfo?.structuralPosition ||
        (employeeProfile as any)?.structuralPosition ||
        userProfile?.structuralLevel ||
        (employeeProfile?.isDivisionManager || userProfile?.isDivisionManager
          ? "division_manager"
          : "staff");

      const isDivisionManager = structuralPosition === "division_manager";

      const payload: any = {
        // employeeUid is the actual Firebase Auth UID — the field
        // firestore.rules' isLeaveRequestOwner() checks first, and the one
        // this component's own read queries filter by. employeeId is kept
        // for display/internal employee code purposes only (falls back to
        // the uid if no code is on file yet) — it is NOT the ownership
        // field, even though older docs used to (incorrectly) rely on it.
        employeeUid: userProfile.uid,
        requesterUid: userProfile.uid, // Alternate ownership field some rules/tools check
        uid: userProfile.uid, // Alternate ownership field some rules/tools check
        userId: userProfile.uid, // Alternate ownership field some rules/tools check
        employeeId: (employeeProfile as any)?.employeeId || userProfile.uid,
        employeeName: userProfile.fullName,
        brandId: resolvedBrandId,
        // Top-level fields first — see the divisionId useMemo comment above
        // for why hrdEmploymentInfo's copy can lag behind a real transfer.
        brandName: (employeeProfile as any)?.brandName || hrdInfo.brandName || hrdInfo.brand || "",
        divisionId:
          (employeeProfile as any)?.divisionId ||
          hrdInfo.divisionId ||
          (employeeProfile as any)?.strukturKepegawaian?.divisionId ||
          "",
        divisionName:
          (employeeProfile as any)?.divisionName ||
          hrdInfo.divisionName ||
          (employeeProfile as any)?.strukturKepegawaian?.divisionName ||
          hrdInfo.divisi ||
          "",
        // Snapshot pair, kept alongside the display fields above purely as
        // "divisi saat pengajuan" history — display code (HRD workspace,
        // detail views) must always resolve division from the employee's
        // LIVE profile instead (resolveCurrentEmployeeDivision in
        // employee-division.ts), never from these, since they go stale the
        // moment HRD moves the employee to a different division.
        requestDivisionId:
          (employeeProfile as any)?.divisionId ||
          hrdInfo.divisionId ||
          (employeeProfile as any)?.strukturKepegawaian?.divisionId ||
          "",
        requestDivisionName:
          (employeeProfile as any)?.divisionName ||
          hrdInfo.divisionName ||
          (employeeProfile as any)?.strukturKepegawaian?.divisionName ||
          hrdInfo.divisi ||
          "",
        employeeCurrentDivisionId:
          (employeeProfile as any)?.divisionId ||
          hrdInfo.divisionId ||
          (employeeProfile as any)?.strukturKepegawaian?.divisionId ||
          "",
        employeeCurrentDivisionName:
          (employeeProfile as any)?.divisionName ||
          hrdInfo.divisionName ||
          (employeeProfile as any)?.strukturKepegawaian?.divisionName ||
          hrdInfo.divisi ||
          "",
        employmentType:
          hrdInfo.employeeType ||
          hrdInfo.tipeKaryawan ||
          userProfile.employmentType ||
          "karyawan",
        contractDurationMonths: parseContractDurationMonths(
          hrdInfo.durasiKontrak || (hrdInfo as any).contractDurationMonths || (hrdInfo as any).contractDuration || "",
        ),
        leaveType: values.leaveType,
        startDate: Timestamp.fromDate(values.startDate),
        endDate: Timestamp.fromDate(values.endDate),
        durationDays: durationDays,
        // No user-facing "Alasan Cuti" field anymore — auto-filled so
        // anything downstream still expecting a reason/leaveReason string
        // doesn't break.
        reason: "Pengajuan cuti tahunan",
        leaveReason: "Pengajuan cuti tahunan",
        leaveAddress: values.leaveAddress,
        // New field set (uid-sourced, not manually typed) plus the legacy
        // handoverEmployee* fields mirrored from the same selection for
        // whatever downstream (approval dialogs, exports) still reads those.
        replacementEmployeeUid:
          values.replacementEmployeeUid !== "none" ? values.replacementEmployeeUid : null,
        replacementEmployeeName: selectedReplacement?.fullName || "",
        replacementEmployeePosition: selectedReplacement?.jobTitle || "",
        replacementEmployeeDivisionId: selectedReplacement?.divisionId || "",
        replacementEmployeeDivisionName: selectedReplacement?.divisionName || "",
        replacementEmployeeBrandId: selectedReplacement?.brandId || "",
        replacementEmployeeBrandName: selectedReplacement?.brandName || "",
        handoverEmployeeId:
          values.replacementEmployeeUid !== "none" ? values.replacementEmployeeUid : "manual",
        handoverEmployeeName: selectedReplacement?.fullName || "",
        handoverEmployeePosition: selectedReplacement?.jobTitle || "",
        handoverNotes: values.handoverNotes,
        emergencyContactName: values.emergencyContactName || "",
        emergencyContactPhone: values.emergencyContactPhone || "",

        // Confirmation-as-electronic-signature-substitute workflow — reset
        // to "pending" on every (re)submission, including when the pengaju
        // reopens a request to swap in a different replacement after a
        // rejection, so a stale accepted/rejected state never lingers
        // against a now-different person.
        ...(selectedReplacement && {
          replacementConfirmation: {
            status: "pending",
            label: "Menunggu konfirmasi pengganti",
            requestedAt: serverTimestamp(),
            requestedByUid: userProfile.uid,
            requestedByName: userProfile.fullName,
            replacementUid: selectedReplacement.uid,
            replacementName: selectedReplacement.fullName,
            replacementPosition: selectedReplacement.jobTitle || "-",
            replacementDivision: selectedReplacement.divisionName || "-",
            message: "Anda ditunjuk sebagai pengganti sementara untuk pengajuan cuti ini.",
          },
        }),

        // Approver fields based on structural level
        status: isDivisionManager ? "pending_director_review" : "pending_manager_review",
        approvalFlowType: isDivisionManager ? "manager_to_director_to_hrd" : "staff_to_manager_to_hrd",
        currentApprovalStep: isDivisionManager ? "director" : "manager",
        currentApproverUid: approvalTarget.approvalTargetUid,
        approvalTargetUid: approvalTarget.approvalTargetUid,
        directSupervisorUid: isDivisionManager ? approvalTarget.approvalTargetUid : null,
        directorUid: isDivisionManager ? approvalTarget.approvalTargetUid : null,
        directorId: isDivisionManager ? approvalTarget.approvalTargetUid : null,
        directorName: isDivisionManager ? (approvalTarget.approvalTargetName || "") : "",

        managerId: approvalTarget.approvalTargetUid,
        managerUid: approvalTarget.approvalTargetUid,
        directManagerId: approvalTarget.approvalTargetUid,
        directManagerUid: approvalTarget.approvalTargetUid,
        managerName: approvalTarget.approvalTargetName || "",
        approvalLevel: approvalTarget.approvalLevel,
        requesterStructuralPosition: structuralPosition,

        // Safe optional fields - using null instead of undefined to satisfy Firestore requirements
        managerNotes: selectedRequest?.managerNotes || null,
        hrdNotes: selectedRequest?.hrdNotes || null,
        replacementEmployeeId:
          (selectedRequest as any)?.replacementEmployeeId || null,

        // Optional document attachment fields (sent only when attachmentUrl is provided)
        ...(attachmentUrl
          ? {
              attachmentUrl,
              attachmentFileId:
                (selectedRequest as any)?.attachmentFileId || null,
              attachmentFileName:
                (selectedRequest as any)?.attachmentFileName || null,
              attachmentMimeType:
                (selectedRequest as any)?.attachmentMimeType || null,
            }
          : {}),

        // Rich time tracking metadata (Asia/Jakarta Context)
        submittedAtStr: formattedSubmissionTime,
        submissionDay: format(submissionDateVal, "EEEE", { locale: idLocale }),
        submissionDate: format(submissionDateVal, "dd MMMM yyyy", {
          locale: idLocale,
        }),
        submissionTime: format(submissionDateVal, "HH:mm", {
          locale: idLocale,
        }),
        startDateStr: formattedStartDate,
        startDay: format(values.startDate, "EEEE", { locale: idLocale }),
        startDateFormatted: format(values.startDate, "dd MMMM yyyy", {
          locale: idLocale,
        }),
        endDateStr: formattedEndDate,
        endDay: format(values.endDate, "EEEE", { locale: idLocale }),
        endDateFormatted: format(values.endDate, "dd MMMM yyyy", {
          locale: idLocale,
        }),
        durationDaysStr: `${durationDays} hari kerja`,
        timezone: "Asia/Jakarta",
      };

      const isEditMode = Boolean(selectedRequest?.id);
      const docRef = isEditMode
        ? doc(firestore, "leave_requests", selectedRequest!.id!)
        : doc(collection(firestore, "leave_requests"));

      // A revision resubmission must route back into the queue of whoever
      // asked for the revision — otherwise the doc stays stuck at
      // revision_requested_by_X forever, invisible to every approver.
      const REVISION_RESUBMIT_TARGET: Record<string, { status: string; currentApprovalStep: string }> = {
        revision_requested: { status: "pending_manager_review", currentApprovalStep: "manager" },
        revision_requested_by_manager: { status: "pending_manager_review", currentApprovalStep: "manager" },
        revision_requested_by_director: { status: "pending_director_review", currentApprovalStep: "director" },
        revision_requested_by_hrd: { status: "pending_hrd", currentApprovalStep: "hrd" },
      };
      const resubmitTarget = isEditMode ? REVISION_RESUBMIT_TARGET[selectedRequest!.status] : undefined;

      // Dynamically remove any undefined properties to avoid Firestore "Unsupported field value: undefined" errors
      let cleanedPayload: any;
      if (isEditMode) {
        // UPDATE — only the fields this form can actually change. Ownership
        // (employeeUid/requesterUid/uid/userId/employeeId), routing
        // (brandId/approvalTargetUid/currentApproverUid/managerId/...), and
        // approval-flow fields are set once at create and must never be
        // resent on edit — resending them here risks silently rewriting an
        // in-flight approval chain (e.g. re-pointing approvalTargetUid at a
        // manager who's since changed) as a side effect of a form save.
        cleanedPayload = cleanUndefinedFields({
          leaveType: values.leaveType,
          startDate: Timestamp.fromDate(values.startDate),
          endDate: Timestamp.fromDate(values.endDate),
          durationDays,
          reason: "Pengajuan cuti tahunan",
          leaveReason: "Pengajuan cuti tahunan",
          leaveAddress: values.leaveAddress,
          emergencyContactName: values.emergencyContactName || "",
          emergencyContactPhone: values.emergencyContactPhone || "",

          replacementEmployeeUid:
            values.replacementEmployeeUid !== "none" ? values.replacementEmployeeUid : null,
          replacementEmployeeName: selectedReplacement?.fullName || "",
          replacementEmployeePosition: selectedReplacement?.jobTitle || "",
          replacementEmployeeDivisionId: selectedReplacement?.divisionId || "",
          replacementEmployeeDivisionName: selectedReplacement?.divisionName || "",
          replacementEmployeeBrandId: selectedReplacement?.brandId || "",
          replacementEmployeeBrandName: selectedReplacement?.brandName || "",

          handoverEmployeeId:
            values.replacementEmployeeUid !== "none" ? values.replacementEmployeeUid : "manual",
          handoverEmployeeName: selectedReplacement?.fullName || "",
          handoverEmployeePosition: selectedReplacement?.jobTitle || "",
          handoverNotes: values.handoverNotes,

          // Reset confirmation state — an edited request may point at a
          // different (or the same, but freshly re-asked) replacement.
          replacementConfirmation: selectedReplacement
            ? {
                status: "pending",
                label: "Menunggu konfirmasi pengganti",
                requestedAt: serverTimestamp(),
                requestedByUid: userProfile.uid,
                requestedByName: userProfile.fullName,
                replacementUid: selectedReplacement.uid,
                replacementName: selectedReplacement.fullName,
                replacementPosition: selectedReplacement.jobTitle || "-",
                replacementDivision: selectedReplacement.divisionName || "-",
                message: "Anda ditunjuk sebagai pengganti sementara untuk pengajuan cuti ini.",
              }
            : null,
          replacementConfirmationStatus: selectedReplacement ? "pending" : "none",

          ...(attachmentUrl
            ? {
                attachmentUrl,
                attachmentFileId: (selectedRequest as any)?.attachmentFileId || null,
                attachmentFileName: (selectedRequest as any)?.attachmentFileName || null,
                attachmentMimeType: (selectedRequest as any)?.attachmentMimeType || null,
              }
            : {}),

          submittedAtStr: formattedSubmissionTime,
          submissionDay: format(submissionDateVal, "EEEE", { locale: idLocale }),
          submissionDate: format(submissionDateVal, "dd MMMM yyyy", { locale: idLocale }),
          submissionTime: format(submissionDateVal, "HH:mm", { locale: idLocale }),

          startDateStr: formattedStartDate,
          startDay: format(values.startDate, "EEEE", { locale: idLocale }),
          startDateFormatted: format(values.startDate, "dd MMMM yyyy", { locale: idLocale }),

          endDateStr: formattedEndDate,
          endDay: format(values.endDate, "EEEE", { locale: idLocale }),
          endDateFormatted: format(values.endDate, "dd MMMM yyyy", { locale: idLocale }),

          durationDaysStr: `${durationDays} hari kerja`,
          timezone: "Asia/Jakarta",

          // Route back to whichever approver requested the revision —
          // resetting status is the only way a resubmit re-enters that queue.
          ...(resubmitTarget || {}),
        });
      } else {
        // CREATE — full payload including ownership/approval/routing fields.
        cleanedPayload = cleanUndefinedFields(payload);
      }

      // Full snapshot of every field firestore.rules' leave_requests
      // create/update checks can look at — logged right before the write so
      // a permission-denied can be diagnosed from this line alone, without
      // guessing which field was empty/mismatched. On UPDATE most of these
      // are legitimately undefined (they weren't resent), which is expected.
      console.log("[LEAVE_CREATE_PAYLOAD_VALIDATE]", {
        authUid: userProfile.uid,
        isEditMode,
        selectedRequestId: selectedRequest?.id || null,
        employeeUid: cleanedPayload.employeeUid,
        requesterUid: cleanedPayload.requesterUid,
        uid: cleanedPayload.uid,
        userId: cleanedPayload.userId,
        employeeId: cleanedPayload.employeeId,
        brandId: cleanedPayload.brandId,
        brandName: cleanedPayload.brandName,
        approvalTargetUid: cleanedPayload.approvalTargetUid,
        currentApproverUid: cleanedPayload.currentApproverUid,
        directSupervisorUid: cleanedPayload.directSupervisorUid,
        managerUid: cleanedPayload.managerUid,
        status: cleanedPayload.status,
      });

      // ===== MAIN WRITE — this is the only write that may create/update the
      // leave_requests doc, and the only one whose failure should ever be
      // reported to the user as "gagal". Everything below this point
      // (notifications) is a side effect and must never be allowed to make a
      // successful submission look like a failure.
      const operation = isEditMode ? "UPDATE" : "CREATE";
      try {
        if (isEditMode) {
          await updateDoc(docRef, { ...cleanedPayload, updatedAt: serverTimestamp() });
        } else {
          await setDoc(docRef, { ...cleanedPayload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        }
        console.log(`[LEAVE_REQUEST_${operation}D]`, { id: docRef.id, path: docRef.path });
      } catch (mainWriteError) {
        console.error(`[LEAVE_REQUEST_${operation}_FAILED]`, {
          path: docRef.path,
          authUid: userProfile.uid,
          isEditMode,
          selectedRequestId: selectedRequest?.id || null,
          payloadCheck: {
            employeeUid: cleanedPayload.employeeUid,
            requesterUid: cleanedPayload.requesterUid,
            brandId: cleanedPayload.brandId,
            approvalTargetUid: cleanedPayload.approvalTargetUid,
            status: cleanedPayload.status,
          },
          error: mainWriteError,
        });
        throw mainWriteError;
      }

      // Note: We DO NOT update leave_balances from the client here as standard employees are restricted by Security Rules.
      // Leave balance quota adjustments are handled by HRD / Super Admin or backend API.

      // The leave request itself is now safely committed — show success and
      // close the modal immediately, before touching anything else. A
      // notification failure after this point must not undo it.
      toast({
        title: isEditMode ? "Perubahan Disimpan" : "Pengajuan Cuti Berhasil",
        description: isEditMode
          ? "Pengajuan cuti berhasil diperbarui."
          : "Pengajuan cuti berhasil diajukan.",
      });
      closeLeaveForm();
      mutateRequests();
      mutateBalance();

      // ===== SIDE EFFECTS — notifications, and only for a brand-new
      // submission (an edit/revision resubmit doesn't re-announce "cuti
      // diajukan"; that already went out at create time). These are no
      // longer written directly from the client: firestore.rules only lets
      // HRD/Super Admin `create` under users/{uid}/notifications — a
      // karyawan can't write one even to their own uid — so every one of
      // these client-side addDoc calls was permission-denied by design, and
      // that failure was what the old "Notifikasi Tertunda" toast surfaced.
      // The fix is moving the write server-side (Admin SDK bypasses rules),
      // not loosening the rule to `isSignedIn()`, which would let any
      // karyawan spam notifications into any other account. The leave
      // request itself already succeeded and closeLeaveForm()/toast above
      // already ran — a failure here is purely a best-effort delivery
      // hiccup, never something the user needs to see or act on.
      if (!isEditMode) {
        try {
          const auth = getAuth();
          const token = await auth.currentUser?.getIdToken();
          const res = await fetch("/api/leave/send-notifications", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ leaveRequestId: docRef.id }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error || `send-notifications responded ${res.status}`);
          }
        } catch (notifError) {
          console.warn("[LEAVE_NOTIFICATION_DELAYED]", { requestId: docRef.id, error: notifError });
          // Best-effort retry marker for HRD/Super Admin tooling — never
          // allowed to fail the submission itself if this write also fails.
          try {
            await updateDoc(docRef, {
              notificationStatus: "pending",
              notificationPendingReason: "server_notification_failed",
            });
          } catch (markError) {
            console.warn("[LEAVE_NOTIFICATION_STATUS_MARK_FAILED]", { requestId: docRef.id, error: markError });
          }
        }
      }
    } catch (e: any) {
      // Reaching here means the MAIN leave_requests write itself failed —
      // the send-notifications call above has its own try/catch and never
      // throws into this block, so this path label is always accurate.
      // isEditMode may be unset if the error happened before that point was
      // reached, so it's re-derived here too.
      const isEditMode = Boolean(selectedRequest?.id);
      const operation = isEditMode ? "UPDATE" : "CREATE";
      console.error(`=== SUBMIT LEAVE REQUEST ${operation} ERROR ===`);
      console.error("Error Code/Message:", e.message || e);
      console.error(
        "Firestore Path attempted: leave_requests/" +
          (selectedRequest?.id || "[NEW_DOCUMENT]"),
      );

      let errorDescription = e.message;
      if (
        e.message?.toLowerCase().includes("permission") ||
        e.code === "permission-denied"
      ) {
        errorDescription = `Missing or insufficient permissions on path 'leave_requests/${selectedRequest?.id || "[NEW_DOCUMENT]"}'. Please verify Firestore Security Rules.`;
      }

      toast({
        variant: "destructive",
        title: isEditMode ? "Gagal Menyimpan Perubahan" : "Gagal Mengajukan Cuti",
        description: errorDescription,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Status display now checks replacementConfirmationStatus FIRST via
  // getLeaveProcessStage — a request sitting at status "pending_manager_review"
  // with an unconfirmed replacement must show "Menunggu Konfirmasi Pengganti",
  // not "Menunggu Persetujuan Atasan", since it hasn't actually reached the
  // atasan's queue yet. Terminal/legacy statuses getLeaveProcessStage doesn't
  // model (cancelled/rejected/revision) fall back to the raw-status switch.
  const getStatusBadgeClass = (request: LeaveRequest) => {
    const stage = getLeaveProcessStage(request);
    switch (stage.stage) {
      case "replacement_pending":
        return "bg-amber-500/10 border-amber-500/20 text-amber-600";
      case "replacement_rejected":
        return "bg-red-500/10 border-red-500/20 text-red-600";
      case "manager_pending":
        return "bg-indigo-500/10 border-indigo-500/20 text-indigo-600";
      case "hrd_pending":
        return "bg-blue-500/10 border-blue-500/20 text-blue-600";
      case "approved":
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-600";
      default:
        break;
    }
    switch (request.status) {
      case "active_leave":
        return "bg-blue-500/10 border-blue-500/20 text-blue-600";
      case "completed":
        return "bg-slate-500/10 border-slate-500/20 text-slate-600";
      case "cancelled":
        return "bg-gray-500/10 border-gray-500/20 text-gray-500";
      case "rejected_by_manager":
      case "rejected_by_director":
      case "rejected_by_hrd":
        return "bg-red-500/10 border-red-500/20 text-red-600";
      case "revision_requested":
      case "revision_requested_by_manager":
      case "revision_requested_by_director":
      case "revision_requested_by_hrd":
        return "bg-amber-500/10 border-amber-500/20 text-amber-600";
      default:
        return "bg-indigo-500/10 border-indigo-500/20 text-indigo-600";
    }
  };

  const getStatusLabel = (request: LeaveRequest) => {
    const stage = getLeaveProcessStage(request);
    if (stage.stage !== "unknown") return stage.label;
    switch (request.status) {
      case "revision_requested":
      case "revision_requested_by_manager":
      case "revision_requested_by_director":
      case "revision_requested_by_hrd":
        return "Perlu Revisi";
      case "rejected_by_manager":
      case "rejected_by_director":
      case "rejected_by_hrd":
        return "Ditolak";
      case "active_leave":
        return "Cuti Aktif";
      case "completed":
        return "Cuti Selesai";
      case "cancelled":
        return "Dibatalkan";
      default:
        return request.status;
    }
  };

  // Sub-status text shown under the badge for the two stages where the
  // headline label alone doesn't explain what's actually being waited on.
  const getStatusSubLabel = (request: LeaveRequest): string | null => {
    const stage = getLeaveProcessStage(request);
    if (stage.stage === "replacement_pending") {
      return "Pengajuan belum diteruskan ke atasan sampai pengganti sementara memberi konfirmasi.";
    }
    if (stage.stage === "replacement_rejected") {
      return "Pengganti menolak. Silakan pilih pengganti lain agar pengajuan bisa dilanjutkan.";
    }
    return null;
  };

  const getReplacementBadge = (req: LeaveRequest) => {
    const confirmation = (req as any).replacementConfirmation;
    if (!confirmation?.status) return null;
    switch (confirmation.status) {
      case "accepted":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            Pengganti Bersedia
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400">
            Pengganti Menolak
          </span>
        );
      case "pending":
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400">
            Menunggu Konfirmasi
          </span>
        );
    }
  };

  if (
    isLoadingProfile ||
    isLoadingBalance ||
    isLoadingRequests ||
    isInitializingBalance
  ) {
    return (
      <div className="flex flex-col justify-center items-center h-64 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        <p className="text-sm font-medium text-slate-400">
          Menyiapkan dashboard cuti...
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900/30">
              <CalendarOff className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white">
                Pengajuan Cuti Tahunan
              </h1>
              <p className="text-xs text-muted-foreground font-medium">
                Kelola saldo dan riwayat rencana cuti Anda secara aman.
              </p>
            </div>
          </div>
          {canSubmitAnnualLeave && (
            <Button
              onClick={handleCreate}
              disabled={!canCreateNewLeave}
              title={
                activeBlockingLeave
                  ? "Selesaikan atau tunggu pengajuan cuti aktif Anda sebelum membuat pengajuan baru."
                  : undefined
              }
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-5 py-2.5 shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Buat Pengajuan Cuti
            </Button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "saya" | "mandat")}>
          <TabsList>
            <TabsTrigger value="saya">Pengajuan Saya</TabsTrigger>
            <TabsTrigger value="mandat" className="gap-1.5">
              Mandat Pengganti Sementara
              {pendingReplacementRequests.length > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                  {pendingReplacementRequests.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="saya" className="space-y-6 mt-4">

        {/* Quota & Info Section — only meaningful for someone who can
            actually submit cuti tahunan. A magang/probation/training account
            never gets a leave_balances doc by design (initializeQuota above
            skips them), so showing "Saldo Cuti Belum Tersedia" here would be
            misleading; show why annual leave isn't available instead. This
            never gates anything below it (Mandat Pengganti Sementara, and
            the Riwayat table further down are unaffected). */}
        {!canSubmitAnnualLeave ? (
          <Card className="border-slate-100 dark:border-slate-900 shadow-sm max-w-2xl">
            <CardContent className="pt-6 flex gap-4 items-start">
              <div className="p-2 bg-slate-100 dark:bg-slate-900/60 rounded-xl text-slate-500 dark:text-slate-400">
                <Info className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Belum Memenuhi Kriteria Cuti Tahunan
                </h3>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {leaveEligibility.reason ||
                    "Anda belum dapat mengajukan cuti tahunan karena status Anda saat ini."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : isLoadingLiveBalance ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="border-slate-100 dark:border-slate-900 shadow-sm">
                <CardContent className="pt-6">
                  <div className="h-3 w-20 rounded bg-slate-100 dark:bg-slate-800" />
                  <div className="mt-3 h-8 w-14 rounded bg-slate-100 dark:bg-slate-800" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !myLiveLeaveBalance?.found ? (
          <Card className="border-amber-100 dark:border-amber-900/20 bg-amber-50/50 dark:bg-amber-950/10 shadow-sm max-w-2xl">
            <CardContent className="pt-6 flex gap-4 items-start">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Saldo Cuti Belum Tersedia
                </h3>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {myLiveLeaveBalance?.reason === "contract_incomplete"
                    ? "Periode kontrak Anda belum diatur oleh HRD."
                    : "Kebijakan cuti untuk brand Anda belum diatur oleh HRD."}{" "}
                  Silakan hubungi HRD.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-indigo-100/50 dark:border-indigo-900/10 shadow-sm bg-gradient-to-br from-indigo-500/5 via-indigo-600/0 to-transparent">
              <CardContent className="pt-6">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Sisa Saldo Cuti
                </p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-4xl font-black text-indigo-600 dark:text-indigo-400">
                    {myLiveLeaveBalance.availableDays}
                  </span>
                  <span className="text-sm font-bold text-slate-500">Hari</span>
                </div>
              </CardContent>
            </Card>
            <Card className="border-emerald-100/50 dark:border-emerald-900/10 shadow-sm bg-gradient-to-br from-emerald-500/5 via-emerald-600/0 to-transparent">
              <CardContent className="pt-6">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Cuti Terpakai
                </p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-4xl font-black text-emerald-600 dark:text-emerald-400">
                    {myLiveLeaveBalance.usedDays}
                  </span>
                  <span className="text-sm font-bold text-slate-500">Hari</span>
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-100/50 dark:border-amber-900/10 shadow-sm bg-gradient-to-br from-amber-500/5 via-amber-600/0 to-transparent">
              <CardContent className="pt-6">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Dalam Approval
                </p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-4xl font-black text-amber-600 dark:text-amber-400">
                    {myLiveLeaveBalance.pendingDays}
                  </span>
                  <span className="text-sm font-bold text-slate-500">Hari</span>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-100 dark:border-slate-900 shadow-sm bg-slate-50/50 dark:bg-slate-900/50">
              <CardContent className="pt-6">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Jatah Awal Tahunan
                </p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-4xl font-black text-slate-700 dark:text-slate-200">
                    {myLiveLeaveBalance.entitlementDays}
                  </span>
                  <span className="text-sm font-bold text-slate-500">Hari</span>
                </div>
                {myLiveLeaveBalance.carryOverDays > 0 && (
                  <p className="mt-1 text-[11px] font-semibold text-slate-400">
                    + {myLiveLeaveBalance.carryOverDays} hari carry over
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Cuti aktif/proses — blocks a new "Ajukan Cuti" outright, so make
            the reason explicit right where the (now-disabled) button is,
            instead of leaving the user guessing why it's greyed out. */}
        {activeBlockingLeave && (
          <Card className="border-amber-100 dark:border-amber-900/20 bg-amber-50/50 dark:bg-amber-950/10 shadow-sm max-w-2xl">
            <CardContent className="pt-6 flex gap-4 items-start">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  {LEAVE_PENDING_STATUSES.includes(normalizeStatus((activeBlockingLeave as any).status))
                    ? "Masih Ada Pengajuan Cuti Diproses"
                    : "Anda Masih Memiliki Cuti Aktif/Terjadwal"}
                </h3>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {LEAVE_PENDING_STATUSES.includes(normalizeStatus((activeBlockingLeave as any).status))
                    ? "Silakan tunggu proses persetujuan selesai sebelum membuat pengajuan baru."
                    : "Pengajuan baru dapat dibuat setelah periode cuti sebelumnya selesai."}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 font-bold rounded-lg text-xs"
                  onClick={() => handleViewDetails(activeBlockingLeave)}
                >
                  Lihat Detail Pengajuan
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Requests Table Card */}
        <Card className="border-slate-100 dark:border-slate-800 shadow-md">
          <CardHeader className="border-b pb-4 bg-slate-50/50 dark:bg-slate-900/50">
            <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">
              Riwayat Pengajuan Cuti Anda
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Jenis Cuti</TableHead>
                    <TableHead>Tanggal Cuti</TableHead>
                    <TableHead>Hari Kerja</TableHead>
                    <TableHead>Pengganti</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right pr-6">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRequests.length > 0 ? (
                    sortedRequests.map((r) => (
                      <TableRow
                        key={r.id}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors"
                      >
                        <TableCell className="font-bold pl-6 capitalize text-indigo-600 dark:text-indigo-400">
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
                        <TableCell className="font-semibold">
                          {format(r.startDate.toDate(), "dd MMM yyyy", {
                            locale: idLocale,
                          })}{" "}
                          -{" "}
                          {format(r.endDate.toDate(), "dd MMM yyyy", {
                            locale: idLocale,
                          })}
                        </TableCell>
                        <TableCell>
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            {r.durationDays} Hari
                          </span>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-slate-500">
                          <div className="flex flex-col gap-1">
                            <span>{r.handoverEmployeeName || "-"}</span>
                            {getReplacementBadge(r)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 max-w-[220px]">
                            <span
                              className={`inline-flex items-center w-fit px-2.5 py-0.5 rounded-full text-xs font-black border uppercase tracking-wider ${getStatusBadgeClass(r)}`}
                            >
                              {getStatusLabel(r)}
                            </span>
                            {getStatusSubLabel(r) && (
                              <span className="text-[11px] text-slate-400 leading-snug">{getStatusSubLabel(r)}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="bg-slate-900 border-slate-800 text-white"
                            >
                              <DropdownMenuItem
                                onSelect={() => handleViewDetails(r)}
                                className="hover:bg-slate-800 focus:bg-slate-800"
                              >
                                <Eye className="mr-2 h-4 w-4" /> Detail Cuti
                              </DropdownMenuItem>
                              {canEmployeeEditLeaveRequest(r.status) && (
                                <DropdownMenuItem
                                  onSelect={() => handleAction("edit", r)}
                                  className="hover:bg-slate-800 focus:bg-slate-800"
                                >
                                  <Edit className="mr-2 h-4 w-4" /> Ubah
                                  Pengajuan
                                </DropdownMenuItem>
                              )}
                              {(r as any).replacementConfirmationStatus === "rejected" &&
                                canEmployeeCancelLeaveRequest(r.status) && (
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      setChangingReplacementRequest(r);
                                      setNewReplacementUid("none");
                                    }}
                                    className="hover:bg-slate-800 focus:bg-slate-800"
                                  >
                                    <Repeat className="mr-2 h-4 w-4" /> Ganti
                                    Pengganti
                                  </DropdownMenuItem>
                                )}
                              {canEmployeeCancelLeaveRequest(r.status) && (
                                <DropdownMenuItem
                                  onSelect={() => handleCancel(r)}
                                  className="text-red-400 hover:bg-slate-800 focus:bg-slate-800 hover:text-red-400"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Batalkan
                                  Cuti
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <CalendarOff className="h-10 w-10 mb-3 opacity-20 text-slate-500" />
                          <p className="text-sm font-bold">
                            Belum ada riwayat pengajuan cuti.
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Gunakan tombol diatas untuk mengajukan cuti baru.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

          </TabsContent>

          <TabsContent value="mandat" className="mt-4">
            <Card className="border-indigo-100 dark:border-indigo-900/40 shadow-md">
              <CardHeader className="border-b pb-4 bg-indigo-50/50 dark:bg-indigo-950/20">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Mandat Pengganti Sementara
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Jika Anda ditunjuk sebagai pengganti sementara oleh rekan kerja, konfirmasi akan
                  muncul di sini. Konfirmasi ini menjadi bukti persetujuan digital sebagai pengganti
                  tanda tangan manual.
                </p>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {replacementMandateEntries.length === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
                    Belum ada pengajuan cuti yang menunjuk Anda sebagai pengganti sementara.
                  </p>
                )}
                {replacementMandateEntries.map((req) => {
                  const confirmation = (req as any).replacementConfirmation;
                  if (!confirmation) return null;
                  const isPending = confirmation.status === "pending";
                  return (
                    <div
                      key={req.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Mandat dari
                          </p>
                          <p className="font-bold text-sm text-slate-900 dark:text-white">
                            {req.employeeName}
                          </p>
                        </div>
                        {getReplacementBadge(req)}
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Periode
                        </p>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {format(req.startDate.toDate(), "dd MMMM yyyy", { locale: idLocale })} –{" "}
                          {format(req.endDate.toDate(), "dd MMMM yyyy", { locale: idLocale })}
                        </p>
                        <p className="text-xs text-slate-500">{req.durationDays} hari kerja</p>
                      </div>

                      {req.handoverNotes && (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                            Catatan Serah Terima Tugas
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                            {req.handoverNotes}
                          </p>
                        </div>
                      )}

                      {isPending && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            size="sm"
                            disabled={isConfirmingReplacement}
                            onClick={() => handleAcceptReplacement(req)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs"
                          >
                            Saya Bersedia
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isConfirmingReplacement}
                            onClick={() => {
                              setRejectingRequestId(req.id!);
                              setRejectReason("");
                            }}
                            className="border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 font-bold rounded-lg text-xs"
                          >
                            Tidak Bersedia
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Alasan Tidak Bersedia — modal, not an inline textarea, so the
          decision reads as a deliberate confirmed action rather than
          something that can be fat-fingered inline in the card. */}
      <Dialog
        open={!!rejectingRequestId}
        onOpenChange={(open) => {
          if (!open) {
            setRejectingRequestId(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tidak Bersedia Menjadi Pengganti</DialogTitle>
            <DialogDescription>
              Tuliskan alasan Anda tidak dapat menjadi pengganti sementara. Alasan ini akan
              dikirimkan ke pengaju cuti.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Tuliskan alasan tidak dapat menjadi pengganti sementara"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRejectingRequestId(null);
                setRejectReason("");
              }}
            >
              Batal
            </Button>
            <Button
              type="button"
              disabled={isConfirmingReplacement}
              onClick={() => {
                const req = replacementMandateEntries.find((r) => r.id === rejectingRequestId);
                if (req) handleRejectReplacement(req);
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              Kirim Penolakan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ganti Pengganti — offered once the named replacement declined.
          Restricted-field update only (see handleChangeReplacement): never
          touches dates, status, or approval routing, so it can be used
          freely while the request is still pending without turning into an
          unreviewed revision. */}
      <Dialog
        open={!!changingReplacementRequest}
        onOpenChange={(open) => {
          if (!open) {
            setChangingReplacementRequest(null);
            setNewReplacementUid("none");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ganti Pengganti Sementara</DialogTitle>
            <DialogDescription>
              Pengganti sebelumnya tidak bersedia. Pilih pengganti sementara baru untuk pengajuan
              cuti ini.
            </DialogDescription>
          </DialogHeader>
          <Select value={newReplacementUid} onValueChange={setNewReplacementUid}>
            <SelectTrigger>
              <SelectValue placeholder="Pilih pengganti sementara" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" disabled>
                Pilih pengganti sementara
              </SelectItem>
              {isLoadingReplacementCandidates ? (
                <div className="p-2 text-xs text-slate-400 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Memuat kandidat...
                </div>
              ) : (
                replacementCandidates
                  .filter((c) => c.uid !== (changingReplacementRequest as any)?.replacementEmployeeUid)
                  .map((c) => (
                    <SelectItem key={c.uid} value={c.uid}>
                      {c.fullName} — {c.jobTitle || "Karyawan"}
                    </SelectItem>
                  ))
              )}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setChangingReplacementRequest(null);
                setNewReplacementUid("none");
              }}
            >
              Batal
            </Button>
            <Button
              type="button"
              disabled={isChangingReplacement || newReplacementUid === "none"}
              onClick={handleChangeReplacement}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {isChangingReplacement && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simpan Pengganti Baru
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Form Pengajuan Cuti Tahunan */}
      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeLeaveForm();
          } else {
            setIsFormOpen(true);
          }
        }}
      >
        <DialogContent className="max-w-[95vw] lg:max-w-[1040px] h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl">
          <DialogHeader className="p-6 pb-4 border-b shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
            <DialogTitle className="text-xl font-black text-slate-900 dark:text-white">
              {selectedRequest
                ? "Ubah Pengajuan Cuti"
                : "Form Pengajuan Cuti Tahunan"}
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-500">
              Lengkapi data cuti dengan benar sebelum dikirim.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <Form {...form}>
              <form
                id="leave-form"
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-5"
              >
                {/* Section 1: Ringkasan Cuti */}
                <section className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-5 space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
                    Ringkasan Cuti
                  </p>

                  <FormField
                    control={form.control}
                    name="leaveType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-black text-slate-500 uppercase tracking-wider">
                          Jenis Cuti*
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                              <SelectValue placeholder="Pilih jenis cuti" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <SelectItem value="tahunan">Cuti Tahunan</SelectItem>
                            <SelectItem value="besar">Cuti Besar</SelectItem>
                            <SelectItem value="menikah">Cuti Menikah</SelectItem>
                            <SelectItem value="melahirkan">Cuti Melahirkan</SelectItem>
                          </SelectContent>
                        </Select>
                        {validationResult.errorField === "leaveType" && (
                          <p className="text-[11px] font-bold text-red-500 mt-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> {validationResult.warning}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3">
                      <span className="font-bold text-slate-400 block mb-0.5">Sisa Cuti Tersedia</span>
                      <p className="font-black text-emerald-600 dark:text-emerald-400 text-base">
                        {myLiveLeaveBalance?.found ? myLiveLeaveBalance.availableDays : 0} Hari
                      </p>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3">
                      <span className="font-bold text-slate-400 block mb-0.5">Jatah Cuti Tahunan</span>
                      <p className="font-black text-slate-700 dark:text-slate-200 text-base">
                        {myLiveLeaveBalance?.found ? myLiveLeaveBalance.entitlementDays : 0} Hari
                      </p>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 col-span-2 sm:col-span-1">
                      <span className="font-bold text-slate-400 block mb-0.5">Ketentuan Pengajuan</span>
                      <p className="font-bold text-slate-700 dark:text-slate-200">Minimal H-14</p>
                    </div>
                  </div>
                </section>

                {/* Section 2: Tanggal Cuti */}
                <section className="rounded-2xl border border-slate-100 dark:border-slate-800 p-5 space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Tanggal Cuti
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel className="text-xs font-black text-slate-500 uppercase">
                            Mulai Cuti*
                          </FormLabel>
                          <FormControl>
                            <GoogleDatePicker
                              value={field.value}
                              onChange={field.onChange}
                              disabledDate={(date) => {
                                const minDate = getMinimumLeaveDate();
                                return date < minDate;
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel className="text-xs font-black text-slate-500 uppercase">
                            Selesai Cuti*
                          </FormLabel>
                          <FormControl>
                            <GoogleDatePicker value={field.value} onChange={field.onChange} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="p-3.5 rounded-xl border border-indigo-100 bg-indigo-50/20 dark:border-indigo-900/30 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                      <Info className="h-4 w-4" />
                      <span className="text-xs font-bold">Durasi (hari kerja Senin–Jumat)</span>
                    </div>
                    <span className="text-lg font-black text-indigo-700 dark:text-indigo-400">
                      {durationDays} Hari Kerja
                    </span>
                  </div>

                  {/* Validation feedback lives here, next to the date fields it's
                      actually about — not as a big banner spanning the whole form. */}
                  {!validationResult.isValid && validationResult.warning && (
                    <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400 flex items-start gap-2.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider">
                          Tanggal cuti belum memenuhi ketentuan
                        </p>
                        <p className="text-xs font-semibold mt-0.5">{validationResult.warning}</p>
                      </div>
                    </div>
                  )}

                  {divisionOverlapWarning && (
                    <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <p className="text-xs font-medium">{divisionOverlapWarning}</p>
                    </div>
                  )}
                </section>

                {/* Section 3: Informasi Selama Cuti */}
                <section className="rounded-2xl border border-slate-100 dark:border-slate-800 p-5 space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Informasi Selama Cuti
                  </p>

                  <FormField
                    control={form.control}
                    name="leaveAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-black text-slate-500 uppercase">
                          Alamat Selama Cuti*
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            rows={2}
                            placeholder="Sebutkan alamat lengkap tempat Anda tinggal/singgah selama cuti..."
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="emergencyContactName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-black text-slate-500 uppercase">
                            Kontak yang Bisa Dihubungi (Opsional)
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="Contoh: Ibu Rina (Istri)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="emergencyContactPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-black text-slate-500 uppercase">
                            No. Telepon (Opsional)
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="Contoh: 0812XXXXXXXX" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="attachment"
                    render={({ field: { value, onChange, ...fieldProps } }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-black text-slate-500 uppercase">
                          Dokumen Pendukung (Opsional)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => onChange(e.target.files?.[0])}
                            {...fieldProps}
                            className="rounded-xl border-slate-200 dark:border-slate-800"
                          />
                        </FormControl>
                        <FormDescription className="text-[10px]">
                          Format: PDF, JPG, PNG. Maksimal 2MB.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </section>

                {/* Section 4: Pengganti Sementara */}
                <section className="rounded-2xl border-2 border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/20 dark:bg-indigo-950/10 p-5 space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Pengganti Sementara
                  </p>

                  {!isLoadingReplacementCandidates && replacementCandidates.length === 0 && (
                    <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <p className="text-xs font-medium">
                        Belum ada karyawan aktif lain di divisi Anda yang bisa dipilih sebagai
                        pengganti sementara.
                      </p>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="replacementEmployeeUid"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-black text-slate-500 uppercase">
                          Nama Pengganti Sementara*
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 h-auto py-2">
                              <SelectValue placeholder="Pilih karyawan pengganti sementara" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            {replacementCandidates.length === 0 && (
                              <SelectItem value="none">Tidak ada pengganti sementara</SelectItem>
                            )}
                            {replacementCandidates.map((c) => (
                              <SelectItem key={c.uid} value={c.uid} className="py-2">
                                <div className="flex items-center gap-2.5">
                                  <div className="h-7 w-7 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[11px] font-black shrink-0">
                                    {c.fullName.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-sm leading-tight">{c.fullName}</span>
                                    <span className="text-[10px] text-slate-500 leading-tight">
                                      {c.jobTitle}
                                      {c.divisionName ? ` • ${c.divisionName}` : ""}
                                    </span>
                                  </div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Auto-filled from the selected candidate — never typed manually. */}
                  {selectedReplacement && (
                    <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-white dark:bg-slate-900 p-4 space-y-2">
                      <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1.5">
                        <User className="h-3 w-3" /> Pengganti Dipilih
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div>
                          <span className="text-slate-400 font-semibold block">Nama</span>
                          <span className="font-bold text-slate-800 dark:text-slate-100">{selectedReplacement.fullName}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold block">Jabatan</span>
                          <span className="font-bold text-slate-800 dark:text-slate-100">{selectedReplacement.jobTitle || "-"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold block">Divisi</span>
                          <span className="font-bold text-slate-800 dark:text-slate-100">{selectedReplacement.divisionName || "-"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold block">Brand</span>
                          <span className="font-bold text-slate-800 dark:text-slate-100">{selectedReplacement.brandName || "-"}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="handoverNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-black text-slate-500 uppercase">
                          Catatan Serah Terima Tugas*
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            rows={3}
                            placeholder="Tulis ringkasan tugas yang perlu dilanjutkan oleh pengganti sementara selama Anda cuti."
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed border-t border-indigo-100 dark:border-indigo-900/40 pt-3">
                    Pengganti sementara akan menerima notifikasi dan diminta mengonfirmasi
                    kesediaannya. Konfirmasi tersebut menjadi bukti persetujuan digital sebagai
                    pengganti tanda tangan manual.
                  </p>
                </section>
              </form>
            </Form>
          </div>

          <DialogFooter className="p-6 pt-4 border-t bg-slate-50/50 dark:bg-slate-900/50 gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              onClick={closeLeaveForm}
              className="rounded-xl font-bold"
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="leave-form"
              disabled={isSaving || !validationResult.isValid}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl px-6"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {selectedRequest ? "Simpan Perubahan" : "Ajukan Cuti"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details View Dialog */}
      <LeaveDetailModalClient
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        request={selectedRequest}
      />
    </>
  );
}
