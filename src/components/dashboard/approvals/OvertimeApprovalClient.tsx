"use client";

import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, getDocs, query, where, or } from "firebase/firestore";
import type { OvertimeSubmission, UserProfile, Brand } from "@/lib/types";
import { useAuth } from "@/providers/auth-provider";
import { useRouter, usePathname, useSearchParams } from "@/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle2, Clock3, Eye, RotateCcw, Search, Timer, UserCheck, X, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { addMonths, format, formatDistanceToNow, startOfMonth } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { KpiCard } from "@/components/recruitment/KpiCard";
import { ReviewOvertimeDialog } from "./ReviewOvertimeDialog";
import { OVERTIME_SUBMISSION_STATUSES, isFinalStatus } from "@/lib/types";
import {
  canCurrentUserApproveOvertime,
  buildHrdDivisionOptions,
  getCurrentUserOvertimeRoles,
  getManagerOptionsByBrandDivision,
  getResolvedEmployeeDivision,
  getResolvedManagerName,
  getResolvedManagerUid,
  normalizeDivisionName,
  getOvertimeAnomalyLabels,
  getOvertimeMainStatusLabel,
  getReviewerRoleDisplayLabel,
  getReviewerScopeLabel,
  isPendingHrdReview,
  isOvertimeAfterManagerApproval,
  isWaitingForManagerAction,
  uniqueById,
} from "@/lib/overtime-utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { OvertimeApprovalStatusBadge } from "./OvertimeApprovalStatusBadge";
import { useHrdScopedBrands, useHrdScopedCollection } from "@/hooks/useHrdScopedCollection";
import { HrdScopeEmptyState } from "@/components/dashboard/hrd/HrdScopeEmptyState";

interface OvertimeApprovalClientProps {
  mode: "manager" | "hrd";
}

type OvertimeSubmissionRecord = OvertimeSubmission & Record<string, any>;

const workLocationLabels: Record<string, string> = {
  kantor: "Kantor",
  rumah_wfh: "Rumah / WFH",
  luar_kantor: "Luar Kantor",
  site_klien: "Site / Lokasi Klien",
  lainnya: "Lainnya",
  remote: "Rumah / WFH",
  site: "Site / Lokasi Klien",
};

const getWorkLocationDisplay = (submission: OvertimeSubmissionRecord) => {
  const rawLocation =
    (submission as any).workLocation || submission.location || "kantor";
  const label =
    workLocationLabels[rawLocation] ||
    submission.workLocationLabel ||
    rawLocation;
  const detail = (submission as any).workLocationDetail?.trim?.();
  return rawLocation === "lainnya" && detail ? `${label} - ${detail}` : label;
};

function getSubmissionDurationMinutes(item: OvertimeSubmissionRecord): number {
  return Number(
    item.approvedMinutesFinal ??
      item.durationMinutes ??
      item.totalDurationMinutes ??
      (item as any).totalJobDurationMinutes ??
      0,
  );
}

function formatDuration(minutes: any): string {
  const value = Number(minutes) || 0;
  const hours = Math.floor(value / 60);
  const remainingMinutes = value % 60;
  if (hours <= 0) return `${remainingMinutes} menit`;
  if (remainingMinutes <= 0) return `${hours} jam`;
  return `${hours} jam ${remainingMinutes} menit`;
}

function getHrdIndicatorLabel(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes("review durasi") || normalized.includes("selisih durasi")) {
    return "Catatan Durasi untuk HRD";
  }
  if (normalized.includes("durasi") && normalized.includes("tinggi")) {
    return "Durasi Melebihi Acuan";
  }
  return label;
}

