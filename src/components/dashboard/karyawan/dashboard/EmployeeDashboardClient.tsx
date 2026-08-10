"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc, limit, orderBy, query, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { format, differenceInCalendarDays } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import type { MenuGroup } from "@/lib/menu-config";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  EmployeeProfile,
  LeaveBalance,
  LeaveRequest,
  PermissionRequest,
  OvertimeSubmission,
  Notification,
} from "@/lib/types";
import { checkLeaveEligibility } from "@/lib/leave-utils";
import { calculateProfileCompleteness } from "@/lib/employee-completeness";
import { resolveEmploymentStage, toJsDate, fallbackText } from "@/lib/employee-dashboard-stage";

import { EmployeeHeroCard } from "./EmployeeHeroCard";
import { EmployeeSummaryCards } from "./EmployeeSummaryCards";
import { QuickActionGrid } from "./QuickActionGrid";
import { EmploymentInfoCard } from "./EmploymentInfoCard";
import { AttendanceTodayCard, type AttendanceTodaySnapshot } from "./AttendanceTodayCard";
import { LeavePermitOvertimeSummary } from "./LeavePermitOvertimeSummary";
import { EmployeeAlertsCard, type DashboardAlert } from "./EmployeeAlertsCard";
import { ActivityTimelineCard, type ActivityItem } from "./ActivityTimelineCard";
import { StatusAdaptiveSection } from "./StatusAdaptiveSection";

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-48 w-full rounded-3xl" />
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

const PERMIT_PENDING_STATUSES = new Set(["pending_manager", "pending_hrd"]);

function formatDateLabel(d: Date | null): string {
  if (!d) return "Belum diatur";
  return format(d, "dd MMMM yyyy", { locale: idLocale });
}

