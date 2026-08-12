"use client";

import { useState, useMemo, useEffect } from "react";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, doc, writeBatch, serverTimestamp, query, where, getDocs, Timestamp } from "firebase/firestore";
import { useHrdScopedCollection, useHrdScopedBrands } from "@/hooks/useHrdScopedCollection";
import { useHrdScopeContext } from "@/providers/hrd-scope-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/auth-provider";
import { sendNotification } from "@/lib/notifications";
import { Search, Loader2, Filter, FileSpreadsheet, Check, ReceiptText, ShieldCheck, User, Calendar, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface OvertimePayrollRecap {
  id?: string;
  employeeId: string;
  employeeName: string;
  brand: string;
  brandId?: string;
  brandName?: string;
  division: string;
  managerId: string;
  managerName: string;
  overtimeDate: string;
  startTime: string;
  endTime: string;
  submittedMinutes: number;
  estimatedMinutes: number;
  managerApprovedMinutes: number;
  hrdApprovedMinutes: number;
  location: string;
  workMode: string;
  taskSummary: string;
  reason: string;
  payrollMonth: string;
  payrollStatus: "pending_payroll" | "processing" | "paid" | "excluded";
  approvedByHrd: string;
  approvedAt: any;
  
  // Audit Trail
  payrollStatusUpdatedAt?: any;
  payrollStatusUpdatedBy?: string;
  payrollStatusUpdatedByName?: string;
  payrollNotes?: string;
  paidAt?: any;
  paidBy?: string;
  paidByName?: string;
  processedAt?: any;
  processedBy?: string;
  processedByName?: string;
}

interface EmployeeMaster {
  uid: string;
  employeeNumber?: string;
  nik?: string;
}

// ── Dedup: overtime_payroll_recaps can end up with more than one doc for the
// exact same day's overtime (e.g. HRD re-approving after a revision cycle) —
// ReviewOvertimeDialog.tsx's addDoc() there always creates a new doc rather
// than upserting, so this page has to defend against duplicates on its own
// rather than assume the source collection is already clean. Every
// aggregate (total hari lembur, total menit, daily log rows, CSV export)
// must run over the deduped set, never the raw one.
function formatDateKey(value: any): string {
  if (!value) return "";
  try {
    const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return format(date, "yyyy-MM-dd");
  } catch {
    return "";
  }
}

function getOvertimeUniqueKey(item: any): string {
  const employeeUid = item?.employeeUid || item?.employeeId || item?.uid || item?.userId || "";

  const dateKey =
    item?.dateKey ||
    item?.overtimeDateKey ||
    formatDateKey(item?.overtimeDate) ||
    "";

  const start = item?.startTime || item?.startTimeText || "";
  const end = item?.endTime || item?.endTimeText || "";

  const approvedMinutes = Number(
    item?.approvedMinutesFinal ??
    item?.overtimeApprovedMinutes ??
    item?.payrollMinutes ??
    item?.hrdApprovedMinutes ??
    item?.durationMinutes ??
    0,
  );

  return [employeeUid, dateKey, start, end, approvedMinutes].join("__");
}

function dedupeOvertimeSubmissions<T extends Record<string, any>>(items: T[]): T[] {
  const map = new Map<string, T>();

  for (const item of items || []) {
    const key = getOvertimeUniqueKey(item);
    if (!key || key.includes("____")) continue;

    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }

    // Duplicate found — keep whichever was updated/reviewed more recently
    // rather than arbitrarily the first or last one encountered.
    const existing = map.get(key)!;
    const existingUpdated = existing.updatedAt?.seconds || existing.hrdReviewedAt?.seconds || existing.approvedAt?.seconds || 0;
    const currentUpdated = item.updatedAt?.seconds || item.hrdReviewedAt?.seconds || item.approvedAt?.seconds || 0;

    if (currentUpdated > existingUpdated) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

function countUniqueOvertimeDays(items: any[]): number {
  const days = new Set<string>();
  for (const item of items || []) {
    const dateKey = item?.dateKey || item?.overtimeDateKey || formatDateKey(item?.overtimeDate);
    if (dateKey) days.add(dateKey);
  }
  return days.size;
}

// "8 jam 0 menit" is redundant when the minute part is zero — show "8 jam"
// instead, "30 menit" alone when under an hour.
function formatDuration(minutes: number): string {
  const value = Number(minutes) || 0;
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (h <= 0) return `${m} menit`;
  if (m <= 0) return `${h} jam`;
  return `${h} jam ${m} menit`;
}

// Legacy docs still carry the old division code "CBDMS" — display it as its
// current name "DTIC" everywhere without touching the stored data itself.
function normalizeDivisionDisplayName(name: any): string {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (raw.toLowerCase() === "cbdms") return "DTIC";
  return raw;
}

export function OvertimePayrollRecapClient() {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Filters State
  const [periodFilter, setPeriodFilter] = useState(() => format(new Date(), "yyyy-MM"));
  const [brandFilter, setBrandFilter] = useState("all");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [payrollStatusFilter, setPayrollStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Checkbox Selection State
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  // Details sheet and audit logs
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);

  // Mass action modal state
  const [massActionType, setMassActionType] = useState<"processing" | "paid" | "excluded" | null>(null);
  const [massNotes, setMassNotes] = useState("");

  // Individual update note state
  const [individualNote, setIndividualNote] = useState("");

  // Staged status pill selection for the detail modal — status pills only
  // mark an intent locally; the actual write happens when "Simpan Status"
  // is clicked in the footer, so a click never silently mutates payroll data.
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  useEffect(() => {
    setPendingStatus(null);
  }, [selectedGroup?.id]);

  // Query payroll recaps — brand-scoped for HRD (Super Admin/All Companies
  // gets everyone via the same hook's internal bypass). Never a raw
  // collection-wide list: firestore.rules only allows HRD to read docs whose
  // brandId is in their own allowedBrandIds, so an unscoped query here was
  // rejected outright with "Missing or insufficient permissions" the moment
  // any doc outside the caller's brands existed in the result set.
  const { isSuperAdmin, isAllCompanies, allowedBrandIds } = useHrdScopeContext();
  const { data: recaps, isLoading } = useHrdScopedCollection<OvertimePayrollRecap>("overtime_payroll_recaps");

  if (typeof window !== "undefined") {
    console.log("[OVERTIME_PAYROLL_RECAP_SCOPE_DEBUG]", {
      currentUserUid: userProfile?.uid,
      role: isSuperAdmin ? "super-admin" : "hrd",
      allowedBrandIds,
      queryMode: isSuperAdmin || isAllCompanies ? "global" : "scoped_by_brand",
    });
  }

  // Query employees list to fetch NIK/Employee Numbers for export
  const employeesRef = useMemoFirebase(() => collection(firestore, "employees"), [firestore]);
  const { data: employeesData } = useCollection<EmployeeMaster>(employeesRef);

  // Brands for the filter dropdown — brand-scoped for HRD via the same
  // allowedBrandIds used to scope the recaps query above (Super Admin/All
  // Companies still gets every brand). Previously this queried the full
  // "brands" collection unconditionally, so HRD Greenlab's Brand dropdown
  // listed every EGS Group brand too — confusing/wrong even though the
  // underlying recap data was already scoped, since picking one of those
  // brands just silently showed zero rows instead of not being offered at all.
  const { data: visibleBrandsData } = useHrdScopedBrands();
  const visibleBrands = visibleBrandsData || [];

  // Stable string key for visibleBrands — `visibleBrandsData || []` produces
  // a brand-new array reference on every render whenever visibleBrandsData
  // is still undefined (loading), so any effect/memo depending on the raw
  // array re-fires every render instead of only when the actual brand list
  // changes. That was the root cause of the "Maximum update depth exceeded"
  // loop: the masterDivisionsByBrand effect below kept depending on a
  // reference that never stabilized, so it kept calling setState, which
  // triggered a re-render, which produced yet another new [] reference.
  const visibleBrandsKey = useMemo(
    () => visibleBrands.map((b) => b.id || b.name || "").sort().join("|"),
    [visibleBrands],
  );

  // Master division data — keyed by brand NAME (matching how brandFilter and
  // recap docs identify a brand) — one entry per brand in visibleBrands,
  // each holding that brand's brands/{id}/divisions subcollection. Reading
  // this instead of `recaps.map(r => r.division)` is the whole point of
  // section 6/7 of this fix: a brand's division list must not depend on
  // whether anyone in it happened to submit overtime this month. Fetched
  // imperatively (not via a hook-per-brand, which would violate the Rules
  // of Hooks for a dynamic brand count) whenever the HRD's visible brand
  // list changes.
  const [masterDivisionsByBrand, setMasterDivisionsByBrand] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!visibleBrandsKey) {
      // Functional-update + emptiness guard so this never schedules a
      // render when the map is already empty — matters while
      // visibleBrandsData is still loading, since that state would
      // otherwise be re-entered on every render.
      setMasterDivisionsByBrand((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        visibleBrands.map(async (brand) => {
          const brandName = brand.name || brand.id || "";
          try {
            const snap = await getDocs(collection(firestore, "brands", brand.id, "divisions"));
            const names = Array.from(
              new Set(
                snap.docs
                  .map((d) => normalizeDivisionDisplayName(d.data()?.name || d.id))
                  .filter(Boolean),
              ),
            ).sort();
            return [brandName, names] as [string, string[]];
          } catch {
            return [brandName, []] as [string, string[]];
          }
        }),
      );
      if (!cancelled) setMasterDivisionsByBrand(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
    // visibleBrandsKey (a stable joined-id string), not visibleBrands
    // (a reference that changes on every render while data is loading),
    // is the real dependency here — see its definition above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore, visibleBrandsKey]);

  const employeeMetadataMap = useMemo(() => {
    const map = new Map<string, string>();
    employeesData?.forEach((emp) => {
      map.set(emp.uid, emp.employeeNumber || emp.nik || "-");
    });
    return map;
  }, [employeesData]);

  // Dynamic filter options — visibleBrands (already scoped) first, then any
  // brand name appearing in recaps but missing from master data. recaps is
  // itself already brand-scoped (useHrdScopedCollection above), so this
  // fallback can never introduce an out-of-scope brand.
  // Filtering below matches against r.brand — the NAME string every recap
  // doc reliably carries (brandId only exists on docs created after this
  // collection started writing it, see ReviewOvertimeDialog.tsx) — so option
  // values must be the brand NAME, not brand.id, or selecting a specific
  // brand would never match anything and silently show zero rows.
  const brandOptions = useMemo(() => {
    const map = new Map<string, string>();

    visibleBrands?.forEach((brand) => {
      const value = brand.name || brand.id || "";
      if (value && !map.has(value)) map.set(value, value);
    });

    recaps?.forEach((r) => {
      const value = r.brand || "";
      if (value && !map.has(value)) map.set(value, r.brand);
    });

    return [...map.entries()].map(([value, label]) => ({ value, label }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleBrandsKey, recaps]);

  const isSingleBrandHrd = !isSuperAdmin && !isAllCompanies && visibleBrands.length === 1;

  // HRD with exactly one visible brand never needs to choose — auto-select
  // it and lock the dropdown. HRD with several sees "Semua Brand Saya" (never
  // the bare "Semua Brand" label, which would misleadingly imply every brand
  // in the system rather than just the ones this HRD is scoped to).
  // Depends on visibleBrandsKey (stable string), not visibleBrands (a
  // reference that changes on every render while loading) — see its
  // definition above. The brandFilter !== onlyBrandName guard alone isn't
  // enough to stop a loop if the effect keeps re-firing on every render.
  useEffect(() => {
    if (isSuperAdmin || isAllCompanies) return;
    const onlyBrandName = visibleBrands[0]?.name || visibleBrands[0]?.id;
    if (visibleBrands.length === 1 && onlyBrandName && brandFilter !== onlyBrandName) {
      setBrandFilter(onlyBrandName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, isAllCompanies, visibleBrandsKey, brandFilter]);

  if (typeof window !== "undefined") {
    console.log("[OVERTIME_PAYROLL_BRAND_SCOPE_DEBUG]", {
      currentUserUid: userProfile?.uid,
      role: isSuperAdmin ? "super-admin" : "hrd",
      allowedBrandIds,
      visibleBrands: visibleBrands.map((b) => ({ id: b.id, name: b.name })),
      // Filter matches r.brand (a name string on every recap doc), not
      // brand.id, so this is a brand NAME despite the field name — see the
      // comment on brandOptions above for why.
      selectedBrandId: brandFilter,
      isSingleBrandHrd,
    });
  }

  // Master-data-driven — a specific brand shows only ITS OWN divisions
  // (never cross-joined with another brand's), "Semua Brand" merges every
  // scoped brand's divisions. Falls back to whatever division names appear
  // in this month's recap data ONLY if the master subcollection came back
  // completely empty (e.g. not populated yet for that brand) — never used
  // as the primary source, since that's exactly the bug this replaces
  // (a division only showing up because someone in it happened to work
  // overtime that month).
  const divisionOptions = useMemo(() => {
    const set = new Set<string>();
    if (brandFilter === "all") {
      Object.values(masterDivisionsByBrand).forEach((names) => names.forEach((n) => set.add(n)));
    } else {
      (masterDivisionsByBrand[brandFilter] || []).forEach((n) => set.add(n));
    }

    if (set.size === 0) {
      recaps?.forEach((r) => {
        if (brandFilter !== "all" && r.brand !== brandFilter) return;
        const name = normalizeDivisionDisplayName(r.division);
        if (name) set.add(name);
      });
    }

    return Array.from(set).sort();
  }, [masterDivisionsByBrand, brandFilter, recaps]);

  // Stable joined key so the reset effect below only re-runs when the set of
  // valid division names actually changes, not on every render just because
  // divisionOptions is a fresh array/useMemo result each time.
  const divisionOptionKey = useMemo(() => divisionOptions.join("|"), [divisionOptions]);

  // A division picked while looking at one brand may not exist under a
  // newly-selected different brand — reset rather than silently filter
  // down to zero rows on a division that's no longer a valid choice. Guarded
  // so it never calls setDivisionFilter when the value is already "all".
  useEffect(() => {
    if (divisionFilter === "all") return;
    if (!divisionOptions.includes(divisionFilter)) {
      setDivisionFilter("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionFilter, divisionOptionKey]);

  // Group and filter recaps
  const filteredAndGroupedRecaps = useMemo(() => {
    if (!recaps) return [];

    // Dedup FIRST, before anything downstream (filtering, grouping, totals,
    // the modal's daily log, CSV export) ever sees the raw collection — a
    // duplicate here would otherwise double-count in every one of those.
    const uniqueRecaps = dedupeOvertimeSubmissions(recaps);

    const filtered = uniqueRecaps.filter((r) => {
      if (periodFilter && r.payrollMonth !== periodFilter) return false;
      if (brandFilter !== "all" && r.brand !== brandFilter) return false;
      if (divisionFilter !== "all" && normalizeDivisionDisplayName(r.division) !== divisionFilter) return false;
      if (payrollStatusFilter !== "all" && (r.payrollStatus || "pending_payroll") !== payrollStatusFilter) return false;
      if (searchTerm) {
        const normalized = searchTerm.toLowerCase();
        if (!r.employeeName?.toLowerCase().includes(normalized)) return false;
      }
      return true;
    });

    const groups: Record<string, {
      id: string;
      employeeId: string;
      employeeName: string;
      brand: string;
      division: string;
      payrollMonth: string;
      totalDays: number;
      totalMinutes: number;
      payrollStatus: "pending_payroll" | "processing" | "paid" | "excluded";
      processedAt: any;
      paidAt: any;
      items: OvertimePayrollRecap[];
    }> = {};

    filtered.forEach((r) => {
      const key = `${r.employeeId}-${r.payrollMonth}`;
      if (!groups[key]) {
        groups[key] = {
          id: key,
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          brand: r.brand || "-",
          division: normalizeDivisionDisplayName(r.division) || "-",
          payrollMonth: r.payrollMonth,
          totalDays: 0,
          totalMinutes: 0,
          payrollStatus: r.payrollStatus || "pending_payroll",
          processedAt: null,
          paidAt: null,
          items: [],
        };
      }

      groups[key].totalMinutes += r.hrdApprovedMinutes || 0;
      groups[key].items.push(r);

      // Keep latest audit timestamps for group display
      if (r.processedAt && (!groups[key].processedAt || r.processedAt.seconds > groups[key].processedAt.seconds)) {
        groups[key].processedAt = r.processedAt;
      }
      if (r.paidAt && (!groups[key].paidAt || r.paidAt.seconds > groups[key].paidAt.seconds)) {
        groups[key].paidAt = r.paidAt;
      }

      // Hierarchy of state representation for group
      const currentStatus = groups[key].payrollStatus;
      const itemStatus = r.payrollStatus || "pending_payroll";

      if (currentStatus === "paid" && itemStatus !== "paid") {
        groups[key].payrollStatus = itemStatus;
      } else if (currentStatus === "processing" && (itemStatus === "pending_payroll" || itemStatus === "excluded")) {
        groups[key].payrollStatus = itemStatus;
      } else if (currentStatus === "pending_payroll" && itemStatus === "excluded") {
        groups[key].payrollStatus = "excluded";
      }
    });

    // Total Hari Lembur = count of DISTINCT dates, not row count — items are
    // already deduped by (employee, date, start, end, minutes), but two
    // genuinely different jobs logged on the same day would still be two
    // rows for one day, which must still count as 1 hari.
    Object.values(groups).forEach((group) => {
      group.totalDays = countUniqueOvertimeDays(group.items);
    });

    return Object.values(groups).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [recaps, periodFilter, brandFilter, divisionFilter, payrollStatusFilter, searchTerm]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedGroupIds(new Set(filteredAndGroupedRecaps.map((g) => g.id)));
    } else {
      setSelectedGroupIds(new Set());
    }
  };

  const handleSelectRow = (groupId: string, checked: boolean) => {
    const next = new Set(selectedGroupIds);
    if (checked) {
      next.add(groupId);
    } else {
      next.delete(groupId);
    }
    setSelectedGroupIds(next);
  };

  // Perform Payroll Status Update (Single or Bulk)
  const performUpdateStatus = async (
    targetGroups: any[],
    newStatus: "pending_payroll" | "processing" | "paid" | "excluded",
    note: string
  ) => {
    setLoading(true);
    try {
      const batch = writeBatch(firestore);
      const now = new Date();
      const operatorId = userProfile?.uid || "hrd";
      const operatorName = userProfile?.fullName || "HRD Admin";

      // Collect maps to prevent spamming notifications
      const employeeIdsToNotify = new Set<string>();
      const managerActionsMap = new Map<string, { managerId: string, count: number }>();

      for (const group of targetGroups) {
        employeeIdsToNotify.add(group.employeeId);

        // Track managers to send a combined summary notification instead of spamming
        group.items.forEach((item: OvertimePayrollRecap) => {
          if (item.managerId) {
            const entry = managerActionsMap.get(item.managerId) || { managerId: item.managerId, count: 0 };
            entry.count += 1;
            managerActionsMap.set(item.managerId, entry);
          }

          // 1. Update `'overtime_payroll_recaps'` doc
          if (item.id) {
            const recapDocRef = doc(firestore, "overtime_payroll_recaps", item.id);
            const updateFields: any = {
              payrollStatus: newStatus,
              payrollStatusUpdatedAt: serverTimestamp(),
              payrollStatusUpdatedBy: operatorId,
              payrollStatusUpdatedByName: operatorName,
              payrollNotes: note || null,
            };

            if (newStatus === "processing") {
              updateFields.processedAt = serverTimestamp();
              updateFields.processedBy = operatorId;
              updateFields.processedByName = operatorName;
            } else if (newStatus === "paid") {
              updateFields.paidAt = serverTimestamp();
              updateFields.paidBy = operatorId;
              updateFields.paidByName = operatorName;
            }

            batch.update(recapDocRef, updateFields);
          }
        });

        // 2. Query and update corresponding documents in `'overtime_submissions'`
        try {
          const submissionsRef = collection(firestore, "overtime_submissions");
          const q = query(
            submissionsRef,
            where("employeeUid", "==", group.employeeId),
            where("status", "in", ["approved_hrd", "approved"])
          );
          const snap = await getDocs(q);
          snap.docs.forEach((docSnap) => {
            const subData = docSnap.data();
            // Match the month or let it match all approved items in the group period
            const subDate = subData.overtimeDate ? (typeof subData.overtimeDate.toDate === "function" ? subData.overtimeDate.toDate() : new Date(subData.overtimeDate)) : null;
            if (subDate && format(subDate, "yyyy-MM") === group.payrollMonth) {
              const submissionDocRef = doc(firestore, "overtime_submissions", docSnap.id);
              
              const updateFields: any = {
                payrollStatus: newStatus,
                payrollStatusUpdatedAt: serverTimestamp(),
                payrollStatusUpdatedBy: operatorId,
                payrollStatusUpdatedByName: operatorName,
                payrollNotes: note || null,
              };

              if (newStatus === "processing") {
                updateFields.processedAt = serverTimestamp();
                updateFields.processedBy = operatorId;
                updateFields.processedByName = operatorName;
              } else if (newStatus === "paid") {
                updateFields.paidAt = serverTimestamp();
                updateFields.paidBy = operatorId;
                updateFields.paidByName = operatorName;
              }

              batch.update(submissionDocRef, updateFields);
            }
          });
        } catch (subErr) {
          console.error("Error querying overtime_submissions to update payrollStatus:", subErr);
        }
      }

      await batch.commit();

      // 3. Send automated notifications to employees
      for (const empId of employeeIdsToNotify) {
        try {
          let title = "Status Payroll Lembur Diperbarui";
          let message = "Status proses lembur Anda telah diperbarui.";

          if (newStatus === "processing") {
            title = "Lembur Sedang Diproses Payroll";
            message = "Lembur Anda sedang diproses payroll.";
          } else if (newStatus === "paid") {
            title = "Lembur Telah Dibayarkan";
            message = "Lembur Anda telah ditandai sudah dibayarkan.";
          } else if (newStatus === "excluded") {
            title = "Lembur Tidak Masuk Payroll";
            message = "Pengajuan lembur Anda ditandai tidak masuk dalam payroll periode ini.";
          } else if (newStatus === "pending_payroll") {
            title = "Lembur Menunggu Payroll";
            message = "Pengajuan lembur Anda menunggu proses payroll kembali.";
          }

          await sendNotification(firestore, {
            userId: empId,
            type: "status_update",
            module: "employee",
            title,
            message,
            targetType: "user",
            targetId: "",
            actionUrl: "/admin/karyawan/pengajuan-lembur",
            createdBy: operatorId,
          });
        } catch (notifErr) {
          console.error("Error sending notification to employee:", notifErr);
        }
      }

      // 4. Send aggregated summary notifications to Managers
      for (const [managerId, entry] of managerActionsMap.entries()) {
        try {
          await sendNotification(firestore, {
            userId: managerId,
            type: "status_update",
            module: "employee",
            title: "Pembaruan Status Payroll Tim",
            message: `${entry.count} pengajuan lembur tim Anda telah diperbarui status payroll-nya menjadi ${
              newStatus === "pending_payroll" ? "Menunggu Payroll"
              : newStatus === "processing" ? "Sedang Diproses"
              : newStatus === "paid" ? "Sudah Dibayarkan"
              : "Tidak Masuk Payroll"
            }.`,
            targetType: "user",
            targetId: "",
            actionUrl: "/admin/manager/persetujuan-lembur",
            createdBy: operatorId,
          });
        } catch (notifErr) {
          console.error("Error sending notification to manager:", notifErr);
        }
      }

      toast({
        title: "Pembaruan Sukses",
        description: `Berhasil memperbarui status payroll untuk ${targetGroups.length} karyawan menjadi ${
          newStatus === "pending_payroll" ? "Menunggu Payroll"
          : newStatus === "processing" ? "Sedang Diproses"
          : newStatus === "paid" ? "Sudah Dibayarkan"
          : "Tidak Masuk Payroll"
        }.`,
      });

      // Clear selection
      setSelectedGroupIds(new Set());
      setMassActionType(null);
      setMassNotes("");
      setIndividualNote("");

      // Update active selected group details if open
      if (selectedGroup) {
        const updatedItems = selectedGroup.items.map((i: any) => ({
          ...i,
          payrollStatus: newStatus,
          payrollStatusUpdatedAt: Timestamp.fromDate(now),
          payrollStatusUpdatedBy: operatorId,
          payrollStatusUpdatedByName: operatorName,
          payrollNotes: note || null,
          processedAt: newStatus === "processing" ? Timestamp.fromDate(now) : i.processedAt,
          processedBy: newStatus === "processing" ? operatorId : i.processedBy,
          processedByName: newStatus === "processing" ? operatorName : i.processedByName,
          paidAt: newStatus === "paid" ? Timestamp.fromDate(now) : i.paidAt,
          paidBy: newStatus === "paid" ? operatorId : i.paidBy,
          paidByName: newStatus === "paid" ? operatorName : i.paidByName,
        }));

        setSelectedGroup({
          ...selectedGroup,
          payrollStatus: newStatus,
          processedAt: newStatus === "processing" ? Timestamp.fromDate(now) : selectedGroup.processedAt,
          paidAt: newStatus === "paid" ? Timestamp.fromDate(now) : selectedGroup.paidAt,
          items: updatedItems,
        });
      }
    } catch (error) {
      console.error("Error committing bulk update:", error);
      toast({
        title: "Gagal Memperbarui",
        description: "Terjadi kesalahan sistem ketika menyimpan status payroll.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Bulk execution
  const executeMassAction = () => {
    if (!massActionType) return;
    const targetGroups = filteredAndGroupedRecaps.filter((g) => selectedGroupIds.has(g.id));
    performUpdateStatus(targetGroups, massActionType, massNotes);
  };

  // CSV Export utility following active filters
  const handleExportCSV = () => {
    try {
      const headers = [
        "Nama Karyawan",
        "NIK / Employee ID",
        "Brand",
        "Divisi",
        "Bulan Payroll",
        "Total Hari Lembur",
        "Durasi Final HRD",
        "Total Menit",
        "Status Payroll",
        "Tanggal Diproses",
        "Tanggal Dibayarkan",
        "Catatan Payroll",
      ];

      const csvRows = [headers.join(",")];

      // filteredAndGroupedRecaps is already built from dedupeOvertimeSubmissions()
      // (see the useMemo above) — never re-derive totals from raw recaps here.
      filteredAndGroupedRecaps.forEach((g) => {
        const empNumber = employeeMetadataMap.get(g.employeeId) || "-";

        const statusLabel =
          g.payrollStatus === "paid" ? "Sudah Dibayarkan"
          : g.payrollStatus === "processing" ? "Sedang Diproses"
          : g.payrollStatus === "excluded" ? "Tidak Masuk Payroll"
          : "Menunggu Payroll";

        const notes = g.items.map((i) => i.payrollNotes).filter(Boolean).join("; ") || "-";

        const row = [
          `"${g.employeeName.replace(/"/g, '""')}"`,
          `"${empNumber}"`,
          `"${g.brand.replace(/"/g, '""')}"`,
          `"${g.division.replace(/"/g, '""')}"`,
          `"${g.payrollMonth}"`,
          g.totalDays,
          `"${formatDuration(g.totalMinutes)}"`,
          g.totalMinutes,
          `"${statusLabel}"`,
          `"${parseSafeFormattedDate(g.processedAt)}"`,
          `"${parseSafeFormattedDate(g.paidAt)}"`,
          `"${notes.replace(/"/g, '""')}"`,
        ];

        csvRows.push(row.join(","));
      });

      const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Rekap_Lembur_Payroll_${periodFilter || "Semua"}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Export Berhasil",
        description: `Berhasil mengunduh dokumen rekap CSV untuk ${filteredAndGroupedRecaps.length} baris data.`,
      });
    } catch (err) {
      console.error("CSV Export failure:", err);
      toast({
        title: "Export Gagal",
        description: "Gagal melakukan export data ke CSV.",
        variant: "destructive",
      });
    }
  };

  // Delegates to the module-level formatDuration() — kept as a thin alias so
  // every existing call site (below) automatically picks up the "8 jam"
  // (not "8 jam 0 menit") fix without having to touch each one individually.
  const formatMinutesToHuman = formatDuration;

  const getStatusBadge = (status: "pending_payroll" | "processing" | "paid" | "excluded") => {
    switch (status) {
      case "paid":
        return <Badge className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold">Sudah Dibayarkan</Badge>;
      case "processing":
        return <Badge className="bg-amber-500/10 border-amber-500/20 text-amber-400 font-bold">Sedang Diproses</Badge>;
      case "excluded":
        return <Badge className="bg-red-500/10 border-red-500/20 text-red-400 font-bold">Tidak Masuk Payroll</Badge>;
      case "pending_payroll":
      default:
        return <Badge className="bg-blue-500/10 border-blue-500/20 text-blue-400 font-bold">Menunggu Payroll</Badge>;
    }
  };

  const parseSafeFormattedDate = (val: any) => {
    if (!val) return "-";
    const date = typeof val.toDate === "function" ? val.toDate() : new Date(val);
    return format(date, "dd MMM yyyy, HH:mm", { locale: idLocale });
  };

  // Compact stat row above the table — derived from filteredAndGroupedRecaps
  // (already deduped + filtered), never recomputed from raw recaps.
  const summaryStats = useMemo(() => {
    let totalMinutes = 0;
    let pending = 0;
    let paid = 0;
    let excluded = 0;
    filteredAndGroupedRecaps.forEach((g) => {
      totalMinutes += g.totalMinutes;
      if (g.payrollStatus === "paid") paid += 1;
      else if (g.payrollStatus === "excluded") excluded += 1;
      else pending += 1; // pending_payroll + processing both read as "belum selesai"
    });
    return {
      totalEmployees: filteredAndGroupedRecaps.length,
      totalMinutes,
      pending,
      paid,
      excluded,
    };
  }, [filteredAndGroupedRecaps]);

  return (
    <div className="space-y-6">
      {/* Title Block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ReceiptText className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
            Rekap Lembur Payroll
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Kelola persetujuan lembur final secara massal atau semi-manual untuk dasar perhitungan penggajian karyawan.
          </p>
        </div>
        
        {/* Bulk Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleExportCSV}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" /> Export CSV
          </Button>

          {selectedGroupIds.size > 0 && (
            <div className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-1 rounded-xl">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 px-2">{selectedGroupIds.size} Terpilih</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMassActionType("processing");
                  setMassNotes("");
                }}
                className="h-8 rounded-lg text-xs font-bold text-amber-400 hover:bg-amber-500/10"
              >
                Tandai Sedang Diproses
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMassActionType("paid");
                  setMassNotes("");
                }}
                className="h-8 rounded-lg text-xs font-bold text-emerald-400 hover:bg-emerald-500/10"
              >
                Tandai Sudah Dibayarkan
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMassActionType("excluded");
                  setMassNotes("");
                }}
                className="h-8 rounded-lg text-xs font-bold text-red-400 hover:bg-red-500/10"
              >
                Tandai Tidak Masuk Payroll
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Filter panel */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/20 rounded-[2rem] shadow-xl backdrop-blur-xl">
        <CardContent className="p-6">
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
            {/* Period Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Bulan Payroll</label>
              <Input
                type="month"
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
                className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl"
              />
            </div>

            {/* Brand Filter — options are always brandOptions (already scoped
                to visibleBrands for HRD); only the "all" option's label/
                presence changes by role/scope. A disabled Select for a
                single-brand HRD rendered as a grayed-out, chevron'd control
                that looked broken/inactive for a value that was never
                actually choosable — a plain read-only field communicates
                "this is just information" instead. */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Brand</label>
              {isSingleBrandHrd ? (
                <div className="h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 px-3 flex items-center text-sm text-slate-900 dark:text-white">
                  {brandOptions[0]?.label || visibleBrands[0]?.name || "-"}
                </div>
              ) : (
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl">
                    <SelectValue placeholder="Pilih brand" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                    <SelectItem value="all">
                      {isSuperAdmin || isAllCompanies ? "Semua Brand" : "Semua Brand Saya"}
                    </SelectItem>
                    {brandOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Division Filter — same read-only-when-single-option pattern as
                Brand above: nothing to actually choose when there's only one
                division in scope, so don't render it as a choice. */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Divisi</label>
              {divisionOptions.length === 1 ? (
                <div className="h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 px-3 flex items-center text-sm text-slate-900 dark:text-white">
                  {divisionOptions[0]}
                </div>
              ) : (
                <Select value={divisionFilter} onValueChange={setDivisionFilter}>
                  <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl">
                    <SelectValue placeholder="Semua Divisi" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                    <SelectItem value="all">Semua Divisi</SelectItem>
                    {divisionOptions.map((div) => (
                      <SelectItem key={div} value={div}>{div}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Payroll Status */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Status Payroll</label>
              <Select value={payrollStatusFilter} onValueChange={setPayrollStatusFilter}>
                <SelectTrigger className="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="pending_payroll">Menunggu Payroll</SelectItem>
                  <SelectItem value="processing">Sedang Diproses</SelectItem>
                  <SelectItem value="paid">Sudah Dibayarkan</SelectItem>
                  <SelectItem value="excluded">Tidak Masuk Payroll</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Cari Karyawan</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Input
                  placeholder="Nama karyawan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Bar — compact, derived from the same already-deduped/filtered
          data as the table below, never a separate recompute. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/20">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <User className="h-3 w-3" /> Karyawan
          </p>
          <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{summaryStats.totalEmployees}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/20">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Calendar className="h-3 w-3" /> Total Durasi
          </p>
          <p className="mt-1 text-lg font-black text-emerald-600 dark:text-emerald-400">{formatDuration(summaryStats.totalMinutes)}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/20">
          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400">Menunggu Payroll</p>
          <p className="mt-1 text-lg font-black text-blue-700 dark:text-blue-400">{summaryStats.pending}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/20">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-3 w-3" /> Sudah Dibayarkan
          </p>
          <p className="mt-1 text-lg font-black text-emerald-700 dark:text-emerald-400">{summaryStats.paid}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/20">
          <p className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">Tidak Masuk Payroll</p>
          <p className="mt-1 text-lg font-black text-red-700 dark:text-red-400">{summaryStats.excluded}</p>
        </div>
      </div>

      {/* Main Table */}
      <Card className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/20 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-24 gap-3 text-slate-600 dark:text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500 dark:text-emerald-400" />
              <p className="text-sm font-semibold">Mengambil Data Rekapitulasi Payroll...</p>
            </div>
          ) : filteredAndGroupedRecaps.length > 0 ? (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10">
                  <TableRow className="border-slate-200 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <TableHead className="px-4 py-3 w-12 text-center">
                      <Checkbox
                        checked={filteredAndGroupedRecaps.length > 0 && selectedGroupIds.size === filteredAndGroupedRecaps.length}
                        onCheckedChange={handleSelectAll}
                        className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 data-[state=checked]:bg-emerald-500"
                      />
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-xs uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">Nama Karyawan</TableHead>
                    <TableHead className="px-3 py-3 text-left text-xs uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">Brand / Divisi</TableHead>
                    <TableHead className="px-3 py-3 text-center text-xs uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">Bulan Payroll</TableHead>
                    <TableHead className="px-3 py-3 text-center text-xs uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400 w-32">Total Hari Lembur</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide font-bold text-emerald-600 dark:text-emerald-400">Durasi Final HRD</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">Total Menit</TableHead>
                    <TableHead className="px-3 py-3 text-center text-xs uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">Status Payroll</TableHead>
                    <TableHead className="px-3 py-3 text-center text-xs uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">Tanggal Diproses</TableHead>
                    <TableHead className="px-3 py-3 text-center text-xs uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">Tanggal Dibayarkan</TableHead>
                    <TableHead className="px-6 py-3 text-right text-xs uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400 w-32">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndGroupedRecaps.map((group) => (
                    <TableRow
                      key={group.id}
                      className="border-slate-200 dark:border-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-900/10 transition cursor-pointer"
                      onClick={() => {
                        setSelectedGroup(group);
                        setIndividualNote(group.items[0]?.payrollNotes || "");
                      }}
                    >
                      <TableCell className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedGroupIds.has(group.id)}
                          onCheckedChange={(checked) => handleSelectRow(group.id, !!checked)}
                          className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 data-[state=checked]:bg-emerald-500"
                        />
                      </TableCell>
                      <TableCell className="px-4 py-3 font-semibold text-sm text-slate-900 dark:text-slate-200">
                        {group.employeeName}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {group.brand} / {group.division}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-sm font-mono text-slate-700 dark:text-slate-300">
                        {group.payrollMonth}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center">
                        <Badge variant="outline" className="bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold px-2 py-0.5">
                          {group.totalDays} Hari
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right font-bold text-sm text-emerald-600 dark:text-emerald-400">
                        {formatMinutesToHuman(group.totalMinutes)}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right font-mono text-sm text-slate-700 dark:text-slate-300">
                        {group.totalMinutes} menit
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center">
                        {getStatusBadge(group.payrollStatus)}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-xs text-slate-600 dark:text-slate-400 font-mono">
                        {parseSafeFormattedDate(group.processedAt)}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-xs text-slate-600 dark:text-slate-400 font-mono">
                        {parseSafeFormattedDate(group.paidAt)}
                      </TableCell>
                      <TableCell className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white dark:hover:text-white rounded-xl text-xs"
                          onClick={() => {
                            setSelectedGroup(group);
                            setIndividualNote(group.items[0]?.payrollNotes || "");
                          }}
                        >
                          Rincian
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-20 text-center gap-3">
              <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400 dark:text-slate-500 animate-pulse">
                🔍
              </div>
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">Belum Ada Rekap Payroll</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                Tidak ada data lembur berstatus disetujui HRD yang cocok dengan penyaringan filter saat ini.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Detail Rincian Hari & Audit Trail (TUGAS 3) */}
      <Dialog open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        {/* Fixed/centered positioning is inherited from the base DialogContent;
            only display (grid -> flex-col) and sizing are overridden here so the
            footer never gets pushed off-screen (see ReviewOvertimeDialog for the
            same class of bug). */}
        <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-w-5xl w-[92vw] h-[86dvh] bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white p-0 overflow-hidden flex flex-col">
          <DialogTitle className="sr-only">Detail Lembur Payroll</DialogTitle>
          {selectedGroup && (() => {
            // Explicit modal-level dedupe — never trust that the group's
            // items are already unique, since the same bug that duplicates
            // overtime_payroll_recaps docs upstream can duplicate items here too.
            const dailyLogs: OvertimePayrollRecap[] = selectedGroup.items;
            const uniqueDailyLogs = dedupeOvertimeSubmissions(dailyLogs);
            const duplicateRemoved = dailyLogs.length - uniqueDailyLogs.length;
            if (duplicateRemoved > 0) {
              console.log("[OVERTIME_PAYROLL_DETAIL_DEDUPE_DEBUG]", {
                employeeUid: selectedGroup.employeeId,
                payrollMonth: selectedGroup.payrollMonth,
                rawLogsCount: dailyLogs.length,
                uniqueLogsCount: uniqueDailyLogs.length,
                duplicateRemoved,
                rawKeys: dailyLogs.map(getOvertimeUniqueKey),
              });
            }
            const latestItem = uniqueDailyLogs[0] || dailyLogs[0];

            const statusPills: { value: "pending_payroll" | "processing" | "paid" | "excluded"; label: string; activeClass: string; idleClass: string }[] = [
              { value: "pending_payroll", label: "Menunggu Payroll", activeClass: "bg-blue-600 border-blue-600 text-white", idleClass: "border-blue-300 dark:border-blue-600/40 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-600/10" },
              { value: "processing", label: "Sedang Diproses", activeClass: "bg-amber-600 border-amber-600 text-white", idleClass: "border-amber-300 dark:border-amber-600/40 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-600/10" },
              { value: "paid", label: "Sudah Dibayarkan", activeClass: "bg-emerald-600 border-emerald-600 text-white", idleClass: "border-emerald-300 dark:border-emerald-600/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-600/10" },
              { value: "excluded", label: "Tidak Masuk Payroll", activeClass: "bg-red-600 border-red-600 text-white", idleClass: "border-red-300 dark:border-red-600/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-600/10" },
            ];
            const effectiveStatus = pendingStatus ?? selectedGroup.payrollStatus;
            const hasPendingChange = pendingStatus !== null && pendingStatus !== selectedGroup.payrollStatus;

            const auditSteps = [
              { label: "Disetujui Manager", done: true, by: latestItem?.managerName || "Manager", at: null as any },
              { label: "Disetujui HRD", done: !!latestItem?.approvedByHrd, by: latestItem?.approvedByHrd || "HRD", at: latestItem?.approvedAt },
              { label: "Masuk Payroll", done: selectedGroup.payrollStatus !== "pending_payroll" || !!latestItem?.processedAt, by: latestItem?.payrollStatusUpdatedByName || "HRD Admin", at: latestItem?.payrollStatusUpdatedAt },
              { label: "Diproses Payroll", done: !!latestItem?.processedAt, by: latestItem?.processedByName || "HRD Admin", at: latestItem?.processedAt },
              { label: "Dibayarkan", done: !!latestItem?.paidAt, by: latestItem?.paidByName || "HRD Admin", at: latestItem?.paidAt },
            ];

            return (
              <>
                {/* Header - shrink */}
                <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <span>📋</span> Detail Lembur Payroll
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-bold text-slate-900 dark:text-slate-200">{selectedGroup.employeeName}</span>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <span>{selectedGroup.brand} / {selectedGroup.division}</span>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <span className="font-mono">{selectedGroup.payrollMonth}</span>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        {getStatusBadge(selectedGroup.payrollStatus)}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedGroup(null)}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Body - scroll */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  <div className="space-y-6 px-6 py-4">

                  {/* Group summary card */}
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 border border-slate-200 dark:border-slate-700">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block">Total Hari Kerja Lembur</span>
                      <span className="text-sm font-black text-slate-900 dark:text-slate-200">{selectedGroup.totalDays} Hari</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block">Akumulasi Payroll</span>
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatMinutesToHuman(selectedGroup.totalMinutes)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block">Total Menit</span>
                      <span className="text-sm font-black text-slate-900 dark:text-slate-200">{selectedGroup.totalMinutes} menit</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block">Status Saat Ini</span>
                      <span className="block mt-0.5">{getStatusBadge(selectedGroup.payrollStatus)}</span>
                    </div>
                  </div>

                  {/* Input Catatan & Aksi Status Payroll */}
                  <div className="space-y-3 bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Catatan & Aksi Status</span>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Catatan Payroll (Opsional)</label>
                      <Textarea
                        placeholder="Masukkan catatan payroll..."
                        value={individualNote}
                        onChange={(e) => setIndividualNote(e.target.value)}
                        className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl text-xs h-16 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Segmented status pills — clicking only stages the choice;
                        the write happens via "Simpan Status" in the footer. */}
                    <div className="flex flex-wrap gap-2 pt-2">
                      {statusPills.map((pill) => (
                        <button
                          key={pill.value}
                          type="button"
                          disabled={loading}
                          onClick={() => setPendingStatus(pill.value)}
                          className={`px-3 h-9 rounded-full border text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                            effectiveStatus === pill.value ? pill.activeClass : `bg-white dark:bg-slate-900 ${pill.idleClass}`
                          }`}
                        >
                          {pill.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Log Pengajuan Harian */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Log Pengajuan Harian</span>
                      {duplicateRemoved > 0 && (
                        <Badge variant="outline" className="text-[10px] font-semibold border-amber-300 dark:border-amber-600/40 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-600/10">
                          Duplikat otomatis digabung
                        </Badge>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-900/20">
                      <Table>
                        <TableHeader className="bg-slate-100 dark:bg-slate-900/60">
                          <TableRow className="border-slate-200 dark:border-slate-800/50">
                            <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-700 dark:text-slate-400">Tanggal</TableHead>
                            <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-700 dark:text-slate-400">Jam Kerja</TableHead>
                            <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-700 dark:text-slate-400">Lokasi</TableHead>
                            <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-700 dark:text-slate-400">Uraian Tugas</TableHead>
                            <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-700 dark:text-slate-400 text-right">Durasi Ajuan</TableHead>
                            <TableHead className="py-2 text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 text-right">Durasi Payroll</TableHead>
                            <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-700 dark:text-slate-400">Status HRD</TableHead>
                            <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-700 dark:text-slate-400">Catatan HRD</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {uniqueDailyLogs.map((item: OvertimePayrollRecap, idx: number) => (
                            <TableRow key={item.id || idx} className="border-slate-200 dark:border-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-900/20">
                              <TableCell className="py-2 text-xs text-slate-700 dark:text-slate-200 font-medium">
                                {format(new Date(item.overtimeDate), "dd MMM yyyy", { locale: idLocale })}
                              </TableCell>
                              <TableCell className="py-2 text-xs font-mono text-slate-600 dark:text-slate-400">
                                {item.startTime} - {item.endTime}
                              </TableCell>
                              <TableCell className="py-2 text-xs text-slate-700 dark:text-slate-300">
                                {item.location}
                              </TableCell>
                              <TableCell className="py-2 text-xs text-slate-600 dark:text-slate-400 max-w-[120px] truncate" title={item.taskSummary}>
                                {item.taskSummary || item.reason || "-"}
                              </TableCell>
                              <TableCell className="py-2 text-xs text-slate-600 dark:text-slate-400 text-right">
                                {formatMinutesToHuman(item.submittedMinutes || 0)}
                              </TableCell>
                              <TableCell className="py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 text-right">
                                {formatMinutesToHuman(item.hrdApprovedMinutes || 0)}
                              </TableCell>
                              <TableCell className="py-2 text-xs">
                                <Badge variant="outline" className="text-[10px] font-semibold border-emerald-300 dark:border-emerald-600/40 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-600/10">
                                  Disetujui HRD
                                </Badge>
                              </TableCell>
                              <TableCell className="py-2 text-xs text-slate-600 dark:text-slate-400 max-w-[140px] truncate" title={item.payrollNotes || ""}>
                                {item.payrollNotes || "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Audit Trail — compact timeline */}
                  <div className="space-y-3 bg-slate-50 dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block pb-1 border-b border-slate-200 dark:border-slate-700">
                      Audit Trail Lembur & Payroll
                    </span>
                    <ol className="pt-2">
                      {auditSteps.map((step, i) => (
                        <li key={step.label} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className={`h-3 w-3 rounded-full shrink-0 ${step.done ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`} />
                            {i < auditSteps.length - 1 && (
                              <span className={`w-px flex-1 min-h-[18px] ${step.done ? "bg-emerald-300 dark:bg-emerald-700" : "bg-slate-200 dark:bg-slate-700"}`} />
                            )}
                          </div>
                          <div className="pb-4 text-xs">
                            <span className={`font-bold ${step.done ? "text-slate-900 dark:text-slate-200" : "text-slate-400 dark:text-slate-600"}`}>
                              {step.label}
                            </span>
                            {step.done && (
                              <span className="text-slate-600 dark:text-slate-400 block">
                                {step.by}
                                {step.at ? ` · ${parseSafeFormattedDate(step.at)}` : ""}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                    {latestItem?.payrollNotes && (
                      <div className="border-t border-slate-200 dark:border-slate-700 pt-2 space-y-1">
                        <span className="text-slate-600 dark:text-slate-400 block font-bold text-xs">Catatan Audit Payroll:</span>
                        <p className="bg-white dark:bg-slate-900 p-2 rounded-xl text-xs text-slate-700 dark:text-slate-300 italic border border-slate-200 dark:border-slate-700">
                          "{latestItem.payrollNotes}"
                        </p>
                      </div>
                    )}
                  </div>
                  </div>
                </div>

                {/* Footer - shrink */}
                <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-6 py-4 flex justify-end gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedGroup(null)}
                    className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl text-xs h-9"
                  >
                    Tutup
                  </Button>
                  {hasPendingChange && (
                    <Button
                      size="sm"
                      disabled={loading}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs h-9"
                      onClick={async () => {
                        await performUpdateStatus([selectedGroup], pendingStatus as any, individualNote);
                        setPendingStatus(null);
                      }}
                    >
                      Simpan Status
                    </Button>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Mass Action Execution Dialog */}
      <Dialog open={massActionType !== null} onOpenChange={(open) => !open && setMassActionType(null)}>
        <DialogContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white font-black text-base flex items-center gap-2">
              <span>⚡</span> Pembaruan Massal Status Payroll
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-400 text-xs">
              Ubah status payroll untuk {selectedGroupIds.size} karyawan secara massal menjadi{" "}
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {massActionType === "processing" ? "Sedang Diproses"
                  : massActionType === "paid" ? "Sudah Dibayarkan"
                  : "Tidak Masuk Payroll"}
              </span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Catatan Payroll Massal (Opsional)</label>
              <Textarea
                placeholder="Masukkan catatan massal..."
                value={massNotes}
                onChange={(e) => setMassNotes(e.target.value)}
                className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl text-xs h-20 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMassActionType(null)}
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl text-xs h-9"
            >
              Batal
            </Button>
            <Button
              size="sm"
              disabled={loading}
              onClick={executeMassAction}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs h-9"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Terapkan Massal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
