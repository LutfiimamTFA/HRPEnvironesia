"use client";

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { MENU_CONFIG } from "@/lib/menu-config";
import { useFirestore } from "@/firebase";
import { collection, query, where, doc, setDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import type {
  UserProfile,
  Brand,
  EmployeeProfile,
  EmployeeMasterData,
} from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Upload,
  Download,
  Users,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Eye,
  Loader2,
  FileSpreadsheet,
  GraduationCap,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  CreditCard,
  Shield,
  RefreshCw,
  Settings2,
  Monitor,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { ImportDialog } from "@/components/dashboard/hrd/ImportDialog";
import { calculateProfileCompleteness } from "@/lib/employee-completeness";
import { useRouter, useSearchParams } from "next/navigation";
import { BankChangeReviewModal } from "@/components/dashboard/hrd/BankChangeReviewModal";
import {
  normalizeEmployeeOperationalStatus,
  getOperationalStatusLabel,
  getOperationalStatusVariant,
  OperationalStatus,
} from "@/lib/employee-status";
import { normalizeEmployeeRow } from "@/lib/employee-row-normalizer";
import { normalizeAttendanceMethodBucket } from "@/lib/attendance-methods";
import { cn } from "@/lib/utils";
import { useHrdScopedBrands, useHrdScopedCollection } from "@/hooks/useHrdScopedCollection";
import { HrdScopeEmptyState } from "@/components/dashboard/hrd/HrdScopeEmptyState";

/** Merged view of a single employee from all 3 sources */
interface MergedEmployee {
  uid: string;
  fullName: string;
  email: string;
  employeeNumber?: string;
  positionTitle?: string;
  division?: string;
  brandId?: string;
  brandName?: string;
  employmentStatus?: string;
  employmentType?: string;
  structuralPosition?: string;
  isDivisionManager?: boolean;
  joinDate?: any;
  employeeProfile?: EmployeeProfile | null;
  hrdEmploymentInfo?: any;
  hasProfile: boolean;
  operationalStatus: OperationalStatus;
  operationalStatusLabel: string;
  mappedType: "tetap" | "kontrak" | "probation" | "magang" | "belum_diatur" | "nonaktif";
  mappedTypeLabel: string;
  needsHrdAttention: boolean;
  pendingBankRequest?: any;
  userRole?: string;
  managementScopes?: any[];
  source?: string | null;
  inviteBatchId?: string | null;
}

function StatusKepegawaanBadge({ status }: { status: OperationalStatus }) {
  const label = getOperationalStatusLabel(status);
  const variant = getOperationalStatusVariant(status);

  return (
    <Badge
      variant="outline"
      className={cn(
        "px-2 py-0 h-5 text-[10px] font-semibold uppercase tracking-wider",
        variant === "success"
          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
          : variant === "warning"
            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
            : variant === "info"
              ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
              : variant === "destructive"
                ? "bg-red-500/10 text-red-500 border-red-500/20"
                : "bg-slate-500/10 text-slate-400 border-slate-500/20",
      )}
    >
      {label}
    </Badge>
  );
}

type MappedEmployeeType = "tetap" | "kontrak" | "probation" | "magang" | "belum_diatur" | "nonaktif";

function getMappedEmployeeType(emp: Partial<MergedEmployee>): MappedEmployeeType {
  const status = (emp.employmentStatus || "").toLowerCase();
  if (status === "resigned" || status === "terminated" || status === "nonaktif") {
    return "nonaktif";
  }

  const rawType = (emp.hrdEmploymentInfo?.employeeType || emp.employmentType || emp.hrdEmploymentInfo?.tipeKaryawan || emp.employmentStatus || emp.hrdEmploymentInfo?.statusKerja || "").toLowerCase();

  if (rawType.includes("tetap") || rawType === "karyawan tetap") return "tetap";
  if (rawType.includes("kontrak") || rawType === "pkwt") return "kontrak";
  if (rawType.includes("probation") || rawType === "percobaan") return "probation";
  if (rawType.includes("magang") || rawType === "intern" || rawType === "internship") return "magang";

  return "belum_diatur";
}

function getMappedEmployeeTypeLabel(type: MappedEmployeeType): string {
  switch (type) {
    case "tetap": return "Karyawan Tetap";
    case "kontrak": return "Kontrak";
    case "probation": return "Probation";
    case "magang": return "Magang";
    case "nonaktif": return "Nonaktif / Resigned";
    case "belum_diatur": return "Belum Diatur";
    default: return "Belum Diatur";
  }
}

function EmployeeTypeBadge({ type }: { type: MappedEmployeeType }) {
  const label = getMappedEmployeeTypeLabel(type);
  let variantClass = "bg-slate-500/10 text-slate-400 border-slate-500/20";
  if (type === "tetap") variantClass = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  else if (type === "kontrak") variantClass = "bg-blue-500/10 text-blue-500 border-blue-500/20";
  else if (type === "probation") variantClass = "bg-amber-500/10 text-amber-500 border-amber-500/20";
  else if (type === "magang") variantClass = "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
  else if (type === "nonaktif") variantClass = "bg-red-500/10 text-red-500 border-red-500/20";

  return (
    <Badge
      variant="outline"
      className={cn(
        "px-2 py-0 h-5 text-[10px] font-semibold uppercase tracking-wider",
        variantClass
      )}
    >
      {label}
    </Badge>
  );
}

function AdminCheckIcons({
  profile,
  pendingBankRequest,
}: {
  profile?: EmployeeProfile | null;
  pendingBankRequest?: any;
}) {
  const rek = profile?.dataRekening;
  const doc = profile?.dokumenAdministratif;

  return (
    <div className="flex flex-wrap gap-1">
      {pendingBankRequest ? (
        <Badge
          variant="outline"
          className="border-amber-500/30 text-amber-500 bg-amber-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          REK: Pending
        </Badge>
      ) : rek?.bankName ? (
        <Badge
          variant="outline"
          className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          REK: OK
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="border-slate-500/30 text-slate-400 bg-slate-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          REK: Belum Ada
        </Badge>
      )}

      {doc?.npwpPhotoUrl ? (
        <Badge
          variant="outline"
          className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          NPWP: OK
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="border-slate-500/30 text-slate-400 bg-slate-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          NPWP: Belum Ada
        </Badge>
      )}

      {doc?.bpjsKesehatanPhotoUrl ? (
        <Badge
          variant="outline"
          className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          BPJS Kes: OK
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="border-slate-500/30 text-slate-400 bg-slate-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          BPJS Kes: Belum Ada
        </Badge>
      )}

      {doc?.bpjsKetenagakerjaanPhotoUrl ? (
        <Badge
          variant="outline"
          className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          BPJS TK: OK
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="border-slate-500/30 text-slate-400 bg-slate-500/10 text-[11px] font-bold px-2 py-0.5 h-6"
        >
          BPJS TK: Belum Ada
        </Badge>
      )}
    </div>
  );
}

// ─── Attendance Method helpers ──────────────────────────────────────────────
// Values are normalized through normalizeAttendanceMethodBucket() so legacy
// values written by the detail page's editor ("web_photo"/"hybrid"/"exempt")
// are recognized here too, instead of falling into "Belum Diatur".

type AttendanceMethodValue = "web_absen" | "id_card" | "fingerprint" | "manual" | "web_photo" | "hybrid" | "exempt" | undefined;

function getAttendanceMethodLabel(method: AttendanceMethodValue): string {
  const bucket = normalizeAttendanceMethodBucket(method);
  if (!bucket) return "Belum Diatur";
  if (bucket === "web_absen") return "Web Absen";
  if (bucket === "id_card") return "ID Card";
  return "Manual";
}

function AttendanceMethodBadge({ method }: { method: AttendanceMethodValue }) {
  const bucket = normalizeAttendanceMethodBucket(method);
  const label = getAttendanceMethodLabel(method);
  let cls = "border-slate-500/30 text-slate-400 bg-slate-500/10";
  if (bucket === "web_absen") cls = "border-blue-500/30 text-blue-500 bg-blue-500/10";
  else if (bucket === "id_card") cls = "border-teal-500/30 text-teal-500 bg-teal-500/10";
  else if (bucket === "manual") cls = "border-orange-500/30 text-orange-500 bg-orange-500/10";
  return (
    <Badge variant="outline" className={cn("text-[10px] font-bold px-2 py-0 h-5 uppercase tracking-wider", cls)}>
      {label}
    </Badge>
  );
}

// ─── Kelola Metode Absensi Modal ─────────────────────────────────────────────

interface KelolaMtdAbsensiModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: MergedEmployee[];
  currentUserUid: string;
  currentUserName: string;
  db: import("firebase/firestore").Firestore;
  onSuccess: () => void;
}