export function EmployeeDashboardClient({ menuConfig }: { menuConfig?: MenuGroup[] }) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const employeeProfileRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, "employee_profiles", userProfile.uid) : null),
    [userProfile, firestore],
  );
  const { data: employeeProfile, isLoading: profileLoading } = useDoc<EmployeeProfile>(employeeProfileRef);

  const leaveBalanceRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, "leave_balances", userProfile.uid) : null),
    [userProfile, firestore],
  );
  const { data: leaveBalance, isLoading: balanceLoading } = useDoc<LeaveBalance>(leaveBalanceRef);

  // Own leave_requests — scoped by employeeUid, the canonical ownership
  // field every current write sets (see LeaveSubmissionClient.tsx). A
  // dashboard summary card can tolerate missing a handful of very old
  // legacy docs that only ever had employeeId/uid/userId set; the Riwayat
  // table on the Pengajuan Cuti page is the completeness-critical view.
  const leaveRequestsQuery = useMemoFirebase(
    () => (userProfile ? query(collection(firestore, "leave_requests"), where("employeeUid", "==", userProfile.uid)) : null),
    [userProfile, firestore],
  );
  const { data: leaveRequests } = useCollection<LeaveRequest>(leaveRequestsQuery);

  // Same query shape PermissionSubmissionClient.tsx already uses for "my izin".
  const permissionQuery = useMemoFirebase(
    () => (userProfile ? query(collection(firestore, "permission_requests"), where("uid", "==", userProfile.uid)) : null),
    [userProfile, firestore],
  );
  const { data: permissionRequests } = useCollection<PermissionRequest>(permissionQuery);

  // Same query shape PengajuanLemburClient.tsx already uses for "my lembur".
  const overtimeQuery = useMemoFirebase(
    () => (userProfile ? query(collection(firestore, "overtime_submissions"), where("employeeUid", "==", userProfile.uid)) : null),
    [userProfile, firestore],
  );
  const { data: overtimeSubmissions } = useCollection<OvertimeSubmission>(overtimeQuery);

  const notificationsQuery = useMemoFirebase(
    () =>
      userProfile
        ? query(collection(firestore, "users", userProfile.uid, "notifications"), orderBy("createdAt", "desc"), limit(8))
        : null,
    [userProfile, firestore],
  );
  const { data: notifications, isLoading: notificationsLoading } = useCollection<Notification>(notificationsQuery);

  // attendance_events isn't readable client-side at all (HRD/Super Admin
  // only per firestore.rules) — /api/attendance/today uses the Admin SDK to
  // return just this caller's own today + this-month summary.
  const [attendance, setAttendance] = useState<{
    today: AttendanceTodaySnapshot;
    monthSummary: { monthKey: string; daysPresent: number };
  } | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  useEffect(() => {
    if (!userProfile) return;
    let cancelled = false;
    (async () => {
      setAttendanceLoading(true);
      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error("Sesi login Anda tidak valid.");
        const res = await fetch("/api/attendance/today", { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal memuat data kehadiran.");
        if (!cancelled) setAttendance(data);
      } catch (e) {
        console.error("Failed to fetch attendance summary:", e);
        if (!cancelled) setAttendance(null);
      } finally {
        if (!cancelled) setAttendanceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userProfile]);

  const stage = useMemo(() => resolveEmploymentStage(userProfile, employeeProfile), [userProfile, employeeProfile]);
  const leaveEligibility = useMemo(() => checkLeaveEligibility(userProfile, employeeProfile), [userProfile, employeeProfile]);
  const completeness = useMemo(() => calculateProfileCompleteness(employeeProfile), [employeeProfile]);

  const hrdInfo: any = (employeeProfile as any)?.hrdEmploymentInfo || {};

  const positionLabel = fallbackText(
    (employeeProfile as any)?.positionTitle || hrdInfo.workRole || hrdInfo.jabatan || userProfile?.jobTitle,
    "Karyawan",
  );
  const brandLabel = fallbackText(
    (employeeProfile as any)?.brandName || hrdInfo.brandName || hrdInfo.brand,
    "Brand belum diatur",
  );
  const divisionLabel = (employeeProfile as any)?.division || hrdInfo.divisionName || hrdInfo.divisi || "";
  const supervisorLabel = fallbackText(
    hrdInfo.directSupervisorName || (employeeProfile as any)?.managerName || (employeeProfile as any)?.supervisorName,
  );
  const workLocationLabel = fallbackText((employeeProfile as any)?.workLocation || hrdInfo.workLocation || hrdInfo.lokasiKerja);
  const workSystemLabel = fallbackText(hrdInfo.sistemKerja || hrdInfo.workSystem);
  const employeeNumberLabel = fallbackText((employeeProfile as any)?.employeeNumber || hrdInfo.employeeId);

  const joinDate = toJsDate((employeeProfile as any)?.joinDate) || toJsDate(hrdInfo.tanggalMasuk);
  const contractStartDate = toJsDate(hrdInfo.contractStartDate) || toJsDate(hrdInfo.kontrakMulai);
  const contractEndDate = toJsDate((employeeProfile as any)?.contractEndDate) || toJsDate(hrdInfo.contractEndDate) || toJsDate(hrdInfo.kontrakSelesai);
  const probationStartDate = toJsDate(hrdInfo.probationStartDate) || toJsDate(hrdInfo.masaPercobaanMulai);
  const probationEndDate = toJsDate((employeeProfile as any)?.probationEndDate) || toJsDate(hrdInfo.probationEndDate) || toJsDate(hrdInfo.masaPercobaanSelesai);

  const tenureValue = useMemo(() => {
    if (stage.stage === "tetap") return "Tetap";
    if (contractStartDate && contractEndDate) {
      return `${format(contractStartDate, "dd MMM yyyy", { locale: idLocale })} – ${format(contractEndDate, "dd MMM yyyy", { locale: idLocale })}`;
    }
    if (joinDate) return `Sejak ${format(joinDate, "dd MMM yyyy", { locale: idLocale })}`;
    return "Belum diatur";
  }, [stage.stage, contractStartDate, contractEndDate, joinDate]);

  const tenureHint = useMemo(() => {
    if (stage.stage === "tetap" && joinDate) return `Bergabung ${format(joinDate, "dd MMM yyyy", { locale: idLocale })}`;
    if (contractEndDate) {
      const daysLeft = differenceInCalendarDays(contractEndDate, new Date());
      if (daysLeft >= 0) return `${daysLeft} hari tersisa`;
    }
    return undefined;
  }, [stage.stage, joinDate, contractEndDate]);

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!divisionLabel) missing.push("Divisi");
    if (!hrdInfo.directSupervisorName && !(employeeProfile as any)?.managerName && !(employeeProfile as any)?.supervisorName) {
      missing.push("Atasan langsung");
    }
    if (stage.stage === "unknown") missing.push("Jenis kontrak");
    return missing;
  }, [divisionLabel, hrdInfo, employeeProfile, stage.stage]);

  // ----- Cuti / Izin / Lembur summaries -----
  const leavePendingStatuses = new Set([
    "pending_manager",
    "pending_manager_review",
    "pending_director",
    "pending_director_review",
    "pending_hrd",
    "menunggu_approval_atasan",
  ]);
  const leavePendingCount = (leaveRequests || []).filter((r) => leavePendingStatuses.has(String((r as any).status))).length;
  const leaveUsed = (leaveBalance?.allocatedLeave ?? 0);

  const permissionPending = (permissionRequests || []).filter((p) => PERMIT_PENDING_STATUSES.has(p.status));
  const thisMonthKey = format(new Date(), "yyyy-MM");
  const permissionThisMonth = (permissionRequests || []).filter((p) => {
    const d = toJsDate(p.startDate);
    return d && format(d, "yyyy-MM") === thisMonthKey;
  });
  const sortedPermissions = [...(permissionRequests || [])].sort((a, b) => {
    const at = toJsDate((a as any).createdAt || a.startDate)?.getTime() || 0;
    const bt = toJsDate((b as any).createdAt || b.startDate)?.getTime() || 0;
    return bt - at;
  });
  const lastPermissionStatusLabel = sortedPermissions[0]
    ? PERMIT_PENDING_STATUSES.has(sortedPermissions[0].status)
      ? "Menunggu persetujuan"
      : sortedPermissions[0].status
    : "Belum ada pengajuan";

  const overtimeThisMonth = (overtimeSubmissions || []).filter((o) => {
    const d = toJsDate((o as any).overtimeDate || (o as any).date);
    return d && format(d, "yyyy-MM") === thisMonthKey;
  });
  const overtimeApproved = overtimeThisMonth.filter((o) => /approved|completed/.test(String(o.status)));
  const overtimePending = overtimeThisMonth.filter((o) => String(o.status).includes("pending"));
  const overtimeTotalHours = Math.round(
    (overtimeThisMonth.reduce((sum, o) => sum + (o.totalDurationMinutes || 0), 0) / 60) * 10,
  ) / 10;

  const activeSubmissionsCount = leavePendingCount + permissionPending.length + overtimePending.length;

  // ----- Alerts -----
  const alerts = useMemo<DashboardAlert[]>(() => {
    const list: DashboardAlert[] = [];

    if (missingFields.length > 0) {
      list.push({
        id: "profile-incomplete",
        tone: "info",
        title: "Data Kepegawaian Masih Perlu Dilengkapi",
        message: "Beberapa data seperti divisi, atasan langsung, atau struktur penempatan masih menunggu pembaruan dari HRD.",
      });
    }

    if (completeness.status !== "complete") {
      list.push({
        id: "documents-incomplete",
        tone: "warning",
        title: "Berkas Administratif Belum Lengkap",
        message: `Kelengkapan data diri Anda baru ${completeness.percentage}%. Lengkapi agar proses payroll dan administrasi lebih lancar.`,
        actionLabel: "Lengkapi Profil",
        actionHref: "/admin/karyawan/profile",
      });
    }

    if (contractEndDate) {
      const daysLeft = differenceInCalendarDays(contractEndDate, new Date());
      if (daysLeft >= 0 && daysLeft <= 30) {
        list.push({
          id: "contract-ending",
          tone: daysLeft <= 7 ? "urgent" : "warning",
          title: "Kontrak Akan Berakhir",
          message: `Kontrak aktif Anda sampai ${formatDateLabel(contractEndDate)} (${daysLeft} hari lagi).`,
        });
      }
    }

    if (activeSubmissionsCount > 0) {
      list.push({
        id: "pending-approvals",
        tone: "info",
        title: "Menunggu Persetujuan",
        message: `Anda memiliki ${activeSubmissionsCount} pengajuan (cuti/izin/lembur) yang masih diproses.`,
      });
    }

    return list;
  }, [missingFields, completeness, contractEndDate, activeSubmissionsCount]);

  // ----- Activity timeline (from notifications) -----
  const activityItems: ActivityItem[] = (notifications || []).map((n) => ({
    id: n.id || `${n.title}-${n.message}`,
    title: n.title,
    message: n.message,
    createdAt: toJsDate(n.createdAt),
  }));

  const isLoading = profileLoading || balanceLoading;

  if (!userProfile || isLoading) {
    return (
      <DashboardLayout pageTitle="Dashboard Karyawan" menuConfig={menuConfig}>
        <DashboardSkeleton />
      </DashboardLayout>
    );
  }

  const today = new Date();
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;

  return (
    <DashboardLayout pageTitle="Dashboard Karyawan" menuConfig={menuConfig}>
      <div className="space-y-6">
        <EmployeeHeroCard
          fullName={userProfile.fullName || "Karyawan"}
          positionLabel={positionLabel}
          stage={stage}
          brandLabel={brandLabel}
          divisionLabel={divisionLabel || undefined}
          profileCompletionPercentage={completeness.percentage}
        />

        <EmployeeSummaryCards
          stage={stage}
          tenureValue={tenureValue}
          tenureHint={tenureHint}
          attendanceValue={attendanceLoading ? "..." : `${attendance?.monthSummary.daysPresent ?? 0} hari hadir`}
          attendanceHint="Bulan ini"
          leaveBalanceValue={leaveEligibility.isEligible ? `${leaveBalance?.currentBalance ?? 0} hari` : "Belum tersedia"}
          leaveBalanceHint={leaveEligibility.isEligible ? undefined : "Menyesuaikan status kepegawaian"}
          activeSubmissionsCount={activeSubmissionsCount}
          completenessLabel={completeness.label}
          completenessTone={completeness.status === "complete" ? "emerald" : completeness.status === "partial" ? "amber" : "rose"}
        />

        <QuickActionGrid
          canSubmitAnnualLeave={leaveEligibility.isEligible}
          leaveDisabledReason={leaveEligibility.isEligible ? undefined : leaveEligibility.reason}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-6">
            <AttendanceTodayCard isWeekend={isWeekend} isLoading={attendanceLoading} snapshot={attendance?.today ?? null} />

            <LeavePermitOvertimeSummary
              leave={{
                eligible: leaveEligibility.isEligible,
                allowance: leaveEligibility.allowance,
                used: leaveUsed,
                remaining: leaveBalance?.currentBalance ?? 0,
                pendingCount: leavePendingCount,
              }}
              permit={{
                activeCount: permissionPending.length,
                thisMonthCount: permissionThisMonth.length,
                lastStatusLabel: lastPermissionStatusLabel,
              }}
              overtime={{
                thisMonthCount: overtimeThisMonth.length,
                approvedCount: overtimeApproved.length,
                pendingCount: overtimePending.length,
                totalHoursThisMonth: overtimeTotalHours,
              }}
            />

            <StatusAdaptiveSection
              stage={stage.stage}
              probationPeriodLabel={
                probationStartDate && probationEndDate
                  ? `${formatDateLabel(probationStartDate)} – ${formatDateLabel(probationEndDate)}`
                  : null
              }
              contractStartLabel={formatDateLabel(contractStartDate)}
              contractEndLabel={formatDateLabel(contractEndDate)}
              contractTypeLabel={stage.label}
              benefit={
                hrdInfo.gajiPokok || hrdInfo.tunjanganTetap || hrdInfo.thr
                  ? { gajiPokok: hrdInfo.gajiPokok, tunjanganTetap: hrdInfo.tunjanganTetap, thr: hrdInfo.thr }
                  : null
              }
            />

            <EmploymentInfoCard
              rows={[
                { label: "Nama Lengkap", value: fallbackText(userProfile.fullName) },
                { label: "NIK / Employee ID", value: employeeNumberLabel },
                { label: "Jabatan", value: positionLabel },
                { label: "Divisi", value: fallbackText(divisionLabel) },
                { label: "Brand / Perusahaan", value: brandLabel },
                { label: "Atasan Langsung", value: supervisorLabel },
                { label: "Jenis Karyawan", value: stage.label },
                { label: "Sistem Kerja", value: workSystemLabel },
                { label: "Lokasi Kerja", value: workLocationLabel },
                { label: "Status Kepegawaian", value: stage.label },
                { label: "Mulai Kerja", value: formatDateLabel(joinDate) },
                {
                  label: "Kontrak Aktif",
                  value: contractEndDate ? `Sampai ${formatDateLabel(contractEndDate)}` : "Tidak ada batas kontrak",
                },
              ]}
              missingFields={missingFields}
            />
          </div>

          <div className="space-y-6">
            <EmployeeAlertsCard alerts={alerts} />
            <ActivityTimelineCard items={activityItems} isLoading={notificationsLoading} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
