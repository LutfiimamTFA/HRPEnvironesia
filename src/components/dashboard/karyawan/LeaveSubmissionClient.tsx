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
} from "lucide-react";
import {
  format,
  differenceInCalendarDays,
  eachDayOfInterval,
  isSaturday,
  isSunday,
  addDays,
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
import { sendLeaveNotification } from "@/lib/leave-notifications";
import { sendNotification } from "@/lib/notifications";
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

/**
 * Runs every non-critical write that follows a successful leave_requests
 * create (staff/manager/handover notifications, replacement-confirmation
 * ping) through Promise.allSettled so a permission-denied or transient
 * failure on any ONE of them can never bubble up and get mistaken for a
 * failure of the main leave_requests write, which has already committed by
 * the time this runs. Each task owns its own try/catch so allSettled always
 * sees a resolved promise; failures are only ever logged.
 */
async function runLeaveRequestSideEffectsSafely(tasks: { label: string; run: () => Promise<any> }[]) {
  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      try {
        await task.run();
      } catch (error) {
        console.warn("[LEAVE_SIDE_EFFECT_FAILED]", { label: task.label, error });
        throw error;
      }
    }),
  );

  const failedLabels = results
    .map((result, index) => (result.status === "rejected" ? tasks[index].label : null))
    .filter((label): label is string => label !== null);

  return { allSucceeded: failedLabels.length === 0, failedLabels };
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
  // actually be deployed — if this specific query is the one throwing
  // permission-denied while the employeeUid/requesterUid/etc queries above
  // succeed, that's the signal it's a rules-deployment gap, not a frontend
  // scoping bug (this query is already scoped by replacementEmployeeUid,
  // never a bare collection() call).
  const replacementRequestsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, "leave_requests"), where("replacementEmployeeUid", "==", userProfile.uid));
  }, [userProfile?.uid, firestore]);
  const {
    data: replacementRequests,
    error: replacementRequestsError,
    mutate: mutateReplacementRequests,
  } = useCollection<LeaveRequest>(replacementRequestsQuery);

  useEffect(() => {
    if (replacementRequestsError) {
      console.error("[LEAVE_REQUEST_QUERY_SCOPE_DEBUG] replacementEmployeeUid query failed", {
        currentUserUid: userProfile?.uid,
        queryField: "replacementEmployeeUid",
        error: replacementRequestsError,
      });
    }
  }, [replacementRequestsError, userProfile?.uid]);

  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isConfirmingReplacement, setIsConfirmingReplacement] = useState(false);

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
      });
      try {
        await sendNotification(firestore, {
          userId: (req as any).employeeUid || req.employeeId,
          type: "status_update",
          module: "employee",
          title: "Pengganti Sementara Bersedia",
          message: `${userProfile.fullName} bersedia menjadi pengganti sementara untuk pengajuan cuti Anda.`,
          targetType: "user",
          targetId: req.id,
          actionUrl: "/admin/karyawan/pengajuan-cuti",
          createdBy: userProfile.uid,
        });
      } catch (notifErr) {
        console.error("Failed to notify requester of replacement acceptance:", notifErr);
      }
      toast({ title: "Konfirmasi Terkirim", description: "Anda bersedia menjadi pengganti sementara." });
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
      });
      try {
        await sendNotification(firestore, {
          userId: (req as any).employeeUid || req.employeeId,
          type: "status_update",
          module: "employee",
          title: "Pengganti Sementara Menolak",
          message: `${userProfile.fullName} tidak bersedia menjadi pengganti sementara. Silakan pilih ulang pengganti sementara untuk pengajuan cuti Anda.`,
          targetType: "user",
          targetId: req.id,
          actionUrl: "/admin/karyawan/pengajuan-cuti",
          createdBy: userProfile.uid,
          priority: "action_required",
        });
      } catch (notifErr) {
        console.error("Failed to notify requester of replacement rejection:", notifErr);
      }
      toast({ title: "Konfirmasi Terkirim", description: "Anda telah menolak menjadi pengganti sementara." });
      setRejectingRequestId(null);
      setRejectReason("");
      mutateReplacementRequests();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal Konfirmasi", description: e.message });
    } finally {
      setIsConfirmingReplacement(false);
    }
  };

  const pendingReplacementRequests = useMemo(
    () => (replacementRequests || []).filter((r) => (r as any).replacementConfirmation?.status === "pending"),
    [replacementRequests],
  );

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

  // Fetch "Pengganti Sementara" candidates once the form dialog opens — a
  // server route (Admin SDK), not a client Firestore query, since a plain
  // karyawan account can't list employee_profiles.
  useEffect(() => {
    if (!isFormOpen || !userProfile) return;
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
  }, [isFormOpen, userProfile]);

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
      const currentBal = leaveBalance?.currentBalance ?? 0;
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
    if (!userProfile || !firestore || !leaveBalance) return;

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
        divisionId: (employeeProfile as any)?.divisionId || hrdInfo.divisionId || "",
        divisionName: (employeeProfile as any)?.divisionName || hrdInfo.divisionName || hrdInfo.divisi || "",
        employmentType:
          hrdInfo.employeeType ||
          hrdInfo.tipeKaryawan ||
          userProfile.employmentType ||
          "karyawan",
        contractDurationMonths: leaveBalance.contractDurationMonths,
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

      const docRef = selectedRequest
        ? doc(firestore, "leave_requests", selectedRequest.id!)
        : doc(collection(firestore, "leave_requests"));

      // Dynamically remove any undefined properties to avoid Firestore "Unsupported field value: undefined" errors
      const cleanedPayload = cleanUndefinedFields(payload);

      // Full snapshot of every field firestore.rules' leave_requests create
      // check can look at — logged right before the write so a
      // permission-denied can be diagnosed from this line alone, without
      // guessing which field was empty/mismatched.
      console.log("[LEAVE_CREATE_PAYLOAD_VALIDATE]", {
        authUid: userProfile.uid,
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
      // reported to the user as "Pengajuan gagal". Everything below this
      // point (notifications) is a side effect and must never be allowed to
      // make a successful submission look like a failure.
      try {
        await setDoc(
          docRef,
          {
            ...cleanedPayload,
            [selectedRequest ? "updatedAt" : "createdAt"]: serverTimestamp(),
          },
          { merge: true },
        );
        console.log("[LEAVE_REQUEST_CREATED]", { id: docRef.id, path: docRef.path });
      } catch (mainWriteError) {
        console.error("[LEAVE_REQUEST_CREATE_FAILED]", {
          path: docRef.path,
          authUid: userProfile.uid,
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
        title: selectedRequest ? "Perubahan Disimpan" : "Pengajuan Cuti Berhasil",
        description: "Pengajuan cuti berhasil diajukan.",
      });
      setIsFormOpen(false);
      mutateRequests();
      mutateBalance();

      // ===== SIDE EFFECTS — notifications only. Wrapped so a permission
      // error on any single notification write (e.g. writing into a
      // manager's or colleague's own notification path) can never bubble up
      // and get logged/shown as a failure of the leave_requests write above,
      // which has already succeeded by this point.
      const { allSucceeded, failedLabels } = await runLeaveRequestSideEffectsSafely([
        {
          label: "staff_submission_notifications",
          run: () =>
            sendLeaveNotification(firestore, "staff_submission", {
              employeeId: userProfile.uid,
              employeeName: userProfile.fullName,
              managerId: payload.managerId,
              managerName: payload.managerName,
              handoverEmployeeId: payload.handoverEmployeeId,
              handoverEmployeeName: payload.handoverEmployeeName,
              startDate: values.startDate,
              endDate: values.endDate,
              requestId: docRef.id,
            }),
        },
        ...(selectedReplacement
          ? [
              {
                // Ask the replacement to confirm — this is the "electronic
                // signature substitute" step; the leave request isn't
                // considered fully settled until they respond (see the
                // "Permintaan Sebagai Pengganti Sementara" section below).
                label: "replacement_confirmation_notification",
                run: () =>
                  sendNotification(firestore, {
                    userId: selectedReplacement.uid,
                    type: "status_update",
                    module: "employee",
                    title: "Penunjukan Pengganti Sementara",
                    message: `${userProfile.fullName} menunjuk Anda sebagai pengganti sementara selama cuti (${formattedStartDate} – ${formattedEndDate}).`,
                    targetType: "user",
                    targetId: docRef.id,
                    actionUrl: "/admin/karyawan/pengajuan-cuti",
                    createdBy: userProfile.uid,
                    priority: "action_required",
                    meta: {
                      leaveRequestId: docRef.id,
                      requesterUid: userProfile.uid,
                      requesterName: userProfile.fullName,
                      leavePeriodStart: formattedStartDate,
                      leavePeriodEnd: formattedEndDate,
                    },
                  }),
              },
            ]
          : []),
      ]);

      if (!allSucceeded) {
        console.warn("[LEAVE_REQUEST_NOTIFICATIONS_PARTIAL_FAILURE]", { requestId: docRef.id, failedLabels });
        toast({
          title: "Notifikasi Tertunda",
          description:
            "Pengajuan cuti berhasil dikirim. Namun notifikasi belum berhasil dikirim otomatis.",
        });
      }
    } catch (e: any) {
      // Reaching here means the MAIN leave_requests write itself failed —
      // side effects never throw into this block (see
      // runLeaveRequestSideEffectsSafely above), so this path label is
      // always accurate now.
      console.error("=== SUBMIT LEAVE REQUEST ERROR ===");
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
        title: "Gagal Mengajukan Cuti",
        description: errorDescription,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "approved":
      case "approved_by_hrd":
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-600";
      case "active_leave":
        return "bg-blue-500/10 border-blue-500/20 text-blue-600";
      case "completed":
        return "bg-slate-500/10 border-slate-500/20 text-slate-600";
      case "cancelled":
        return "bg-gray-500/10 border-gray-500/20 text-gray-500";
      case "rejected_by_manager":
      case "rejected_by_hrd":
        return "bg-red-500/10 border-red-500/20 text-red-600";
      case "revision_requested":
      case "revision_requested_by_manager":
      case "revision_requested_by_hrd":
        return "bg-amber-500/10 border-amber-500/20 text-amber-600";
      case "pending_manager":
      case "pending_manager_review":
      default:
        return "bg-indigo-500/10 border-indigo-500/20 text-indigo-600";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending_manager":
      case "pending_manager_review":
        return "Menunggu Persetujuan Atasan";
      case "revision_requested":
      case "revision_requested_by_manager":
        return "Perlu Revisi";
      case "rejected_by_manager":
        return "Ditolak";
      case "pending_hrd":
      case "pending_hrd_review":
        return "Menunggu Verifikasi HRD";
      case "revision_requested_by_hrd":
        return "Perlu Revisi";
      case "rejected_by_hrd":
        return "Ditolak";
      case "approved":
      case "approved_by_hrd":
        return "Disetujui HRD";
      case "active_leave":
        return "Cuti Aktif";
      case "completed":
        return "Cuti Selesai";
      case "cancelled":
        return "Dibatalkan";
      default:
        return status;
    }
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

  if (!isLoadingBalance && !leaveBalance) {
    return (
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
        </div>

        {/* Warning Alert Card */}
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
                Saldo cuti belum tersedia. Silakan hubungi HRD.
              </p>
            </div>
          </CardContent>
        </Card>
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
          <Button
            onClick={handleCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-5 py-2.5 shadow-lg shadow-indigo-600/20"
          >
            <PlusCircle className="mr-2 h-4 w-4" /> Buat Pengajuan Cuti
          </Button>
        </div>

        {/* Quota & Info Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-indigo-100/50 dark:border-indigo-900/10 shadow-sm bg-gradient-to-br from-indigo-500/5 via-indigo-600/0 to-transparent">
            <CardContent className="pt-6">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Sisa Saldo Cuti
              </p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-4xl font-black text-indigo-600 dark:text-indigo-400">
                  {leaveBalance?.currentBalance ?? 0}
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
                  {leaveBalance?.allocatedLeave ?? 0}
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
                  {leaveBalance?.pendingLeave ?? 0}
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
                  {leaveBalance?.initialQuota ?? 0}
                </span>
                <span className="text-sm font-bold text-slate-500">Hari</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Permintaan Sebagai Pengganti Sementara — visible whenever a
            colleague named this account as their replacement. */}
        {(replacementRequests || []).length > 0 && (
          <Card className="border-indigo-100 dark:border-indigo-900/40 shadow-md">
            <CardHeader className="border-b pb-4 bg-indigo-50/50 dark:bg-indigo-950/20">
              <CardTitle className="text-sm font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Permintaan Sebagai Pengganti Sementara
              </CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Konfirmasi ini menjadi bukti persetujuan digital sebagai pengganti tanda tangan
                manual.
              </p>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {(replacementRequests || []).map((req) => {
                const confirmation = (req as any).replacementConfirmation;
                if (!confirmation) return null;
                const isPending = confirmation.status === "pending";
                const isRejecting = rejectingRequestId === req.id;
                return (
                  <div
                    key={req.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-bold text-sm text-slate-900 dark:text-white">
                          {req.employeeName}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {format(req.startDate.toDate(), "dd MMM yyyy", { locale: idLocale })} –{" "}
                          {format(req.endDate.toDate(), "dd MMM yyyy", { locale: idLocale })} (
                          {req.durationDays} hari kerja)
                        </p>
                      </div>
                      {getReplacementBadge(req)}
                    </div>
                    {req.handoverNotes && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                        <span className="font-bold block mb-0.5 text-slate-400 uppercase text-[10px] tracking-wider">
                          Catatan Serah Terima Tugas
                        </span>
                        {req.handoverNotes}
                      </p>
                    )}

                    {isPending && !isRejecting && (
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

                    {isPending && isRejecting && (
                      <div className="space-y-2 pt-1">
                        <Textarea
                          rows={2}
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Tuliskan alasan tidak dapat menjadi pengganti sementara"
                          className="text-xs"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={isConfirmingReplacement}
                            onClick={() => handleRejectReplacement(req)}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs"
                          >
                            Kirim Penolakan
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRejectingRequestId(null)}
                            className="font-bold rounded-lg text-xs"
                          >
                            Batal
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}
                          >
                            {getStatusLabel(r.status)}
                          </span>
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
                              {(r.status === "pending_manager_review" ||
                                r.status.startsWith("revision_")) && (
                                <>
                                  <DropdownMenuItem
                                    onSelect={() => handleAction("edit", r)}
                                    className="hover:bg-slate-800 focus:bg-slate-800"
                                  >
                                    <Edit className="mr-2 h-4 w-4" /> Ubah
                                    Pengajuan
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => handleCancel(r)}
                                    className="text-red-400 hover:bg-slate-800 focus:bg-slate-800 hover:text-red-400"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Batalkan
                                    Cuti
                                  </DropdownMenuItem>
                                </>
                              )}
                              {(r.status === "approved" ||
                                r.status === "active_leave") && (
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
      </div>

      {/* Form Pengajuan Cuti Tahunan */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
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
                        {leaveBalance?.currentBalance ?? 0} Hari
                      </p>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3">
                      <span className="font-bold text-slate-400 block mb-0.5">Jatah Cuti Tahunan</span>
                      <p className="font-black text-slate-700 dark:text-slate-200 text-base">
                        {leaveBalance?.initialQuota ?? 0} Hari
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
              variant="ghost"
              onClick={() => setIsFormOpen(false)}
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
              Ajukan Cuti
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
