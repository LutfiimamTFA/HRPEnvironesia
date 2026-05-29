"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore } from "@/firebase";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  ArrowLeft,
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Home,
  Navigation,
  Search,
  TrendingUp,
  Users,
  X,
  CheckSquare,
  MapPin,
  ExternalLink,
  Filter,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { BusinessTripMission, BusinessTripMissionMember, FinalReport, MemberFinalReport, MemberNote } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: any): string {
  try {
    if (!value) return "-";
    const date = value instanceof Timestamp ? value.toDate() : new Date(value);
    return format(date, "dd MMM yyyy", { locale: idLocale });
  } catch {
    return "-";
  }
}

function formatDateTime(value: any): string {
  try {
    if (!value) return "-";
    const date = value instanceof Timestamp ? value.toDate() : new Date(value);
    return format(date, "dd MMM yyyy, HH:mm", { locale: idLocale });
  } catch {
    return "-";
  }
}

function toSeconds(ts: any): number {
  if (!ts) return 0;
  if (ts instanceof Timestamp) return ts.seconds;
  if (typeof ts === "object" && ts?.seconds) return ts.seconds;
  try { return new Date(ts).getTime() / 1000; } catch { return 0; }
}

function toDate(ts: any): Date | null {
  if (!ts) return null;
  try {
    if (ts instanceof Timestamp) return ts.toDate();
    if (typeof ts === "object" && ts?.seconds) return new Date(ts.seconds * 1000);
    return new Date(ts);
  } catch { return null; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TrackingStats = {
  total: number;
  departed: number;
  arrived: number;
  activityDone: number;
  returned: number;
  issues: number;
  lastUpdateAt: any;
  lastUpdateByName: string;
  memberNames: string[];
};

type HrdDisplayStatus =
  | "draft_mission"
  | "pending_manager_validation"
  | "waiting_staff_confirmation"
  | "pending_hrd_finalization"
  | "approved_ready_to_depart"
  | "in_progress"
  | "at_location"
  | "activity_in_progress"
  | "activity_done"
  | "needs_attention"
  | "returned_pending_report"
  | "final_report_submitted"
  | "report_submitted"
  | "settlement_review"
  | "completed"
  | "rejected"
  | "cancelled";

type TimelineEntry = {
  id: string;
  message: string;
  category?: "tracking" | "approval" | "system";
  byUid?: string | null;
  byName?: string | null;
  createdAt: any;
};

// ── Status computation ─────────────────────────────────────────────────────────

function computeDisplayStatus(
  mission: BusinessTripMission,
  tracking: TrackingStats | undefined,
): HrdDisplayStatus {
  const stored = (mission.status ?? "draft_mission") as HrdDisplayStatus;

  // Terminal / approval-flow statuses — always use stored
  if (
    ["pending_manager_validation", "waiting_staff_confirmation",
     "pending_hrd_finalization", "draft_mission",
     "rejected", "cancelled"].includes(stored)
  ) return stored;

  if (["completed", "final_report_submitted", "settlement_review"].includes(stored)) return stored;
  if (stored === "report_submitted") return stored;

  if (!tracking || tracking.total === 0) return stored;

  if (tracking.issues > 0) return "needs_attention";
  if (tracking.returned >= tracking.total && tracking.total > 0) return "returned_pending_report";
  if (tracking.activityDone >= tracking.total && tracking.total > 0) return "activity_done";
  if (tracking.activityDone > 0) return "activity_in_progress";
  if (tracking.arrived >= tracking.total && tracking.total > 0) return "at_location";
  if (tracking.departed > 0) return "in_progress";
  if (stored === "approved_ready_to_depart") return "approved_ready_to_depart";

  return stored;
}

const STATUS_PRIORITY: Record<string, number> = {
  needs_attention: 0,
  activity_done: 1,
  activity_in_progress: 2,
  at_location: 3,
  in_progress: 4,
  approved_ready_to_depart: 5,
  returned_pending_report: 6,
  final_report_submitted: 7,
  report_submitted: 8,
  pending_hrd_finalization: 9,
  waiting_staff_confirmation: 9,
  pending_manager_validation: 10,
  draft_mission: 11,
  settlement_review: 12,
  completed: 13,
  rejected: 14,
  cancelled: 15,
};

// ── Status label + badge ───────────────────────────────────────────────────────

function statusLabel(s: string): string {
  const MAP: Record<string, string> = {
    draft_mission: "Draft",
    pending_manager_validation: "Menunggu Validasi Manager",
    waiting_staff_confirmation: "Menunggu Konfirmasi Staff",
    pending_hrd_finalization: "Menunggu Finalisasi HRD",
    approved_ready_to_depart: "Siap Berangkat",
    in_progress: "Sedang Berjalan",
    at_location: "Sudah Sampai Lokasi",
    activity_in_progress: "Kegiatan Berjalan",
    activity_done: "Kegiatan Selesai",
    needs_attention: "Butuh Perhatian",
    returned_pending_report: "Menunggu Laporan Akhir",
    final_report_submitted: "Laporan Akhir Terkirim",
    report_submitted: "Laporan Dikirim",
    settlement_review: "Review Penyelesaian",
    completed: "Selesai",
    rejected: "Ditolak",
    cancelled: "Dibatalkan",
    on_duty: "Sedang Bertugas",
  };
  return MAP[s] ?? s.replace(/_/g, " ");
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    needs_attention: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/40",
    in_progress: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/40",
    at_location: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/40",
    activity_in_progress: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/40",
    activity_done: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/40",
    approved_ready_to_depart: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800/40",
    returned_pending_report: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/40",
    final_report_submitted: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/40",
    report_submitted: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/40",
    settlement_review: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/40",
    completed: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/40",
    pending_hrd_finalization: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/40",
    pending_manager_validation: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800/40",
    waiting_staff_confirmation: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800/40",
    rejected: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/40",
    cancelled: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-800/40",
    draft_mission: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-800/40",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${variants[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {statusLabel(status)}
    </span>
  );
}

// ── Member trip status ─────────────────────────────────────────────────────────

function memberTripLabel(ts?: string): { label: string; color: string } {
  const MAP: Record<string, { label: string; color: string }> = {
    ready: { label: "Siap", color: "text-teal-600 dark:text-teal-400" },
    departed: { label: "Berangkat", color: "text-blue-600 dark:text-blue-400" },
    arrived: { label: "Sampai Lokasi", color: "text-blue-700 dark:text-blue-300" },
    activity_done: { label: "Kegiatan Selesai", color: "text-indigo-600 dark:text-indigo-400" },
    return_started: { label: "Dalam Perjalanan Pulang", color: "text-purple-600 dark:text-purple-400" },
    returned: { label: "Sudah Kembali", color: "text-green-600 dark:text-green-400" },
    issue_reported: { label: "Ada Kendala", color: "text-red-600 dark:text-red-400" },
  };
  return MAP[ts ?? ""] ?? { label: ts ? ts.replace(/_/g, " ") : "–", color: "text-muted-foreground" };
}

// ── Timeline category helpers ──────────────────────────────────────────────────

type HrdTimelineCategory = "tracking" | "approval" | "changes" | "issues" | "system";

function inferCategory(entry: TimelineEntry): HrdTimelineCategory {
  if (entry.category === "tracking") return "tracking";
  if (entry.category === "approval") return "approval";
  if ((entry.category as string) === "changes") return "changes";
  if ((entry.category as string) === "issues") return "issues";

  const msg = (entry.message ?? "").toLowerCase();

  // Issues first (specific)
  if (msg.includes("kendala") || msg.includes("melaporkan kendala")) return "issues";

  // Tracking journey
  if (
    msg.includes("berangkat") || msg.includes("sampai lokasi") || msg.includes("tiba") ||
    msg.includes("kegiatan selesai") || msg.includes("sudah kembali") ||
    msg.includes("mengonfirmasi keberangkatan") || msg.includes("mengonfirmasi tiba") ||
    msg.includes("mengonfirmasi kembali") || msg.includes("mengonfirmasi kegiatan")
  ) return "tracking";

  // Approval
  if (
    msg.includes("disetujui") || msg.includes("ditolak") || msg.includes("validasi") ||
    msg.includes("konfirmasi") || msg.includes("finalisasi") || msg.includes("menunggu") ||
    msg.includes("manager") || msg.includes("hrd") || msg.includes("direktur")
  ) return "approval";

  // Changes
  if (
    msg.includes("diubah") || msg.includes("diperbarui") || msg.includes("diupdate") ||
    msg.includes("tanggal") || msg.includes("tujuan") || msg.includes("anggota") ||
    msg.includes("dokumen") || msg.includes("instruksi") || msg.includes("spd") ||
    msg.includes("ditambahkan") || msg.includes("dihapus") || msg.includes("diganti")
  ) return "changes";

  return "system";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function HRDMonitoringClient() {
  const firestore = useFirestore();
  const { userProfile } = useAuth();

  // ── Data state ───────────────────────────────────────────────────────────
  const [missions, setMissions] = useState<BusinessTripMission[]>([]);
  const [isLoadingMissions, setIsLoadingMissions] = useState(true);
  const [memberTrackingMap, setMemberTrackingMap] = useState<Record<string, TrackingStats>>({});
  const [brandSet, setBrandSet] = useState<Set<string>>(new Set());

  // ── Detail state ─────────────────────────────────────────────────────────
  const [selectedMission, setSelectedMission] = useState<BusinessTripMission | null>(null);
  const [detailMembers, setDetailMembers] = useState<BusinessTripMissionMember[]>([]);
  const [detailTimeline, setDetailTimeline] = useState<TimelineEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [timelineTab, setTimelineTab] = useState<"all" | "tracking" | "approval" | "changes" | "issues">("tracking");
  const [detailFinalReport, setDetailFinalReport] = useState<FinalReport | null>(null);
  const [detailMemberReports, setDetailMemberReports] = useState<Record<string, MemberFinalReport>>({});
  const [detailMemberNotes, setDetailMemberNotes] = useState<Record<string, MemberNote>>({});
  const [isArchivingMission, setIsArchivingMission] = useState(false);

  // ── Filter / sort state ──────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "nearest" | "az" | "status">("newest");
  const [showFilters, setShowFilters] = useState(false);

  // ── Subscriptions ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!firestore) return;
    const q = query(collection(firestore, "business_trip_missions"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BusinessTripMission));
      setMissions(docs);
      setIsLoadingMissions(false);
      // Keep selectedMission in sync with latest Firestore data
      setSelectedMission((prev) => {
        if (!prev?.id) return prev;
        const updated = docs.find((d) => d.id === prev.id);
        return updated ?? prev;
      });
    });
    return unsub;
  }, [firestore]);

  useEffect(() => {
    if (!firestore) return;
    const q = collectionGroup(firestore, "members");
    const unsub = onSnapshot(q, (snap) => {
      const map: Record<string, TrackingStats> = {};
      const brands = new Set<string>();

      snap.docs.forEach((d) => {
        const data = d.data() as BusinessTripMissionMember;
        const mId = data.missionId;
        if (!mId) return;

        const ms = data.memberStatus as string;
        if (["archived", "cancelled", "rejected_by_manager", "declined_by_staff"].includes(ms)) return;

        if (!map[mId]) {
          map[mId] = { total: 0, departed: 0, arrived: 0, activityDone: 0, returned: 0, issues: 0, lastUpdateAt: null, lastUpdateByName: "", memberNames: [] };
        }
        const s = map[mId];
        s.total++;
        s.memberNames.push(data.employeeName);

        if (data.brandName) brands.add(data.brandName);

        const ts = data.memberTripStatus;
        if (ts === "departed" || ts === "arrived" || ts === "activity_done" || ts === "return_started" || ts === "returned") s.departed++;
        if (ts === "arrived" || ts === "activity_done" || ts === "return_started" || ts === "returned") s.arrived++;
        if (ts === "activity_done" || ts === "return_started" || ts === "returned") s.activityDone++;
        if (ts === "returned") s.returned++;
        if (ts === "issue_reported") s.issues++;

        const upd = data.lastTripUpdateAt;
        if (upd && (!s.lastUpdateAt || toSeconds(upd) > toSeconds(s.lastUpdateAt))) {
          s.lastUpdateAt = upd;
          s.lastUpdateByName = data.lastTripUpdateByName ?? "";
        }
      });

      setMemberTrackingMap(map);
      setBrandSet(brands);
    });
    return unsub;
  }, [firestore]);

  // Detail subscriptions
  useEffect(() => {
    if (!firestore || !selectedMission?.id) {
      setDetailMembers([]);
      setDetailTimeline([]);
      setDetailFinalReport(null);
      setDetailMemberReports({});
      setDetailMemberNotes({});
      return;
    }
    setDetailLoading(true);
    const mId = selectedMission.id;

    const unsubMembers = onSnapshot(
      query(collection(firestore, `business_trip_missions/${mId}/members`), orderBy("createdAt", "asc")),
      (snap) => {
        setDetailMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BusinessTripMissionMember)));
        setDetailLoading(false);
      },
      (err) => { console.error("members snapshot error:", err); setDetailLoading(false); },
    );

    const unsubTimeline = onSnapshot(
      query(collection(firestore, `business_trip_missions/${mId}/timeline`), orderBy("createdAt", "desc")),
      (snap) => {
        setDetailTimeline(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimelineEntry)));
      },
      (err) => console.error("timeline snapshot error:", err),
    );

    const unsubFinalReport = onSnapshot(
      collection(firestore, `business_trip_missions/${mId}/final_report`),
      (snap) => {
        const first = snap.docs[0];
        setDetailFinalReport(first ? ({ id: first.id, ...first.data() } as FinalReport) : null);
      },
      (err) => console.error("final_report snapshot error:", err),
    );

    const unsubMemberReports = onSnapshot(
      collection(firestore, `business_trip_missions/${mId}/member_final_reports`),
      (snap) => {
        const map: Record<string, MemberFinalReport> = {};
        snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } as MemberFinalReport; });
        setDetailMemberReports(map);
      },
      (err) => console.error("member_final_reports snapshot error:", err),
    );

    const unsubMemberNotes = onSnapshot(
      collection(firestore, `business_trip_missions/${mId}/member_notes`),
      (snap) => {
        const map: Record<string, MemberNote> = {};
        snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() } as MemberNote; });
        setDetailMemberNotes(map);
      },
      (err) => console.error("member_notes snapshot error:", err),
    );

    return () => { unsubMembers(); unsubTimeline(); unsubFinalReport(); unsubMemberReports(); unsubMemberNotes(); };
  }, [firestore, selectedMission?.id]);

  // ── Summary stats ──────────────────────────────────────────────────────────

  const summary = useMemo(() => {
    let total = 0, readyToDepart = 0, inProgress = 0, needsAttention = 0, pendingReport = 0, done = 0, cancelled = 0;
    missions.forEach((m) => {
      if ((m.status as string) === "archived_duplicate") return;
      const ds = computeDisplayStatus(m, memberTrackingMap[m.id ?? ""]);
      if (ds === "cancelled" || ds === "rejected") { cancelled++; return; }
      total++;
      if (ds === "approved_ready_to_depart") readyToDepart++;
      else if (ds === "in_progress" || ds === "at_location" || ds === "activity_in_progress" || ds === "activity_done") inProgress++;
      else if (ds === "needs_attention") needsAttention++;
      else if (ds === "returned_pending_report" || ds === "final_report_submitted" || ds === "report_submitted") pendingReport++;
      else if (ds === "completed" || ds === "settlement_review") done++;
    });
    return { total, readyToDepart, inProgress, needsAttention, pendingReport, done, cancelled };
  }, [missions, memberTrackingMap]);

  // ── Filtered + sorted missions ─────────────────────────────────────────────

  const filteredMissions = useMemo(() => {
    const q = search.toLowerCase().trim();
    const now = new Date();

    let list = missions.filter((m) => {
      if ((m.status as string) === "archived_duplicate") return false;

      // Status filter
      if (statusFilter !== "all") {
        const ds = computeDisplayStatus(m, memberTrackingMap[m.id ?? ""]);
        if (ds !== statusFilter) return false;
      }

      // Date filter
      if (dateFilter !== "all") {
        const start = toDate(m.startDate);
        if (!start) return false;
        if (dateFilter === "today") {
          if (start < startOfDay(now) || start > endOfDay(now)) return false;
        } else if (dateFilter === "thisweek") {
          if (start < startOfWeek(now, { weekStartsOn: 1 }) || start > endOfWeek(now, { weekStartsOn: 1 })) return false;
        } else if (dateFilter === "thismonth") {
          if (start < startOfMonth(now) || start > endOfMonth(now)) return false;
        }
      }

      // Brand filter
      if (brandFilter !== "all") {
        const tracking = memberTrackingMap[m.id ?? ""];
        // We need to check members for this mission — this is approximate from tracking map
        // For proper brand filter we rely on mission-level data if available
        // skip if we can't determine
      }

      // Search
      if (q) {
        const tracking = memberTrackingMap[m.id ?? ""];
        const nameMatch = (m.missionName ?? "").toLowerCase().includes(q);
        const destMatch = [m.destinationProvince, m.destinationRegency, m.destinationAddress]
          .filter(Boolean).join(" ").toLowerCase().includes(q);
        const memberMatch = tracking?.memberNames.some((n) => n.toLowerCase().includes(q));
        const spdMatch = (m.assignmentNumber ?? "").toLowerCase().includes(q);
        if (!nameMatch && !destMatch && !memberMatch && !spdMatch) return false;
      }

      return true;
    });

    return list.slice().sort((a, b) => {
      if (sortBy === "nearest") {
        const nowSec = Date.now() / 1000;
        return Math.abs(toSeconds(a.startDate) - nowSec) - Math.abs(toSeconds(b.startDate) - nowSec);
      }
      if (sortBy === "az") return (a.missionName ?? "").localeCompare(b.missionName ?? "");
      if (sortBy === "status") {
        const da = computeDisplayStatus(a, memberTrackingMap[a.id ?? ""]);
        const db = computeDisplayStatus(b, memberTrackingMap[b.id ?? ""]);
        return (STATUS_PRIORITY[da] ?? 99) - (STATUS_PRIORITY[db] ?? 99);
      }
      return toSeconds(b.createdAt) - toSeconds(a.createdAt);
    });
  }, [missions, memberTrackingMap, search, statusFilter, dateFilter, brandFilter, sortBy]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectMission = useCallback((m: BusinessTripMission) => {
    setSelectedMission(m);
    setTimelineTab("tracking");
  }, []);

  const handleBack = useCallback(() => {
    setSelectedMission(null);
    setDetailMembers([]);
    setDetailTimeline([]);
  }, []);

  const handleHrdArchiveMission = async () => {
    if (!firestore || !selectedMission?.id || !userProfile) return;
    setIsArchivingMission(true);
    try {
      await updateDoc(doc(firestore, "business_trip_missions", selectedMission.id), {
        status: "completed",
        archivedAt: serverTimestamp(),
        archivedByUid: userProfile.uid,
        archivedByName: userProfile.fullName || userProfile.email || "",
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(firestore, "business_trip_missions", selectedMission.id, "timeline"), {
        message: `HRD (${userProfile.fullName || userProfile.email}) menutup dan mengarsipkan perjalanan dinas. Status: Selesai.`,
        category: "system",
        byName: userProfile.fullName || userProfile.email || null,
        byUid: userProfile.uid,
        createdAt: serverTimestamp(),
      });
    } catch (error: any) {
      console.error(error);
    } finally {
      setIsArchivingMission(false);
    }
  };

  // ── Render: stat card ─────────────────────────────────────────────────────

  const StatCard = ({
    label, value, icon: Icon, accent, onClick, active
  }: {
    label: string; value: number; icon: React.ElementType;
    accent: string; onClick?: () => void; active?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all w-full ${
        active
          ? "border-primary/40 bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/30 hover:bg-muted/40"
      } ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <span className="text-3xl font-bold tabular-nums">{value}</span>
    </button>
  );

  // ── Render: DETAIL VIEW ───────────────────────────────────────────────────

  if (selectedMission) {
    const tracking = memberTrackingMap[selectedMission.id ?? ""];
    const displayStatus = computeDisplayStatus(selectedMission, tracking);
    const activeMembers = detailMembers.filter(
      (m) => !["archived", "declined_by_staff", "rejected_by_manager"].includes(m.memberStatus as string),
    );
    const filteredTimeline = detailTimeline.filter((e) => {
      if (timelineTab === "all") return true;
      return inferCategory(e) === timelineTab;
    });

    return (
      <div className="space-y-4">
        {/* Back header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5 pl-2">
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar
          </Button>
        </div>

        {/* Mission header card */}
        <Card className="border-border/60">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold leading-tight">{selectedMission.missionName}</h2>
                  <StatusBadge status={displayStatus} />
                </div>
                {selectedMission.assignmentNumber && (
                  <p className="text-sm text-muted-foreground font-mono">SPD: {selectedMission.assignmentNumber}</p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm text-muted-foreground">
                  {(selectedMission.destinationProvince || selectedMission.destinationRegency) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                      {[selectedMission.destinationRegency, selectedMission.destinationProvince].filter(Boolean).join(", ")}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                    {formatDate(selectedMission.startDate)} – {formatDate(selectedMission.endDate)}
                  </span>
                  {selectedMission.tripType && (
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                      {selectedMission.tripType}{selectedMission.tripTypeOther ? ` – ${selectedMission.tripTypeOther}` : ""}
                    </span>
                  )}
                  {selectedMission.assignedByName && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 flex-shrink-0" />
                      Oleh: {selectedMission.assignedByName}
                    </span>
                  )}
                </div>
              </div>

              {/* Tracking mini-summary */}
              {tracking && tracking.total > 0 && (
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  {[
                    { icon: Navigation, label: "Berangkat", value: tracking.departed, color: "text-blue-500" },
                    { icon: MapPin, label: "Sampai", value: tracking.arrived, color: "text-indigo-500" },
                    { icon: Home, label: "Kembali", value: tracking.returned, color: "text-green-500" },
                    { icon: AlertTriangle, label: "Kendala", value: tracking.issues, color: "text-amber-500" },
                  ].map(({ icon: Icon, label, value, color }) => (
                    <div key={label} className="flex flex-col items-center gap-0.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                      <Icon className={`h-4 w-4 ${color}`} />
                      <span className="text-lg font-bold tabular-nums">{value}<span className="text-xs font-normal text-muted-foreground">/{tracking.total}</span></span>
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Document link */}
            {(selectedMission.googleDriveLink || selectedMission.assignmentLetterDriveUrl) && (
              <div className="mt-3 flex items-center gap-2 pt-3 border-t border-border/40">
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <a
                  href={selectedMission.googleDriveLink || selectedMission.assignmentLetterDriveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline underline-offset-2 flex items-center gap-1 hover:text-primary/80"
                >
                  Lihat Surat Tugas / SPD
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Progress Perjalanan — step visual with real-time counts */}
        {tracking && tracking.total > 0 && (() => {
          const stepsData = [
            {
              label: "Berangkat", icon: Navigation, count: tracking.departed,
              names: activeMembers.filter(m => ["departed","arrived","activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
              color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50/60 dark:bg-blue-900/20", border: "border-blue-200/60 dark:border-blue-800/40",
            },
            {
              label: "Sampai Lokasi", icon: MapPin, count: tracking.arrived,
              names: activeMembers.filter(m => ["arrived","activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
              color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50/60 dark:bg-indigo-900/20", border: "border-indigo-200/60 dark:border-indigo-800/40",
            },
            {
              label: "Kegiatan Selesai", icon: CheckCircle2, count: tracking.activityDone,
              names: activeMembers.filter(m => ["activity_done","return_started","returned"].includes(m.memberTripStatus ?? "")).map(m => m.employeeName),
              color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50/60 dark:bg-purple-900/20", border: "border-purple-200/60 dark:border-purple-800/40",
            },
            {
              label: "Kembali", icon: Home, count: tracking.returned,
              names: activeMembers.filter(m => m.memberTripStatus === "returned").map(m => m.employeeName),
              color: "text-green-600 dark:text-green-400", bg: "bg-green-50/60 dark:bg-green-900/20", border: "border-green-200/60 dark:border-green-800/40",
            },
          ];

          // Find last updated member for narrative
          let lastUpdatedMember: BusinessTripMissionMember | null = null;
          let lastUpdateSecs = 0;
          activeMembers.forEach((m) => {
            const s = toSeconds(m.lastTripUpdateAt);
            if (s > lastUpdateSecs) { lastUpdateSecs = s; lastUpdatedMember = m; }
          });

          const narrative = (() => {
            if (!lastUpdatedMember) return null;
            const m = lastUpdatedMember as BusinessTripMissionMember;
            const name = m.lastTripUpdateByName || m.employeeName;
            const { label } = memberTripLabel(m.memberTripStatus);
            return `${name} ${label.toLowerCase()} pada ${formatDateTime(m.lastTripUpdateAt)}.`;
          })();

          return (
            <Card className="border-border/60">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Progress Perjalanan
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {stepsData.map((step) => {
                    const Icon = step.icon;
                    return (
                      <div
                        key={step.label}
                        className={`rounded-xl border p-3 text-center space-y-1 ${
                          step.count > 0 ? `${step.bg} ${step.border}` : "border-border/40 bg-muted/5 opacity-50"
                        }`}
                      >
                        <Icon className={`h-4 w-4 mx-auto ${step.count > 0 ? step.color : "text-muted-foreground/40"}`} />
                        <p className="text-[10px] font-medium text-muted-foreground">{step.label}</p>
                        <p className={`text-lg font-bold tabular-nums ${step.count > 0 ? step.color : "text-muted-foreground/40"}`}>
                          {step.count}<span className="text-[10px] font-normal text-muted-foreground">/{tracking.total}</span>
                        </p>
                        {step.names.length > 0 && (
                          <p className="text-[9px] text-muted-foreground leading-tight" title={step.names.join(", ")}>
                            {step.names.slice(0, 2).join(", ")}{step.names.length > 2 ? ` +${step.names.length - 2}` : ""}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {narrative && (
                  <p className="text-xs text-muted-foreground italic">{narrative}</p>
                )}
                {tracking.issues > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200/60 dark:border-red-800/30 bg-red-50/60 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{tracking.issues} anggota melaporkan kendala</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Final Report Section — always show when mission is at/past returned stage */}
        {(selectedMission.status === "returned_pending_report" || selectedMission.status === "final_report_submitted" || selectedMission.status === "completed" || detailFinalReport || Object.keys(detailMemberReports).length > 0) && (() => {
          const rpt = detailFinalReport;
          const reviewStatus = rpt?.reportReviewStatus;
          const isApproved = reviewStatus === "approved";
          const canArchive = selectedMission.status === "final_report_submitted" || selectedMission.status === "completed";

          const reviewBadge = () => {
            if (!rpt?.submittedAt) return null;
            if (reviewStatus === "approved") return <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">Laporan Disetujui</span>;
            if (reviewStatus === "revision_requested") return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Perlu Revisi</span>;
            if (reviewStatus === "resubmitted") return <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Dikirim Ulang</span>;
            if (rpt?.submittedAt) return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Menunggu Review</span>;
            return null;
          };

          return (
            <Card className="border-border/60">
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <CardTitle className="text-base">Laporan Akhir Dinas</CardTitle>
                    {selectedMission.reportMode && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {selectedMission.reportMode === "individual_report" ? "Individu" : "Tim"}
                      </span>
                    )}
                    {reviewBadge()}
                  </div>
                  {canArchive && (
                    <div className="flex items-center gap-2">
                      {!isApproved && (
                        <span className="text-xs text-muted-foreground">Belum disetujui direktur</span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-green-500 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
                        onClick={handleHrdArchiveMission}
                        disabled={isArchivingMission}
                      >
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        Tutup &amp; Arsipkan
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-4">
                {!rpt && Object.keys(detailMemberReports).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/10 py-8 px-4 text-center space-y-1.5">
                    <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">Belum ada laporan akhir</p>
                    <p className="text-xs text-muted-foreground/70">Laporan akan tampil setelah peserta mengirim laporan.</p>
                  </div>
                ) : (
                  <>
                    {/* Meta info */}
                    {rpt && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {rpt.dilaporkanOlehName && <span>Dilaporkan oleh: <strong className="text-foreground">{rpt.dilaporkanOlehName}</strong></span>}
                        {rpt.submittedAt && <span>Dikirim: {formatDateTime(rpt.submittedAt)}</span>}
                        {rpt.reviewedByName && reviewStatus !== "pending_review" && (
                          <span>Direview: <strong className="text-foreground">{rpt.reviewedByName}</strong> · {formatDateTime(rpt.reviewedAt)}</span>
                        )}
                      </div>
                    )}

                    {/* Revision note */}
                    {reviewStatus === "revision_requested" && rpt?.revisionNote && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3.5 py-3 dark:border-amber-700/30 dark:bg-amber-900/10">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">Catatan Revisi dari Direktur</p>
                        <p className="text-sm text-amber-800 dark:text-amber-300">{rpt.revisionNote}</p>
                      </div>
                    )}

                    {/* Team report body */}
                    {rpt && (
                      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                        {rpt.ringkasanKegiatan && (
                          <div><p className="text-xs font-medium text-muted-foreground">Ringkasan Kegiatan</p><p className="text-sm whitespace-pre-wrap">{rpt.ringkasanKegiatan}</p></div>
                        )}
                        {rpt.hasilOutput && (
                          <div><p className="text-xs font-medium text-muted-foreground">Hasil / Output</p><p className="text-sm whitespace-pre-wrap">{rpt.hasilOutput}</p></div>
                        )}
                        {rpt.kendalaDanSolusi && (
                          <div><p className="text-xs font-medium text-muted-foreground">Kendala &amp; Solusi</p><p className="text-sm whitespace-pre-wrap">{rpt.kendalaDanSolusi}</p></div>
                        )}
                        {rpt.tindakLanjut && (
                          <div><p className="text-xs font-medium text-muted-foreground">Tindak Lanjut</p><p className="text-sm whitespace-pre-wrap">{rpt.tindakLanjut}</p></div>
                        )}
                        {rpt.catatanUntukHRD && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Catatan untuk HRD</p>
                            <p className="text-sm font-medium text-amber-700 dark:text-amber-400 whitespace-pre-wrap">{rpt.catatanUntukHRD}</p>
                          </div>
                        )}
                        {rpt.lampiranUrl && (
                          <a href={rpt.lampiranUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
                            <FileText className="h-3.5 w-3.5" /> Lihat Lampiran
                          </a>
                        )}
                      </div>
                    )}

                    {/* Per-member individual reports */}
                    {Object.keys(detailMemberReports).length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Laporan Individu Anggota</p>
                          <span className="text-xs text-muted-foreground">
                            {Object.values(detailMemberReports).filter((r) => !!r.submittedAt).length}/{Object.keys(detailMemberReports).length} terkumpul
                          </span>
                        </div>
                        {Object.values(detailMemberReports).map((r) => (
                          <div key={r.memberUid} className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <p className="text-sm font-semibold">{r.memberName}</p>
                              <div className="flex items-center gap-1.5">
                                {r.reportReviewStatus === "approved" && <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">Disetujui</span>}
                                {r.reportReviewStatus === "revision_requested" && <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Perlu Revisi</span>}
                                {r.reportReviewStatus === "resubmitted" && <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">Dikirim Ulang</span>}
                                {!r.reportReviewStatus && r.submittedAt && <span className="text-[10px] font-semibold text-muted-foreground">Terkirim</span>}
                                {r.submittedAt && <span className="text-[10px] text-muted-foreground">{formatDateTime(r.submittedAt)}</span>}
                              </div>
                            </div>
                            {r.kegiatanDilakukan && <div><p className="text-xs font-medium text-muted-foreground">Kegiatan</p><p className="text-xs">{r.kegiatanDilakukan}</p></div>}
                            {r.hasilPribadi && <div><p className="text-xs font-medium text-muted-foreground">Hasil</p><p className="text-xs">{r.hasilPribadi}</p></div>}
                            {r.kendalaPribadi && <div><p className="text-xs font-medium text-muted-foreground">Kendala</p><p className="text-xs">{r.kendalaPribadi}</p></div>}
                            {r.solusiPribadi && <div><p className="text-xs font-medium text-muted-foreground">Solusi</p><p className="text-xs">{r.solusiPribadi}</p></div>}
                            {r.catatanTambahan && <div><p className="text-xs font-medium text-muted-foreground">Catatan</p><p className="text-xs">{r.catatanTambahan}</p></div>}
                            {r.lampiranUrl && (
                              <a href={r.lampiranUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline dark:text-blue-400">Lihat Lampiran</a>
                            )}
                            {r.revisionNote && (
                              <div className="mt-1 rounded border border-amber-200 bg-amber-50/50 px-2 py-1 dark:border-amber-700/30 dark:bg-amber-900/10">
                                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">Catatan revisi: {r.revisionNote}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })()}

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Left: Members tracking */}
          <div className="lg:col-span-3 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide px-1">
              Anggota & Status Perjalanan
            </h3>
            {detailLoading ? (
              <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">Memuat...</div>
            ) : activeMembers.length === 0 ? (
              <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">Belum ada anggota aktif.</div>
            ) : (
              <div className="space-y-2">
                {activeMembers.map((member) => {
                  const ts = member.memberTripStatus;
                  const { label, color } = memberTripLabel(ts);
                  const hasIssue = ts === "issue_reported";
                  return (
                    <div
                      key={member.id}
                      className={`rounded-xl border px-4 py-3 ${
                        hasIssue
                          ? "border-red-300/60 bg-red-50/40 dark:border-red-800/40 dark:bg-red-900/10"
                          : ts === "returned"
                          ? "border-green-300/60 bg-green-50/40 dark:border-green-800/40 dark:bg-green-900/10"
                          : ts && ts !== "ready"
                          ? "border-blue-300/60 bg-blue-50/30 dark:border-blue-800/40 dark:bg-blue-900/10"
                          : "border-border/60 bg-card"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{member.employeeName}</p>
                          {member.employeePosition && (
                            <p className="text-xs text-muted-foreground truncate">{member.employeePosition}</p>
                          )}
                          {member.brandName && (
                            <p className="text-xs text-muted-foreground">{member.brandName}{member.divisionName ? ` · ${member.divisionName}` : ""}</p>
                          )}
                        </div>
                        <span className={`text-xs font-semibold flex-shrink-0 ${color}`}>{label}</span>
                      </div>

                      {/* Milestone timestamps */}
                      {ts && ts !== "ready" && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                          {member.departedAt && (
                            <span className="flex items-center gap-0.5">
                              <Navigation className="h-3 w-3 text-blue-400" />
                              Berangkat {formatDateTime(member.departedAt)}
                            </span>
                          )}
                          {member.arrivedAt && (
                            <span className="flex items-center gap-0.5">
                              <MapPin className="h-3 w-3 text-indigo-400" />
                              Tiba {formatDateTime(member.arrivedAt)}
                            </span>
                          )}
                          {member.activityDoneAt && (
                            <span className="flex items-center gap-0.5">
                              <CheckSquare className="h-3 w-3 text-indigo-400" />
                              Selesai {formatDateTime(member.activityDoneAt)}
                            </span>
                          )}
                          {member.returnedAt && (
                            <span className="flex items-center gap-0.5">
                              <Home className="h-3 w-3 text-green-400" />
                              Kembali {formatDateTime(member.returnedAt)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Issue details */}
                      {hasIssue && (member.issueNote || member.issueCategory) && (
                        <div className="mt-2 rounded-lg bg-red-100/60 dark:bg-red-900/20 px-3 py-2 text-xs text-red-800 dark:text-red-300">
                          <span className="font-semibold">Kendala</span>
                          {member.issueCategory ? ` · ${member.issueCategory}` : ""}
                          {member.issueUrgency ? ` · Urgensi: ${member.issueUrgency}` : ""}
                          {member.issueNote ? `: ${member.issueNote}` : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Timeline */}
          <div className="lg:col-span-2 space-y-3">
            <div className="space-y-2 px-1">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Timeline Aktivitas
              </h3>
              <div className="flex flex-wrap gap-1 rounded-lg border border-border overflow-hidden text-xs">
                {(["tracking", "approval", "changes", "issues", "all"] as const).map((tab) => {
                  const tabLabels: Record<string, string> = {
                    tracking: "Perjalanan",
                    approval: "Approval",
                    changes: "Perubahan",
                    issues: "Kendala",
                    all: "Semua",
                  };
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setTimelineTab(tab)}
                      className={`px-2.5 py-1.5 transition-colors ${
                        timelineTab === tab
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {tabLabels[tab]}
                    </button>
                  );
                })}
              </div>
            </div>

            {(() => {
              const borderColors: Record<string, string> = {
                tracking: "border-l-blue-500",
                approval: "border-l-green-500",
                changes: "border-l-purple-500",
                issues: "border-l-amber-500",
                system: "border-l-border",
              };
              const catLabels: Record<string, string> = {
                tracking: "Perjalanan",
                approval: "Approval",
                changes: "Perubahan",
                issues: "Kendala",
                system: "Sistem",
              };
              const catColors: Record<string, string> = {
                tracking: "text-blue-500",
                approval: "text-green-600",
                changes: "text-purple-500",
                issues: "text-amber-600",
                system: "text-muted-foreground",
              };
              const noDataLabels: Record<string, string> = {
                tracking: "Belum ada log perjalanan.",
                approval: "Belum ada log approval.",
                changes: "Belum ada log perubahan.",
                issues: "Tidak ada kendala dilaporkan.",
                all: "Belum ada riwayat aktivitas.",
              };
              return (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {detailTimeline.length === 0 ? (
                    <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
                      Belum ada riwayat aktivitas.
                    </div>
                  ) : filteredTimeline.length === 0 ? (
                    <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
                      {noDataLabels[timelineTab] ?? "Tidak ada entri."}
                    </div>
                  ) : (
                    filteredTimeline.map((entry) => {
                      const cat = inferCategory(entry);
                      return (
                        <div
                          key={entry.id}
                          className={`rounded-xl border-l-4 border border-border/40 bg-card px-3 py-2.5 ${borderColors[cat] ?? "border-l-border"}`}
                        >
                          <p className="text-xs leading-relaxed text-foreground/90">{entry.message}</p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {entry.byName ? `${entry.byName} · ` : ""}{formatDateTime(entry.createdAt)}
                            </span>
                            {timelineTab === "all" && (
                              <span className={`text-[9px] font-semibold uppercase tracking-wide ${catColors[cat] ?? "text-muted-foreground"}`}>
                                {catLabels[cat] ?? "Sistem"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: LIST VIEW ─────────────────────────────────────────────────────

  const activeFilterCount = [
    statusFilter !== "all",
    dateFilter !== "all",
    brandFilter !== "all",
  ].filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Total Misi"
          value={summary.total}
          icon={FileText}
          accent="bg-muted text-muted-foreground"
          onClick={() => setStatusFilter("all")}
          active={statusFilter === "all"}
        />
        <StatCard
          label="Siap Berangkat"
          value={summary.readyToDepart}
          icon={Navigation}
          accent="bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400"
          onClick={() => setStatusFilter(statusFilter === "approved_ready_to_depart" ? "all" : "approved_ready_to_depart")}
          active={statusFilter === "approved_ready_to_depart"}
        />
        <StatCard
          label="Sedang Berjalan"
          value={summary.inProgress}
          icon={Activity}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
          onClick={() => setStatusFilter(statusFilter === "in_progress" ? "all" : "in_progress")}
          active={statusFilter === "in_progress"}
        />
        <StatCard
          label="Butuh Perhatian"
          value={summary.needsAttention}
          icon={AlertTriangle}
          accent="bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
          onClick={() => setStatusFilter(statusFilter === "needs_attention" ? "all" : "needs_attention")}
          active={statusFilter === "needs_attention"}
        />
        <StatCard
          label="Menunggu Laporan"
          value={summary.pendingReport}
          icon={Clock}
          accent="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
          onClick={() => setStatusFilter(statusFilter === "returned_pending_report" ? "all" : "returned_pending_report")}
          active={statusFilter === "returned_pending_report"}
        />
        <StatCard
          label="Selesai"
          value={summary.done}
          icon={CheckCircle2}
          accent="bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
          onClick={() => setStatusFilter(statusFilter === "completed" ? "all" : "completed")}
          active={statusFilter === "completed"}
        />
      </div>

      {/* ── Toolbar ── */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Cari nama misi, SPD, tujuan, atau nama anggota…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="newest">Terbaru Dibuat</option>
            <option value="nearest">Tanggal Terdekat</option>
            <option value="az">A–Z</option>
            <option value="status">Prioritas Status</option>
          </select>
        </div>

        {/* Expanded filter panel */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">Semua Status</option>
                <option value="approved_ready_to_depart">Siap Berangkat</option>
                <option value="in_progress">Sedang Berjalan</option>
                <option value="at_location">Sudah Sampai Lokasi</option>
                <option value="activity_in_progress">Kegiatan Berjalan</option>
                <option value="activity_done">Kegiatan Selesai</option>
                <option value="needs_attention">Butuh Perhatian</option>
                <option value="returned_pending_report">Menunggu Laporan Akhir</option>
                <option value="final_report_submitted">Laporan Akhir Terkirim</option>
                <option value="report_submitted">Laporan Dikirim</option>
                <option value="pending_hrd_finalization">Menunggu Finalisasi HRD</option>
                <option value="waiting_staff_confirmation">Menunggu Konfirmasi Staff</option>
                <option value="pending_manager_validation">Menunggu Validasi Manager</option>
                <option value="completed">Selesai</option>
                <option value="rejected">Ditolak</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tanggal Berangkat</label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">Semua Waktu</option>
                <option value="today">Hari Ini</option>
                <option value="thisweek">Minggu Ini</option>
                <option value="thismonth">Bulan Ini</option>
              </select>
            </div>

            {brandSet.size > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Brand</label>
                <select
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="all">Semua Brand</option>
                  {Array.from(brandSet).sort().map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}

            {activeFilterCount > 0 && (
              <div className="flex flex-col justify-end">
                <button
                  type="button"
                  onClick={() => { setStatusFilter("all"); setDateFilter("all"); setBrandFilter("all"); }}
                  className="h-8 rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  Reset Filter
                </button>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground pl-1">
          Menampilkan {filteredMissions.length} dari {missions.filter(m => (m.status as string) !== "archived_duplicate").length} misi
        </p>
      </div>

      {/* ── Mission table ── */}
      <div className="rounded-xl border border-border overflow-hidden">
        {isLoadingMissions ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Memuat data misi…</div>
        ) : filteredMissions.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {search || activeFilterCount > 0
              ? "Tidak ada misi yang cocok dengan filter."
              : "Belum ada perjalanan dinas."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="min-w-[200px]">Nama Misi</TableHead>
                  <TableHead className="min-w-[140px]">Tujuan</TableHead>
                  <TableHead className="min-w-[130px]">Periode</TableHead>
                  <TableHead className="min-w-[90px] text-center">Anggota</TableHead>
                  <TableHead className="min-w-[150px]">Progress Perjalanan</TableHead>
                  <TableHead className="min-w-[160px]">Update Terakhir</TableHead>
                  <TableHead className="min-w-[110px]">Kendala</TableHead>
                  <TableHead className="min-w-[140px]">Status Aktual</TableHead>
                  <TableHead className="min-w-[70px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMissions.map((mission) => {
                  const tracking = memberTrackingMap[mission.id ?? ""];
                  const displayStatus = computeDisplayStatus(mission, tracking);
                  const hasIssue = (tracking?.issues ?? 0) > 0;

                  return (
                    <TableRow
                      key={mission.id}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => handleSelectMission(mission)}
                    >
                      {/* Nama Misi */}
                      <TableCell>
                        <div className="font-medium leading-tight">{mission.missionName || "–"}</div>
                        {mission.assignmentNumber && (
                          <div className="mt-0.5 text-xs font-mono text-muted-foreground">{mission.assignmentNumber}</div>
                        )}
                        {mission.tripType && (
                          <div className="mt-0.5 text-xs text-muted-foreground">{mission.tripType}</div>
                        )}
                      </TableCell>

                      {/* Tujuan */}
                      <TableCell>
                        <div className="text-sm">
                          {mission.destinationRegency || mission.destinationProvince || "–"}
                        </div>
                        {mission.destinationProvince && mission.destinationRegency && (
                          <div className="text-xs text-muted-foreground">{mission.destinationProvince}</div>
                        )}
                      </TableCell>

                      {/* Periode */}
                      <TableCell>
                        <div className="text-xs">
                          {formatDate(mission.startDate)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          s/d {formatDate(mission.endDate)}
                        </div>
                        {mission.durationDays && (
                          <div className="text-xs text-muted-foreground">{mission.durationDays}h</div>
                        )}
                      </TableCell>

                      {/* Anggota */}
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{tracking?.total ?? mission.memberCount ?? 0}</span>
                        </div>
                      </TableCell>

                      {/* Progress Perjalanan */}
                      <TableCell>
                        {tracking && tracking.total > 0 ? (
                          <div className="space-y-0.5 text-xs">
                            <div className="flex items-center gap-1.5">
                              <Navigation className={`h-3 w-3 flex-shrink-0 ${tracking.departed > 0 ? "text-blue-500" : "text-muted-foreground/40"}`} />
                              <span className={tracking.departed > 0 ? "" : "text-muted-foreground/50"}>
                                {tracking.departed}/{tracking.total} berangkat
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <MapPin className={`h-3 w-3 flex-shrink-0 ${tracking.arrived > 0 ? "text-indigo-500" : "text-muted-foreground/40"}`} />
                              <span className={tracking.arrived > 0 ? "" : "text-muted-foreground/50"}>
                                {tracking.arrived}/{tracking.total} sampai lokasi
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <CheckSquare className={`h-3 w-3 flex-shrink-0 ${tracking.activityDone > 0 ? "text-indigo-600" : "text-muted-foreground/40"}`} />
                              <span className={tracking.activityDone > 0 ? "" : "text-muted-foreground/50"}>
                                {tracking.activityDone}/{tracking.total} kegiatan selesai
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Home className={`h-3 w-3 flex-shrink-0 ${tracking.returned > 0 ? "text-green-600" : "text-muted-foreground/40"}`} />
                              <span className={tracking.returned > 0 ? "" : "text-muted-foreground/50"}>
                                {tracking.returned}/{tracking.total} kembali
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Belum ada data tracking</span>
                        )}
                      </TableCell>

                      {/* Update Terakhir */}
                      <TableCell>
                        {tracking?.lastUpdateAt ? (
                          <div className="space-y-0.5">
                            <div className="text-xs font-medium leading-tight">
                              {tracking.lastUpdateByName || "–"}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {formatDateTime(tracking.lastUpdateAt)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">–</span>
                        )}
                      </TableCell>

                      {/* Kendala */}
                      <TableCell>
                        {hasIssue ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3" />
                            {tracking!.issues} kendala
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Tidak ada</span>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <StatusBadge status={displayStatus} />
                      </TableCell>

                      {/* Aksi */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 px-2 text-xs"
                          onClick={() => handleSelectMission(mission)}
                        >
                          Detail
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