function KelolaMtdAbsensiModal({
  open,
  onOpenChange,
  employees,
  currentUserUid,
  currentUserName,
  db,
  onSuccess,
}: KelolaMtdAbsensiModalProps) {
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<"all" | "web_absen" | "id_card" | "manual" | "belum_diatur">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMethod, setBulkMethod] = useState<"web_absen" | "id_card" | "manual" | "">("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [singleEdit, setSingleEdit] = useState<{ uid: string; name: string } | null>(null);
  const [singleMethod, setSingleMethod] = useState<"web_absen" | "id_card" | "manual" | "">("");
  const { toast } = useToast();

  // ── reset on close ──
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setSelected(new Set());
      setBulkMethod("");
      setConfirmOpen(false);
      setSingleEdit(null);
    }
    onOpenChange(v);
  };

  // ── filter ──
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter((e) => {
      const m = (e.employeeProfile?.attendanceMethod as AttendanceMethodValue) ?? undefined;
      const normalized = normalizeAttendanceMethodBucket(m);
      if (methodFilter === "web_absen" && normalized !== "web_absen") return false;
      if (methodFilter === "id_card" && normalized !== "id_card") return false;
      if (methodFilter === "manual" && normalized !== "manual") return false;
      if (methodFilter === "belum_diatur" && normalized != null) return false;
      if (q) {
        const hay = `${e.fullName} ${e.email} ${e.brandName ?? ""} ${e.division ?? ""} ${e.employeeNumber ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [employees, search, methodFilter]);

  // ── summary ──
  const summary = useMemo(() => {
    let webAbsen = 0, idCard = 0, manual = 0, belum = 0;
    employees.forEach((e) => {
      const m = (e.employeeProfile?.attendanceMethod as AttendanceMethodValue) ?? undefined;
      const n = normalizeAttendanceMethodBucket(m);
      if (n === "web_absen") webAbsen++;
      else if (n === "id_card") idCard++;
      else if (n === "manual") manual++;
      else belum++;
    });
    return { total: employees.length, webAbsen, idCard, manual, belum };
  }, [employees]);

  // ── checkbox ──
  const allChecked = filtered.length > 0 && filtered.every((e) => selected.has(e.uid));
  const toggleAll = () => {
    if (allChecked) {
      const next = new Set(selected);
      filtered.forEach((e) => next.delete(e.uid));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((e) => next.add(e.uid));
      setSelected(next);
    }
  };
  const toggleOne = (uid: string) => {
    const next = new Set(selected);
    if (next.has(uid)) next.delete(uid); else next.add(uid);
    setSelected(next);
  };

  // ── save helper ──
  const saveMethod = async (uids: string[], method: "web_absen" | "id_card" | "manual") => {
    setSaving(true);
    try {
      const batch = writeBatch(db as any);
      const methodLabel = method === "web_absen" ? "Web Absen" : method === "id_card" ? "ID Card" : "Manual";
      uids.forEach((uid) => {
        const ref = doc(db as any, "employee_profiles", uid);
        batch.set(ref, {
          attendanceMethod: method,
          attendanceMethodLabel: methodLabel,
          attendanceConfig: { method, methodLabel },
          attendanceMethodUpdatedAt: serverTimestamp(),
          attendanceMethodUpdatedBy: currentUserUid,
          // Legacy fields kept for backward compatibility with older reads.
          attendanceUpdatedAt: serverTimestamp(),
          attendanceUpdatedBy: currentUserUid,
          attendanceUpdatedByName: currentUserName,
        }, { merge: true });
      });
      await batch.commit();
      toast({ title: "Berhasil disimpan", description: `Metode absensi ${uids.length} karyawan diperbarui.` });
      onSuccess();
      setSelected(new Set());
      setBulkMethod("");
      setConfirmOpen(false);
      setSingleEdit(null);
    } catch {
      toast({ variant: "destructive", title: "Gagal menyimpan", description: "Terjadi kesalahan. Coba lagi." });
    } finally {
      setSaving(false);
    }
  };

  const selectedList = [...selected];
  const methodLabel = (m: string) => m === "web_absen" ? "Web Absen" : m === "id_card" ? "ID Card" : m === "manual" ? "Manual" : m;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl w-full max-h-[90vh] flex flex-col p-0 gap-0 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <DialogTitle className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-teal-500" />
            Kelola Metode Absensi
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Pantau dan ubah metode absensi karyawan tanpa membuka detail satu per satu.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Summary cards */}
          <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-100 dark:border-slate-800/50">
            {[
              { label: "Total Karyawan", val: summary.total, cls: "text-slate-600 dark:text-slate-400", bg: "bg-slate-500/10" },
              { label: "Web Absen", val: summary.webAbsen, cls: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
              { label: "ID Card", val: summary.idCard, cls: "text-teal-600 dark:text-teal-400", bg: "bg-teal-500/10" },
              { label: "Belum Diatur", val: summary.belum, cls: "text-slate-500 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-800" },
            ].map((s) => (
              <div key={s.label} className={cn("rounded-xl p-3 flex flex-col gap-1", s.bg)}>
                <span className={cn("text-2xl font-black", s.cls)}>{s.val}</span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Filter bar */}
          <div className="px-6 py-3 flex flex-wrap gap-2 items-center border-b border-slate-100 dark:border-slate-800/50">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama, NIK, brand, atau divisi..."
                className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>
            <div className="flex gap-1.5">
              {(["all", "web_absen", "id_card", "manual", "belum_diatur"] as const).map((f) => {
                const labels: Record<string, string> = { all: "Semua", web_absen: "Web Absen", id_card: "ID Card", manual: "Manual", belum_diatur: "Belum Diatur" };
                return (
                  <button
                    key={f}
                    onClick={() => setMethodFilter(f)}
                    className={cn(
                      "h-8 px-3 text-xs font-bold rounded-lg border transition-colors",
                      methodFilter === f
                        ? "bg-teal-500 text-white border-teal-500"
                        : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60",
                    )}
                  >
                    {labels[f]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="px-6 py-3 bg-teal-500/10 border-b border-teal-500/20 flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-teal-700 dark:text-teal-400">{selected.size} karyawan dipilih</span>
              <div className="flex gap-2 ml-auto items-center">
                <span className="text-xs text-slate-500">Ubah ke:</span>
                {(["web_absen", "id_card", "manual"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setBulkMethod(m); setConfirmOpen(true); }}
                    className="h-8 px-3 text-xs font-bold rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-teal-500 hover:text-teal-600 transition-colors"
                  >
                    {methodLabel(m)}
                  </button>
                ))}
                <button onClick={() => setSelected(new Set())} className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/40 sticky top-0 z-10">
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300 accent-teal-500" />
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Nama Karyawan</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[130px]">NIK</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[130px]">Brand</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[140px]">Divisi</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[130px]">Metode Absensi</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[160px]">Terakhir Diubah</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[80px]">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400 text-sm">
                      Tidak ada karyawan sesuai filter.
                    </td>
                  </tr>
                ) : filtered.map((emp) => {
                  const method = (emp.employeeProfile?.attendanceMethod as AttendanceMethodValue) ?? undefined;
                  const updatedAt = (emp.employeeProfile as any)?.attendanceUpdatedAt;
                  const updatedByName = (emp.employeeProfile as any)?.attendanceUpdatedByName;
                  const dateStr = updatedAt?.toDate ? updatedAt.toDate().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";
                  const isSingleEditing = singleEdit?.uid === emp.uid;
                  return (
                    <tr
                      key={emp.uid}
                      className={cn(
                        "border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors",
                        selected.has(emp.uid) && "bg-teal-50/60 dark:bg-teal-900/10",
                      )}
                    >
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(emp.uid)} onChange={() => toggleOne(emp.uid)} className="h-4 w-4 rounded border-slate-300 accent-teal-500" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white text-[13px]">{emp.fullName}</div>
                        <div className="text-[11px] text-slate-400">{emp.email}</div>
                      </td>
                      <td className="px-4 py-3 text-[12px] font-mono text-slate-600 dark:text-slate-400">
                        {emp.employeeNumber || "—"}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-slate-600 dark:text-slate-400">{emp.brandName || "—"}</td>
                      <td className="px-4 py-3 text-[12px] text-slate-600 dark:text-slate-400">{emp.division || "—"}</td>
                      <td className="px-4 py-3">
                        {isSingleEditing ? (
                          <div className="flex gap-1 flex-wrap">
                            {(["web_absen", "id_card", "manual"] as const).map((m) => (
                              <button
                                key={m}
                                onClick={() => setSingleMethod(m)}
                                className={cn(
                                  "h-7 px-2 text-[11px] font-bold rounded-md border transition-colors",
                                  singleMethod === m
                                    ? "bg-teal-500 text-white border-teal-500"
                                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400",
                                )}
                              >
                                {methodLabel(m)}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <AttendanceMethodBadge method={method} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400">
                        <div>{dateStr}</div>
                        {updatedByName && <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{updatedByName}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {isSingleEditing ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              disabled={!singleMethod || saving}
                              className="h-7 px-2 text-[11px] rounded-md bg-teal-500 hover:bg-teal-600 text-white"
                              onClick={() => singleMethod && saveMethod([emp.uid], singleMethod as "web_absen" | "id_card" | "manual")}
                            >
                              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Simpan"}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] rounded-md" onClick={() => { setSingleEdit(null); setSingleMethod(""); }}>
                              Batal
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-3 text-[11px] rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-teal-600 hover:border-teal-500"
                            onClick={() => {
                              setSingleEdit({ uid: emp.uid, name: emp.fullName });
                              const cur = (emp.employeeProfile?.attendanceMethod as AttendanceMethodValue) ?? undefined;
                              setSingleMethod((cur === "fingerprint" ? "id_card" : cur) as any ?? "");
                            }}
                          >
                            Ubah
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 flex items-center justify-between">
          <span className="text-xs text-slate-400">{filtered.length} karyawan ditampilkan</span>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => handleOpenChange(false)}>
            Tutup
          </Button>
        </div>
      </DialogContent>

      {/* Bulk confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={(v) => { if (!v) setConfirmOpen(false); }}>
        <DialogContent className="max-w-sm bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">Konfirmasi Perubahan</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 mt-1">
              Ubah metode absensi untuk <strong>{selectedList.length} karyawan</strong> menjadi <strong>{methodLabel(bulkMethod)}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setConfirmOpen(false)} disabled={saving}>Batal</Button>
            <Button
              size="sm"
              className="rounded-xl bg-teal-500 hover:bg-teal-600 text-white"
              disabled={saving || !bulkMethod}
              onClick={() => bulkMethod && saveMethod(selectedList, bulkMethod as "web_absen" | "id_card" | "manual")}
            >
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Menyimpan...</> : "Simpan Perubahan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function getActionNeededStatus(employee: MergedEmployee): {
  status: string;
  priority: number;
  color: string;
  bgColor: string;
  textColor: string;
} {
  const profile = employee.employeeProfile;
  const rek = profile?.dataRekening;
  const doc = profile?.dokumenAdministratif;

  // Priority order: pending review > missing required docs > incomplete data > complete
  if (employee.pendingBankRequest) {
    return {
      status: "Rekening Pending Review",
      priority: 4,
      color: "border-amber-500/30",
      bgColor: "bg-amber-500/10",
      textColor: "text-amber-500",
    };
  }

  const missingDocs = [];
  if (!doc?.npwpPhotoUrl) missingDocs.push("NPWP");
  if (!doc?.bpjsKesehatanPhotoUrl) missingDocs.push("BPJS Kes");
  if (!doc?.bpjsKetenagakerjaanPhotoUrl) missingDocs.push("BPJS TK");

  if (missingDocs.length > 0) {
    return {
      status: `${missingDocs.join(", ")} Belum Ada`,
      priority: 3,
      color: "border-red-500/30",
      bgColor: "bg-red-500/10",
      textColor: "text-red-500",
    };
  }

  const completeness = calculateProfileCompleteness(profile ?? null);
  if (completeness.status === "not_started") {
    return {
      status: "Data Belum Lengkap",
      priority: 2,
      color: "border-orange-500/30",
      bgColor: "bg-orange-500/10",
      textColor: "text-orange-500",
    };
  }

  if (completeness.status === "partial") {
    return {
      status: "Data Tidak Lengkap",
      priority: 1,
      color: "border-slate-500/30",
      bgColor: "bg-slate-500/10",
      textColor: "text-slate-400",
    };
  }

  return {
    status: "Tidak Ada Masalah",
    priority: 0,
    color: "border-emerald-500/30",
    bgColor: "bg-emerald-500/10",
    textColor: "text-emerald-500",
  };
}

function generateEmployeeId(employee: MergedEmployee, index: number): string {
  if (employee.employeeNumber) {
    return employee.employeeNumber;
  }
  return "-";
}

function SummaryCard({
  label,
  count,
  icon: Icon,
  color,
}: {
  label: string;
  count: number;
  icon: any;
  color: string;
}) {
  return (
    <div className="flex-1 min-w-[120px] bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/50 p-3 rounded-xl hover:border-slate-300 dark:hover:border-slate-700 transition-all group">
      <div className="flex items-center justify-between mb-3">
        <div className={cn("p-2 rounded-lg", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">
          {count}
        </span>
      </div>
      <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
        {label}
      </p>
    </div>
  );
}

function SyncManagementHrdButton({
  users,
  onSuccess,
}: {
  users: UserProfile[];
  onSuccess?: () => void;
}) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    if (!window.confirm("Sinkronisasi data management dan HRD sebagai karyawan aktif?\n\nOperasi ini tidak akan menghapus data pribadi yang sudah ada.")) return;
    setIsSyncing(true);
    let updatedCount = 0;
    let errorCount = 0;

    try {
      for (const user of users) {
        const role = (user.role || "").toLowerCase();
        if (["super-admin", "super_admin", "system-admin", "admin-system"].includes(role)) continue;

        const isManagement = user.structuralLevel === "management" || (role === "manager" && (user.managementScopes?.length ?? 0) > 0);
        const isHrd = role === "hrd";

        if (!isManagement && !isHrd) continue;

        const baseData: Record<string, any> = {
          uid: user.uid,
          fullName: user.fullName,
          email: user.email || "",
          employmentStatus: "active",
          isEmployee: true,
          canRequestOvertime: false,
          updatedAt: new Date().toISOString(),
        };

        if (isManagement) {
          baseData.structuralLevel = "management";
          baseData.workRole = user.workRole || user.jobTitle || "Manager";
          baseData.positionTitle = user.workRole || user.positionTitle || "Manager";

          const primaryScope = user.managementScopes?.[0] || null;
          if (primaryScope) {
            baseData.managementScopes = user.managementScopes;
            const isAllBrands = primaryScope.scopeType === "all" || primaryScope.brandId === "all";
            const isSelectedDivisions = primaryScope.scopeType === "selected_divisions";

            if (!isAllBrands) {
              baseData.brandId = primaryScope.brandId;
              baseData.brandName = primaryScope.brandName;
            } else {
              baseData.brandId = null;
              baseData.brandName = "Semua Brand / Perusahaan";
            }

            if (isSelectedDivisions && (primaryScope.divisionIds?.length ?? 0) > 0 && primaryScope.divisionIds![0] !== "all") {
              baseData.divisionId = primaryScope.divisionIds![0];
              baseData.divisionName = primaryScope.divisionNames?.[0] || "Divisi";
            } else {
              baseData.divisionId = null;
              baseData.divisionName = isAllBrands ? "Semua Brand / Perusahaan" : "Seluruh Brand / Perusahaan";
            }
          }
        }

        if (isHrd) {
          baseData.role = "hrd";
          baseData.workRole = user.workRole || "HRD";
          baseData.positionTitle = user.workRole || user.positionTitle || "HRD";
          baseData.canRequestLeave = true;
          baseData.canRequestPermission = true;
          baseData.canUseEmployeeFeatures = true;
          baseData.attendanceMethod = baseData.attendanceMethod || "web";

          const brandIdRaw = user.brandId;
          const resolvedBrandId = Array.isArray(brandIdRaw) ? brandIdRaw[0] : brandIdRaw;
          if (resolvedBrandId) baseData.brandId = resolvedBrandId;
          if (user.brandName) baseData.brandName = user.brandName;
          if (user.divisionId) baseData.divisionId = user.divisionId;
          if (user.divisionName) baseData.divisionName = user.divisionName;
        }

        try {
          const empRef = doc(firestore, "employee_profiles", user.uid);
          await setDoc(empRef, baseData, { merge: true });
          updatedCount++;
        } catch (e) {
          errorCount++;
          console.error(`[SyncMgmt] Failed for ${user.fullName}:`, e);
        }
      }

      toast({
        title: "Sinkronisasi Selesai",
        description: `${updatedCount} profil diperbarui${errorCount ? `, ${errorCount} gagal` : ""}. Refresh halaman untuk melihat perubahan.`,
      });
      onSuccess?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Sinkronisasi",
        description: error.message,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={isSyncing}
      className="rounded-xl border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-900/50 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/20 hover:text-teal-700 dark:hover:text-teal-300"
    >
      {isSyncing ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 h-3.5 w-3.5" />
      )}
      Sinkronisasi Management & HRD
    </Button>
  );
}

export default function KaryawanDataPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(["hrd", "super-admin"]);
  const firestore = useFirestore();
  const { toast } = useToast();

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  const [activeTab, setActiveTab] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [completenessFilter, setCompletenessFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [actionNeededFilter, setActionNeededFilter] = useState("all");
  const [sortBy, setSortBy] = useState<
    | "name-asc"
    | "name-desc"
    | "completeness-asc"
    | "completeness-desc"
    | "needs-review"
  >("name-asc");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Set initial tab from query param if available
  useMemo(() => {
    const filter = searchParams.get("filter");
    if (filter === "review") {
      setActiveTab("review");
    }
  }, [searchParams]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [completenessFilter, actionNeededFilter, searchTerm, sortBy, brandFilter, activeTab]);

  const [selectedReviewEmp, setSelectedReviewEmp] =
    useState<MergedEmployee | null>(null);
  const [selectedReviewReq, setSelectedReviewReq] = useState<any | null>(null);
  const [showMtdAbsensiModal, setShowMtdAbsensiModal] = useState(false);

  const pendingBankConstraints = useMemo(() => [where("status", "==", "pending")], []);
  const userConstraints = useMemo(
    () => [where("role", "in", ["karyawan", "manager"]), where("isActive", "==", true)],
    [],
  );

  const { data: pendingBankRequests, mutate: mutateBankRequests } =
    useHrdScopedCollection<any>("bank_change_requests", { constraints: pendingBankConstraints });

  const {
    data: users,
    isLoading: usersLoading,
    isScopeConfigured,
    emptyStateMessage,
  } = useHrdScopedCollection<UserProfile>("users", { constraints: userConstraints });

  const {
    data: employees,
    isLoading: employeesLoading,
    mutate,
  } = useHrdScopedCollection<EmployeeMasterData>("employees");

  const { data: employeeProfiles, isLoading: profilesLoading } =
    useHrdScopedCollection<EmployeeProfile>("employee_profiles");

  const { data: brands, isLoading: brandsLoading } = useHrdScopedBrands();

  const isLoading = usersLoading || employeesLoading || profilesLoading || brandsLoading;

  const allMerged = useMemo<MergedEmployee[]>(() => {
    if (isLoading) return [];

    const systemRoles = [
      "super-admin", "system-admin", "admin-system",
      "super_admin", "system_admin", "admin_system",
      // "hrd" intentionally NOT excluded — HRD is also an active employee
    ];

    // Index users and employees by uid for fast lookup
    const usersByUid = new Map<string, UserProfile>();
    (users ?? []).forEach((u) => usersByUid.set(u.uid, u));

    const employeesByUid = new Map<string, EmployeeMasterData>();
    (employees ?? []).forEach((e) => employeesByUid.set(e.uid, e));

    // Index profiles by uid AND by email (for legacy email-keyed docs)
    const profilesByUid = new Map<string, EmployeeProfile>();
    const profilesByEmail = new Map<string, EmployeeProfile>();
    (employeeProfiles ?? []).forEach((p) => {
      const docUid = (p as any).uid || (p as any).id;
      if (docUid) profilesByUid.set(docUid, p);
      if (p.email) profilesByEmail.set(p.email.toLowerCase(), p);
    });

    const seenUids = new Set<string>();
    const result: MergedEmployee[] = [];

    // ── PASS 1: Iterate employee_profiles (primary source of truth) ──────────
    (employeeProfiles ?? []).forEach((profile) => {
      const uid = (profile as any).uid || (profile as any).id;
      if (!uid) return; // skip malformed docs
      if (seenUids.has(uid)) return; // deduplicate
      seenUids.add(uid);

      const user = usersByUid.get(uid);
      const emp = employeesByUid.get(uid);

      // Exclude system accounts
      if (user?.role && systemRoles.includes(user.role)) return;

      // Resolve display name — never show blank
      const resolvedName =
        emp?.fullName ||
        profile?.fullName ||
        (profile as any)?.employeeName ||
        (profile as any)?.name ||
        (profile as any)?.displayName ||
        (profile?.dataDiriIdentitas as any)?.namaLengkap ||
        (profile?.dataDiriIdentitas as any)?.namaPanggilan ||
        user?.fullName ||
        (user as any)?.displayName ||
        emp?.email ||
        profile?.email ||
        user?.email ||
        "";

      // Log missing names for recovery audit
      if (!resolvedName) {
        console.warn(`[DataKaryawan] uid=${uid} — nama tidak ditemukan di semua sumber`);
      }

      const hrdEmploymentInfo = profile?.hrdEmploymentInfo || {};
      const normalized = normalizeEmployeeRow(emp ?? {}, profile, user ?? {}, brands || []);

      const employmentStatus = emp?.employmentStatus || hrdEmploymentInfo?.statusKerja || "";
      const mappedType = getMappedEmployeeType({
        employmentStatus,
        employmentType: normalized.tipeKaryawan,
        hrdEmploymentInfo,
      });

      // Read structuralPosition from dedicated field, never conflate with employmentType
      const structuralPosition =
        (profile as any)?.structuralPosition ||
        (profile as any)?.structuralLevel ||
        hrdEmploymentInfo?.structuralPosition ||
        (emp as any)?.structuralPosition ||
        (user as any)?.structuralPosition ||
        normalized.structuralPosition ||
        "staff";

      const isDivisionManager =
        structuralPosition === "division_manager" ||
        profile?.isDivisionManager ||
        (user as any)?.isDivisionManager ||
        false;

      result.push({
        uid,
        fullName: resolvedName,
        email: emp?.email || profile?.email || user?.email || "",
        employeeNumber:
          hrdEmploymentInfo?.employeeId ||
          (emp as any)?.employeeId ||
          (emp as any)?.nomorIndukKaryawan ||
          profile?.employeeNumber ||
          undefined,
        positionTitle: normalized.jabatan,
        division: normalized.divisi,
        brandId: normalized.brandId,
        brandName: normalized.brandName,
        employmentStatus,
        employmentType: normalized.tipeKaryawan,
        structuralPosition,
        isDivisionManager,
        joinDate: emp?.joinDate ?? emp?.startDate,
        employeeProfile: profile,
        hrdEmploymentInfo,
        hasProfile: true,
        operationalStatus: normalized.statusKerja,
        operationalStatusLabel: getOperationalStatusLabel(normalized.statusKerja),
        mappedType,
        mappedTypeLabel: getMappedEmployeeTypeLabel(mappedType),
        needsHrdAttention: normalized.needsHrdAttention,
        pendingBankRequest: pendingBankRequests?.find((r) => r.employeeUid === uid),
        userRole: user?.role || "",
        managementScopes: user?.managementScopes || (profile as any)?.managementScopes || [],
        source: (user as any)?.source || null,
        inviteBatchId: (user as any)?.inviteBatchId || null,
      });
    });

    // ── PASS 2: users with role 'karyawan'/'hrd'/management that have NO profile yet ──
    // Only show these if they don't already appear via profile
    (users ?? []).forEach((u) => {
      if (seenUids.has(u.uid)) return;
      if (u.role && systemRoles.includes(u.role)) return;
      if (u.role === "kandidat") return;
      // Include karyawan, HRD (active employee), or users with employment/structural data
      const isHrdUser = u.role === "hrd" && u.isActive !== false;
      if (u.role !== "karyawan" && !isHrdUser && !(u as any).employmentType && !(u as any).structuralLevel) return;

      seenUids.add(u.uid);

      const emp = employeesByUid.get(u.uid);
      const profile = null; // confirmed: no profile for this uid
      const hrdEmploymentInfo = {};
      const normalized = normalizeEmployeeRow(emp ?? u, profile, u, brands || []);

      const employmentStatus = (u as any).employmentStatus || "";
      const mappedType = getMappedEmployeeType({
        employmentStatus,
        employmentType: normalized.tipeKaryawan,
        hrdEmploymentInfo,
      });

      const structuralPosition =
        (u as any).structuralPosition ||
        (u as any).structuralLevel ||
        normalized.structuralPosition ||
        "staff";

      result.push({
        uid: u.uid,
        fullName: u.fullName || (u as any)?.displayName || u.email || "",
        email: u.email || "",
        employeeNumber: (u as any)?.employeeId || (u as any)?.nomorIndukKaryawan || undefined,
        positionTitle: normalized.jabatan,
        division: normalized.divisi,
        brandId: normalized.brandId,
        brandName: normalized.brandName,
        employmentStatus,
        employmentType: normalized.tipeKaryawan,
        structuralPosition,
        isDivisionManager: structuralPosition === "division_manager" || (u as any)?.isDivisionManager || false,
        employeeProfile: null,
        hrdEmploymentInfo,
        hasProfile: false,
        operationalStatus: normalized.statusKerja,
        operationalStatusLabel: getOperationalStatusLabel(normalized.statusKerja),
        mappedType,
        mappedTypeLabel: getMappedEmployeeTypeLabel(mappedType),
        needsHrdAttention: true,
        pendingBankRequest: pendingBankRequests?.find((r) => r.employeeUid === u.uid),
        userRole: u.role || "",
        managementScopes: u.managementScopes || [],
        source: (u as any).source || null,
        inviteBatchId: (u as any).inviteBatchId || null,
      });
    });

    return result;
  }, [
    employees,
    users,
    employeeProfiles,
    brands,
    pendingBankRequests,
    isLoading,
  ]);

  const filteredEmployees = useMemo(() => {
    let filtered = allMerged.filter((emp) => {
      const status = emp.operationalStatus;
      let tabMatch = false;
      if (activeTab === "all") tabMatch = true;
      else if (activeTab === "review") tabMatch = !!emp.pendingBankRequest;
      else if (activeTab === "tetap") tabMatch = emp.mappedType === "tetap";
      else if (activeTab === "kontrak") tabMatch = emp.mappedType === "kontrak";
      else if (activeTab === "probation") tabMatch = emp.mappedType === "probation";
      else if (activeTab === "magang") tabMatch = emp.mappedType === "magang";
      else if (activeTab === "belum_diatur") tabMatch = emp.mappedType === "belum_diatur";
      else if (activeTab === "nonaktif") tabMatch = emp.mappedType === "nonaktif";

      if (!tabMatch) return false;
      const brandMatch = brandFilter === "all" || emp.brandId === brandFilter;
      if (!brandMatch) return false;
      const searchMatch =
        searchTerm === "" ||
        emp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase());
      if (!searchMatch) return false;
      if (completenessFilter !== "all") {
        const c = calculateProfileCompleteness(emp.employeeProfile ?? null);
        if (completenessFilter === "complete" && c.status !== "complete")
          return false;
        if (completenessFilter === "partial" && c.status !== "partial")
          return false;
        if (completenessFilter === "not_started" && c.status !== "not_started")
          return false;
      }

      // Action needed filter
      if (actionNeededFilter !== "all") {
        const actionStatus = getActionNeededStatus(emp);
        if (actionNeededFilter === "review" && actionStatus.priority !== 4)
          return false;
        if (
          actionNeededFilter === "bank_pending" &&
          actionStatus.priority !== 4
        )
          return false;
        if (
          actionNeededFilter === "npwp_missing" &&
          !actionStatus.status.includes("NPWP")
        )
          return false;
        if (
          actionNeededFilter === "bpjs_missing" &&
          !actionStatus.status.includes("BPJS")
        )
          return false;
        if (
          actionNeededFilter === "data_incomplete" &&
          actionStatus.priority < 2
        )
          return false;
        if (
          actionNeededFilter === "data_complete" &&
          actionStatus.priority !== 0
        )
          return false;
      }

      return true;
    });

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.fullName
            .toLowerCase()
            .localeCompare(b.fullName.toLowerCase());
        case "name-desc":
          return b.fullName
            .toLowerCase()
            .localeCompare(a.fullName.toLowerCase());
        case "completeness-asc": {
          const aComp = calculateProfileCompleteness(a.employeeProfile ?? null);
          const bComp = calculateProfileCompleteness(b.employeeProfile ?? null);
          return aComp.percentage - bComp.percentage;
        }
        case "completeness-desc": {
          const aComp = calculateProfileCompleteness(a.employeeProfile ?? null);
          const bComp = calculateProfileCompleteness(b.employeeProfile ?? null);
          return bComp.percentage - aComp.percentage;
        }
        case "needs-review": {
          const aStatus = getActionNeededStatus(a);
          const bStatus = getActionNeededStatus(b);
          // Sort by priority (higher priority first), then by name
          if (aStatus.priority !== bStatus.priority) {
            return bStatus.priority - aStatus.priority;
          }
          return a.fullName
            .toLowerCase()
            .localeCompare(b.fullName.toLowerCase());
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [
    allMerged,
    activeTab,
    brandFilter,
    searchTerm,
    completenessFilter,
    actionNeededFilter,
    sortBy,
  ]);

  // Pagination logic
  const totalPages = Math.ceil(filteredEmployees.length / pageSize);
  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredEmployees.slice(startIndex, startIndex + pageSize);
  }, [filteredEmployees, currentPage, pageSize]);

  // Calculate tab counts based on filtered brand
  const tabCounts = useMemo(() => {
    const brandFiltered = brandFilter === "all"
      ? allMerged
      : allMerged.filter((e) => e.brandId === brandFilter);

    return {
      all: brandFiltered.length,
      review: brandFiltered.filter((e) => e.pendingBankRequest).length,
      tetap: brandFiltered.filter((e) => e.mappedType === "tetap").length,
      kontrak: brandFiltered.filter((e) => e.mappedType === "kontrak").length,
      probation: brandFiltered.filter((e) => e.mappedType === "probation").length,
      magang: brandFiltered.filter((e) => e.mappedType === "magang").length,
      belum_diatur: brandFiltered.filter((e) => e.mappedType === "belum_diatur").length,
      nonaktif: brandFiltered.filter((e) => e.mappedType === "nonaktif").length,
    };
  }, [allMerged, brandFilter]);

  const pendingReviewCount = tabCounts.review;

  const groupedEmployees = useMemo(() => {
    const groups: Record<string, MergedEmployee[]> = {
      tetap: [],
      kontrak: [],
      probation: [],
      magang: [],
      belum_diatur: [],
      nonaktif: [],
    };
    paginatedEmployees.forEach((emp) => {
      if (groups[emp.mappedType])
        groups[emp.mappedType].push(emp);
      else groups.belum_diatur.push(emp);
    });
    return groups;
  }, [paginatedEmployees]);

  const stats = useMemo(() => {
    // Filter by brand for stats calculation
    const brandFiltered = brandFilter === "all"
      ? allMerged
      : allMerged.filter((e) => e.brandId === brandFilter);

    return {
      total: brandFiltered.length,
      tetap: brandFiltered.filter((e) => e.mappedType === "tetap").length,
      kontrak: brandFiltered.filter((e) => e.mappedType === "kontrak").length,
      probation: brandFiltered.filter((e) => e.mappedType === "probation").length,
      magang: brandFiltered.filter((e) => e.mappedType === "magang").length,
      belum_diatur: brandFiltered.filter((e) => e.mappedType === "belum_diatur").length,
      nonaktif: brandFiltered.filter((e) => e.mappedType === "nonaktif").length,
      // Administrative stats
      needsReview: brandFiltered.filter((e) => e.pendingBankRequest).length,
      bankPending: brandFiltered.filter((e) => e.pendingBankRequest).length,
      npwpMissing: brandFiltered.filter(
        (e) => !e.employeeProfile?.dokumenAdministratif?.npwpPhotoUrl,
      ).length,
      bpjsMissing: brandFiltered.filter(
        (e) =>
          !e.employeeProfile?.dokumenAdministratif?.bpjsKesehatanPhotoUrl ||
          !e.employeeProfile?.dokumenAdministratif?.bpjsKetenagakerjaanPhotoUrl,
      ).length,
      dataIncomplete: brandFiltered.filter((e) => {
        const c = calculateProfileCompleteness(e.employeeProfile ?? null);
        return c.status === "not_started" || c.status === "partial";
      }).length,
      dataComplete: brandFiltered.filter((e) => {
        const c = calculateProfileCompleteness(e.employeeProfile ?? null);
        return c.status === "complete";
      }).length,
    };
  }, [allMerged, brandFilter]);

  const handleExport = () => {
    if (!filteredEmployees.length) {
      toast({
        title: "Tidak Ada Data",
        description: "Tidak ada data untuk diekspor.",
      });
      return;
    }
    const headers = [
      "fullName",
      "email",
      "positionTitle",
      "division",
      "brandName",
      "employmentStatus",
      "employeeNumber",
    ];
    const csvContent = [
      headers.join(","),
      ...filteredEmployees.map((e) =>
        headers
          .map(
            (h) => `"${((e as any)[h] || "").toString().replace(/"/g, '""')}"`,
          )
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `karyawan-${activeTab}-${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadTemplate = () => {
    const headers =
      "fullName,email,phone,employeeNumber,positionTitle,division,brandName,joinDate(YYYY-MM-DD),employmentStatus(active/probation/resigned/terminated)";
    const blob = new Blob([headers], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", "template-karyawan.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!hasAccess) {
    return (
      <DashboardLayout pageTitle="Data Karyawan" menuConfig={menuConfig}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isScopeConfigured) {
    return (
      <DashboardLayout pageTitle="Data Karyawan" menuConfig={menuConfig}>
        <HrdScopeEmptyState message={emptyStateMessage} />
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout pageTitle="Data Karyawan" menuConfig={menuConfig}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <DashboardLayout pageTitle="Employee Directory" menuConfig={menuConfig}>
        <div className="space-y-8 w-full max-w-[1800px] mx-auto px-4 md:px-8 pb-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Data Karyawan
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Directory administrasi karyawan terpusat PT. HRP Environesia
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <SyncManagementHrdButton users={users ?? []} onSuccess={() => mutate?.()} />
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-teal-400 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40 font-semibold"
                onClick={() => setShowMtdAbsensiModal(true)}
              >
                <Settings2 className="mr-2 h-3.5 w-3.5" /> Kelola Metode Absensi
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                onClick={() => setIsImportOpen(true)}
              >
                <Upload className="mr-2 h-3.5 w-3.5" /> Import
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                onClick={handleExport}
              >
                <Download className="mr-2 h-3.5 w-3.5" /> Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                onClick={handleDownloadTemplate}
              >
                <FileSpreadsheet className="mr-2 h-3.5 w-3.5" /> Template
              </Button>
            </div>
          </div>

          {pendingReviewCount > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-500/20 rounded-xl">
                  <AlertTriangle className="h-6 w-6 text-amber-500" />
                </div>
                <p className="text-[15px] font-medium text-amber-500/90">
                  Ada{" "}
                  <span className="font-bold text-amber-500 text-base">
                    {pendingReviewCount}
                  </span>{" "}
                  perubahan data rekening karyawan yang membutuhkan tindakan
                  HRD.
                </p>
              </div>
              <Button
                size="lg"
                variant="default"
                className="bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold h-11 px-6 rounded-xl text-sm w-full md:w-auto"
                onClick={() => setActiveTab("review")}
              >
                Lihat yang Perlu Direview
              </Button>
            </div>
          )}

          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            <SummaryCard
              label="Total Karyawan"
              count={stats.total}
              icon={Users}
              color="bg-slate-500/10 text-slate-500"
            />
            <SummaryCard
              label="Tetap"
              count={stats.tetap}
              icon={CheckCircle}
              color="bg-emerald-500/10 text-emerald-500"
            />
            <SummaryCard
              label="Kontrak"
              count={stats.kontrak}
              icon={FileSpreadsheet}
              color="bg-blue-500/10 text-blue-500"
            />
            <SummaryCard
              label="Probation"
              count={stats.probation}
              icon={AlertTriangle}
              color="bg-orange-500/10 text-orange-500"
            />
            <SummaryCard
              label="Magang"
              count={stats.magang}
              icon={Briefcase}
              color="bg-indigo-500/10 text-indigo-500"
            />
            <SummaryCard
              label="Belum Diatur"
              count={stats.belum_diatur}
              icon={GraduationCap}
              color="bg-slate-500/10 text-slate-500"
            />
            <SummaryCard
              label="Nonaktif"
              count={stats.nonaktif}
              icon={XCircle}
              color="bg-red-500/10 text-red-500"
            />
          </div>

          {/* Administrative Summary Cards */}
          <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/50 p-4 rounded-xl">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">
              Status Administrasi
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              <SummaryCard
                label="Perlu Review HRD"
                count={stats.needsReview}
                icon={Clock}
                color="bg-amber-500/10 text-amber-500"
              />
              <SummaryCard
                label="Rekening Pending"
                count={stats.bankPending}
                icon={CreditCard}
                color="bg-amber-500/10 text-amber-500"
              />
              <SummaryCard
                label="NPWP Belum Ada"
                count={stats.npwpMissing}
                icon={FileText}
                color="bg-red-500/10 text-red-500"
              />
              <SummaryCard
                label="BPJS Belum Ada"
                count={stats.bpjsMissing}
                icon={Shield}
                color="bg-red-500/10 text-red-500"
              />
              <SummaryCard
                label="Data Lengkap"
                count={stats.dataComplete}
                icon={CheckCircle}
                color="bg-emerald-500/10 text-emerald-500"
              />
            </div>
          </div>

          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 backdrop-blur-xl">
            <CardHeader className="p-5 border-b border-slate-200 dark:border-slate-800/50">
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3.5 top-3 h-5 w-5 text-slate-400 dark:text-slate-500" />
                  <Input
                    placeholder="Cari nama atau email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 h-11 pl-11 rounded-xl focus:border-emerald-500/50 transition-all text-sm text-slate-900 dark:text-white"
                  />
                </div>

                {(brands?.length || 0) === 1 ? (
                  <div className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
                    Perusahaan: {brands?.[0]?.name || brands?.[0]?.id}
                  </div>
                ) : (
                  <Select value={brandFilter} onValueChange={setBrandFilter}>
                    <SelectTrigger className="w-[180px] bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 h-11 rounded-xl text-sm font-medium text-slate-900 dark:text-white">
                      <SelectValue placeholder="Brand" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                      <SelectItem value="all">Semua Brand</SelectItem>
                      {brands?.map((b) => (
                        <SelectItem key={b.id!} value={b.id!}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Select
                  value={completenessFilter}
                  onValueChange={setCompletenessFilter}
                >
                  <SelectTrigger className="w-[180px] bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 h-11 rounded-xl text-sm font-medium text-slate-900 dark:text-white">
                    <SelectValue placeholder="Kelengkapan" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <SelectItem value="all">Semua Kelengkapan</SelectItem>
                    <SelectItem value="complete">Lengkap</SelectItem>
                    <SelectItem value="partial">Sebagian</SelectItem>
                    <SelectItem value="not_started">Belum Isi</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={actionNeededFilter}
                  onValueChange={setActionNeededFilter}
                >
                  <SelectTrigger className="w-[200px] bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 h-11 rounded-xl text-sm font-medium text-slate-900 dark:text-white">
                    <SelectValue placeholder="Action Needed" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="review">Perlu Review HRD</SelectItem>
                    <SelectItem value="bank_pending">
                      Rekening Pending
                    </SelectItem>
                    <SelectItem value="npwp_missing">NPWP Belum Ada</SelectItem>
                    <SelectItem value="bpjs_missing">BPJS Belum Ada</SelectItem>
                    <SelectItem value="data_incomplete">
                      Data Tidak Lengkap
                    </SelectItem>
                    <SelectItem value="data_complete">Data Lengkap</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={sortBy}
                  onValueChange={(value: any) => setSortBy(value)}
                >
                  <SelectTrigger className="w-[180px] bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 h-11 rounded-xl text-sm font-medium text-slate-900 dark:text-white">
                    <SelectValue placeholder="Urutkan" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <SelectItem value="name-asc">Nama A-Z</SelectItem>
                    <SelectItem value="name-desc">Nama Z-A</SelectItem>
                    <SelectItem value="completeness-desc">
                      Kelengkapan Tertinggi
                    </SelectItem>
                    <SelectItem value="completeness-asc">
                      Kelengkapan Terendah
                    </SelectItem>
                    <SelectItem value="needs-review">
                      Perlu Review Dulu
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800/50"
                >
                  <TabsList className="h-9 bg-transparent gap-1.5">
                    <TabsTrigger
                      value="all"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4 text-slate-600 dark:text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white"
                    >
                      Semua ({tabCounts.all})
                    </TabsTrigger>
                    <TabsTrigger
                      value="review"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4 text-amber-600 dark:text-amber-500 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-700 dark:data-[state=active]:text-amber-400"
                    >
                      Perlu Review HRD ({tabCounts.review})
                    </TabsTrigger>
                    <TabsTrigger
                      value="tetap"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4 text-slate-600 dark:text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white"
                    >
                      Tetap ({tabCounts.tetap})
                    </TabsTrigger>
                    <TabsTrigger
                      value="kontrak"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4 text-slate-600 dark:text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white"
                    >
                      Kontrak ({tabCounts.kontrak})
                    </TabsTrigger>
                    <TabsTrigger
                      value="probation"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4 text-slate-600 dark:text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white"
                    >
                      Probation ({tabCounts.probation})
                    </TabsTrigger>
                    <TabsTrigger
                      value="magang"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4 text-slate-600 dark:text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white"
                    >
                      Magang ({tabCounts.magang})
                    </TabsTrigger>
                    <TabsTrigger
                      value="belum_diatur"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4 text-slate-600 dark:text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white"
                    >
                      Belum Diatur ({tabCounts.belum_diatur})
                    </TabsTrigger>
                    <TabsTrigger
                      value="nonaktif"
                      className="h-7 text-xs uppercase font-bold rounded-lg px-4 text-slate-600 dark:text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white"
                    >
                      Nonaktif ({tabCounts.nonaktif})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {(searchTerm ||
                  brandFilter !== "all" ||
                  completenessFilter !== "all" ||
                  actionNeededFilter !== "all" ||
                  sortBy !== "name-asc" ||
                  activeTab !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    onClick={() => {
                      setSearchTerm("");
                      setBrandFilter("all");
                      setCompletenessFilter("all");
                      setActionNeededFilter("all");
                      setActiveTab("all");
                      setSortBy("name-asc");
                      setCurrentPage(1);
                    }}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-20 text-center space-y-4">
                  <Loader2 className="h-10 w-10 animate-spin text-emerald-500 mx-auto" />
                  <p className="text-sm text-slate-500 font-medium">
                    Menyusun direktori karyawan...
                  </p>
                </div>
              ) : filteredEmployees.length > 0 ? (
                <Accordion
                  type="multiple"
                  defaultValue={Object.keys(groupedEmployees)}
                  className="w-full"
                >
                  {Object.entries(groupedEmployees)
                    .filter(([_, emps]) => emps.length > 0)
                    .map(([status, emps]) => (
                      <AccordionItem
                        value={status}
                        key={status}
                        className="border-b border-slate-200 dark:border-slate-800/50 last:border-0"
                      >
                        <AccordionTrigger className="px-6 py-3 bg-slate-100 dark:bg-slate-900/20 hover:no-underline group">
                          <div className="flex items-center gap-3">
                            <EmployeeTypeBadge
                              type={status as MappedEmployeeType}
                            />
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                              {emps.length} Personel
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-0 pb-0">
                          <div className="overflow-x-auto w-full">
                            <Table className="w-full table-fixed min-w-[1200px]">
                              <TableHeader className="bg-slate-50 dark:bg-slate-900/40">
                                <TableRow className="border-slate-200 dark:border-slate-800/50 hover:bg-transparent">
                                  <TableHead className="text-xs uppercase font-bold text-slate-600 dark:text-slate-400 px-6 h-12 w-[60px] sticky left-0 bg-slate-50 dark:bg-slate-900/40 z-10">
                                    No
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-600 dark:text-slate-400 h-12 w-[120px]">
                                    Employee ID
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-600 dark:text-slate-400 h-12 min-w-[300px]">
                                    Karyawan
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-600 dark:text-slate-400 h-12 min-w-[200px]">
                                    Brand/Divisi
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-600 dark:text-slate-400 h-12 w-[120px]">
                                    Status
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-600 dark:text-slate-400 h-12 w-[160px]">
                                    Kelengkapan
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-600 dark:text-slate-400 h-12 min-w-[250px]">
                                    Action Needed
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-600 dark:text-slate-400 h-12 w-[130px]">
                                    Metode Absensi
                                  </TableHead>
                                  <TableHead className="text-xs uppercase font-bold text-slate-600 dark:text-slate-400 h-12 min-w-[300px]">
                                    Admin Check
                                  </TableHead>
                                  <TableHead className="text-right px-6 h-12 min-w-[200px] text-xs uppercase font-bold text-slate-600 dark:text-slate-400">
                                    Aksi
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {emps.map((emp, index) => {
                                  const globalIndex =
                                    (currentPage - 1) * pageSize + index + 1;
                                  const c = calculateProfileCompleteness(
                                    emp.employeeProfile ?? null,
                                  );
                                  const actionStatus =
                                    getActionNeededStatus(emp);
                                  const employeeId = generateEmployeeId(
                                    emp,
                                    globalIndex,
                                  );
                                  const hasPendingReq =
                                    !!emp.pendingBankRequest;
                                  return (
                                    <TableRow
                                      key={`${emp.uid}-${index}`}
                                      className={cn(
                                        "border-slate-200 dark:border-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-colors group min-h-[88px]",
                                        hasPendingReq && "bg-amber-50 dark:bg-amber-500/[0.04]",
                                      )}
                                    >
                                      <TableCell className="px-6 py-6 text-center align-middle sticky left-0 bg-white dark:bg-slate-950/50 backdrop-blur-sm z-10">
                                        <span className="text-sm font-bold text-slate-600 dark:text-slate-400">
                                          {String(globalIndex).padStart(2, "0")}
                                        </span>
                                      </TableCell>
                                      <TableCell className="py-6 align-middle">
                                        <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300">
                                          {employeeId}
                                        </span>
                                      </TableCell>
                                      <TableCell className="px-6 py-6 align-middle">
                                        <div className="flex flex-col gap-1">
                                          <span className="text-base font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                            {emp.fullName || emp.email || "Nama belum tersedia"}
                                          </span>
                                          <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                                            {emp.email}
                                          </span>
                                          {(emp as any).source === 'employee_invite' && (
                                            <Badge className="w-fit border-0 bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 text-[10px] px-1.5 h-4 mt-0.5">
                                              Employee Invite
                                            </Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="py-6 align-middle">
                                        <div className="flex flex-col gap-1 items-start">
                                          {emp.brandName ? (
                                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                              {emp.brandName}
                                            </span>
                                          ) : (emp.structuralPosition === "management" || emp.userRole === "manager") ? (
                                            <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                                              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                              {(emp.managementScopes?.length ?? 0) > 0 ? "Belum sinkron dari scope" : "Brand belum diatur"}
                                            </span>
                                          ) : (
                                            <span className="text-sm text-slate-400 dark:text-slate-500">—</span>
                                          )}
                                          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                            {emp.division}
                                          </span>
                                          {emp.userRole === "hrd" ? (
                                            <Badge className="bg-teal-500/10 text-teal-600 border-teal-500/20 text-[10px] mt-1 h-5 px-1.5 uppercase font-bold tracking-widest dark:text-teal-400">HRD</Badge>
                                          ) : (emp.isDivisionManager || emp.structuralPosition === "division_manager") ? (
                                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] mt-1 h-5 px-1.5 uppercase font-bold tracking-widest">Manager Divisi</Badge>
                                          ) : emp.structuralPosition === "supervisor" ? (
                                            <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[10px] mt-1 h-5 px-1.5 uppercase font-bold tracking-widest">Supervisor</Badge>
                                          ) : emp.structuralPosition === "management" || emp.userRole === "manager" ? (
                                            <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px] mt-1 h-5 px-1.5 uppercase font-bold tracking-widest">Direksi/Manajemen</Badge>
                                          ) : (
                                            <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 text-[10px] mt-1 h-5 px-1.5 uppercase font-bold tracking-widest">Staff</Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="py-6 align-middle">
                                        <EmployeeTypeBadge
                                          type={emp.mappedType}
                                        />
                                      </TableCell>
                                      <TableCell className="py-6 align-middle">
                                        <div className="flex flex-col gap-2">
                                          <div className="w-28 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                              className={cn(
                                                "h-full transition-all",
                                                c.status === "complete"
                                                  ? "bg-emerald-500"
                                                  : "bg-amber-500",
                                              )}
                                              style={{
                                                width: `${c.percentage}%`,
                                              }}
                                            />
                                          </div>
                                          <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                                            {c.percentage}%
                                          </span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="py-6 align-middle">
                                        <div className="flex flex-wrap gap-1">
                                          {actionStatus.priority === 4 && (
                                            <Badge
                                              variant="outline"
                                              className="text-[11px] font-bold px-2 py-0.5 h-6 border-amber-500/30 bg-amber-500/10 text-amber-500"
                                            >
                                              Rekening Pending
                                            </Badge>
                                          )}
                                          {actionStatus.status.includes(
                                            "NPWP",
                                          ) && (
                                            <Badge
                                              variant="outline"
                                              className="text-[11px] font-bold px-2 py-0.5 h-6 border-red-500/30 bg-red-500/10 text-red-500"
                                            >
                                              NPWP Belum Ada
                                            </Badge>
                                          )}
                                          {actionStatus.status.includes(
                                            "BPJS Kes",
                                          ) && (
                                            <Badge
                                              variant="outline"
                                              className="text-[11px] font-bold px-2 py-0.5 h-6 border-red-500/30 bg-red-500/10 text-red-500"
                                            >
                                              BPJS Kes Belum Ada
                                            </Badge>
                                          )}
                                          {actionStatus.status.includes(
                                            "BPJS TK",
                                          ) && (
                                            <Badge
                                              variant="outline"
                                              className="text-[11px] font-bold px-2 py-0.5 h-6 border-red-500/30 bg-red-500/10 text-red-500"
                                            >
                                              BPJS TK Belum Ada
                                            </Badge>
                                          )}
                                          {actionStatus.status.includes(
                                            "Data Belum Lengkap",
                                          ) && (
                                            <Badge
                                              variant="outline"
                                              className="text-[11px] font-bold px-2 py-0.5 h-6 border-orange-500/30 bg-orange-500/10 text-orange-500"
                                            >
                                              Data Belum Lengkap
                                            </Badge>
                                          )}
                                          {actionStatus.status.includes(
                                            "Data Tidak Lengkap",
                                          ) && (
                                            <Badge
                                              variant="outline"
                                              className="text-[11px] font-bold px-2 py-0.5 h-6 border-slate-500/30 bg-slate-500/10 text-slate-400"
                                            >
                                              Data Tidak Lengkap
                                            </Badge>
                                          )}
                                          {actionStatus.priority === 0 && (
                                            <Badge
                                              variant="outline"
                                              className="text-[11px] font-bold px-2 py-0.5 h-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                                            >
                                              Tidak Ada Masalah
                                            </Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="py-6 align-middle">
                                        <AttendanceMethodBadge method={(emp.employeeProfile?.attendanceMethod as AttendanceMethodValue) ?? undefined} />
                                      </TableCell>
                                      <TableCell className="py-6 align-middle">
                                        <AdminCheckIcons
                                          profile={emp.employeeProfile}
                                          pendingBankRequest={
                                            emp.pendingBankRequest
                                          }
                                        />
                                      </TableCell>
                                      <TableCell className="text-right px-6 py-6 align-middle">
                                        <div className="flex items-center justify-end gap-3">
                                          {emp.pendingBankRequest && (
                                            <Button
                                              variant="default"
                                              size="sm"
                                              className="h-9 px-4 rounded-xl text-[13px] font-bold bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-md shadow-amber-900/20"
                                              onClick={() => {
                                                setSelectedReviewEmp(emp);
                                                setSelectedReviewReq(
                                                  emp.pendingBankRequest,
                                                );
                                              }}
                                            >
                                              Review Perubahan
                                            </Button>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-9 px-4 rounded-xl text-[13px] font-bold bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all"
                                            onClick={() =>
                                              router.push(
                                                `/admin/hrd/employee-data/karyawan/${emp.uid}`,
                                              )
                                            }
                                          >
                                            Lihat Detail
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                </Accordion>
              ) : (
                <div className="p-20 text-center space-y-4">
                  <Users className="h-12 w-12 text-slate-300 dark:text-slate-800 mx-auto" />
                  <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                    Tidak ada data yang sesuai dengan filter saat ini.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                    onClick={() => {
                      setSearchTerm("");
                      setBrandFilter("all");
                      setCompletenessFilter("all");
                      setActionNeededFilter("all");
                      setActiveTab("all");
                      setSortBy("name-asc");
                      setCurrentPage(1);
                    }}
                  >
                    Bersihkan Filter
                  </Button>
                </div>
              )}
            </CardContent>

            {/* Pagination Controls */}
            {filteredEmployees.length > 0 && (
              <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(value) => {
                        setPageSize(Number(value));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[120px] bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 h-9 rounded-lg text-sm text-slate-900 dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                        <SelectItem value="25">25 per halaman</SelectItem>
                        <SelectItem value="50">50 per halaman</SelectItem>
                        <SelectItem value="100">100 per halaman</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Menampilkan{" "}
                      {Math.min(
                        (currentPage - 1) * pageSize + 1,
                        filteredEmployees.length,
                      )}{" "}
                      -{" "}
                      {Math.min(
                        currentPage * pageSize,
                        filteredEmployees.length,
                      )}{" "}
                      dari {filteredEmployees.length} karyawan
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                      className="h-9 px-3 rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <div className="flex items-center gap-1">
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          const pageNum =
                            Math.max(
                              1,
                              Math.min(totalPages - 4, currentPage - 2),
                            ) + i;
                          if (pageNum > totalPages) return null;
                          return (
                            <Button
                              key={pageNum}
                              variant={
                                currentPage === pageNum ? "default" : "outline"
                              }
                              size="sm"
                              onClick={() => setCurrentPage(pageNum)}
                              className={cn(
                                "h-9 w-9 rounded-lg text-sm font-bold",
                                currentPage === pageNum
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
                              )}
                            >
                              {pageNum}
                            </Button>
                          );
                        },
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="h-9 px-3 rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-50"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </DashboardLayout>

      <ImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImportSuccess={() => mutate?.()}
      />

      <KelolaMtdAbsensiModal
        open={showMtdAbsensiModal}
        onOpenChange={setShowMtdAbsensiModal}
        employees={allMerged}
        currentUserUid={userProfile?.uid || ""}
        currentUserName={userProfile?.fullName || userProfile?.email || ""}
        db={firestore}
        onSuccess={() => mutate?.()}
      />

      {selectedReviewEmp && selectedReviewReq && (
        <BankChangeReviewModal
          open={!!selectedReviewReq}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedReviewEmp(null);
              setSelectedReviewReq(null);
            }
          }}
          request={selectedReviewReq}
          employeeData={selectedReviewEmp}
          onSuccess={() => {
            mutateBankRequests();
          }}
        />
      )}
    </>
  );
}
