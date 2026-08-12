"use client";

import { useState, useMemo } from "react";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import {
  collection,
  query,
  where,
  or,
  doc,
  serverTimestamp,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { resolveApprovalTarget } from "@/lib/approval-flow";
import { useAuth } from "@/providers/auth-provider";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  CalendarOff,
  CheckCircle2,
  Send,
  X,
  SlidersHorizontal,
  Clock,
  XCircle,
  FileStack,
  Search,
} from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { sendLeaveNotification } from "@/lib/leave-notifications";
import { type LeaveRequest } from "@/lib/types";
import { LeaveDetailModal } from "@/components/ui/LeaveDetailModal";
import { LeaveApprovalTable } from "@/components/dashboard/approvals/LeaveApprovalTable";
import { getReplacementConfirmationStatus, getReplacementStatusBadgeClass } from "@/lib/leave-replacement-status";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

export default function ManagerLeaveApprovalPage() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(
    null,
  );
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isActionOpen, setIsActionOpen] = useState(false);
  const [reasonError, setReasonError] = useState(false);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(
    null,
  );
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [managerNameFilter, setManagerNameFilter] = useState<string>("");
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

  const isDirectorMode = useMemo(() => {
    if (!userProfile) return false;

    const normalizedHierarchy = [
      userProfile.structuralLevel,
      userProfile.positionTitle,
      userProfile.jobTitle,
      userProfile.workRole,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const hasDirectorKeywords = /direktur|director|manajemen|management/.test(
      normalizedHierarchy,
    );

    return userProfile.structuralLevel === "management" || hasDirectorKeywords;
  }, [userProfile]);

  const pageTitle = isDirectorMode
    ? "Persetujuan Cuti Manager Divisi"
    : "Persetujuan Cuti Tim";

  const pageSubtitle = isDirectorMode
    ? "Tinjau pengajuan cuti Manager Divisi lintas brand dan divisi."
    : "Tinjau pengajuan cuti staff di divisi Anda.";

  const currentUserUid = userProfile?.uid || "";

  const filterInputClass =
    "w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-500 dark:focus:border-teal-500 focus:ring-teal-500 dark:focus:ring-teal-500 focus:outline-none focus:ring-1 px-3 py-2 text-sm shadow-none";

  const filterSelectClass =
    "w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-500 dark:focus:border-teal-500 focus:ring-teal-500 dark:focus:ring-teal-500 focus:outline-none focus:ring-1 px-3 py-2 text-sm shadow-none appearance-none";

  const getRequesterLevel = (req: LeaveRequest) => {
    return ((req as any).requesterStructuralPosition as string) || "staff";
  };

  const isSelfRequest = (req: LeaveRequest) =>
    req.employeeId === currentUserUid;

  const isDivisionManagerRequest = (req: LeaveRequest) =>
    getRequesterLevel(req) === "division_manager";

  const getApproverUids = (req: LeaveRequest) => {
    return [
      req.managerId,
      (req as any).managerUid,
      req.directManagerId,
      (req as any).directManagerUid,
      (req as any).directSupervisorUid,
      (req as any).approvalTargetUid,
      (req as any).currentApproverUid,
    ]
      .filter(Boolean)
      .map(String);
  };

  const isAssignedManager = (req: LeaveRequest) => {
    const managerApprovers = [
      req.managerId,
      (req as any).managerUid,
      (req as any).currentApproverUid,
    ]
      .filter(Boolean)
      .map(String);
    return managerApprovers.includes(currentUserUid);
  };

  const isAssignedDirector = (req: LeaveRequest) => {
    const directorApprovers = [
      (req as any).approvalTargetUid,
      (req as any).directSupervisorUid,
      req.directManagerUid,
      (req as any).directManagerUid,
      (req as any).currentApproverUid,
    ]
      .filter(Boolean)
      .map(String);
    return directorApprovers.includes(currentUserUid);
  };

  const isDirectorRequest = (req: LeaveRequest) => {
    const requesterLevel = getRequesterLevel(req);
    const approvalLevel =
      ((req as any).approvalLevel as string | undefined) || "";

    return (
      requesterLevel === "division_manager" ||
      approvalLevel === "manager_to_director" ||
      isAssignedDirector(req)
    );
  };

  const pendingStatuses = new Set([
    "pending_manager",
    "pending_manager_review",
    "pending_director",
    "pending_director_review",
    "pending_supervisor",
    "menunggu_approval_atasan",
    "waiting_manager_approval",
    "waiting_director_approval",
  ]);

  const isPendingStatus = (status: string) =>
    pendingStatuses.has(status);

  const isActionEnabledForRole = (req: LeaveRequest) => {
    const status = req.status;
    const requesterStructuralLevel = String(
      (req as any).requesterStructuralPosition ||
      (req as any).structuralLevel ||
      ""
    ).toLowerCase();

    const isDivisionManager = requesterStructuralLevel.includes("manager");

    if (isDivisionManager) {
      return [
        "pending_director",
        "pending_director_review",
        "waiting_director_approval"
      ].includes(status);
    } else {
      return [
        "pending_manager",
        "pending_manager_review",
        "waiting_manager_approval",
        "menunggu_approval_atasan",
        "pending_supervisor"
      ].includes(status);
    }
  };

  // A manager must never approve a leave request while its named
  // replacement hasn't confirmed (or has declined) — that's the FIRST gate
  // in the real workflow, before this even reaches the atasan's decision in
  // spirit. Reject stays available regardless (a manager can still reject a
  // request outright without waiting on the replacement). Reads through the
  // shared getReplacementConfirmationStatus() helper (src/lib/leave-
  // replacement-status.ts) — the same one the staff page and modal use —
  // so this gate can never disagree with what's actually displayed.
  const canApproveReplacementGate = (req: LeaveRequest): boolean => {
    const status = getReplacementConfirmationStatus(req);
    return status.key !== "pending" && status.key !== "declined";
  };

  const getReplacementBlockMessage = (req: LeaveRequest): string | null => {
    const status = getReplacementConfirmationStatus(req);
    if (status.key === "pending") return "Menunggu pengganti sementara mengonfirmasi kesediaan.";
    if (status.key === "declined") return "Pengganti menolak. Pengaju perlu memilih pengganti lain.";
    return null;
  };

  const isPendingForCurrentApprover = (req: LeaveRequest, userUid: string) => {
    if (!isActionEnabledForRole(req)) return false;

    const managerId = req.managerId;
    const managerUid = (req as any).managerUid;
    const directManagerId = req.directManagerId;
    const directManagerUid = (req as any).directManagerUid;
    const directSupervisorUid = (req as any).directSupervisorUid;
    const approvalTargetUid = (req as any).approvalTargetUid;
    const currentApproverUid = (req as any).currentApproverUid;
    const approverIds = [
      managerId,
      managerUid,
      directManagerId,
      directManagerUid,
      directSupervisorUid,
      approvalTargetUid,
      currentApproverUid,
    ]
      .filter(Boolean)
      .map(String);

    return approverIds.includes(userUid);
  };

  const getLevelBadgeClass = (level: string) => {
    switch (level) {
      case "division_manager":
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
      case "management":
        return "bg-slate-500/10 border-slate-500/20 text-slate-300";
      default:
        return "bg-slate-700/10 border-slate-750 text-slate-400";
    }
  };

  const getLevelLabel = (level: string) => {
    switch (level) {
      case "division_manager":
        return "Manager Divisi";
      case "management":
        return "Direktur / Manajemen";
      default:
        return "Staff";
    }
  };

  // 1. Fetch leave requests — scoped to every field firestore.rules accepts
  // as "this manager is the approver" (managerId/managerUid/directManagerId/
  // directManagerUid/approvalTargetUid/directSupervisorUid/currentApproverUid).
  // An unscoped collection(firestore,"leave_requests") query used to run here
  // and get rejected outright with permission-denied — Firestore evaluates
  // `list` rules per potential result document, so a query that COULD return
  // another employee's request is denied entirely, not silently filtered.
  // Remaining client-side filtering below (isSelfRequest/isDirectorMode/etc.)
  // still applies on top of this already-scoped result set.
  const managerRequestsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    const uid = userProfile.uid;
    return query(
      collection(firestore, "leave_requests"),
      or(
        where("managerId", "==", uid),
        where("managerUid", "==", uid),
        where("directManagerId", "==", uid),
        where("directManagerUid", "==", uid),
        where("approvalTargetUid", "==", uid),
        where("directSupervisorUid", "==", uid),
        where("currentApproverUid", "==", uid),
      ),
    );
  }, [userProfile?.uid, firestore]);

  const {
    data: requests,
    isLoading: isLoadingRequests,
    mutate: mutateRequests,
  } = useCollection<LeaveRequest>(managerRequestsQuery);

  // 2. Strict Relationship Gating:
  // Only display requests matching the manager's UID directly across any field
  const filteredRequests = useMemo(() => {
    if (!requests || !currentUserUid) return [];

    return requests.filter((r) => {
      if (isSelfRequest(r)) return false;

      if (isDirectorMode) {
        return isDirectorRequest(r);
      }

      return isAssignedManager(r) && !isDivisionManagerRequest(r);
    });
  }, [requests, currentUserUid, isDirectorMode]);

  const availableBrandOptions = useMemo(() => {
    return Array.from(new Set(filteredRequests.map((r) => r.brandName))).sort();
  }, [filteredRequests]);

  const availableDivisionOptions = useMemo(() => {
    return Array.from(
      new Set(filteredRequests.map((r) => r.divisionName)),
    ).sort();
  }, [filteredRequests]);

  const availableYearOptions = useMemo(() => {
    const years = new Set<number>();
    filteredRequests.forEach((r) => {
      const year =
        r.createdAt?.toDate?.()?.getFullYear?.() ?? new Date().getFullYear();
      years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [filteredRequests]);

  const getStatusCategory = (status: string) => {
    if (isPendingStatus(status)) return "pending";
    if (status.includes("rejected")) return "rejected";
    if (status.includes("revision")) return "revision";
    if (status.includes("approved")) return "approved";
    return status;
  };

  // Visual priority accent — a colored left border so a manager can scan
  // which rows need action (pending) vs. which are already resolved, without
  // reading every status badge individually.
  const getRowAccentClass = (status: string) => {
    const category = getStatusCategory(status);
    if (category === "pending") return "border-l-4 border-l-amber-500";
    if (category === "approved" || status === "active_leave" || status === "completed")
      return "border-l-4 border-l-emerald-500";
    if (category === "rejected") return "border-l-4 border-l-red-500";
    if (category === "revision") return "border-l-4 border-l-orange-500";
    return "border-l-4 border-l-transparent";
  };

  const visibleRequests = useMemo(() => {
    return filteredRequests.filter((r) => {
      if (brandFilter !== "all" && r.brandName !== brandFilter) return false;
      if (divisionFilter !== "all" && r.divisionName !== divisionFilter)
        return false;
      if (
        managerNameFilter &&
        !((r as any).managerName || r.managerName || "")
          .toLowerCase()
          .includes(managerNameFilter.toLowerCase())
      ) {
        return false;
      }
      if (leaveTypeFilter !== "all" && r.leaveType !== leaveTypeFilter)
        return false;
      if (
        statusFilter !== "all" &&
        getStatusCategory(r.status) !== statusFilter
      )
        return false;

      if (monthFilter !== "all" || yearFilter !== "all") {
        const createdAt = r.createdAt?.toDate?.();
        if (!createdAt) return false;
        if (
          monthFilter !== "all" &&
          createdAt.getMonth() + 1 !== Number(monthFilter)
        )
          return false;
        if (
          yearFilter !== "all" &&
          createdAt.getFullYear() !== Number(yearFilter)
        )
          return false;
      }

      if (
        searchTerm &&
        ![
          r.employeeName,
          r.brandName,
          r.divisionName,
          (r as any).managerName || r.managerName || "",
          r.leaveType,
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  }, [
    filteredRequests,
    brandFilter,
    divisionFilter,
    managerNameFilter,
    leaveTypeFilter,
    statusFilter,
    monthFilter,
    yearFilter,
    searchTerm,
  ]);

  const activeRequests = useMemo(() => {
    return visibleRequests.filter((r) =>
      isPendingForCurrentApprover(r, currentUserUid),
    );
  }, [visibleRequests, currentUserUid]);

  const hasInvalidApproverPending = useMemo(() => {
    return filteredRequests.some(
      (r) => isPendingStatus(r.status) && !getApproverUids(r).length,
    );
  }, [filteredRequests]);

  const historyRequests = useMemo(() => {
    return visibleRequests
      .filter((r) => !isPendingStatus(r.status))
      .sort((a, b) => {
        const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
        const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
        return bTime - aTime;
      });
  }, [visibleRequests]);

  // Helpers for exact formatting
  const formatSubmissionDate = (req: LeaveRequest) => {
    try {
      const date = req.createdAt ? req.createdAt.toDate() : new Date();
      return format(date, "EEEE, dd MMMM yyyy 'pukul' HH:mm", {
        locale: idLocale,
      });
    } catch {
      return req.submittedAtStr || "-";
    }
  };

  const getSubmissionDateParts = (req: LeaveRequest) => {
    try {
      const date = req.createdAt ? req.createdAt.toDate() : new Date();
      return {
        day: format(date, "EEEE, dd MMMM yyyy", { locale: idLocale }),
        time: format(date, "'pukul' HH:mm", { locale: idLocale }),
      };
    } catch {
      return {
        day: req.submittedAtStr || "-",
        time: "",
      };
    }
  };

  const formatPeriodDate = (req: LeaveRequest) => {
    try {
      const start = req.startDate.toDate();
      const end = req.endDate.toDate();
      return `${format(start, "EEEE, dd MMMM yyyy", { locale: idLocale })} – ${format(end, "EEEE, dd MMMM yyyy", { locale: idLocale })}`;
    } catch {
      return "-";
    }
  };

  const getPeriodDateParts = (req: LeaveRequest) => {
    try {
      const start = req.startDate.toDate();
      const end = req.endDate.toDate();
      return {
        start: format(start, "EEEE, dd MMMM yyyy", { locale: idLocale }),
        end: format(end, "EEEE, dd MMMM yyyy", { locale: idLocale }),
      };
    } catch {
      return {
        start: "-",
        end: "-",
      };
    }
  };

  const formatDuration = (req: LeaveRequest) => {
    return `${req.durationDays} hari kerja`;
  };

  const getTimelineApproverName = (req: LeaveRequest) => {
    return (
      (req as any).directSupervisorName ||
      (req as any).approvalTargetName ||
      req.managerName ||
      "Atasan"
    );
  };

  const getTimelineStepState = (
    req: LeaveRequest,
    step: "approval" | "hrd" | "realization",
  ) => {
    const status = req.status;

    if (step === "approval") {
      if (
        [
          "pending_manager",
          "pending_manager_review",
          "pending_director",
          "pending_director_review",
          "pending_supervisor",
          "menunggu_approval_atasan",
          "waiting_manager_approval",
          "waiting_director_approval",
        ].includes(status)
      ) {
        return "current";
      }
      if (["rejected_by_manager", "rejected_by_director"].includes(status)) {
        return "rejected";
      }
      if (
        [
          "revision_requested",
          "revision_requested_by_manager",
          "revision_requested_by_director",
        ].includes(status)
      ) {
        return "revision";
      }
      if (
        [
          "approved_by_manager",
          "approved_by_director",
          "pending_hrd",
          "pending_hrd_review",
          "approved_by_hrd",
          "active_leave",
          "completed",
        ].includes(status)
      ) {
        return "completed";
      }
      return "waiting";
    }

    if (step === "hrd") {
      if (["pending_hrd", "pending_hrd_review"].includes(status)) {
        return "current";
      }
      if (status === "rejected_by_hrd") {
        return "rejected";
      }
      if (status === "revision_requested_by_hrd") {
        return "revision";
      }
      if (["approved_by_hrd", "active_leave", "completed"].includes(status)) {
        return "completed";
      }
      return "waiting";
    }

    if (step === "realization") {
      if (status === "active_leave") return "current";
      if (status === "completed") return "completed";
      return "waiting";
    }

    return "waiting";
  };

  const getTimelineStepDetail = (
    req: LeaveRequest,
    step: "approval" | "hrd" | "realization",
  ) => {
    const status = req.status;
    const approverName = getTimelineApproverName(req);
    const decisionTime = req.updatedAt?.toDate
      ? format(req.updatedAt.toDate(), "dd MMM yyyy 'pukul' HH:mm", {
          locale: idLocale,
        })
      : "-";
    const managerNote =
      (req as any).managerNotes ||
      (req as any).directorNotes ||
      (req as any).notes ||
      "";

    if (step === "approval") {
      if (
        [
          "pending_manager",
          "pending_manager_review",
          "pending_director",
          "pending_director_review",
          "pending_supervisor",
          "menunggu_approval_atasan",
          "waiting_manager_approval",
          "waiting_director_approval",
        ].includes(status)
      ) {
        return `Menunggu persetujuan ${approverName}`;
      }
      if (
        status === "rejected_by_manager" ||
        status === "rejected_by_director"
      ) {
        return `Ditolak oleh ${approverName} pada ${decisionTime}${managerNote ? ` — ${managerNote}` : ""}`;
      }
      if (
        [
          "revision_requested",
          "revision_requested_by_manager",
          "revision_requested_by_director",
        ].includes(status)
      ) {
        return `Revisi diminta oleh ${approverName} pada ${decisionTime}${managerNote ? ` — ${managerNote}` : ""}`;
      }
      if (
        [
          "approved_by_manager",
          "approved_by_director",
          "pending_hrd",
          "pending_hrd_review",
          "approved_by_hrd",
          "active_leave",
          "completed",
        ].includes(status)
      ) {
        return `Disetujui oleh ${approverName}`;
      }
      return `Menunggu persetujuan ${approverName}`;
    }

    if (step === "hrd") {
      if (["pending_hrd", "pending_hrd_review"].includes(status)) {
        return "Menunggu Verifikasi HRD";
      }
      if (status === "rejected_by_hrd") {
        return `Ditolak HRD pada ${decisionTime}`;
      }
      if (status === "revision_requested_by_hrd") {
        return `Revisi HRD diminta pada ${decisionTime}`;
      }
      if (["approved_by_hrd", "active_leave", "completed"].includes(status)) {
        return `Disetujui HRD pada ${decisionTime}`;
      }
      return "Menunggu proses HRD";
    }

    if (step === "realization") {
      if (status === "active_leave") {
        return `Cuti sedang berlangsung sejak ${formatPeriodDate(req)}`;
      }
      if (status === "completed") {
        return `Cuti selesai setelah periode ${formatPeriodDate(req)}`;
      }
      return "Menunggu realisasi cuti";
    }

    return "";
  };

  const handleViewDetails = (req: LeaveRequest) => {
    setSelectedRequest(req);
    setNotes("");
    setIsDetailOpen(true);
  };

  // Opens the Setujui/Tolak confirmation dialog — only ever called from the
  // detail modal's sticky footer (see LeaveDetailModal's onRequestApprove/
  // onRequestReject), never from the table, so a manager always sees the
  // full review workspace before a decision dialog can appear. Keeps
  // whatever notes were already typed in the modal's body panel rather than
  // clearing them, since that's the same `notes` state the confirm dialog
  // reuses for its (optional for approve, required for reject) reason field.
  const handleOpenAction = (
    type: "approve" | "reject",
    req: LeaveRequest,
  ) => {
    if (req.employeeId === userProfile?.uid) {
      toast({
        variant: "destructive",
        title: "Aksi Tidak Diizinkan",
        description: "Anda tidak dapat memproses pengajuan milik sendiri.",
      });
      return;
    }

    if ((req as any).approvalTargetUid === req.employeeId) {
      toast({
        variant: "destructive",
        title: "Aksi Tidak Diizinkan",
        description:
          "Pengajuan ini memiliki target approval yang sama dengan pemohon dan tidak dapat diproses.",
      });
      return;
    }

    if (req.status === "pending_hrd" || req.status === "pending_hrd_review") {
      toast({
        variant: "destructive",
        title: "Sudah Diproses",
        description: isDirectorMode
          ? "Pengajuan ini sudah diteruskan ke HRD dan tidak bisa diproses lagi oleh Direktur."
          : "Pengajuan ini sudah diteruskan ke HRD dan tidak bisa diproses lagi oleh Manager.",
      });
      return;
    }

    if (!isActionEnabledForRole(req)) {
      toast({
        variant: "destructive",
        title: "Aksi Tidak Diizinkan",
        description: isDirectorMode
          ? "Pengajuan ini sudah diteruskan ke HRD dan tidak bisa diproses lagi oleh Direktur."
          : "Pengajuan ini tidak berada dalam status pending yang dapat Anda proses.",
      });
      return;
    }

    setSelectedRequest(req);
    setActionType(type);
    setNotes("");
    setReasonError(false);
    setIsActionOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!selectedRequest || !actionType || !userProfile || !firestore) return;

    const currentUser = userProfile;
    const req = selectedRequest as any;

    // 1. Self approval validation check
    const isSelfApproval = currentUser.uid === req.employeeUid || currentUser.uid === req.employeeId;
    if (isSelfApproval) {
      toast({
        variant: "destructive",
        title: "Self-approval blocked",
        description: "Anda tidak dapat menyetujui pengajuan Anda sendiri.",
      });
      return;
    }

    // Defense-in-depth on top of the Approve button's own disabled state —
    // a stale dialog left open across a status change (another tab, a race)
    // must not still let a manager approve before the named replacement has
    // confirmed.
    if (actionType === "approve" && !canApproveReplacementGate(selectedRequest)) {
      toast({
        variant: "destructive",
        title: "Belum Bisa Disetujui",
        description: getReplacementBlockMessage(selectedRequest) || "Menunggu konfirmasi pengganti sementara.",
      });
      return;
    }

    // Role check / structural level of the requester
    const requesterStructuralLevel = String(
      req.requesterStructuralPosition ||
      req.structuralLevel ||
      ""
    ).toLowerCase();

    const isDivisionManagerRequest =
      requesterStructuralLevel.includes("manager") ||
      req.approvalFlowType === "manager_to_director_to_hrd" ||
      req.approvalLevel === "manager_to_director";

    const currentApproverUid = req.currentApproverUid || null;
    const approvalTargetUid = req.approvalTargetUid || null;
    const directorUid = req.directorUid || null;
    const directorId = req.directorId || null;
    const directorName = req.directorName || "";
    const directSupervisorUid = req.directSupervisorUid || null;

    // 1 & 2. Block legacy/incomplete requests from being approved directly
    const isLegacyRequestMissingApprover =
      isDivisionManagerRequest &&
      !currentApproverUid &&
      !approvalTargetUid &&
      !directorUid &&
      !directorId &&
      !directSupervisorUid;

    if (isLegacyRequestMissingApprover) {
      toast({
        variant: "destructive",
        title: "Migrasi Diperlukan",
        description: "Pengajuan lama ini belum memiliki approver Direktur. HRD/Super Admin perlu memigrasi data approver terlebih dahulu.",
      });
      return;
    }

    // 2. Strict UID validation (do not allow role bypass!)
    const allowedUids = [
      currentApproverUid,
      approvalTargetUid,
      directorUid,
      directorId,
      directSupervisorUid,
      // For staff requests, include directManagerUid / directManagerId / managerId / managerUid
      ...(!isDivisionManagerRequest ? [
        req.directManagerUid,
        req.directManagerId,
        req.managerUid,
        req.managerId,
      ] : [])
    ]
      .filter(Boolean)
      .map(String);

    const isAssigned = allowedUids.includes(currentUser.uid);

    if (!isAssigned) {
      toast({
        variant: "destructive",
        title: "Akses Ditolak",
        description: `UID akun Anda (${currentUser.uid}) belum tercatat sebagai approver untuk pengajuan ini. Hubungi HRD untuk mendaftarkan Anda sebagai atasan/direktur yang sah.`,
      });
      return;
    }

    if (actionType === "reject" && notes.trim().length < 5) {
      toast({
        variant: "destructive",
        title: "Keterangan Wajib Diisi",
        description: "Harap masukkan keterangan/alasan minimal 5 karakter.",
      });
      return;
    }

    setIsSaving(true);
    try {
      if (!isActionEnabledForRole(selectedRequest)) {
        toast({
          variant: "destructive",
          title: "Gagal Memproses",
          description: isDirectorMode
            ? "Pengajuan ini sudah diteruskan ke HRD dan tidak bisa diproses lagi oleh Direktur."
            : "Pengajuan ini tidak berada dalam status pending yang dapat Anda proses.",
        });
        setIsActionOpen(false);
        setIsDetailOpen(false);
        return;
      }

      let payload: any = {};
      let notificationType: any = "manager_approval";

      const displayNameOrEmail = (currentUser as any).displayName || currentUser.email || currentUser.fullName || "Direktur/Manajemen";

      if (isDivisionManagerRequest) {
        if (actionType === "approve") {
          payload = {
            status: "pending_hrd",
            directorDecision: "approved",
            directorReviewedAt: serverTimestamp(),
            directorReviewedBy: currentUser.uid,
            directorReviewedByName: (currentUser as any).displayName || currentUser.email,
            directorNotes: notes || "",
            currentApprovalStep: "hrd",
            currentApproverUid: null,
            approvalTargetUid: null,
            updatedAt: serverTimestamp(),
            
            // Compatibility manager fields
            managerDecision: "approved",
            managerReviewedAt: serverTimestamp(),
            managerReviewedBy: currentUser.uid,
            managerReviewedByName: (currentUser as any).displayName || currentUser.email,
          };
          notificationType = "director_approval";
        } else if (actionType === "reject") {
          payload = {
            status: "rejected_by_director",
            directorDecision: "rejected",
            directorReviewedAt: serverTimestamp(),
            directorReviewedBy: currentUser.uid,
            directorReviewedByName: (currentUser as any).displayName || currentUser.email,
            directorNotes: notes,
            updatedAt: serverTimestamp(),

            // Compatibility manager fields
            managerDecision: "rejected",
            managerReviewedAt: serverTimestamp(),
            managerReviewedBy: currentUser.uid,
            managerReviewedByName: (currentUser as any).displayName || currentUser.email,
            managerNotes: notes,
          };
          notificationType = "director_rejection";
        }
      } else {
        if (actionType === "approve") {
          payload = {
            status: "pending_hrd",
            managerDecision: "approved",
            managerReviewedAt: serverTimestamp(),
            managerReviewedBy: currentUser.uid,
            managerReviewedByName: displayNameOrEmail,
            managerNotes: notes || "",
            currentApprovalStep: "hrd",
            updatedAt: serverTimestamp(),
          };
          notificationType = "manager_approval";
        } else if (actionType === "reject") {
          payload = {
            status: "rejected_by_manager",
            managerDecision: "rejected",
            managerReviewedAt: serverTimestamp(),
            managerReviewedBy: currentUser.uid,
            managerReviewedByName: displayNameOrEmail,
            managerNotes: notes,
            updatedAt: serverTimestamp(),
          };
          notificationType = "manager_rejection";
        }
      }

      // 7. Debug log before update
      console.log("APPROVE DIRECTOR LEAVE", {
        requestId: selectedRequest.id,
        currentUserUid: currentUser.uid,
        currentUserRole: currentUser.role || "",
        employeeUid: (selectedRequest as any).employeeUid || selectedRequest.employeeId,
        statusBefore: selectedRequest.status,
        approvalFlowType: req.approvalFlowType || "",
        currentApprovalStep: req.currentApprovalStep || "",
        currentApproverUid: currentApproverUid || "",
        approvalTargetUid: approvalTargetUid || "",
        directorUid: directorUid || "",
        directorId: directorId || "",
        directSupervisorUid: directSupervisorUid || "",
        payload
      });

      const reqRef = doc(firestore, "leave_requests", selectedRequest.id!);
      await updateDoc(reqRef, payload);
      console.log("Approve success");

      try {
        await sendLeaveNotification(firestore, notificationType, {
          employeeId: selectedRequest.employeeId,
          employeeName: selectedRequest.employeeName,
          managerId: currentUser.uid,
          managerName: displayNameOrEmail,
          startDate: selectedRequest.startDate,
          endDate: selectedRequest.endDate,
          reason: actionType === "reject" ? notes : undefined,
          requestId: selectedRequest.id!,
        });
      } catch (notifErr: any) {
        console.error("Failed to send separate notification:", notifErr);
      }

      toast({
        title: actionType === "approve" ? "Persetujuan Dikirim" : "Pengajuan Ditolak",
        description:
          actionType === "approve"
            ? "Pengajuan cuti berhasil disetujui"
            : "Pengajuan cuti berhasil ditolak",
      });

      // Update state locally first for immediate responsiveness
      setSelectedRequest({
        ...selectedRequest,
        status: payload.status || "pending_hrd",
        currentApprovalStep: payload.currentApprovalStep || "hrd",
        currentApproverUid: payload.currentApproverUid !== undefined ? payload.currentApproverUid : null,
        approvalTargetUid: payload.approvalTargetUid !== undefined ? payload.approvalTargetUid : null,
      } as any);

      setIsActionOpen(false);
      setIsDetailOpen(false);
      mutateRequests();
    } catch (e: any) {
      console.error("Error matching director approval update leave request:", e);
      toast({
        variant: "destructive",
        title: "Gagal Memproses",
        description: "Terjadi kesalahan saat memproses keputusan",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "approved":
      case "approved_by_hrd":
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
      case "active_leave":
        return "bg-blue-500/10 border-blue-500/20 text-blue-400";
      case "completed":
        return "bg-slate-500/10 border-slate-700 text-slate-400";
      case "cancelled":
        return "bg-gray-500/10 border-gray-700 text-gray-400";
      case "rejected_by_manager":
      case "rejected_by_director":
      case "rejected_by_hrd":
        return "bg-red-500/10 border-red-500/20 text-red-400";
      case "revision_requested":
      case "revision_requested_by_manager":
      case "revision_requested_by_director":
      case "revision_requested_by_hrd":
        return "bg-amber-500/10 border-amber-500/20 text-amber-400";
      case "pending_manager":
      case "pending_manager_review":
      case "pending_director":
      case "pending_director_review":
      case "pending_supervisor":
      case "menunggu_approval_atasan":
      case "waiting_manager_approval":
      case "waiting_director_approval":
        return "bg-amber-500/10 border-amber-500/20 text-amber-400";
      case "pending_hrd":
      case "pending_hrd_review":
        return "bg-blue-500/10 border-blue-500/20 text-blue-400";
      default:
        return "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400";
    }
  };

  const getStatusLabel = (status: string) => {
    if (isDirectorMode && isPendingStatus(status)) {
      return "Menunggu Persetujuan Direktur";
    }

    switch (status) {
      case "pending_manager":
      case "pending_manager_review":
        return "Menunggu Persetujuan Manager Divisi";
      case "pending_director":
      case "pending_director_review":
        return "Menunggu Persetujuan Direktur";
      case "pending_supervisor":
        return "Menunggu Persetujuan Atasan";
      case "menunggu_approval_atasan":
        return "Menunggu Persetujuan Atasan (Mandor)";
      case "waiting_manager_approval":
        return "Menunggu Persetujuan Manager";
      case "waiting_director_approval":
        return "Menunggu Persetujuan Direktur";
      case "revision_requested":
      case "revision_requested_by_manager":
        return "Perlu Revisi (Atasan)";
      case "revision_requested_by_director":
        return "Perlu Revisi (Direktur)";
      case "rejected_by_manager":
        return "Ditolak Atasan";
      case "rejected_by_director":
        return "Ditolak Direktur";
      case "pending_hrd":
      case "pending_hrd_review":
        return "Menunggu Verifikasi HRD";
      case "revision_requested_by_hrd":
        return "Perlu Revisi (HRD)";
      case "rejected_by_hrd":
        return "Ditolak HRD";
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

  const currentDate = new Date();
  const thisMonth = currentDate.getMonth() + 1;
  const thisYear = currentDate.getFullYear();

  const isThisMonth = (value: any) => {
    const date = value?.toDate?.();
    return (
      !!date &&
      date.getMonth() + 1 === thisMonth &&
      date.getFullYear() === thisYear
    );
  };

  // Dashboard summary cards — always visible (manager and director mode
  // alike), reflecting visibleRequests (already brand/division/search
  // filtered) so the numbers move together with whatever the table shows.
  const approvedThisMonthCount = visibleRequests.filter((r) => {
    const reviewedAt = (r as any).directorReviewedAt || r.managerReviewedAt;
    const decision = (r as any).directorDecision || (r as any).managerDecision;
    return decision === "approved" && isThisMonth(reviewedAt);
  }).length;

  const rejectedThisMonthCount = visibleRequests.filter((r) => {
    const reviewedAt = (r as any).directorReviewedAt || r.managerReviewedAt;
    const decision = (r as any).directorDecision || (r as any).managerDecision;
    return decision === "rejected" && isThisMonth(reviewedAt);
  }).length;

  const totalThisMonthCount = visibleRequests.filter((r) =>
    isThisMonth(r.createdAt),
  ).length;

  const leaveTypeChipLabel: Record<string, string> = {
    tahunan: "Tahunan",
    besar: "Besar",
    menikah: "Menikah",
    melahirkan: "Melahirkan",
  };

  const statusChipLabel: Record<string, string> = {
    pending: "Menunggu",
    approved: "Disetujui",
    rejected: "Ditolak",
    revision: "Revisi",
  };

  // Chips reflect every active filter so a manager can see at a glance what
  // is narrowing the list — and clear any single one without reopening the
  // filter panel.
  const activeFilterChips = [
    brandFilter !== "all" && { key: "brand", label: `Brand: ${brandFilter}`, onRemove: () => setBrandFilter("all") },
    divisionFilter !== "all" && { key: "division", label: `Divisi: ${divisionFilter}`, onRemove: () => setDivisionFilter("all") },
    managerNameFilter && { key: "managerName", label: `Manager: ${managerNameFilter}`, onRemove: () => setManagerNameFilter("") },
    leaveTypeFilter !== "all" && { key: "leaveType", label: `Jenis Cuti: ${leaveTypeChipLabel[leaveTypeFilter] || leaveTypeFilter}`, onRemove: () => setLeaveTypeFilter("all") },
    statusFilter !== "all" && { key: "status", label: `Status: ${statusChipLabel[statusFilter] || statusFilter}`, onRemove: () => setStatusFilter("all") },
    monthFilter !== "all" && { key: "month", label: `Bulan: ${String(monthFilter).padStart(2, "0")}`, onRemove: () => setMonthFilter("all") },
    yearFilter !== "all" && { key: "year", label: `Tahun: ${yearFilter}`, onRemove: () => setYearFilter("all") },
    searchTerm && { key: "search", label: `Cari: "${searchTerm}"`, onRemove: () => setSearchTerm("") },
  ].filter(Boolean) as { key: string; label: string; onRemove: () => void }[];

  const handleResetFilters = () => {
    setBrandFilter("all");
    setDivisionFilter("all");
    setManagerNameFilter("");
    setLeaveTypeFilter("all");
    setStatusFilter("all");
    setMonthFilter("all");
    setYearFilter("all");
    setSearchTerm("");
  };

  // Dashboard-style summary row — always visible so the page never reads as
  // a bare form + table, regardless of manager vs. director mode.
  const summaryCards = [
    {
      key: "pending",
      title: isDirectorMode ? "Menunggu Persetujuan Direktur" : "Menunggu Persetujuan Anda",
      value: activeRequests.length,
      subtext: "Perlu Anda tinjau",
      icon: Clock,
      borderClass: "border-amber-200 dark:border-amber-900/40",
      bgClass: "bg-amber-50/60 dark:bg-amber-950/10",
      iconBgClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    },
    {
      key: "approved",
      title: "Disetujui Bulan Ini",
      value: approvedThisMonthCount,
      subtext: `${format(currentDate, "MMMM yyyy", { locale: idLocale })}`,
      icon: CheckCircle2,
      borderClass: "border-emerald-200 dark:border-emerald-900/40",
      bgClass: "bg-emerald-50/60 dark:bg-emerald-950/10",
      iconBgClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    },
    {
      key: "rejected",
      title: "Ditolak Bulan Ini",
      value: rejectedThisMonthCount,
      subtext: `${format(currentDate, "MMMM yyyy", { locale: idLocale })}`,
      icon: XCircle,
      borderClass: "border-red-200 dark:border-red-900/40",
      bgClass: "bg-red-50/60 dark:bg-red-950/10",
      iconBgClass: "bg-red-500/15 text-red-600 dark:text-red-400",
    },
    {
      key: "total",
      title: "Total Pengajuan Bulan Ini",
      value: totalThisMonthCount,
      subtext: "Seluruh pengajuan masuk",
      icon: FileStack,
      borderClass: "border-indigo-200 dark:border-indigo-900/40",
      bgClass: "bg-indigo-50/60 dark:bg-indigo-950/10",
      iconBgClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    },
  ];

  return (
    <DashboardLayout pageTitle={pageTitle} menuConfig={undefined}>
      <div className="w-full space-y-6 px-4 md:px-8 max-w-[1600px] mx-auto text-slate-900 dark:text-slate-100 pb-10">
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center gap-4 py-5">
          <div className="p-3.5 bg-indigo-100 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200 dark:border-indigo-900/30 shadow-sm">
            <CalendarOff className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {pageTitle}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold mt-0.5">
              {pageSubtitle}
            </p>
          </div>
        </div>

        {/* Summary Cards — always visible, dashboard-style overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.key}
                className={`rounded-2xl border shadow-sm ${card.borderClass} ${card.bgClass}`}
              >
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 leading-tight">
                      {card.title}
                    </p>
                    <div className={`h-8 w-8 shrink-0 rounded-xl flex items-center justify-center ${card.iconBgClass}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="text-3xl font-black text-slate-900 dark:text-white leading-none">
                    {card.value}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-500 font-medium">
                    {card.subtext}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Toolbar — search + filter toggle, always visible */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama karyawan, brand, divisi, atau jenis cuti..."
              className="w-full h-11 pl-10 pr-4 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none shadow-none"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {activeFilterChips.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="rounded-2xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 h-11"
              >
                Reset Filter
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className="rounded-2xl border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 gap-1.5 h-11 px-4"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {isFilterOpen ? "Tutup Filter" : "Buka Filter"}
              {activeFilterChips.length > 0 && (
                <Badge className="ml-1 bg-indigo-600 hover:bg-indigo-600 text-white text-[10px] font-black rounded-full px-1.5 py-0">
                  {activeFilterChips.length}
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Active Filter Chips */}
        {activeFilterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 -mt-2">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.onRemove}
                className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
              >
                {chip.label}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}

        {/* Filters Section (Collapsible) */}
        {isFilterOpen && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in duration-200">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-600 dark:text-slate-400">
                Brand
              </label>
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="all">Semua Brand</option>
                {availableBrandOptions.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-600 dark:text-slate-400">
                Divisi
              </label>
              <select
                value={divisionFilter}
                onChange={(e) => setDivisionFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="all">Semua Divisi</option>
                {availableDivisionOptions.map((division) => (
                  <option key={division} value={division}>
                    {division}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Nama Manager Divisi
              </label>
              <input
                type="text"
                value={managerNameFilter}
                onChange={(e) => setManagerNameFilter(e.target.value)}
                placeholder="Cari nama manager"
                className={filterInputClass}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Jenis Cuti
              </label>
              <select
                value={leaveTypeFilter}
                onChange={(e) => setLeaveTypeFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="all">Semua Jenis</option>
                <option value="tahunan">Tahunan</option>
                <option value="besar">Besar</option>
                <option value="menikah">Menikah</option>
                <option value="melahirkan">Melahirkan</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="all">Semua Status</option>
                <option value="pending">Menunggu</option>
                <option value="approved">Disetujui</option>
                <option value="rejected">Ditolak</option>
                <option value="revision">Revisi</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Bulan
              </label>
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="all">Semua Bulan</option>
                {[...Array(12)].map((_, idx) => {
                  const month = idx + 1;
                  return (
                    <option key={month} value={String(month)}>
                      {String(month).padStart(2, "0")}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                Tahun
              </label>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="all">Semua Tahun</option>
                {availableYearOptions.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

          </div>
        )}

        {/* Tabs — pending and history are never shown stacked; only one
            table renders at a time so the page stays readable as data
            grows. */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "pending" | "history")}>
          <TabsList className="bg-slate-100 dark:bg-slate-900 rounded-2xl p-1 h-auto">
            <TabsTrigger
              value="pending"
              className="rounded-xl px-4 py-2 text-xs font-bold gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm"
            >
              Butuh Persetujuan Saya
              <Badge className="bg-indigo-600 hover:bg-indigo-600 text-white text-[10px] font-black rounded-full px-2 py-0">
                {activeRequests.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rounded-xl px-4 py-2 text-xs font-bold gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm"
            >
              Riwayat Keputusan
              <Badge className="bg-slate-300 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-[10px] font-black rounded-full px-2 py-0">
                {historyRequests.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            <LeaveApprovalTable
              items={activeRequests}
              mode="pending"
              title={isDirectorMode ? "Menunggu Persetujuan Direktur" : "Menunggu Persetujuan Anda"}
              onSelect={handleViewDetails}
              getRequesterLevel={getRequesterLevel}
              getLevelBadgeClass={getLevelBadgeClass}
              getLevelLabel={getLevelLabel}
              getStatusBadgeClass={getStatusBadgeClass}
              getStatusLabel={getStatusLabel}
              getRowAccentClass={getRowAccentClass}
              formatDuration={formatDuration}
              formatPeriodDate={formatPeriodDate}
              getSubmissionDateParts={getSubmissionDateParts}
              getPeriodDateParts={getPeriodDateParts}
              hasInvalidApproverPending={hasInvalidApproverPending}
              activeFilterCount={activeFilterChips.length}
              onResetFilters={handleResetFilters}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <LeaveApprovalTable
              items={historyRequests}
              mode="history"
              title={isDirectorMode ? "Riwayat Keputusan Cuti Manager Divisi" : "Riwayat Keputusan Cuti Tim"}
              onSelect={handleViewDetails}
              getRequesterLevel={getRequesterLevel}
              getLevelBadgeClass={getLevelBadgeClass}
              getLevelLabel={getLevelLabel}
              getStatusBadgeClass={getStatusBadgeClass}
              getStatusLabel={getStatusLabel}
              getRowAccentClass={getRowAccentClass}
              formatDuration={formatDuration}
              formatPeriodDate={formatPeriodDate}
              getSubmissionDateParts={getSubmissionDateParts}
              getPeriodDateParts={getPeriodDateParts}
              activeFilterCount={activeFilterChips.length}
              onResetFilters={handleResetFilters}
            />
          </TabsContent>
        </Tabs>

      </div>

      {/* DETAIL MODAL — the only place decisions can be initiated from (see
          LeaveDetailModal's sticky footer). Table rows only ever open this. */}
      <LeaveDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        request={selectedRequest}
        currentUserUid={currentUserUid}
        isPendingForCurrentApprover={isPendingForCurrentApprover}
        formatSubmissionDate={formatSubmissionDate}
        formatPeriodDate={formatPeriodDate}
        formatDuration={formatDuration}
        getRequesterLevel={getRequesterLevel}
        getLevelBadgeClass={getLevelBadgeClass}
        getLevelLabel={getLevelLabel}
        getStatusBadgeClass={getStatusBadgeClass}
        getStatusLabel={getStatusLabel}
        getTimelineStepState={getTimelineStepState}
        getTimelineStepDetail={getTimelineStepDetail}
        getReplacementConfirmationStatus={getReplacementConfirmationStatus}
        getReplacementBlockMessage={getReplacementBlockMessage}
        canApproveReplacementGate={canApproveReplacementGate}
        onRequestApprove={(req) => handleOpenAction("approve", req)}
        onRequestReject={(req) => handleOpenAction("reject", req)}
        isSaving={isSaving}
      />

      {/* ACTION CONFIRMATION DIALOG — Setujui/Tolak only. Always opened from
          the detail modal's footer, on top of it, so the manager has already
          read the full review workspace before this can appear. */}
      <Dialog open={isActionOpen} onOpenChange={setIsActionOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-2xl my-auto top-[50%] translate-y-[-50%] p-6">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-slate-50">
              {actionType === "approve"
                ? "Konfirmasi Persetujuan"
                : "Konfirmasi Penolakan"}
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-1">
              {actionType === "approve"
                ? "Yakin ingin menyetujui pengajuan cuti ini?"
                : "Anda yakin ingin menolak pengajuan cuti ini?"}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Nama Pengaju</p>
                <p className="font-bold text-slate-900 dark:text-slate-200">{selectedRequest.employeeName}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Jenis Cuti</p>
                <p className="font-bold text-slate-900 dark:text-slate-200 capitalize">
                  Cuti{" "}
                  {selectedRequest.leaveType === "tahunan"
                    ? "Tahunan"
                    : selectedRequest.leaveType === "besar"
                      ? "Besar"
                      : selectedRequest.leaveType === "menikah"
                        ? "Menikah"
                        : selectedRequest.leaveType === "melahirkan"
                          ? "Melahirkan"
                          : "Tahunan"}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Periode Cuti</p>
                <p className="font-bold text-slate-900 dark:text-slate-200">{formatPeriodDate(selectedRequest)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Durasi</p>
                <p className="font-bold text-slate-900 dark:text-slate-200">{formatDuration(selectedRequest)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Status Pengganti</p>
                <p className="font-bold text-slate-900 dark:text-slate-200">
                  {getReplacementConfirmationStatus(selectedRequest).label}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5 py-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              {actionType === "reject"
                ? "Alasan Penolakan (wajib)"
                : "Catatan Persetujuan (opsional)"}
            </label>
            <Textarea
              rows={3}
              placeholder={
                actionType === "approve"
                  ? "Catatan persetujuan (opsional)..."
                  : "Keterangan/alasan (wajib, minimal 5 karakter)..."
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`rounded-xl bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:ring-indigo-500 ${
                actionType === "reject" && reasonError && !notes.trim()
                  ? "border-red-500 dark:border-red-500 focus:border-red-500"
                  : "border-slate-300 dark:border-slate-800 focus:border-indigo-500 dark:focus:border-indigo-500"
              }`}
            />
            {actionType === "reject" && reasonError && !notes.trim() && (
              <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                Alasan penolakan wajib diisi
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsActionOpen(false)}
              disabled={isSaving}
              className="rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Batal
            </Button>
            <Button
              onClick={() => {
                if (actionType === "reject" && !notes.trim()) {
                  setReasonError(true);
                  return;
                }
                handleConfirmAction();
              }}
              disabled={isSaving}
              className={`font-bold rounded-xl px-5 disabled:opacity-60 ${
                actionType === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memproses...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {actionType === "approve" ? "Ya, Setujui" : "Ya, Tolak"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