function HrdKpiCard({
  label,
  value,
  subtitle,
  icon,
  tone,
}: {
  label: string;
  value: number;
  subtitle: string;
  icon: ReactNode;
  tone: "teal" | "amber" | "emerald" | "red" | "blue";
}) {
  const styles = {
    teal: "from-teal-50 to-white border-teal-100 text-teal-700 bg-teal-100",
    amber: "from-amber-50 to-white border-amber-100 text-amber-700 bg-amber-100",
    emerald: "from-emerald-50 to-white border-emerald-100 text-emerald-700 bg-emerald-100",
    red: "from-red-50 to-white border-red-100 text-red-700 bg-red-100",
    blue: "from-blue-50 to-white border-blue-100 text-blue-700 bg-blue-100",
  }[tone].split(" ");
  const [gradientFrom, gradientTo, border, textColor, iconBg] = styles;

  return (
    <div className={`group rounded-2xl border bg-gradient-to-br ${gradientFrom} ${gradientTo} ${border} p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-1.5 text-2xl font-bold tracking-tight ${textColor}`}>{value}</p>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBg} ${textColor}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ── Local-date-safe month key + "still pending" helpers ─────────────────────
// The old month filter compared epoch timestamps (new Date(`${periodFilter}-01`),
// which JS parses as UTC midnight) against overtimeDate's raw epoch value. A
// submission for "01 Agustus 2026" stored as WIB midnight is 2026-07-31T17:00Z
// — 7 hours BEFORE 2026-08-01T00:00Z, so it silently fell into the July
// range instead of August. Comparing "yyyy-MM" strings computed from LOCAL
// date fields (never toISOString()/getUTC*) sidesteps the whole class of bug.
function getOvertimeMonthKey(item: OvertimeSubmissionRecord): string {
  if (item.overtimeMonthKey) return item.overtimeMonthKey;

  if (typeof item.overtimeDateStr === "string" && item.overtimeDateStr.length >= 7) {
    return item.overtimeDateStr.slice(0, 7);
  }

  const rawDate: any = (item as any).overtimeDate ?? (item as any).date;
  const date = typeof rawDate?.toDate === "function" ? rawDate.toDate() : rawDate ? new Date(rawDate) : null;
  if (!date || Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// "" means no month filter — resolves "current"/"custom" down to the actual
// "yyyy-MM" key the table should match against, or "" for "all" so the
// filter step below becomes a no-op.
function getSelectedMonthKey(
  monthFilterMode: "all" | "current" | "custom",
  selectedMonth: string,
  currentMonthKey: string,
): string {
  if (monthFilterMode === "all") return "";
  if (monthFilterMode === "current") return currentMonthKey;
  return selectedMonth;
}

// Every status a submission can be in before a final manager/HRD decision —
// covers both the current flow's statuses and legacy coordinator-era ones,
// since older docs in this collection can still carry the latter.
const PENDING_OVERTIME_STATUSES = [
  "pending_manager_review",
  "submitted",
  "pending_supervisor",
  "pending_atasan",
  "pending_coordinator",
  "approved_by_manager",
  "pending_hrd_review",
  "pending_hrd",
  "revision_requested",
  "revision_requested_by_manager",
  "revision_requested_by_hrd",
  "revision_manager",
  "revision_hrd",
  "revision_requested_by_coordinator",
];

const FINAL_OVERTIME_STATUSES = [
  "approved_by_hrd",
  "approved",
  "approved_hrd",
  "rejected_by_manager",
  "rejected_by_hrd",
  "rejected_manager",
  "rejected_hrd",
  "rejected",
  "cancelled",
];

function isOvertimeStillOpen(item: OvertimeSubmissionRecord): boolean {
  const status = item.status || (item as any).approvalStatus || "";
  return PENDING_OVERTIME_STATUSES.includes(status);
}

function isFinalOvertimeStatus(item: OvertimeSubmissionRecord): boolean {
  const status = item.status || (item as any).approvalStatus || "";
  return FINAL_OVERTIME_STATUSES.includes(status);
}

// Shared with the kpis block below (same array reference, not just the same
// literal values twice) so "Menunggu Review HRD" / "Dalam Review Manager"
// can never drift from what the pending_hrd/pending_supervisor tabs show.
const HRD_PENDING_HRD_STATUSES = ["pending_hrd", "pending_hrd_review", "approved_by_manager"];
const HRD_PENDING_SUPERVISOR_STATUSES = ["pending_supervisor", "submitted", "pending_manager_review"];

// Deliberately NARROWER than PENDING_OVERTIME_STATUSES — this is only the
// statuses where the MANAGER stage specifically is still open. Using the
// full "still open anywhere" set here would wrongly keep counting an item
// as "waiting for me" after this manager already approved it and it moved
// on to approved_by_manager/pending_hrd_review (their old
// directSupervisorUid/managerUid stays on the doc even after they've acted).
const MANAGER_ACTIONABLE_STATUSES = [
  "pending_coordinator",
  "submitted",
  "pending_manager_review",
  "pending_supervisor",
  "pending_manager",
  "pending_atasan",
  "revision_manager",
];

// Same predicate drives BOTH the "Menunggu Validasi Saya" table rows and the
// "Menunggu Persetujuan Anda" KPI — a single source of truth so the two can
// never drift apart (previously the KPI only checked the exact legacy
// "pending_coordinator" status + overtimeCoordinatorUid, while the table's
// row filter also accepted the new-flow statuses and taskAssignerUid/
// directSupervisorUid/managerUid, so the KPI could under-count relative to
// what the table actually showed).
// new Date(year, monthIndex, day) — numeric args — is always LOCAL time per
// spec, unlike new Date("2026-07-01") (UTC). Used only for display, so a
// monthKey never round-trips through a UTC-parsed string anywhere.
function formatMonthKeyLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return monthKey;
  return format(new Date(year, month - 1, 1), "MMMM yyyy", { locale: idLocale });
}

export function OvertimeApprovalClient({ mode }: OvertimeApprovalClientProps) {
  const { userProfile } = useAuth() as { userProfile: UserProfile };
  const firestore = useFirestore();

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hasHydratedParams = useRef(false);

  const [statusFilter, setStatusFilter] = useState<
    OvertimeSubmission["status"] | "all"
  >(mode === "manager" ? "pending_coordinator" : "all");
  const [activeTab, setActiveTab] = useState<
    | "pending_hrd"
    | "pending_supervisor"
    | "pending_coordinator"
    | "approved"
    | "rejected"
    | "rekap_payroll"
    | "all"
    | "riwayat_saya"
    | "perlu_diproses"
  >(mode === "hrd" ? "pending_hrd" : "pending_coordinator");
  const [brandFilter, setBrandFilter] = useState("all");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("all");
  // Three explicit modes instead of a single "" = all / "YYYY-MM" = custom
  // string — an empty-string input rendered as a native <input type="month">
  // reads as "disabled/broken" to users even when it's fully interactive, so
  // the mode is now a first-class, always-clickable choice instead of being
  // inferred from whether a value happens to be set.
  const [monthFilterMode, setMonthFilterModeState] = useState<"all" | "current" | "custom">("all");
  const [selectedMonth, setSelectedMonthState] = useState(() => format(new Date(), "yyyy-MM"));
  // Computed once per render via date-fns format(), which reads LOCAL date
  // fields — never toISOString()/getUTCMonth().
  const currentMonthKey = format(new Date(), "yyyy-MM");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<
    "recent" | "duration" | "overtime_date"
  >("recent");
  const [selectedSubmission, setSelectedSubmission] =
    useState<OvertimeSubmissionRecord | null>(null);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(
    null,
  );

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

  const getSearchParam = (key: string) => searchParams?.get(key) ?? null;

  const normalizeQueryValue = (value: string | null) =>
    value ? value.replace(/-/g, "_") : null;

  const managerTabs = [
    "pending_coordinator",
    "pending_supervisor",
    "riwayat_saya",
    "all",
  ] as const;
  const hrdTabs = [
    "pending_hrd",
    "pending_supervisor",
    "approved",
    "rejected",
    "all",
  ] as const;
  const hrdStatusFilters = [
    "all",
    "pending_hrd",
    "pending_supervisor",
    "approved",
    "approved_hrd",
    "rejected_manager",
    "rejected_hrd",
    "revision_manager",
    "revision_hrd",
  ] as const;

  const queryStatePrefix = `overtime-approval-${mode}`;

  const updateUrlParams = (updates: Record<string, string | null>) => {
    if (!router || !pathname) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");

    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "all" || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    router.replace(newUrl);
  };

  const updateUrlParam = (key: string, value: string | null) => {
    updateUrlParams({ [key]: value });
  };

  const setLocalStorageValue = (key: string, value: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  };

  const readLocalStorageValue = (key: string) => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  };

  useEffect(() => {
    if (hasHydratedParams.current || typeof window === "undefined") return;

    const tabParam = normalizeQueryValue(getSearchParam("tab"));
    const statusParam = getSearchParam("status");
    const monthParam = getSearchParam("month");
    const searchParam = getSearchParam("search");
    const brandParam = getSearchParam("brand");
    const divisionParam = getSearchParam("division");
    const managerParam = getSearchParam("manager");

    if (mode === "hrd") {
      if (tabParam && hrdTabs.includes(tabParam as any)) {
        setActiveTab(tabParam as any);
      } else {
        const storedTab = readLocalStorageValue(`${queryStatePrefix}-tab`);
        if (storedTab && hrdTabs.includes(storedTab as any)) {
          setActiveTab(storedTab as any);
          updateUrlParam("tab", storedTab);
        }
      }

      if (statusParam && hrdStatusFilters.includes(statusParam as any)) {
        setStatusFilter(statusParam as any);
      } else {
        const storedStatus = readLocalStorageValue(
          `${queryStatePrefix}-status`,
        );
        if (storedStatus && hrdStatusFilters.includes(storedStatus as any)) {
          setStatusFilter(storedStatus as any);
          updateUrlParam("status", storedStatus);
        }
      }

      if (brandParam) {
        setBrandFilter(brandParam);
      } else {
        const storedBrand = readLocalStorageValue(`${queryStatePrefix}-brand`);
        if (storedBrand) {
          setBrandFilter(storedBrand);
          updateUrlParam("brand", storedBrand);
        }
      }

      if (divisionParam) {
        setDivisionFilter(divisionParam);
      } else {
        const storedDivision = readLocalStorageValue(
          `${queryStatePrefix}-division`,
        );
        if (storedDivision) {
          setDivisionFilter(storedDivision);
          updateUrlParam("division", storedDivision);
        }
      }

      if (managerParam) {
        setManagerFilter(managerParam);
      } else {
        const storedManager = readLocalStorageValue(
          `${queryStatePrefix}-manager`,
        );
        if (storedManager) {
          setManagerFilter(storedManager);
          updateUrlParam("manager", storedManager);
        }
      }
    } else {
      const statusTabParam = tabParam || normalizeQueryValue(statusParam);
      if (statusTabParam && managerTabs.includes(statusTabParam as any)) {
        setActiveTab(statusTabParam as any);
      } else {
        const storedTab = readLocalStorageValue(`${queryStatePrefix}-tab`);
        if (storedTab && managerTabs.includes(storedTab as any)) {
          setActiveTab(storedTab as any);
          updateUrlParam("status", storedTab.replace(/_/g, "-"));
        } else {
          setActiveTab("pending_coordinator");
        }
      }
    }

    const hydrateMonth = (value: string) => {
      if (value === "all" || value === "") {
        setMonthFilterModeState("all");
      } else if (value === "current") {
        setMonthFilterModeState("current");
      } else {
        setMonthFilterModeState("custom");
        setSelectedMonthState(value);
      }
    };
    if (monthParam) {
      hydrateMonth(monthParam);
    } else {
      const storedMonth = readLocalStorageValue(`${queryStatePrefix}-month`);
      if (storedMonth) {
        hydrateMonth(storedMonth);
        updateUrlParam("month", storedMonth);
      }
    }

    if (searchParam) {
      setSearchTerm(searchParam);
    } else {
      const storedSearch = readLocalStorageValue(`${queryStatePrefix}-search`);
      if (storedSearch) {
        setSearchTerm(storedSearch);
        updateUrlParam("search", storedSearch);
      }
    }

    hasHydratedParams.current = true;
  }, [mode, searchParams, queryStatePrefix, router, pathname]);

  const setPersistedActiveTab = (value: typeof activeTab) => {
    setActiveTab(value);
    setLocalStorageValue(`${queryStatePrefix}-tab`, value);
    if (mode === "hrd") {
      updateUrlParam("tab", value);
    } else {
      updateUrlParam("status", value.replace(/_/g, "-"));
    }
  };

  const setPersistedStatusFilter = (value: typeof statusFilter) => {
    setStatusFilter(value);
    setLocalStorageValue(`${queryStatePrefix}-status`, value);
    updateUrlParam("status", value === "all" ? null : value);
  };

  const setPersistedBrandFilter = (value: string) => {
    setBrandFilter(value);
    setDivisionFilter("all");
    setManagerFilter("all");
    setLocalStorageValue(`${queryStatePrefix}-brand`, value);
    setLocalStorageValue(`${queryStatePrefix}-division`, "all");
    setLocalStorageValue(`${queryStatePrefix}-manager`, "all");
    updateUrlParams({
      brand: value === "all" ? null : value,
      division: null,
      manager: null,
    });
  };
  const setPersistedDivisionFilter = (value: string) => {
    setDivisionFilter(value);
    setManagerFilter("all");
    setLocalStorageValue(`${queryStatePrefix}-division`, value);
    setLocalStorageValue(`${queryStatePrefix}-manager`, "all");
    updateUrlParams({
      division: value === "all" ? null : value,
      manager: null,
    });
  };

  const setPersistedManagerFilter = (value: string) => {
    setManagerFilter(value);
    setLocalStorageValue(`${queryStatePrefix}-manager`, value);
    updateUrlParam("manager", value === "all" ? null : value);
  };

  const setPersistedMonthFilterMode = (nextMode: "all" | "current" | "custom") => {
    setMonthFilterModeState(nextMode);
    const persistValue = nextMode === "custom" ? selectedMonth : nextMode;
    setLocalStorageValue(`${queryStatePrefix}-month`, persistValue);
    updateUrlParam("month", nextMode === "all" ? null : persistValue);
  };

  const setPersistedSelectedMonth = (value: string) => {
    setSelectedMonthState(value);
    setMonthFilterModeState("custom");
    setLocalStorageValue(`${queryStatePrefix}-month`, value);
    updateUrlParam("month", value);
  };

  const setPersistedSearchTerm = (value: string) => {
    setSearchTerm(value);
    setLocalStorageValue(`${queryStatePrefix}-search`, value);
    updateUrlParam("search", value || null);
  };

  const resetHrdFilters = () => {
    setBrandFilter("all");
    setDivisionFilter("all");
    setManagerFilter("all");
    setStatusFilter("all");
    setMonthFilterModeState("all");
    setSearchTerm("");
    for (const [key, value] of [
      [`${queryStatePrefix}-brand`, "all"],
      [`${queryStatePrefix}-division`, "all"],
      [`${queryStatePrefix}-manager`, "all"],
      [`${queryStatePrefix}-status`, "all"],
      [`${queryStatePrefix}-month`, "all"],
      [`${queryStatePrefix}-search`, ""],
    ]) setLocalStorageValue(key, value);
    updateUrlParams({
      brand: null,
      division: null,
      manager: null,
      status: null,
      month: null,
      search: null,
    });
  };

  const getEffectiveStatus = (submission: OvertimeSubmission) =>
    (submission as any).approvalStatus || submission.status || "draft";

  const getSubmittedAt = (submission: OvertimeSubmission) =>
    parseSafeDate((submission as any).submittedAt ?? submission.createdAt) ??
    new Date(0);

  const getOvertimeDate = (submission: OvertimeSubmission) =>
    parseSafeDate((submission as any).overtimeDate ?? submission.date) ?? null;

  const managerSubmissionsQuery = useMemoFirebase(() => {
    if (!userProfile) return null;

    if (mode === "manager") {
      return query(
        collection(firestore, "overtime_submissions"),
        or(
          where("currentApproverUid", "==", userProfile.uid),
          where("approvalTargetUid", "==", userProfile.uid),
          where("waitingForUid", "==", userProfile.uid),
          where("directSupervisorUid", "==", userProfile.uid),
          where("managerUid", "==", userProfile.uid),
          where("taskAssignerUid", "==", userProfile.uid),
          where("overtimeCoordinatorUid", "==", userProfile.uid),
        ),
      );
    }

    return null;
  }, [userProfile, firestore, mode]);

  const {
    data: managerSubmissions,
    isLoading: managerSubmissionsLoading,
    mutate: mutateManagerSubmissions,
  } = useCollection<OvertimeSubmissionRecord>(managerSubmissionsQuery);
  const {
    data: hrdSubmissions,
    isLoading: hrdSubmissionsLoading,
    mutate: mutateHrdSubmissions,
    isScopeConfigured,
    emptyStateMessage,
    scope: hrdScope,
  } = useHrdScopedCollection<OvertimeSubmissionRecord>("overtime_submissions", {
    enabled: mode === "hrd",
  });
  const submissionsRaw = mode === "hrd" ? hrdSubmissions : managerSubmissions;
  // The manager query ORs together directSupervisorUid/managerUid/
  // overtimeCoordinatorUid — one person (e.g. Daniel, both the real atasan
  // AND the coordinator on the same submission) can match more than one of
  // those branches. A single Firestore or() query already returns each doc
  // once, but dedupe defensively so KPI counts and the table can never
  // diverge if this ever becomes multiple merged queries.
  const submissions = useMemo(
    () => (submissionsRaw ? uniqueById(submissionsRaw) : submissionsRaw),
    [submissionsRaw],
  );
  const isLoading = mode === "hrd" ? hrdSubmissionsLoading : managerSubmissionsLoading;
  const mutate = mode === "hrd" ? mutateHrdSubmissions : mutateManagerSubmissions;

  // Fetch all brands dari master data
  const brandsQuery = useMemo(
    () => (mode === "manager" ? query(collection(firestore, "brands")) : null),
    [firestore, mode]
  );

  const {
    data: managerBrands = [],
    isLoading: managerBrandsLoading,
  } = useCollection<Brand>(brandsQuery);
  const {
    data: hrdBrands = [],
    isLoading: hrdBrandsLoading,
  } = useHrdScopedBrands();
  const allBrands = mode === "hrd" ? hrdBrands : managerBrands;
  const brandsLoading = mode === "hrd" ? hrdBrandsLoading : managerBrandsLoading;

  const brandOptions = useMemo(
    () =>
      (allBrands || [])
        .filter((brand) => !!brand.id && !!brand.name)
        .map((brand) => ({ value: brand.id!, label: brand.name }))
        .sort((a, b) => a.label.localeCompare(b.label, "id")),
    [allBrands],
  );
  const brandNameById = useMemo(
    () => new Map(brandOptions.map((brand) => [brand.value, brand.label])),
    [brandOptions],
  );

  // HRD filter masters are independent from overtime rows. The scope hook
  // chunks allowedBrandIds automatically for profiles/users; the selected
  // brand's nested division master is read directly from its canonical path.
  const { data: scopedEmployeeProfiles = [], isLoading: employeeProfilesLoading } =
    useHrdScopedCollection<any>("employee_profiles", { enabled: mode === "hrd" });
  const { data: scopedUsers = [], isLoading: scopedUsersLoading } =
    useHrdScopedCollection<any>("users", { enabled: mode === "hrd" });

  const allowedBrandIds = useMemo(() => {
    if (mode !== "hrd") return [];
    if (hrdScope?.scopeType === "all_companies") {
      return brandOptions.map((brand) => brand.value);
    }
    const scopedBrandIds = hrdScope?.allowedBrandIds || [];
    // Super Admin is unscoped by role, so its normalized HRD scope may not
    // carry ids even though useHrdScopedBrands() correctly returns all brands.
    return scopedBrandIds.length > 0
      ? scopedBrandIds
      : brandOptions.map((brand) => brand.value);
  }, [brandOptions, hrdScope, mode]);
  const effectiveDivisionBrandIds = useMemo(
    () => (brandFilter === "all" ? allowedBrandIds : [brandFilter]).filter(Boolean),
    [allowedBrandIds, brandFilter],
  );
  const [masterDivisions, setMasterDivisions] = useState<any[]>([]);
  const [masterDivisionsLoading, setMasterDivisionsLoading] = useState(false);

  useEffect(() => {
    if (mode !== "hrd" || brandsLoading) return;
    let cancelled = false;
    setMasterDivisionsLoading(true);

    Promise.all(
      effectiveDivisionBrandIds.map(async (brandId) => {
        try {
          const snapshot = await getDocs(
            collection(firestore, "brands", brandId, "divisions"),
          );
          return snapshot.docs.map((divisionDoc) => ({
            id: divisionDoc.id,
            ...divisionDoc.data(),
            brandId,
            brandName: brandNameById.get(brandId) || "",
          }));
        } catch (error) {
          console.error("Gagal memuat master divisi HRD", { brandId, error });
          return [];
        }
      }),
    )
      .then((rows) => {
        if (!cancelled) setMasterDivisions(rows.flat());
      })
      .finally(() => {
        if (!cancelled) setMasterDivisionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brandNameById, brandsLoading, effectiveDivisionBrandIds, firestore, mode]);

  const masterEmployees = useMemo(() => {
    const byUid = new Map<string, any>();
    for (const user of scopedUsers || []) {
      const uid = user.uid || user.id;
      if (uid) byUid.set(uid, { ...user, uid });
    }
    for (const profile of scopedEmployeeProfiles || []) {
      const uid = profile.uid || profile.id;
      if (!uid) continue;
      const user = byUid.get(uid) || {};
      const profileBrandId =
        profile.brandId ||
        profile.companyId ||
        profile.hrdEmploymentInfo?.brandId ||
        profile.hrdEmploymentInfo?.companyId ||
        profile.strukturKepegawaian?.brandId ||
        "";
      const profileBrandName =
        profile.brandName ||
        profile.companyName ||
        profile.hrdEmploymentInfo?.brandName ||
        profile.hrdEmploymentInfo?.companyName ||
        "";
      const profileDivisionId =
        profile.divisionId ||
        profile.hrdEmploymentInfo?.divisionId ||
        profile.strukturKepegawaian?.divisionId ||
        "";
      const profileDivisionName =
        profile.divisionName ||
        profile.hrdEmploymentInfo?.divisionName ||
        profile.hrdEmploymentInfo?.divisi ||
        profile.strukturKepegawaian?.divisionName ||
        "";
      byUid.set(uid, {
        ...user,
        ...profile,
        uid,
        brandId: profileBrandId || user.brandId || user.companyId || "",
        brandName: profileBrandName || user.brandName || user.companyName || "",
        divisionId: profileDivisionId || user.divisionId || "",
        divisionName: profileDivisionName || user.divisionName || user.division || "",
        role: profile.role || user.role,
        structuralLevel: profile.structuralLevel || user.structuralLevel,
        structuralPosition: profile.structuralPosition || user.structuralPosition,
        isDivisionManager: profile.isDivisionManager ?? user.isDivisionManager,
        hrdEmploymentInfo: {
          ...(user.hrdEmploymentInfo || {}),
          ...(profile.hrdEmploymentInfo || {}),
        },
      });
    }
    return Array.from(byUid.values());
  }, [scopedEmployeeProfiles, scopedUsers]);

  const employeeMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const employee of masterEmployees) {
      const keys = [employee.uid, employee.id, employee.userId].filter(Boolean);
      for (const key of keys) map.set(String(key), employee);
    }
    return map;
  }, [masterEmployees]);

  const divisionOptions = useMemo(
    () =>
      buildHrdDivisionOptions({
        selectedBrandId: brandFilter,
        allowedBrandIds,
        allDivisions: masterDivisions,
        allEmployees: masterEmployees,
        overtimeSubmissions: submissions,
      }),
    [allowedBrandIds, brandFilter, masterDivisions, masterEmployees, submissions],
  );

  const selectedDivisionOption = useMemo(
    () => divisionOptions.find((option) => option.id === divisionFilter),
    [divisionFilter, divisionOptions],
  );

  const managerOptions = useMemo(
    () =>
      getManagerOptionsByBrandDivision(
        masterEmployees,
        selectedDivisionOption?.brandId || brandFilter,
        selectedDivisionOption?.divisionId || divisionFilter,
      ),
    [brandFilter, divisionFilter, masterEmployees, selectedDivisionOption],
  );
  const selectedBrandLabel =
    brandOptions.find((brand) => brand.value === brandFilter)?.label || "";
  const selectedManagerLabel =
    managerOptions.find((manager) => manager.uid === managerFilter)?.name || "";
  const statusFilterLabels: Record<string, string> = {
    pending_hrd: "Menunggu Review HRD",
    pending_supervisor: "Dalam Review Manager",
    approved: "Disetujui",
    approved_hrd: "Disetujui HRD",
    rejected_manager: "Ditolak Manager",
    rejected_hrd: "Ditolak HRD",
    revision_manager: "Revisi Manager",
    revision_hrd: "Revisi HRD",
  };
  const hasActiveHrdFilters =
    brandFilter !== "all" ||
    divisionFilter !== "all" ||
    managerFilter !== "all" ||
    statusFilter !== "all" ||
    monthFilterMode !== "all" ||
    !!searchTerm.trim();

  useEffect(() => {
    if (
      mode === "hrd" &&
      !employeeProfilesLoading &&
      !masterDivisionsLoading &&
      divisionFilter !== "all" &&
      !divisionOptions.some((option) => option.id === divisionFilter)
    ) {
      setPersistedDivisionFilter("all");
    }
  }, [
    divisionFilter,
    divisionOptions,
    employeeProfilesLoading,
    masterDivisionsLoading,
    mode,
  ]);

  useEffect(() => {
    if (
      mode === "hrd" &&
      !employeeProfilesLoading &&
      !scopedUsersLoading &&
      managerFilter !== "all" &&
      !managerOptions.some((option) => option.uid === managerFilter)
    ) {
      setPersistedManagerFilter("all");
    }
  }, [
    employeeProfilesLoading,
    managerFilter,
    managerOptions,
    mode,
    scopedUsersLoading,
  ]);

  useEffect(() => {
    if (
      mode === "hrd" &&
      !brandsLoading &&
      brandFilter !== "all" &&
      !brandOptions.some((brand) => brand.value === brandFilter)
    ) {
      setPersistedBrandFilter("all");
    }
  }, [brandFilter, brandOptions, brandsLoading, mode]);

  // Current flow has no coordinator stage — "pending_coordinator" is kept as
  // the tab KEY (URL/localStorage compat) but now also covers the new
  // manager-actionable statuses ("submitted"/"pending_manager_review"), so a
  // brand new submission still shows up in a manager's default tab.
  const activeTabStatuses = useMemo(() => {
    if (mode === "manager") {
      switch (activeTab) {
        case "pending_coordinator":
          return ["submitted", "pending_manager_review"];
        case "pending_supervisor":
          return ["pending_supervisor"];
        case "riwayat_saya":
          return OVERTIME_SUBMISSION_STATUSES.filter(
            (status) =>
              status !== "pending_coordinator" &&
              status !== "pending_supervisor" &&
              status !== "submitted" &&
              status !== "pending_manager_review",
          );
        case "all":
        default:
          return OVERTIME_SUBMISSION_STATUSES;
      }
    }

    if (mode !== "hrd") return ["pending_supervisor"];

    switch (activeTab) {
      case "pending_hrd":
        return HRD_PENDING_HRD_STATUSES;
      case "pending_supervisor":
        return HRD_PENDING_SUPERVISOR_STATUSES;
      case "approved":
      case "rekap_payroll":
        return ["approved_hrd", "approved", "approved_by_hrd"];
      case "rejected":
        return ["rejected_manager", "rejected_hrd", "rejected_by_manager", "rejected_by_hrd"];
      case "all":
      default:
        return OVERTIME_SUBMISSION_STATUSES;
    }
  }, [activeTab, mode]);

  // Tabs where the user still needs to ACT — these DEFAULT monthFilterMode
  // to "all" (see the boundary-crossing effect below) so a pending approval
  // never quietly "disappears" just because the calendar rolled into a new
  // month, but the user can still explicitly switch to "current"/"custom" to
  // filter pending by month for a specific rekap need — nothing here is
  // hardcoded to ignore the filter.
  const isPendingForMeTab =
    (mode === "manager" &&
      (activeTab === "pending_coordinator" ||
        activeTab === "pending_supervisor")) ||
    (mode === "hrd" &&
      (activeTab === "pending_hrd" || activeTab === "pending_supervisor"));

  // Re-apply the tab-category default only when CROSSING the pending/history
  // boundary (e.g. "Menunggu Validasi Saya" → "Riwayat Keputusan Saya") —
  // not on every tab click within the same category, and not on mount
  // (where it would clobber a month just hydrated from the URL/localStorage
  // above). The filter itself stays fully user-controlled either way; this
  // only decides what the buttons show as selected when you first arrive.
  const prevIsPendingForMeTabRef = useRef(isPendingForMeTab);
  useEffect(() => {
    if (prevIsPendingForMeTabRef.current !== isPendingForMeTab) {
      setMonthFilterModeState(isPendingForMeTab ? "all" : "current");
      prevIsPendingForMeTabRef.current = isPendingForMeTab;
    }
  }, [isPendingForMeTab]);

  // Pending approvals default to all months on the initial visit as well as
  // when crossing back from a history tab. An explicit ?month= URL remains
  // authoritative, so shared/filter links still work.
  const didApplyInitialPendingMonthDefaultRef = useRef(false);
  useEffect(() => {
    if (
      didApplyInitialPendingMonthDefaultRef.current ||
      !hasHydratedParams.current
    ) return;
    didApplyInitialPendingMonthDefaultRef.current = true;
    if (isPendingForMeTab && !searchParams?.get("month")) {
      setMonthFilterModeState("all");
    }
  }, [isPendingForMeTab, searchParams]);

  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];

    const activeMonthKey = getSelectedMonthKey(monthFilterMode, selectedMonth, currentMonthKey);

    return submissions.filter((s) => {
      const effectiveStatus = getEffectiveStatus(s);

      // Tab filtering
      const activeTabMatch =
        mode === "manager"
          ? activeTabStatuses.includes(effectiveStatus as any)
          : mode !== "hrd" || activeTab === "all"
            ? true
            : activeTab === "pending_hrd"
              ? isPendingHrdReview(s)
              : activeTabStatuses.includes(effectiveStatus as any);
      if (!activeTabMatch) return false;

      // Role-specific filtering in manager mode
      if (mode === "manager") {
        if (activeTab === "pending_coordinator") {
          if (!isWaitingForManagerAction(s, userProfile.uid)) return false;
        } else if (activeTab === "pending_supervisor") {
          if (
            s.directSupervisorUid !== userProfile.uid &&
            s.managerUid !== userProfile.uid
          )
            return false;
        } else if (activeTab === "riwayat_saya") {
          const hasDecision =
            s.coordinatorDecisionBy === userProfile.uid ||
            (s as any).coordinatorApprovedBy === userProfile.uid ||
            s.supervisorApprovedBy === userProfile.uid ||
            (s as any).managerReviewedBy === userProfile.uid ||
            s.rejectedBy === userProfile.uid ||
            s.revisionRequestedBy === userProfile.uid;
          if (!hasDecision) return false;
        }
      }

      // Status filter (only for HRD if set)
      if (mode === "hrd" && statusFilter !== "all") {
        const statusMatches =
          statusFilter === "pending_hrd"
            ? isPendingHrdReview(s)
            : effectiveStatus === statusFilter;
        if (!statusMatches) return false;
      }

      // Brand and division filters (only for HRD)
      if (mode === "hrd") {
        if (brandFilter !== "all") {
          if (s.brandId !== brandFilter) return false;
        }

        if (divisionFilter !== "all") {
          const resolvedDivision = getResolvedEmployeeDivision(s, employeeMap);
          if (
            !selectedDivisionOption ||
            (selectedDivisionOption.brandId &&
              s.brandId !== selectedDivisionOption.brandId) ||
            (resolvedDivision.divisionId !== selectedDivisionOption.divisionId &&
              normalizeDivisionName(resolvedDivision.divisionName) !==
                normalizeDivisionName(selectedDivisionOption.name))
          ) return false;
        }

        if (managerFilter !== "all") {
          if (getResolvedManagerUid(s) !== managerFilter) return false;
        }
      }

      // Month filter — string-key comparison (local date). Fully
      // user-controlled via monthFilterMode now: "all" resolves activeMonthKey
      // to "" (no-op below) so nothing is EVER hidden by month unless the
      // user explicitly picked "Bulan Ini"/"Pilih Bulan" — including on the
      // pending-for-me tabs, which only DEFAULT to "all" rather than being
      // hardcoded to ignore this filter.
      if (activeMonthKey) {
        const monthKey = getOvertimeMonthKey(s);
        if (!monthKey || monthKey !== activeMonthKey) return false;
      }

      // Search filter
      if (searchTerm) {
        const normalized = searchTerm.toLowerCase().trim();
        const resolvedDivision = getResolvedEmployeeDivision(s, employeeMap);
        const resolvedManagerName = getResolvedManagerName(s, employeeMap);
        const jobSearchValues = ((s as any).jobs || []).flatMap((job: any) => [
          job.title,
          job.description,
          job.workOutput,
          job.projectOrClient,
        ]);
        const taskSearchValues = [
          ...(s.taskDetails || []).map((task: any) => task.description || task.title),
          ...(s.tasks || []).map((task: any) => task.description || task.title),
        ];
        const values = [
          s.employeeName,
          s.fullName,
          s.employeeCode,
          s.brandName,
          resolvedDivision.divisionName,
          resolvedManagerName,
          (s as any).managerName,
          (s as any).overtimeReason,
          s.reason,
          (s as any).workSummary,
          (s as any).projectOrClient,
          ...jobSearchValues,
          ...taskSearchValues,
        ];
        if (
          !values.some((value) =>
            String(value || "").toLowerCase().includes(normalized),
          )
        ) return false;
      }

      return true;
    });
  }, [
    submissions,
    statusFilter,
    searchTerm,
    brandFilter,
    divisionFilter,
    divisionOptions,
    employeeMap,
    managerFilter,
    monthFilterMode,
    selectedMonth,
    currentMonthKey,
    activeTab,
    mode,
    activeTabStatuses,
    selectedDivisionOption,
  ]);

  const pendingHrdItems = useMemo(
    () => uniqueById((submissions || []).filter((item) => isPendingHrdReview(item))),
    [submissions],
  );

  const sortedSubmissions = useMemo(() => {
    const list = [...filteredSubmissions];

    if (sortOption === "duration") {
      return list.sort(
        (a, b) => (b.totalDurationMinutes || 0) - (a.totalDurationMinutes || 0),
      );
    }

    if (sortOption === "overtime_date") {
      return list.sort((a, b) => {
        const aDate = getOvertimeDate(a)?.getTime() ?? 0;
        const bDate = getOvertimeDate(b)?.getTime() ?? 0;
        return aDate - bDate;
      });
    }

    return list.sort(
      (a, b) => getSubmittedAt(b).getTime() - getSubmittedAt(a).getTime(),
    );
  }, [filteredSubmissions, sortOption]);

  // "Semua Pengajuan"/"Semua Riwayat" with a specific month picked would
  // otherwise hide a still-pending item from a different month entirely —
  // surfaced here as a separate callout so it's never just gone.
  const crossMonthPendingInAllTab = useMemo(() => {
    const activeMonthKey = getSelectedMonthKey(monthFilterMode, selectedMonth, currentMonthKey);
    if (!submissions || activeTab !== "all" || !activeMonthKey) return [];
    return submissions.filter(
      (s) => isOvertimeStillOpen(s) && getOvertimeMonthKey(s) !== activeMonthKey,
    );
  }, [submissions, activeTab, monthFilterMode, selectedMonth, currentMonthKey]);

  const DAILY_LIMIT_MINUTES = 240; // 4 jam

  // Map: "${employeeUid}_${overtimeDateStr}" → total submitted minutes across ALL submissions for that employee+date
  const dailyOvertimeTotalMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!submissions) return map;
    submissions.forEach((s) => {
      const uid = s.employeeUid || s.uid || "";
      if (!uid) return;
      const dateVal: any = (s as any).overtimeDate ?? s.date;
      let dateStr = "";
      if (dateVal && typeof dateVal === "object" && typeof dateVal.toDate === "function") {
        dateStr = format(dateVal.toDate(), "yyyy-MM-dd");
      } else if (typeof dateVal === "string") {
        dateStr = dateVal.slice(0, 10);
      }
      if (!dateStr) return;
      const key = `${uid}_${dateStr}`;
      map.set(key, (map.get(key) || 0) + (s.totalDurationMinutes || 0));
    });
    return map;
  }, [submissions]);

  const getDailyTotal = (s: OvertimeSubmission): number => {
    const uid = s.employeeUid || s.uid || "";
    const dateVal: any = (s as any).overtimeDate ?? s.date;
    let dateStr = "";
    if (dateVal && typeof dateVal === "object" && typeof dateVal.toDate === "function") {
      dateStr = format(dateVal.toDate(), "yyyy-MM-dd");
    } else if (typeof dateVal === "string") {
      dateStr = dateVal.slice(0, 10);
    }
    if (!uid || !dateStr) return 0;
    return dailyOvertimeTotalMap.get(`${uid}_${dateStr}`) || 0;
  };

  const payrollRecapGrouped = useMemo(() => {
    if (activeTab !== "rekap_payroll") return [];

    const groups: Record<
      string,
      {
        employeeUid: string;
        employeeName: string;
        divisionName: string;
        brandName: string;
        count: number;
        totalMinutes: number;
        hasOverLimit: boolean;
        items: OvertimeSubmission[];
      }
    > = {};

    filteredSubmissions.forEach((s) => {
      const empId = s.employeeUid || s.uid || "unknown";
      const name = s.employeeName || s.fullName || "Karyawan";
      const div = s.divisionName || s.division || "-";
      const brand = s.brandName || "-";
      const approvedMinutes =
        s.approvedMinutesFinal !== undefined && s.approvedMinutesFinal !== null
          ? s.approvedMinutesFinal
          : s.totalDurationMinutes || 0;

      if (!groups[empId]) {
        groups[empId] = {
          employeeUid: empId,
          employeeName: name,
          divisionName: div,
          brandName: brand,
          count: 0,
          totalMinutes: 0,
          hasOverLimit: false,
          items: [],
        };
      }
      groups[empId].count += 1;
      groups[empId].totalMinutes += approvedMinutes;
      if (s.isOverDailyLimit) groups[empId].hasOverLimit = true;
      groups[empId].items.push(s);
    });

    return Object.values(groups).sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName),
    );
  }, [filteredSubmissions, activeTab]);

  const kpis = useMemo(() => {
    if (!submissions)
      return {
        pendingHrd: 0,
        pendingManager: 0,
        approved: 0,
        rejected: 0,
        total: 0,
        pending: 0,
        revision: 0,
      };

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = addMonths(monthStart, 1);

    return submissions.reduce(
      (acc, s) => {
        const effectiveStatus = getEffectiveStatus(s);
        const overtimeDate = getOvertimeDate(s);

        if (mode === "hrd") {
          if (isPendingHrdReview(s)) acc.pendingHrd++;
          if (HRD_PENDING_SUPERVISOR_STATUSES.includes(effectiveStatus)) acc.pendingManager++;

          const decisionDate = s.hrdDecisionAt?.toDate();
          if (
            decisionDate &&
            decisionDate >= monthStart &&
            decisionDate < monthEnd
          ) {
            if (["approved", "approved_hrd"].includes(effectiveStatus))
              acc.approved++;
            if (["rejected_manager", "rejected_hrd"].includes(effectiveStatus))
              acc.rejected++;
          }

          if (
            overtimeDate &&
            overtimeDate >= monthStart &&
            overtimeDate < monthEnd
          ) {
            acc.total++;
          }
        } else {
          // Exactly the same strict predicate used by "Menunggu Validasi Saya":
          // only current-flow manager-stage statuses and an explicit approver
          // target count toward this KPI.
          if (isWaitingForManagerAction(s, userProfile.uid)) acc.pending++;

          if (
            effectiveStatus === "revision_manager" ||
            effectiveStatus === "revision_requested_by_coordinator"
          ) {
            acc.revision++;
          }

          const coordinatorDecisionDate =
            s.coordinatorDecisionAt?.toDate?.() ||
            (typeof s.coordinatorDecisionAt === "string"
              ? new Date(s.coordinatorDecisionAt)
              : null);
          const supervisorDecisionDate =
            s.supervisorApprovedAt?.toDate?.() ||
            (typeof s.supervisorApprovedAt === "string"
              ? new Date(s.supervisorApprovedAt)
              : null);
          const managerDecisionDate =
            s.managerDecisionAt?.toDate?.() ||
            (typeof s.managerDecisionAt === "string"
              ? new Date(s.managerDecisionAt)
              : null);

          const hasApprovedThisMonth =
            (s.coordinatorDecision === "approved" &&
              (s.coordinatorDecisionBy === userProfile.uid ||
                (s as any).coordinatorApprovedBy === userProfile.uid) &&
              coordinatorDecisionDate &&
              coordinatorDecisionDate >= monthStart &&
              coordinatorDecisionDate < monthEnd) ||
            (s.supervisorApprovedBy === userProfile.uid &&
              supervisorDecisionDate &&
              supervisorDecisionDate >= monthStart &&
              supervisorDecisionDate < monthEnd) ||
            (effectiveStatus === "approved_by_manager" &&
              managerDecisionDate &&
              managerDecisionDate >= monthStart &&
              managerDecisionDate < monthEnd);

          if (hasApprovedThisMonth) acc.approved++;

          const rejectedDate =
            s.rejectedAt?.toDate?.() ||
            (typeof s.rejectedAt === "string" ? new Date(s.rejectedAt) : null);
          const hasRejectedThisMonth =
            s.rejectedBy === userProfile.uid &&
            rejectedDate &&
            rejectedDate >= monthStart &&
            rejectedDate < monthEnd;

          if (hasRejectedThisMonth) acc.rejected++;
        }

        return acc;
      },
      {
        pendingHrd: 0,
        pendingManager: 0,
        approved: 0,
        rejected: 0,
        total: 0,
        pending: 0,
        revision: 0,
      },
    );
  }, [submissions, userProfile]);

  useEffect(() => {
    if (mode !== "hrd" || !userProfile) return;
    console.log("[HRD_OVERTIME_FILTER_DEBUG]", {
      currentUserUid: userProfile.uid,
      selectedBrandId: brandFilter,
      selectedDivisionId: divisionFilter,
      selectedManagerUid: managerFilter,
      selectedStatus: statusFilter,
      monthFilterMode,
      selectedMonth,
      allowedBrandIds: (hrdScope as any)?.allowedBrandIds || [],
      totalFetched: submissions?.length || 0,
      pendingHrdCount: pendingHrdItems.length,
      visibleCount: filteredSubmissions.length,
      divisionOptions,
      managerOptions,
      items: (submissions || []).map((item) => ({
        ...(() => {
          const resolvedDivision = getResolvedEmployeeDivision(item, employeeMap);
          return {
            resolvedDivisionId: resolvedDivision.divisionId,
            resolvedDivisionName: resolvedDivision.divisionName,
            snapshotDivisionName: resolvedDivision.snapshotDivisionName,
            resolvedManagerName: getResolvedManagerName(item, employeeMap),
          };
        })(),
        id: item.id,
        employeeName: item.employeeName,
        brandId: item.brandId,
        brandName: item.brandName,
        divisionId: item.divisionId,
        divisionName: item.divisionName,
        status: item.status,
        approvalStatus: (item as any).approvalStatus,
        currentApprovalStep: (item as any).currentApprovalStep,
        currentApproverUid: (item as any).currentApproverUid,
        managerUid: item.managerUid,
        managerName: (item as any).managerName || item.directSupervisorName,
        managerReviewedBy: (item as any).managerReviewedBy,
        overtimeDateStr: (item as any).overtimeDateStr,
        overtimeMonthKey: (item as any).overtimeMonthKey,
      })),
    });
  }, [
    brandFilter,
    divisionFilter,
    divisionOptions,
    employeeMap,
    filteredSubmissions,
    hrdScope,
    managerFilter,
    managerOptions,
    mode,
    monthFilterMode,
    pendingHrdItems,
    selectedMonth,
    statusFilter,
    submissions,
    userProfile,
  ]);

  useEffect(() => {
    if (mode !== "hrd" || !userProfile) return;
    console.log("[HRD_DIVISION_OPTIONS_DEBUG]", {
      selectedBrandId: brandFilter,
      allowedBrandIds,
      effectiveBrandIds: effectiveDivisionBrandIds,
      allDivisionsCount: masterDivisions.length,
      allEmployeesCount: masterEmployees.length,
      overtimeSubmissionsCount: submissions?.length || 0,
      divisionOptions,
      rawDivisionNames: {
        fromMaster: masterDivisions.map((division) => ({
          id: division.id,
          name: division.name || division.divisionName || division.divisi,
          brandId:
            division.brandId || division.companyId || division.parentBrandId,
          type: division.type || division.nodeType,
        })),
        fromEmployees: masterEmployees.map((employee) => ({
          uid: employee.uid,
          name: employee.fullName || employee.name,
          divisionName:
            employee.divisionName ||
            employee.hrdEmploymentInfo?.divisionName ||
            employee.hrdEmploymentInfo?.divisi,
          brandId:
            employee.brandId ||
            employee.companyId ||
            employee.hrdEmploymentInfo?.brandId,
        })),
        fromSubmissions: (submissions || []).map((submission) => ({
          id: submission.id,
          employeeName: submission.employeeName,
          divisionName: submission.divisionName || submission.division,
          brandId: submission.brandId,
        })),
      },
    });
    console.log("[HRD_DIVISION_FILTER_DEBUG]", {
      selectedBrandId: brandFilter,
      selectedDivisionValue: divisionFilter,
      allowedBrandIds,
      divisionOptions,
      allBrands: (allBrands || []).map((brand) => ({
        id: brand.id || (brand as any).brandId,
        name: brand.name || (brand as any).brandName,
      })),
      rawMasterDivisions: masterDivisions.map((division) => ({
        id: division.id || division.divisionId,
        name: division.name || division.divisionName || division.divisi,
        brandId:
          division.brandId ||
          division.companyId ||
          division.parentBrandId ||
          division.parentId ||
          division.brand?.id,
        type: division.type || division.nodeType,
      })),
      employeeDivisionSamples: masterEmployees.map((employee) => ({
        uid: employee.uid,
        name: employee.fullName || employee.name,
        brandId:
          employee.brandId ||
          employee.companyId ||
          employee.hrdEmploymentInfo?.brandId,
        divisionId:
          employee.divisionId || employee.hrdEmploymentInfo?.divisionId,
        divisionName:
          employee.divisionName ||
          employee.hrdEmploymentInfo?.divisionName ||
          employee.hrdEmploymentInfo?.divisi,
      })),
      submissionDivisionSamples: (submissions || []).map((submission) => ({
        id: submission.id,
        employeeName: submission.employeeName,
        brandId: submission.brandId,
        divisionId: submission.divisionId,
        divisionName: submission.divisionName || submission.division,
      })),
    });
  }, [
    allowedBrandIds,
    allBrands,
    brandFilter,
    divisionOptions,
    effectiveDivisionBrandIds,
    masterDivisions,
    masterEmployees,
    mode,
    submissions,
    userProfile,
  ]);

  // Union of roles across the data currently shown (filteredSubmissions) —
  // e.g. Daniel is both the real atasan AND the coordinator on Lutfi's
  // submission, so this picks up BOTH roles instead of only whichever field
  // happened to be checked first (see getCurrentUserOvertimeRoles).
  const currentUserRoles = useMemo(() => {
    if (!filteredSubmissions.length || !userProfile) return [];
    const seen = new Map<string, { key: "direct_supervisor" | "task_assigner" }>();
    for (const s of filteredSubmissions) {
      for (const role of getCurrentUserOvertimeRoles(s, userProfile.uid)) {
        if (!seen.has(role.key)) seen.set(role.key, { key: role.key });
      }
    }
    return Array.from(seen.values());
  }, [filteredSubmissions, userProfile]);

  const organizationTitle = useMemo(() => {
    if (!userProfile) return "—";
    const lookup = [
      userProfile.jobTitle,
      (userProfile as any).jabatan,
      (userProfile as any).position,
      (userProfile as any).structuralPositionLabel,
      userProfile.workRole,
      (userProfile as any).title,
      (userProfile as any).roleDisplayName,
      (userProfile as any).organizationRoleName,
    ];

    const value = lookup.find(
      (item) => typeof item === "string" && item.trim() !== "",
    ) as string | undefined;

    return value || userProfile.positionTitle || "—";
  }, [userProfile]);

  // Was hardcoded per-tab regardless of the user's actual role on the data
  // shown — Daniel landing on "Menunggu Validasi Saya" (tab key
  // "pending_coordinator", a legacy name that now also covers the current
  // flow) always saw "Koordinator / Pengawas Lembur" even when he's also
  // the real atasan for every submission on that tab. Now derived from
  // currentUserRoles instead of the tab key.
  const dynamicRoleLabel = useMemo(
    () => getReviewerScopeLabel(currentUserRoles as any),
    [currentUserRoles],
  );

  const isUserTurn = (s: OvertimeSubmission) => {
    if (!userProfile) return false;
    const status = s.status || (s as any).approvalStatus || "draft";

    if (mode === "hrd") {
      return [
        "pending_hrd_review",
        "pending_hrd",
        "approved_by_manager",
        "revision_hrd",
        "revision_requested_by_hrd",
        "verified_manager",
      ].includes(status);
    }

    if (mode === "manager") {
      return (
        MANAGER_ACTIONABLE_STATUSES.includes(status) &&
        canCurrentUserApproveOvertime(s, userProfile.uid)
      );
    }

    return false;
  };

  if (mode === "hrd" && !isScopeConfigured) {
    return <HrdScopeEmptyState message={emptyStateMessage} />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {mode === "hrd" ? (
          <>
            <HrdKpiCard
              label="Menunggu Review HRD"
              value={pendingHrdItems.length}
              subtitle="Butuh keputusan"
              tone="teal"
              icon={<Clock3 className="h-5 w-5" />}
            />
            <HrdKpiCard
              label="Dalam Review Manager"
              value={kpis.pendingManager}
              subtitle="Menunggu validasi atasan"
              tone="amber"
              icon={<UserCheck className="h-5 w-5" />}
            />
            <HrdKpiCard
              label="Disetujui Bulan Ini"
              value={kpis.approved}
              subtitle="Final HRD"
              tone="emerald"
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
            <HrdKpiCard
              label="Ditolak Bulan Ini"
              value={kpis.rejected}
              subtitle="Keputusan ditolak"
              tone="red"
              icon={<XCircle className="h-5 w-5" />}
            />
            <HrdKpiCard
              label="Total Lembur Bulan Ini"
              value={kpis.total}
              subtitle="Akumulasi pengajuan"
              tone="blue"
              icon={<Timer className="h-5 w-5" />}
            />
          </>
        ) : (
          <>
            <KpiCard title="Menunggu Persetujuan Anda" value={kpis.pending} />
            <KpiCard title="Disetujui Bulan Ini" value={kpis.approved} />
            <KpiCard
              title="Ditolak Bulan Ini"
              value={kpis.rejected}
              deltaType="inverse"
            />
          </>
        )}
      </div>

      {isPendingForMeTab && monthFilterMode !== "all" && (
        <p className="text-xs text-muted-foreground">
          KPI di atas tetap menghitung semua pending lintas bulan — menampilkan sebagian data di tabel berdasarkan filter bulan yang dipilih.
        </p>
      )}

      <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="space-y-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-bold tracking-tight text-slate-950">
                {mode === "hrd" ? "Approval Workspace Lembur" : "Persetujuan Lembur Tim"}
              </CardTitle>
              <CardDescription>
                {mode === "manager"
                  ? "Tinjau dan setujui pengajuan lembur staff Anda sebagai Koordinator atau Manager Divisi."
                  : "Prioritaskan, tinjau, dan putuskan pengajuan lembur dalam satu workspace HRD."}
              </CardDescription>
            </div>
            <div className="w-full">
              {mode === "hrd" ? (
                <Tabs
                  value={activeTab}
                  onValueChange={(value) => setPersistedActiveTab(value as any)}
                >
                  <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 sm:grid-cols-3 xl:grid-cols-6">
                    <TabsTrigger className="rounded-xl py-2.5 text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm" value="pending_hrd">Menunggu HRD</TabsTrigger>
                    <TabsTrigger className="rounded-xl py-2.5 text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm" value="pending_supervisor">
                      Dalam Review Manager
                    </TabsTrigger>
                    <TabsTrigger className="rounded-xl py-2.5 text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm" value="approved">Disetujui</TabsTrigger>
                    <TabsTrigger className="rounded-xl py-2.5 text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm" value="rejected">Ditolak</TabsTrigger>
                    <TabsTrigger className="rounded-xl py-2.5 text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm" value="rekap_payroll">
                      Rekap Payroll
                    </TabsTrigger>
                    <TabsTrigger className="rounded-xl py-2.5 text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm" value="all">Semua Riwayat</TabsTrigger>
                  </TabsList>
                </Tabs>
              ) : (
                <Tabs
                  value={activeTab}
                  onValueChange={(value) => setPersistedActiveTab(value as any)}
                >
                  <TabsList className="grid w-full grid-cols-4 gap-1">
                    <TabsTrigger value="pending_coordinator">
                      Menunggu Validasi Saya
                    </TabsTrigger>
                    <TabsTrigger value="pending_supervisor">
                      Sebagai Manager Divisi
                    </TabsTrigger>
                    <TabsTrigger value="riwayat_saya">
                      Riwayat Keputusan Saya
                    </TabsTrigger>
                    <TabsTrigger value="all">Semua Pengajuan</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </div>
          </div>

          {mode === "manager" && userProfile ? (
            <div className="rounded-2xl border border-teal-200/60 bg-teal-50/40 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-600">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Scope Persetujuan Anda
                  </p>
                  <p className="text-xs text-slate-500">
                    Sebagai {dynamicRoleLabel}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">
                    Brand
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-800">
                    {userProfile.brandName || userProfile.brandId || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">
                    Divisi
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-800">
                    {userProfile.divisionName || userProfile.division || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">
                    Jabatan Organisasi
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-800">
                    {organizationTitle}
                  </p>
                </div>
                <div className="rounded-xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">
                    Fungsi Approval Saat Ini
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-teal-700">
                    {dynamicRoleLabel}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {mode === "hrd" && (
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Cari karyawan, NIK, divisi, manager, pekerjaan..."
                  value={searchTerm}
                  onChange={(event) => setPersistedSearchTerm(event.target.value)}
                  className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pl-10 focus:bg-white"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={resetHrdFilters}
                disabled={!hasActiveHrdFilters}
                className="h-11 rounded-xl border-slate-200 px-4"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset Filter
              </Button>
            </div>
          )}

          <div
            className={`grid items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ${
              mode === "hrd"
                ? "md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
                : "lg:grid-cols-[1fr_1.8fr]"
            }`}
          >
            {mode === "hrd" && (
              <>
                <Select
                  value={brandFilter}
                  onValueChange={(val) => setPersistedBrandFilter(val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Semua Brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Brand</SelectItem>
                    {brandOptions.map((brand) => (
                      <SelectItem key={brand.value} value={brand.value}>
                        {brand.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={divisionFilter}
                  onValueChange={(val) => setPersistedDivisionFilter(val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Semua Divisi" />
                  </SelectTrigger>
                  <SelectContent>
                    {divisionOptions.map((division) => (
                      <SelectItem key={division.id} value={division.id}>
                        {division.name}
                        {brandFilter === "all" && division.brandId
                          ? ` — ${brandNameById.get(division.brandId) || division.brandId}`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={managerFilter}
                  onValueChange={(val) => setPersistedManagerFilter(val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Manager Divisi" />
                  </SelectTrigger>
                  <SelectContent>
                    {managerOptions.map((manager) => (
                      <SelectItem key={manager.uid} value={manager.uid}>
                        {manager.name}
                        {manager.position ? ` — ${manager.position}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {mode === "hrd" && (
              <Select
                value={statusFilter}
                onValueChange={(val) => setPersistedStatusFilter(val as any)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="pending_hrd">Menunggu HRD</SelectItem>
                  <SelectItem value="pending_supervisor">
                    Dalam Review Manager Divisi
                  </SelectItem>
                  <SelectItem value="approved">Disetujui</SelectItem>
                  <SelectItem value="approved_hrd">Disetujui HRD</SelectItem>
                  <SelectItem value="rejected_manager">
                    Ditolak Manager Divisi
                  </SelectItem>
                  <SelectItem value="rejected_hrd">Ditolak HRD</SelectItem>
                  <SelectItem value="revision_manager">
                    Revisi Manager Divisi
                  </SelectItem>
                  <SelectItem value="revision_hrd">Revisi HRD</SelectItem>
                </SelectContent>
              </Select>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant={monthFilterMode === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPersistedMonthFilterMode("all")}
                >
                  Semua Bulan
                </Button>
                <Button
                  type="button"
                  variant={monthFilterMode === "current" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPersistedMonthFilterMode("current")}
                >
                  Bulan Ini
                </Button>
                <Button
                  type="button"
                  variant={monthFilterMode === "custom" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPersistedMonthFilterMode("custom")}
                >
                  Pilih Bulan
                </Button>
                {monthFilterMode === "custom" && (
                  <Input
                    type="month"
                    value={selectedMonth}
                    onChange={(event) => setPersistedSelectedMonth(event.target.value)}
                    className="w-auto"
                  />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {monthFilterMode === "all" &&
                  (isPendingForMeTab
                    ? "Menampilkan semua pengajuan pending agar tidak ada approval yang terlewat."
                    : "Menampilkan semua bulan.")}
                {monthFilterMode === "current" && "Menampilkan pengajuan bulan berjalan."}
                {monthFilterMode === "custom" &&
                  `Menampilkan pengajuan sesuai bulan yang dipilih (${formatMonthKeyLabel(selectedMonth)}).`}
              </p>
            </div>
            <div className={mode === "hrd" ? "hidden" : "relative w-full"}>
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={
                  mode === "hrd"
                    ? "Cari karyawan, NIK, divisi, manager, pekerjaan..."
                    : "Cari nama staff..."
                }
                value={searchTerm}
                onChange={(e) => setPersistedSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {mode === "hrd" && hasActiveHrdFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Filter aktif:</span>
              {brandFilter !== "all" && (
                <Badge variant="secondary" className="gap-1 rounded-full bg-blue-50 text-blue-700">
                  Brand: {selectedBrandLabel || brandFilter}
                  <button type="button" onClick={() => setPersistedBrandFilter("all")} aria-label="Hapus filter brand">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {divisionFilter !== "all" && selectedDivisionOption && (
                <Badge variant="secondary" className="gap-1 rounded-full bg-teal-50 text-teal-700">
                  Divisi: {selectedDivisionOption.name}
                  <button type="button" onClick={() => setPersistedDivisionFilter("all")} aria-label="Hapus filter divisi">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {managerFilter !== "all" && (
                <Badge variant="secondary" className="gap-1 rounded-full bg-violet-50 text-violet-700">
                  Manager: {selectedManagerLabel || managerFilter}
                  <button type="button" onClick={() => setPersistedManagerFilter("all")} aria-label="Hapus filter manager">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {statusFilter !== "all" && (
                <Badge variant="secondary" className="gap-1 rounded-full bg-amber-50 text-amber-700">
                  Status: {statusFilterLabels[statusFilter] || statusFilter}
                  <button type="button" onClick={() => setPersistedStatusFilter("all")} aria-label="Hapus filter status">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {monthFilterMode !== "all" && (
                <Badge variant="secondary" className="gap-1 rounded-full bg-indigo-50 text-indigo-700">
                  Bulan: {monthFilterMode === "current" ? "Bulan Ini" : formatMonthKeyLabel(selectedMonth)}
                  <button type="button" onClick={() => setPersistedMonthFilterMode("all")} aria-label="Hapus filter bulan">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {searchTerm.trim() && (
                <Badge variant="secondary" className="gap-1 rounded-full">
                  Pencarian: {searchTerm}
                  <button type="button" onClick={() => setPersistedSearchTerm("")} aria-label="Hapus pencarian">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}

          {mode === "hrd" && activeTab === "pending_hrd" && hasActiveHrdFilters && (
            <p className="text-xs text-slate-500">
              {pendingHrdItems.length} data menunggu HRD tersedia, {filteredSubmissions.length} tampil setelah filter.
            </p>
          )}

          {mode === "hrd" && activeTab === "pending_supervisor" && (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
              <AlertTitle>Menunggu Manager Divisi</AlertTitle>
              <AlertDescription>
                Belum masuk antrean HRD karena belum disetujui Manager Divisi.
              </AlertDescription>
            </Alert>
          )}

          {activeTab === "all" && crossMonthPendingInAllTab.length > 0 && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>
                Pengajuan Tertunda / Butuh Tindakan ({crossMonthPendingInAllTab.length})
              </AlertTitle>
              <AlertDescription>
                <p className="mb-2">
                  Masih pending dari bulan lain — tidak masuk hitungan {formatMonthKeyLabel(getSelectedMonthKey(monthFilterMode, selectedMonth, currentMonthKey))} di bawah, tapi tetap butuh tindakan.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {crossMonthPendingInAllTab.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedSubmission(item)}
                      className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                    >
                      {item.employeeName || item.fullName} · {formatMonthKeyLabel(getOvertimeMonthKey(item))}
                    </button>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              Memuat daftar pengajuan...
            </div>
          ) : activeTab === "rekap_payroll" ? (
            payrollRecapGrouped.length > 0 ? (
              <div className="space-y-4">
                {/* Rekap Payroll Header Card */}
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-teal-200/70 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 border border-teal-200/60">
                      <span className="text-base">📊</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                        Rekapitulasi Lembur Bulanan
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Total akumulasi jam lembur yang disetujui (siap payroll)
                        untuk periode{" "}
                        {(() => {
                          const key = getSelectedMonthKey(monthFilterMode, selectedMonth, currentMonthKey);
                          return key ? formatMonthKeyLabel(key) : "semua bulan";
                        })()}.
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-teal-50 border border-teal-200 text-teal-700 font-bold px-3 py-1 text-xs">
                    {payrollRecapGrouped.length} Karyawan Terdaftar
                  </Badge>
                </div>

                {/* Main Payroll Table */}
                <div className="min-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow className="border-slate-200 hover:bg-slate-50">
                        <TableHead className="px-6 py-4 text-left text-xs uppercase font-bold text-slate-500 w-10"></TableHead>
                        <TableHead className="px-3 py-4 text-left text-xs uppercase font-bold text-slate-500">
                          Nama Karyawan
                        </TableHead>
                        <TableHead className="px-3 py-4 text-left text-xs uppercase font-bold text-slate-500">
                          Brand / Divisi
                        </TableHead>
                        <TableHead className="px-3 py-4 text-center text-xs uppercase font-bold text-slate-500 w-32">
                          Frekuensi Lembur
                        </TableHead>
                        <TableHead className="px-3 py-4 text-right text-xs uppercase font-bold text-teal-600 w-48">
                          Total Durasi Payroll
                        </TableHead>
                        <TableHead className="px-6 py-4 text-right text-xs uppercase font-bold text-slate-500 w-32">
                          Aksi
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payrollRecapGrouped.map((g) => {
                        const isExpanded = expandedEmployeeId === g.employeeUid;
                        const totalHours = Math.floor(g.totalMinutes / 60);
                        const totalMins = g.totalMinutes % 60;
                        const durationLabel =
                          totalHours > 0
                            ? `${totalHours} jam ${totalMins} menit`
                            : `${totalMins} menit`;

                        return (
                          <Fragment key={g.employeeUid}>
                            <TableRow
                              className="border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer group"
                              onClick={() =>
                                setExpandedEmployeeId(
                                  isExpanded ? null : g.employeeUid,
                                )
                              }
                            >
                              <TableCell className="px-6 py-4 text-center">
                                <span className="text-slate-400 font-mono text-xs group-hover:text-teal-500 transition-colors">
                                  {isExpanded ? "▼" : "▶"}
                                </span>
                              </TableCell>
                              <TableCell className="px-3 py-4 font-semibold text-sm text-slate-900">
                                {g.employeeName}
                              </TableCell>
                              <TableCell className="px-3 py-4 text-sm text-slate-500">
                                {g.brandName} / {g.divisionName}
                              </TableCell>
                              <TableCell className="px-3 py-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <Badge
                                    variant="outline"
                                    className="bg-slate-50 border-slate-200 text-slate-600 font-bold px-2 py-0.5"
                                  >
                                    {g.count}x Kerja
                                  </Badge>
                                  {g.hasOverLimit && (
                                    <Badge
                                      variant="outline"
                                      className="bg-amber-50 border-amber-200 text-amber-700 font-semibold px-2 py-0.5 text-[10px] flex items-center gap-1"
                                    >
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                      Ada Durasi Tinggi
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="px-3 py-4 text-right font-black text-sm text-teal-600">
                                {durationLabel}
                              </TableCell>
                              <TableCell
                                className="px-6 py-4 text-right"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 border-slate-200 text-slate-600 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl text-xs transition-colors"
                                  onClick={() =>
                                    setExpandedEmployeeId(
                                      isExpanded ? null : g.employeeUid,
                                    )
                                  }
                                >
                                  {isExpanded ? "Tutup" : "Rincian"}
                                </Button>
                              </TableCell>
                            </TableRow>

                            {isExpanded && (
                              <TableRow
                                key={`${g.employeeUid}-details`}
                                className="bg-teal-50/30 border-teal-100 hover:bg-teal-50/30"
                              >
                                <TableCell colSpan={6} className="px-8 py-4">
                                  <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
                                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                                      <span>📋</span> Rincian Lembur Disetujui
                                    </h5>
                                    <Table>
                                      <TableHeader className="bg-slate-50">
                                        <TableRow className="border-slate-200">
                                          <TableHead className="py-2 text-xs font-semibold text-slate-500">
                                            Tanggal
                                          </TableHead>
                                          <TableHead className="py-2 text-xs font-semibold text-slate-500">
                                            Jam Kerja
                                          </TableHead>
                                          <TableHead className="py-2 text-xs font-semibold text-slate-500">
                                            Lokasi
                                          </TableHead>
                                          <TableHead className="py-2 text-xs font-semibold text-slate-500">
                                            Pekerjaan
                                          </TableHead>
                                          <TableHead className="py-2 text-xs font-semibold text-slate-500 text-right">
                                            Diajukan
                                          </TableHead>
                                          <TableHead className="py-2 text-xs font-semibold text-teal-600 text-right">
                                            Disetujui Payroll
                                          </TableHead>
                                          <TableHead className="py-2 text-xs font-semibold text-amber-600 text-right">
                                            Kelebihan &gt;4 Jam
                                          </TableHead>
                                          <TableHead className="py-2 text-xs font-semibold text-slate-500 text-right">
                                            Aksi
                                          </TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {g.items.map((item) => {
                                          const ovDate = getOvertimeDate(item);
                                          const itemMinutes =
                                            item.approvedMinutesFinal !==
                                              undefined &&
                                            item.approvedMinutesFinal !== null
                                              ? item.approvedMinutesFinal
                                              : item.totalDurationMinutes || 0;

                                          const itemHours = Math.floor(
                                            itemMinutes / 60,
                                          );
                                          const itemMins = itemMinutes % 60;
                                          const itemDurationLabel =
                                            itemHours > 0
                                              ? `${itemHours} jam ${itemMins} menit`
                                              : `${itemMins} menit`;

                                          const taskDesc =
                                            (item.taskDetails &&
                                              item.taskDetails[0]
                                                ?.description) ||
                                            (item.tasks &&
                                              item.tasks[0]?.description) ||
                                            item.reason ||
                                            "-";

                                          return (
                                            <TableRow
                                              key={item.id}
                                              className="border-slate-100 hover:bg-slate-50/60"
                                            >
                                              <TableCell className="py-2 text-xs text-slate-700">
                                                {ovDate
                                                  ? format(
                                                      ovDate,
                                                      "dd MMMM yyyy",
                                                      { locale: idLocale },
                                                    )
                                                  : "-"}
                                              </TableCell>
                                              <TableCell className="py-2 text-xs text-slate-500 font-mono">
                                                {item.startTime} -{" "}
                                                {item.endTime}
                                              </TableCell>
                                              <TableCell className="py-2 text-xs text-slate-700">
                                                {getWorkLocationDisplay(item)}
                                              </TableCell>
                                              <TableCell
                                                className="py-2 text-xs text-slate-500 truncate max-w-[200px]"
                                                title={taskDesc}
                                              >
                                                {taskDesc}
                                              </TableCell>
                                              <TableCell className="py-2 text-xs text-slate-500 text-right">
                                                {item.totalDurationMinutes
                                                  ? `${Math.floor(item.totalDurationMinutes / 60)}j ${item.totalDurationMinutes % 60}m`
                                                  : "-"}
                                              </TableCell>
                                              <TableCell className="py-2 text-xs font-bold text-teal-600 text-right">
                                                {itemDurationLabel}
                                              </TableCell>
                                              <TableCell className="py-2 text-xs text-right">
                                                {item.isOverDailyLimit && item.overtimeExcessMinutes ? (
                                                  <div className="flex items-center justify-end gap-1">
                                                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                                                    <span className="font-semibold text-amber-600">
                                                      +{Math.floor((item.overtimeExcessMinutes || 0) / 60)}j {(item.overtimeExcessMinutes || 0) % 60}m
                                                    </span>
                                                  </div>
                                                ) : (
                                                  <span className="text-slate-300">—</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="py-2 text-xs text-right">
                                                <Button
                                                  variant="link"
                                                  size="sm"
                                                  className="h-auto p-0 text-teal-600 hover:text-teal-700 font-semibold"
                                                  onClick={() =>
                                                    setSelectedSubmission(item)
                                                  }
                                                >
                                                  Lihat Dialog
                                                </Button>
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-64 items-center justify-center text-center p-8 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                  <Search className="h-6 w-6 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700">
                  Tidak ada rekap payroll ditemukan.
                </h3>
                <p className="text-sm text-slate-500 mt-2 max-w-xs">
                  Coba ubah periode atau filter pencarian untuk melihat data
                  payroll disetujui lainnya.
                </p>
              </div>
            )
          ) : sortedSubmissions.length > 0 ? (
            <div className="min-w-full">
              <div className="overflow-x-auto bg-white">
              <Table className={mode === "hrd" ? "min-w-[1120px]" : undefined}>
                <TableHeader className="sticky top-0 z-10 bg-slate-50">
                  <TableRow className="border-slate-200 hover:bg-slate-50">
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      {mode === "hrd" ? "Karyawan" : "Staff"}
                    </TableHead>
                    {mode === "hrd" ? (
                      <>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Brand / Divisi
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Manager
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Tanggal & Jam
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Durasi
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Status
                        </TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Tanggal & Jam Lembur
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Durasi
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Lokasi
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Ringkasan Pekerjaan
                        </TableHead>
                        <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          Status
                        </TableHead>
                      </>
                    )}
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">
                      Aksi
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSubmissions.map((s) => {
                    const effectiveStatus = getEffectiveStatus(s) as any;
                    const overtimeDate = getOvertimeDate(s);
                    const resolvedDivision = getResolvedEmployeeDivision(s, employeeMap);
                    const resolvedManagerName = getResolvedManagerName(s, employeeMap);
                    const submissionMonthKey = getOvertimeMonthKey(s);
                    const isOverdueMonth =
                      isOvertimeStillOpen(s) &&
                      !!submissionMonthKey &&
                      submissionMonthKey < currentMonthKey;
                    const summaryTask =
                      (s.taskDetails && s.taskDetails[0]?.description) ||
                      (s.tasks && s.tasks[0]?.description) ||
                      s.reason ||
                      "-";
                    const isTurn = isUserTurn(s);
                    const actionLabel = isTurn ? "Review" : "Detail";
                    const durationMinutes = getSubmissionDurationMinutes(s);
                    const isAfterManagerApproval = isOvertimeAfterManagerApproval(s);
                    const employeeName = s.employeeName || s.fullName || "Karyawan";
                    const employeeInitials = employeeName
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0]?.toUpperCase())
                      .join("") || "K";

                    const dailyTotal = getDailyTotal(s);
                    const isOverLimit = dailyTotal > DAILY_LIMIT_MINUTES;
                    const anomalyLabels = getOvertimeAnomalyLabels(
                      {
                        ...s,
                        anomalyFlags: [
                          ...(s.anomalyFlags || []),
                          ...(isOverLimit ? ["duration_high"] : []),
                        ],
                      },
                      userProfile?.uid,
                    );
                    const displayAnomalyLabels = Array.from(
                      new Set([
                        ...anomalyLabels.map(getHrdIndicatorLabel),
                        ...((s as any).overtimeType === "hari_libur" ? ["Hari Libur"] : []),
                        ...((s as any).isCrossDay ? ["Lintas Hari"] : []),
                      ]),
                    );
                    const rowPriorityClass = isPendingHrdReview(s)
                      ? "border-l-4 border-l-teal-500 bg-teal-50/20 hover:bg-teal-50/60"
                      : String(effectiveStatus).includes("rejected")
                        ? "border-l-4 border-l-red-400 hover:bg-red-50/50"
                        : String(effectiveStatus).includes("approved")
                          ? "border-l-4 border-l-emerald-400 hover:bg-emerald-50/40"
                          : "border-l-4 border-l-transparent hover:bg-slate-50";

                    return (
                      <TableRow
                        key={s.id}
                        className={`cursor-pointer border-b border-slate-100 transition-colors last:border-b-0 ${
                          mode === "hrd" ? rowPriorityClass : "hover:bg-muted"
                        }`}
                        onClick={() => setSelectedSubmission(s)}
                      >
                        <TableCell className="px-3 py-3 align-top">
                          <div className="flex min-w-[190px] items-start gap-2.5">
                            {mode === "hrd" && (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700 ring-1 ring-teal-100">
                                {employeeInitials}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold text-slate-900">
                                {employeeName}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {s.workRole || s.positionTitle || (s as any).position || "-"}
                              </div>
                              {mode === "hrd" && s.employeeCode && (
                                <div className="mt-1 text-[11px] font-medium text-slate-400">
                                  NIK: {s.employeeCode}
                                </div>
                              )}
                            </div>
                          </div>
                          {mode === "manager" ? (() => {
                            const rowRoles = getCurrentUserOvertimeRoles(s, userProfile?.uid);
                            if (rowRoles.length === 0) return null;
                            return (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Badge
                                  variant="secondary"
                                  className="px-2 py-1 text-[11px] font-semibold"
                                >
                                  {getReviewerRoleDisplayLabel(rowRoles)}
                                </Badge>
                              </div>
                            );
                          })() : null}
                        </TableCell>
                        {mode === "hrd" ? (
                          <>
                            <TableCell className="px-3 py-3 align-top">
                              <div className="text-sm font-semibold text-slate-800">{s.brandName || "-"}</div>
                              <div className="mt-0.5 text-sm text-teal-700">{resolvedDivision.divisionName}</div>
                              {resolvedDivision.snapshotDivisionName &&
                                resolvedDivision.snapshotDivisionName.trim().toLowerCase() !==
                                  resolvedDivision.divisionName.trim().toLowerCase() && (
                                  <div className="mt-1 text-[10px] text-slate-400">
                                    Saat pengajuan: {resolvedDivision.snapshotDivisionName}
                                  </div>
                                )}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              <div className="text-sm font-semibold text-slate-800">{resolvedManagerName || "-"}</div>
                              <div className="mt-0.5 text-xs text-slate-500">Manager Divisi / Atasan Langsung</div>
                              {isAfterManagerApproval && (
                                <Badge variant="outline" className="mt-1.5 border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                                  <CheckCircle2 className="mr-1 h-3 w-3" /> Disetujui Manager
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              <div className="text-sm font-semibold text-slate-800 truncate">
                                {overtimeDate
                                  ? format(overtimeDate, "dd MMM yyyy", {
                                      locale: idLocale,
                                    })
                                  : "-"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {s.startTime || "-"} - {s.endTime || "-"}
                              </div>
                              {(s as any).isCrossDay && (
                                <Badge variant="outline" className="mt-1.5 border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700">
                                  Lintas Hari
                                </Badge>
                              )}
                              {isOverdueMonth && (
                                <Badge variant="outline" className="mt-1.5 border-amber-300 bg-amber-50 text-amber-700 text-[10px] px-1.5 py-0.5">
                                  Tertunda dari {formatMonthKeyLabel(submissionMonthKey)}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              <div className="text-sm font-bold text-slate-900">
                                {formatDuration(durationMinutes)}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-500">{durationMinutes} menit</div>
                              {isOverLimit && (
                                <Badge variant="outline" className="mt-1.5 border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] text-orange-700">
                                  Durasi Melebihi Acuan
                                </Badge>
                              )}
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="px-3 py-3 align-top">
                              <div className="text-sm truncate">
                                {overtimeDate
                                  ? format(overtimeDate, "dd MMM yyyy", {
                                      locale: idLocale,
                                    })
                                  : "-"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {s.startTime} - {s.endTime}
                              </div>
                              {isOverdueMonth && (
                                <Badge variant="outline" className="mt-1.5 border-amber-300 bg-amber-50 text-amber-700 text-[10px] px-1.5 py-0.5">
                                  Tertunda dari {formatMonthKeyLabel(submissionMonthKey)}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              {s.totalDurationMinutes} menit
                              {s.approvedMinutesFinal !== undefined &&
                                s.approvedMinutesFinal !== null &&
                                s.approvedMinutesFinal !==
                                  s.totalDurationMinutes && (
                                  <div className="text-[10px] text-amber-500 font-medium mt-1">
                                    Durasi final HRD:{" "}
                                    {Math.floor(s.approvedMinutesFinal / 60)}{" "}
                                    jam {s.approvedMinutesFinal % 60}m, dari
                                    pengajuan{" "}
                                    {Math.floor(s.totalDurationMinutes / 60)}{" "}
                                    jam {s.totalDurationMinutes % 60}m
                                  </div>
                                )}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              {getWorkLocationDisplay(s)}
                            </TableCell>
                            <TableCell className="px-3 py-3 align-top">
                              <p className="text-sm truncate">{summaryTask}</p>
                            </TableCell>
                          </>
                        )}
                        <TableCell className="px-3 py-3 align-top">
                          <OvertimeApprovalStatusBadge
                            status={effectiveStatus}
                            mode={mode}
                            divisionName={resolvedDivision.divisionName}
                            payrollStatus={s.payrollStatus}
                            labelOverride={mode === "manager" ? getOvertimeMainStatusLabel(s) : undefined}
                          />
                          <div className="mt-1.5 flex max-h-11 max-w-[240px] flex-wrap gap-1 overflow-hidden">
                            {displayAnomalyLabels.map((label) => (
                              <span key={label} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold leading-tight text-amber-700">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                {label}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-3 align-top text-right">
                          <Button
                            variant={isTurn ? "default" : "outline"}
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedSubmission(s);
                            }}
                            className={
                              isTurn
                                ? "rounded-lg border-none bg-teal-600 text-white shadow-sm hover:bg-teal-700"
                                : "rounded-lg border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                            }
                          >
                            {isTurn ? (
                              <CheckCircle2 className="mr-1.5 h-4 w-4" />
                            ) : (
                              <Eye className="mr-1.5 h-4 w-4" />
                            )}
                            {actionLabel}
                          </Button>
                          {mode === "manager" &&
                            !isTurn &&
                            effectiveStatus === "pending_coordinator" &&
                            (s.directSupervisorUid === userProfile?.uid ||
                              s.managerUid === userProfile?.uid) && (
                              <div className="text-[10px] text-amber-500 font-medium mt-1 leading-tight max-w-[120px] ml-auto">
                                Menunggu persetujuan Koordinator terlebih
                                dahulu.
                              </div>
                            )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-64 items-center justify-center text-center p-8 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <Search className="h-6 w-6 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700">
                {mode === "hrd"
                  ? "Tidak ada pengajuan lembur ditemukan"
                  : mode === "manager" && activeTab === "perlu_diproses"
                  ? "Tidak ada pengajuan yang perlu Anda proses saat ini."
                  : "Tidak ada pengajuan ditemukan."}
              </h3>
              <p className="text-sm text-slate-500 mt-2 max-w-xs">
                {mode === "hrd" && hasActiveHrdFilters
                  ? "Coba ubah filter brand, divisi, status, manager, atau bulan."
                  : mode === "hrd" && activeTab === "pending_hrd"
                    ? "Belum ada pengajuan yang menunggu verifikasi HRD."
                    : mode === "manager" && activeTab === "perlu_diproses"
                  ? "Semua pengajuan staff Anda telah diproses atau belum ada pengajuan baru."
                  : "Coba ubah filter atau periode untuk melihat data lainnya."}
              </p>
              {mode === "hrd" && hasActiveHrdFilters && (
                <Button
                  variant="outline"
                  className="mt-5 rounded-xl"
                  onClick={resetHrdFilters}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset Filter
                </Button>
              )}
              {mode === "manager" && activeTab === "perlu_diproses" && (
                <Button
                  variant="outline"
                  className="mt-6 rounded-xl border-slate-200 text-slate-700 hover:border-teal-400 hover:text-teal-600"
                  onClick={() => setPersistedActiveTab("riwayat_saya")}
                >
                  Lihat Riwayat Saya
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedSubmission && (
        <ReviewOvertimeDialog
          open={!!selectedSubmission}
          onOpenChange={(open) => !open && setSelectedSubmission(null)}
          submission={selectedSubmission}
          onSuccess={() => {
            mutate();
            if (mode === "manager") {
              setPersistedActiveTab("riwayat_saya");
            }
          }}
          mode={mode}
          dailyTotalMinutes={getDailyTotal(selectedSubmission)}
          employeeMap={employeeMap}
        />
      )}
    </div>
  );
}
