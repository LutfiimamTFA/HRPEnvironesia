'use client';

import { useState, useMemo, Fragment } from 'react';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, serverTimestamp, where, writeBatch, updateDoc, getDoc } from 'firebase/firestore';
import { resolveApprovalTarget } from '@/lib/approval-flow';
import { useAuth } from '@/providers/auth-provider';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { sendLeaveNotification } from '@/lib/leave-notifications';
import { type LeaveRequest, type LeaveBalance, type LeaveBalanceAdjustment, type LeavePolicy } from '@/lib/types';
import { calculateLeaveBalance } from '@/lib/leave-balance';
import { useLiveLeaveBalance } from '@/hooks/use-live-leave-balance';
import { getLeaveProcessStage } from '@/lib/leave-process-stage';
import { getRequestEmployeeProfile, resolveCurrentEmployeeDivision } from '@/lib/employee-division';
import { getReplacementConfirmationStatus, getReplacementStatusBadgeClass } from '@/lib/leave-replacement-status';
import { formatPeriodLabel, matchesPeriod } from '@/lib/period';
import { MonthYearPicker } from '@/components/ui/MonthYearPicker';
import {
  Loader2,
  CalendarOff,
  AlertTriangle,
  Eye,
  CheckCircle2,
  Settings,
  Send,
  Building,
  Users,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  FileClock,
  Briefcase,
  Layers,
  MapPin,
  PhoneCall,
  UserCheck,
  Check,
  HelpCircle,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { useHrdScopedBrands, useHrdScopedCollection } from '@/hooks/useHrdScopedCollection';
import { HrdScopeEmptyState } from '@/components/dashboard/hrd/HrdScopeEmptyState';

export default function HrdLeaveApprovalPage() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  // State managers
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [selectedBalance, setSelectedBalance] = useState<LeaveBalance | null>(null);
  
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isActionOpen, setIsActionOpen] = useState(false);
  const [reasonError, setReasonError] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);

  // Calendar State completely removed

  // Interactive filter state
  const [isCashoutOpen, setIsCashoutOpen] = useState(false);
  const [cashoutDays, setCashoutDays] = useState<number>(0);
  const [cashoutAmount, setCashoutAmount] = useState<number>(0);
  const [cashoutReason, setCashoutReason] = useState('Pencairan Nilai Cuti ke Payroll');
  
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterDivision, setFilterDivision] = useState('all');
  const [filterLeaveType, setFilterLeaveType] = useState('all');
  const [filterSupervisorStatus, setFilterSupervisorStatus] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterManager, setFilterManager] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('all'); // "all" | "YYYY-MM"
  const [filterRequesterType, setFilterRequesterType] = useState('all');
  
  const [filterAdjustmentType, setFilterAdjustmentType] = useState('all');
  const [filterAdjustmentChange, setFilterAdjustmentChange] = useState('all');
  const [selectedAdjustment, setSelectedAdjustment] = useState<any>(null);
  const [isAdjustmentDetailOpen, setIsAdjustmentDetailOpen] = useState(false);

  // 1. Fetch all necessary data sources for resolving complete employee records
  const {
    data: employeeProfiles,
    isScopeConfigured,
    emptyStateMessage,
  } = useHrdScopedCollection<any>('employee_profiles');

  const { data: rawEmployees } = useHrdScopedCollection<any>('employees');

  const activeUserConstraints = useMemo(
    () => [where('role', 'in', ['karyawan', 'manager']), where('isActive', '==', true)],
    [],
  );
  const { data: rawUsers } = useHrdScopedCollection<any>('users', { constraints: activeUserConstraints });

  // A leave_requests doc's owner-uid field can point at any of several
  // identifiers depending on when/how it was written (see
  // getLeaveRequestOwnerUid / getRequestEmployeeProfile) — indexing the
  // profile under every identifier it itself carries means a lookup by ANY
  // of those fields still resolves to the SAME current profile, instead of
  // silently missing (and falling back to the request's own stale
  // snapshot) whenever the request's id field doesn't match uid/id exactly.
  const addProfileIndex = (map: Map<string, any>, profile: any) => {
    const keys = [
      profile.id,
      profile.uid,
      profile.userId,
      profile.authUid,
      profile.employeeUid,
      profile.employeeId,
      profile.employeeCode,
      profile.employeeNumber,
      profile.nomorIndukKaryawan,
      profile.email,
    ].filter(Boolean);
    keys.forEach((key) => map.set(String(key), profile));
  };

  const { employeeProfilesMap, employeesMap, usersMap } = useMemo(() => {
    const pMap = new Map<string, any>();
    const eMap = new Map<string, any>();
    const uMap = new Map<string, any>();
    if (employeeProfiles) employeeProfiles.forEach(p => addProfileIndex(pMap, p));
    if (rawEmployees) rawEmployees.forEach(e => addProfileIndex(eMap, e));
    if (rawUsers) rawUsers.forEach(u => addProfileIndex(uMap, u));
    return { employeeProfilesMap: pMap, employeesMap: eMap, usersMap: uMap };
  }, [employeeProfiles, rawEmployees, rawUsers]);

  const resolveEmployeeName = (p: any, e: any, u: any, b: any) => {
    return e?.fullName ||
           e?.name ||
           e?.displayName ||
           e?.personalData?.fullName ||
           e?.dataDiriIdentitas?.namaLengkap ||
           p?.fullName ||
           p?.name ||
           p?.displayName ||
           p?.personalData?.fullName ||
           p?.dataDiriIdentitas?.namaLengkap ||
           u?.fullName ||
           u?.name ||
           u?.displayName ||
           b?.employeeName ||
           e?.email ||
           p?.email ||
           u?.email ||
           "Nama belum tersedia";
  };

  // Emergency contact fields have been stored under many different key
  // spellings/nesting across form revisions over the years (raw fields on
  // the leave_requests doc, nested `emergencyContact.*`, personalInfo.*,
  // hrdPersonalInfo.*, dataDiriIdentitas.* Indonesian-labeled variants) —
  // this walks every known variant on both the request snapshot and the
  // current employee profile so a phone number stored under any of them
  // still surfaces instead of showing "Tidak ada kontak" incorrectly.
  const resolveEmergencyContact = (request: any, profile: any) => {
    const name =
      request?.emergencyContactName ||
      request?.emergencyContact?.name ||
      request?.emergencyContactFullName ||
      request?.kontakDaruratNama ||
      profile?.emergencyContactName ||
      profile?.emergencyContact?.name ||
      profile?.personalInfo?.emergencyContactName ||
      profile?.personalInfo?.emergencyContact?.name ||
      profile?.hrdPersonalInfo?.emergencyContactName ||
      profile?.hrdPersonalInfo?.emergencyContact?.name ||
      profile?.dataDiriIdentitas?.emergencyContactName ||
      profile?.dataDiriIdentitas?.namaKontakDarurat ||
      null;

    const phone =
      request?.emergencyContactPhone ||
      request?.emergencyContact?.phone ||
      request?.emergencyContactNumber ||
      request?.emergencyContactPhoneNumber ||
      request?.kontakDaruratTelepon ||
      request?.kontakDaruratNomor ||
      profile?.emergencyContactPhone ||
      profile?.emergencyContact?.phone ||
      profile?.personalInfo?.emergencyContactPhone ||
      profile?.personalInfo?.emergencyContact?.phone ||
      profile?.hrdPersonalInfo?.emergencyContactPhone ||
      profile?.hrdPersonalInfo?.emergencyContact?.phone ||
      profile?.dataDiriIdentitas?.emergencyContactPhone ||
      profile?.dataDiriIdentitas?.nomorKontakDarurat ||
      null;

    const relation =
      request?.emergencyContactRelation ||
      request?.emergencyContact?.relation ||
      request?.emergencyContactRelationship ||
      request?.kontakDaruratHubungan ||
      profile?.emergencyContactRelation ||
      profile?.emergencyContact?.relation ||
      profile?.personalInfo?.emergencyContactRelation ||
      profile?.personalInfo?.emergencyContact?.relation ||
      profile?.hrdPersonalInfo?.emergencyContactRelation ||
      profile?.hrdPersonalInfo?.emergencyContact?.relation ||
      profile?.dataDiriIdentitas?.hubunganKontakDarurat ||
      null;

    return { name, phone, relation };
  };

  const formatRupiah = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(value);
  };

  // 2. Fetch all leave requests
  const { data: requests, isLoading: isLoadingRequests, mutate: mutateRequests } = useHrdScopedCollection<LeaveRequest>('leave_requests');

  // 3. Fetch all leave balances
  const { data: balances, isLoading: isLoadingBalances, mutate: mutateBalances } = useHrdScopedCollection<LeaveBalance>('leave_balances');

  // 4. Fetch all adjustments
  const { data: adjustments, isLoading: isLoadingAdjustments, mutate: mutateAdjustments } = useHrdScopedCollection<LeaveBalanceAdjustment>('leave_balance_adjustments');

  // 4b. Leave policies — for the live, period-aware "Ringkasan Saldo Cuti" panel (calculateLeaveBalanceForRequest), independent of the OLD leave_balances doc above.
  const { data: leavePolicies } = useHrdScopedCollection<LeavePolicy>('leave_policies', {
    brandField: 'brandIds',
    brandFieldMode: 'array',
  });

  // 5. Fetch master brands and divisions
  const { data: masterBrands } = useHrdScopedBrands();

  const divisionsQuery = useMemoFirebase(() => {
    if (filterBrand === 'all') return null;
    return collection(firestore, 'brands', filterBrand, 'divisions');
  }, [firestore, filterBrand]);
  const { data: masterDivisions } = useCollection<any>(divisionsQuery);

  // Filter unique dropdown options dynamically
  const brandOptions = useMemo(() => {
    const map = new Map<string, {id: string, name: string}>();
    if (masterBrands) {
      masterBrands.forEach(b => {
        if (b.name) map.set(b.id, { id: b.id, name: b.name });
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [masterBrands]);

  const divisionOptions = useMemo(() => {
    const map = new Map<string, {id: string, name: string, brandId: string}>();
    if (masterDivisions && filterBrand !== 'all') {
      masterDivisions.forEach(d => {
        if (d.name) map.set(d.id, { id: d.id, name: d.name, brandId: filterBrand });
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [masterDivisions, filterBrand]);

  // The leave_requests doc's managerName is a SNAPSHOT taken at submission
  // time — if that manager's display name has since changed in
  // employee_profiles (the exact "Mandor" vs "Daniel" bug), the dropdown
  // must show the CURRENT name, not the stale one frozen on old requests.
  // De-duped by uid (not name), so the same manager under two different
  // historical name spellings still collapses to one option.
  const getRequestManagerUid = (r: LeaveRequest) =>
    r.managerId || (r as any).managerUid || (r as any).directManagerUid || (r as any).currentApproverUid || null;

  const managerOptions = useMemo(() => {
    const map = new Map<string, string>();
    if (requests) {
      requests.forEach(r => {
        const managerUid = getRequestManagerUid(r);
        if (!managerUid || map.has(managerUid)) return;
        const profile = employeeProfilesMap.get(String(managerUid));
        const employee = employeesMap.get(String(managerUid));
        const user = usersMap.get(String(managerUid));
        const resolvedName = resolveEmployeeName(profile, employee, user, null);
        // Only fall back to the request's own stale snapshot name when NO
        // current profile/employee/user record exists at all for this uid.
        const name = resolvedName !== 'Nama belum tersedia' ? resolvedName : (r.managerName || 'Nama belum tersedia');
        map.set(managerUid, name);
      });
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [requests, employeeProfilesMap, employeesMap, usersMap]);

  const leaveTypeChipLabel: Record<string, string> = {
    tahunan: 'Cuti Tahunan',
    besar: 'Cuti Besar',
    menikah: 'Cuti Menikah',
    melahirkan: 'Cuti Melahirkan',
  };

  const statusChipLabel: Record<string, string> = {
    pending_hrd: 'Antrean HRD',
    approved: 'Disetujui HRD',
    rejected_by_hrd: 'Ditolak HRD',
    revision_requested_by_hrd: 'Revisi HRD',
  };

  const requesterTypeChipLabel: Record<string, string> = {
    staff: 'Staff/Karyawan',
    manager: 'Manager Divisi',
  };

  const supervisorStatusChipLabel: Record<string, string> = {
    pending: 'Menunggu Atasan',
    approved: 'Disetujui Atasan',
    rejected: 'Ditolak Atasan',
  };

  // Active filter chips — lets HRD see at a glance what's narrowing the
  // table, and clear any single one without reopening the filter panel.
  const activeFilterChips = [
    filterBrand !== 'all' && { key: 'brand', label: `Brand: ${brandOptions.find(b => b.id === filterBrand)?.name || filterBrand}`, onRemove: () => setFilterBrand('all') },
    filterDivision !== 'all' && { key: 'division', label: `Divisi: ${divisionOptions.find(d => `${d.brandId}__${d.id}` === filterDivision)?.name || filterDivision}`, onRemove: () => setFilterDivision('all') },
    filterLeaveType !== 'all' && { key: 'leaveType', label: `Jenis Cuti: ${leaveTypeChipLabel[filterLeaveType] || filterLeaveType}`, onRemove: () => setFilterLeaveType('all') },
    filterSupervisorStatus !== 'all' && { key: 'supervisorStatus', label: `Status Atasan: ${supervisorStatusChipLabel[filterSupervisorStatus] || filterSupervisorStatus}`, onRemove: () => setFilterSupervisorStatus('all') },
    filterStatus !== 'all' && { key: 'status', label: `Status HRD: ${statusChipLabel[filterStatus] || filterStatus}`, onRemove: () => setFilterStatus('all') },
    filterRequesterType !== 'all' && { key: 'requesterType', label: `Tipe: ${requesterTypeChipLabel[filterRequesterType] || filterRequesterType}`, onRemove: () => setFilterRequesterType('all') },
    filterManager !== 'all' && { key: 'manager', label: `Atasan: ${managerOptions.find(m => m.id === filterManager)?.name || filterManager}`, onRemove: () => setFilterManager('all') },
    filterPeriod !== 'all' && { key: 'period', label: `Periode: ${formatPeriodLabel(filterPeriod)}`, onRemove: () => setFilterPeriod('all') },
    filterSearch && { key: 'search', label: `Cari: "${filterSearch}"`, onRemove: () => setFilterSearch('') },
  ].filter(Boolean) as { key: string; label: string; onRemove: () => void }[];

  const handleResetFilters = () => {
    setFilterBrand('all');
    setFilterDivision('all');
    setFilterLeaveType('all');
    setFilterSupervisorStatus('all');
    setFilterStatus('all');
    setFilterRequesterType('all');
    setFilterSearch('');
    setFilterManager('all');
    setFilterPeriod('all');
  };

  // Compute 5 indicators dynamically
  const approvedThisMonthCount = useMemo(() => {
    if (!requests) return 0;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    return requests.filter(r => {
      if (!['approved', 'approved_by_hrd', 'active_leave', 'completed'].includes(r.status)) return false;
      try {
        const start = r.startDate.toDate();
        return start.getMonth() === currentMonth && start.getFullYear() === currentYear;
      } catch {
        return false;
      }
    }).length;
  }, [requests]);

  const activeTodayCount = useMemo(() => {
    if (!requests) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return requests.filter(r => {
      if (!['approved', 'approved_by_hrd', 'active_leave'].includes(r.status)) return false;
      try {
        const start = r.startDate.toDate();
        start.setHours(0, 0, 0, 0);
        const end = r.endDate.toDate();
        end.setHours(23, 59, 59, 999);
        return today >= start && today <= end;
      } catch {
        return false;
      }
    }).length;
  }, [requests]);

  const totalUsedDays = useMemo(() => {
    if (!requests) return 0;
    return requests
      .filter(r => ['approved', 'approved_by_hrd', 'active_leave', 'completed'].includes(r.status))
      .reduce((sum, r) => sum + (r.durationDays || 0), 0);
  }, [requests]);

  const lowBalanceEmployees = useMemo(() => {
    if (!balances) return [];
    return balances.filter(b => {
      const remaining = b.currentBalance !== undefined ? b.currentBalance : ((b as any).remainingDays ?? 0);
      return remaining <= 2;
    });
  }, [balances]);

  const isManagerRequest = (req: LeaveRequest) => {
    const level = String(
      (req as any).requesterStructuralPosition || 
      (req as any).structuralLevel || 
      req.requesterStructuralPosition || 
      ""
    ).toLowerCase();
    
    const role = String((req as any).role || "").toLowerCase();
    const jobTitle = String((req as any).jobTitle || "").toLowerCase();
    const positionTitle = String((req as any).positionTitle || "").toLowerCase();

    return level.includes("manager") ||
           role.includes("manager") ||
           jobTitle.includes("manager") ||
           positionTitle.includes("manager") ||
           (req as any).approvalFlowType === "manager_to_director_to_hrd";
  };

  const getRequesterPositionLabel = (req: LeaveRequest) => {
    const level = (req as any).requesterStructuralPosition || 
                  (req as any).structuralLevel || 
                  req.requesterStructuralPosition || 
                  "Staff";
    return level;
  };

  // Alur Approval — a real step indicator (Staff → Pengganti → Manager
  // Divisi/Direktur → HRD → Selesai), not just a static flow label. Pengganti
  // is skipped entirely when the request never named a replacement. Each
  // dot's state (done/current/rejected/upcoming) comes from the same
  // getLeaveProcessStage() the Status Atasan/Status HRD columns use, so the
  // stepper can never disagree with the badges next to it.
  type ApprovalStepState = 'done' | 'current' | 'rejected' | 'upcoming';
  const renderApprovalFlowSteps = (req: LeaveRequest) => {
    const stage = getLeaveProcessStage(req);
    const isMgr = isManagerRequest(req);
    const hasReplacement =
      Boolean((req as any)?.replacementEmployeeUid) ||
      (Boolean((req as any)?.handoverEmployeeId) && (req as any)?.handoverEmployeeId !== 'manual');
    const approvalBlocked = stage.stage === 'replacement_pending' || stage.stage === 'replacement_rejected';

    const steps: { key: string; label: string; state: ApprovalStepState }[] = [
      { key: 'staff', label: 'Staff', state: 'done' },
    ];

    if (hasReplacement) {
      steps.push({
        key: 'replacement',
        label: 'Pengganti',
        state: stage.stage === 'replacement_pending' ? 'current' : stage.stage === 'replacement_rejected' ? 'rejected' : 'done',
      });
    }

    let approvalState: ApprovalStepState = 'upcoming';
    if (!approvalBlocked) {
      if (stage.stage === 'manager_pending') approvalState = 'current';
      else if (stage.stage === 'hrd_pending' || stage.stage === 'approved') approvalState = 'done';
      else if (req.status.includes('rejected') && !req.status.includes('hrd')) approvalState = 'rejected';
    }
    steps.push({ key: 'manager', label: isMgr ? 'Direktur' : 'Manager Divisi', state: approvalState });

    let hrdState: ApprovalStepState = 'upcoming';
    if (stage.stage === 'hrd_pending') hrdState = 'current';
    else if (stage.stage === 'approved') hrdState = 'done';
    else if (req.status === 'rejected_by_hrd') hrdState = 'rejected';
    steps.push({ key: 'hrd', label: 'HRD', state: hrdState });

    steps.push({ key: 'done', label: 'Selesai', state: stage.stage === 'approved' ? 'done' : 'upcoming' });

    const dotClass = (state: ApprovalStepState) =>
      state === 'done' ? 'bg-emerald-500' : state === 'current' ? 'bg-amber-500 animate-pulse' : state === 'rejected' ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-700';
    const labelClass = (state: ApprovalStepState) =>
      state === 'done' ? 'text-emerald-600 dark:text-emerald-400' : state === 'current' ? 'text-amber-600 dark:text-amber-400 font-bold' : state === 'rejected' ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-600';
    const lineClass = (state: ApprovalStepState) =>
      state === 'done' ? 'bg-emerald-300 dark:bg-emerald-800' : 'bg-slate-200 dark:bg-slate-800';

    return (
      <div className="flex items-start">
        {steps.map((step, i) => (
          <Fragment key={step.key}>
            <div className="flex flex-col items-center gap-1 w-14 shrink-0" title={step.label}>
              <span className={`h-2 w-2 rounded-full ${dotClass(step.state)}`} />
              <span className={`text-[11px] font-semibold text-center leading-tight ${labelClass(step.state)}`}>{step.label}</span>
            </div>
            {i < steps.length - 1 && <div className={`h-px w-3 mt-1.5 shrink-0 ${lineClass(step.state)}`} />}
          </Fragment>
        ))}
      </div>
    );
  };

  const getSupervisorStatusLabel = (req: LeaveRequest) => {
    const status = req.status;
    const isMgr = isManagerRequest(req);

    // Replacement confirmation is the FIRST gate — a request hasn't really
    // reached the atasan's queue while it's still waiting on the pengganti
    // sementara, no matter what `status` itself says.
    const stage = getLeaveProcessStage(req);
    if (stage.stage === 'replacement_pending' || stage.stage === 'replacement_rejected') {
      return 'Belum Masuk Tahap Atasan';
    }

    // Check Director/Management decisions for managers
    if (isMgr) {
      if (req.directorDecision === 'approved') return 'Disetujui Direktur/Manajemen';
      if (req.directorDecision === 'rejected') return 'Ditolak Direktur';
      if (req.directorDecision === 'revision_requested') return 'Revisi Diminta Direktur';
      if (status === 'rejected_by_director') return 'Ditolak Direktur';
      if (status === 'revision_requested_by_director') return 'Revisi Diminta Direktur';
    }

    // Manager decisions
    if ((req as any).managerDecision === 'approved') return 'Disetujui Manager Divisi';
    if ((req as any).managerDecision === 'rejected') return 'Ditolak Atasan';
    if ((req as any).managerDecision === 'revision_requested') return 'Revisi Diminta Atasan';
    if (status === 'rejected_by_manager') return 'Ditolak Atasan';
    if (status === 'revision_requested_by_manager') return 'Revisi Diminta Atasan';

    // Fallback based on status string
    if (status.includes('director') && status.includes('reject')) return 'Ditolak Direktur';
    if (status.includes('manager') && status.includes('reject')) return 'Ditolak Atasan';
    if (status.includes('director') && status.includes('revision')) return 'Revisi Diminta Direktur';
    if (status.includes('manager') && status.includes('revision')) return 'Revisi Diminta Atasan';

    // Pending state representations
    if (isMgr) {
      if (['pending_director', 'pending_director_review', 'waiting_director_approval'].includes(status)) {
        return 'Menunggu Persetujuan Direktur';
      }
    } else {
      if (['pending_manager', 'pending_manager_review', 'waiting_manager_approval', 'menunggu_approval_atasan'].includes(status)) {
        return 'Menunggu Persetujuan Manager';
      }
    }

    return 'Belum Diproses';
  };

  const getSupervisorStatusBadgeClass = (req: LeaveRequest) => {
    const label = getSupervisorStatusLabel(req);
    if (label.includes('Disetujui')) return 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400';
    if (label.includes('Ditolak')) return 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400';
    if (label.includes('Revisi')) return 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400';
    if (label.includes('Menunggu')) return 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-400';
    return 'bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400';
  };

  const getHrdStatusLabel = (req: LeaveRequest) => {
    const status = req.status;
    // Same replacement-confirmation gate as getSupervisorStatusLabel — this
    // is the exact bug fix: a request stuck on an unconfirmed pengganti used
    // to show "Menunggu Atasan" here, hiding the REAL blocker from HRD.
    const stage = getLeaveProcessStage(req);
    if (stage.stage === 'replacement_pending') return 'Menunggu Konfirmasi Pengganti';
    if (stage.stage === 'replacement_rejected') return 'Pengganti Menolak';
    if (['approved', 'approved_by_hrd', 'active_leave', 'completed'].includes(status)) return 'Disetujui HRD';
    if (status === 'rejected_by_hrd') return 'Ditolak HRD';
    if (status === 'revision_requested_by_hrd') return 'Revisi Diminta HRD';
    if (status === 'pending_hrd' || status === 'pending_hrd_review') return 'Menunggu Tindakan HRD';
    return 'Belum Masuk Tahap HRD';
  };

  const getHrdStatusBadgeClass = (req: LeaveRequest) => {
    const label = getHrdStatusLabel(req);
    if (label === 'Disetujui HRD') return 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400';
    if (label === 'Ditolak HRD') return 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400';
    if (label === 'Pengganti Menolak') return 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400';
    if (label === 'Menunggu Konfirmasi Pengganti') return 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400';
    if (label === 'Revisi Diminta HRD') return 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400';
    if (label === 'Menunggu Tindakan HRD') return 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-400';
    return 'bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400';
  };

  // General leaves requests filtered by interactive filters
  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    return requests.filter(r => {
      const profile = getRequestEmployeeProfile(r, employeeProfilesMap);
      // 1. Search text — nama, jabatan, brand, divisi, jenis cuti, status
      if (filterSearch) {
        const queryStr = filterSearch.toLowerCase();
        const haystack = [
          r.employeeName,
          getRequesterPositionLabel(r),
          profile?.brandName || profile?.hrdEmploymentInfo?.brandName || r.brandName,
          resolveCurrentEmployeeDivision(r, profile).divisionName,
          r.leaveType,
          getSupervisorStatusLabel(r),
          getHrdStatusLabel(r),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(queryStr)) return false;
      }
      // 2. Brand
      if (filterBrand !== 'all') {
        const bBrandId = profile?.brandId || profile?.hrdEmploymentInfo?.brandId || r.brandId || '';
        if (bBrandId !== filterBrand) return false;
      }
      // 3. Division — current profile wins over the request's own snapshot,
      // same priority as the display columns, so filtering by "DTIC" finds
      // an employee whose request still snapshots the old "CBDMS" division.
      if (filterDivision !== 'all') {
        const fDivId = filterDivision.split('__')[1] || filterDivision;
        const bDivId = resolveCurrentEmployeeDivision(r, profile).divisionId || r.divisionId || '';
        if (bDivId !== fDivId) return false;
      }
      // 4. Leave Type
      if (filterLeaveType !== 'all') {
        if (r.leaveType !== filterLeaveType) return false;
      }
      // 5. Status HRD
      if (filterStatus !== 'all') {
        if (filterStatus === 'pending_hrd') {
          if (r.status !== 'pending_hrd' && r.status !== 'pending_hrd_review') return false;
        } else if (filterStatus === 'approved') {
          if (r.status !== 'approved' && r.status !== 'approved_by_hrd') return false;
        } else {
          if (r.status !== filterStatus) return false;
        }
      }
      // 5b. Status Atasan — categorized off the same label HRD sees in the
      // table/modal (Disetujui/Ditolak/Menunggu), so the filter option
      // always matches what's actually displayed.
      if (filterSupervisorStatus !== 'all') {
        const label = getSupervisorStatusLabel(r);
        if (filterSupervisorStatus === 'approved' && !label.includes('Disetujui')) return false;
        if (filterSupervisorStatus === 'rejected' && !label.includes('Ditolak')) return false;
        if (filterSupervisorStatus === 'pending' && !label.includes('Menunggu')) return false;
      }
      // 6. Manager — matched by uid via the same resolver managerOptions uses.
      if (filterManager !== 'all') {
        if (getRequestManagerUid(r) !== filterManager) return false;
      }
      // 7. Periode (YYYY-MM) filter
      if (filterPeriod !== 'all') {
        try {
          if (!matchesPeriod(r.startDate.toDate(), filterPeriod)) return false;
        } catch {
          return false;
        }
      }
      // 8. Requester Type filter
      if (filterRequesterType !== 'all') {
        const isMgr = isManagerRequest(r);
        if (filterRequesterType === 'manager' && !isMgr) return false;
        if (filterRequesterType === 'staff' && isMgr) return false;
      }
      return true;
    });
  }, [requests, filterSearch, filterBrand, filterDivision, filterLeaveType, filterStatus, filterSupervisorStatus, filterManager, filterPeriod, filterRequesterType, employeeProfilesMap]);

  // Tab 1 List: Need HRD Action
  const needHrdActionList = useMemo(() => {
    return filteredRequests.filter(r =>
      getLeaveProcessStage(r).hrdCanApprove
    ).sort((a, b) => {
      const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return bTime - aTime;
    });
  }, [filteredRequests]);

  // Tab 2 List: All Requests (filtered further by "Tipe Pengaju" in the filter panel)
  const allRequestsList = useMemo(() => {
    return [...filteredRequests].sort((a, b) => {
      const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return bTime - aTime;
    });
  }, [filteredRequests]);

  const pendingHrdCount = useMemo(() => {
    return needHrdActionList.length;
  }, [needHrdActionList]);

  // Tab 3 List: Employee Quota balances filtered (Sourced from Employee Profiles to show uninitialized ones)
  const filteredBalances = useMemo(() => {
    if (!employeeProfiles) return [];

    const eligible = employeeProfiles.filter(p => {
      const bEmploymentType = p.hrdEmploymentInfo?.employeeType || '';
      const contractMonths = p.hrdEmploymentInfo?.contractDurationMonths || 0;
      
      const isTetap = bEmploymentType.toLowerCase().includes('tetap');
      const isEligibleKontrak = bEmploymentType.toLowerCase().includes('kontrak') && contractMonths >= 12;
      
      if (!isTetap && !isEligibleKontrak) return false;

      // 1. Search text
      if (filterSearch) {
        if (!p.fullName?.toLowerCase().includes(filterSearch.toLowerCase())) return false;
      }

      // 2. Brand
      if (filterBrand !== 'all') {
        const bBrandId = p.hrdEmploymentInfo?.brandId || p.brandId || '';
        if (bBrandId !== filterBrand) return false;
      }
      // 3. Division
      if (filterDivision !== 'all') {
        const fDivId = filterDivision.split('__')[1] || filterDivision;
        const bDivId = p.hrdEmploymentInfo?.divisionId || p.divisionId || '';
        if (bDivId !== fDivId) return false;
      }
      return true;
    });

    return eligible.map(p => {
      const uid = p.uid || p.id;
      const emp = employeesMap.get(uid);
      const usr = usersMap.get(uid);
      // Live-calculated, same calculateLeaveBalance() every other page
      // (Detail Karyawan, Detail Pengajuan) reads — replaces the old
      // leave_balances-doc lookup that let this tab disagree with the rest
      // of the app. No per-row console.log here — logging once per eligible
      // employee on every recompute of this table (N employees x every
      // requests/leavePolicies/employeeProfiles listener tick) was exactly
      // the "[LEAVE_BALANCE_SYNC_DEBUG] muncul berulang" spam; the shared
      // useLiveLeaveBalance hook's own single log (fired once per explicit
      // fetch, from api/leave/my-balance) is the one source of truth for
      // that debug tag now.
      const liveBalance = calculateLeaveBalance({ employee: p, leaveRequests: requests, leavePolicies });
      return { profile: p, employee: emp || null, user: usr || null, liveBalance };
    });
  }, [employeeProfiles, requests, leavePolicies, filterSearch, filterBrand, filterDivision, employeesMap, usersMap]);

  // Tab 4 List: Audit Mutasi Saldo Cuti ledger logs filtered
  const sortedAdjustmentsFiltered = useMemo(() => {
    if (!adjustments) return [];
    
    const processed = adjustments.map(a => {
      const profile = getRequestEmployeeProfile(a, employeeProfilesMap) || employeeProfilesMap.get(a.employeeId);
      const currentDivision = resolveCurrentEmployeeDivision(a, profile);
      const bBrandId = profile?.hrdEmploymentInfo?.brandId || profile?.brandId || (a as any).brandId || '';
      return {
        ...a,
        brandId: bBrandId,
        divisionId: currentDivision.divisionId,
        brandName: profile?.hrdEmploymentInfo?.brandName || profile?.brandName || (a as any).brandName || '-',
        divisionName: currentDivision.divisionName,
      };
    });

    return processed.filter(a => {
      // 1. Search text
      if (filterSearch) {
        const queryStr = filterSearch.toLowerCase();
        const empMatch = a.employeeName?.toLowerCase().includes(queryStr);
        const reasonMatch = a.reason?.toLowerCase().includes(queryStr);
        if (!empMatch && !reasonMatch) return false;
      }
      // 2. Brand
      if (filterBrand !== 'all') {
        if (a.brandId !== filterBrand) return false;
      }
      // 3. Division
      if (filterDivision !== 'all') {
        const fDivId = filterDivision.split('__')[1] || filterDivision;
        if (a.divisionId !== fDivId) return false;
      }
      // 4. Periode (YYYY-MM) filter
      if (filterPeriod !== 'all') {
        try {
          const date = a.createdAt?.toDate ? a.createdAt.toDate() : new Date();
          if (!matchesPeriod(date, filterPeriod)) return false;
        } catch {
          return false;
        }
      }
      // 5. Adjustment Type
      if (filterAdjustmentType !== 'all') {
        if (a.type !== filterAdjustmentType) return false;
      }
      // 6. Adjustment Change
      if (filterAdjustmentChange !== 'all') {
        if (filterAdjustmentChange === 'positive' && a.adjustmentValue <= 0) return false;
        if (filterAdjustmentChange === 'negative' && a.adjustmentValue >= 0) return false;
      }
      return true;
    }).sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bTime - aTime;
    });
  }, [adjustments, filterSearch, filterBrand, filterDivision, filterPeriod, filterAdjustmentType, filterAdjustmentChange, employeeProfilesMap]);

  // Live "Ringkasan Saldo Cuti" panel — calls the EXACT SAME calculateLeaveBalance()
  // used by the "Saldo & Hak Cuti" tab (filteredBalances above) and the
  // Directory Karyawan / Policy Cuti pages, with the SAME arguments
  // (employee, requests, leavePolicies). Previously this called the sibling
  // calculateLeaveBalanceForRequest() instead — a different function with a
  // different framing (excludes the request being reviewed from "pending"),
  // so a pending request's own days silently vanished from "Sisa Bisa
  // Diajukan" here while Directory Karyawan still counted them. Same
  // function + same inputs is the only way these can never drift apart again.
  // The modal's "Ringkasan Saldo Cuti" — calls useLiveLeaveBalance(), the
  // EXACT SAME hook Directory Karyawan and the Policy Cuti summary card use
  // (src/hooks/use-live-leave-balance.ts → GET /api/leave/my-balance, Admin
  // SDK, server-side). Deliberately NOT a local calculateLeaveBalance() call
  // against this page's own client-scoped `requests`/`employeeProfiles` —
  // that's what caused the drift this fixes: useHrdScopedCollection's single
  // brand-scoped query doesn't do the same multi-field owner-UID join
  // (employeeUid/requesterUid/uid/userId/employeeId/createdByUid) the API
  // route does server-side, so an approved leave_requests doc whose owner
  // field didn't line up with this page's query silently dropped out of
  // "Terpakai" here while Directory Karyawan (via the API) still counted it.
  const selectedEmployeeUid = useMemo(() => {
    if (!selectedRequest) return null;
    const profile = getRequestEmployeeProfile(selectedRequest, employeeProfilesMap);
    return profile?.uid || profile?.id || (selectedRequest as any)?.employeeUid || selectedRequest.employeeId || null;
  }, [selectedRequest, employeeProfilesMap]);

  const {
    balance: selectedRequestBalance,
    loading: isLoadingSelectedBalance,
    refetch: refetchSelectedBalance,
  } = useLiveLeaveBalance(selectedEmployeeUid);

  const [isMigrating, setIsMigrating] = useState(false);

  const handleMigrateLegacyRequest = async (req: LeaveRequest) => {
    if (!firestore || !userProfile) return;
    setIsMigrating(true);
    try {
      const employeeProfile = employeeProfilesMap.get(req.employeeId || (req as any).employeeUid);
      const employeeUser = usersMap.get(req.employeeId || (req as any).employeeUid);
      
      let divisionMaster: any = null;
      const brandId = req.brandId || employeeProfile?.hrdEmploymentInfo?.brandId || employeeProfile?.brandId;
      const divisionId = req.divisionId || employeeProfile?.hrdEmploymentInfo?.divisionId || employeeProfile?.divisionId;

      if (brandId && divisionId) {
        const divRef = doc(firestore, 'brands', brandId, 'divisions', divisionId);
        const divSnap = await getDoc(divRef);
        if (divSnap.exists()) {
          divisionMaster = divSnap.data();
        }
      }

      const approvalTarget = resolveApprovalTarget(
        employeeProfile as any,
        employeeUser as any,
        divisionMaster
      );

      if (!approvalTarget.approvalTargetUid) {
        throw new Error("Atasan/Direktur untuk divisi ini belum diatur di struktur organisasi.");
      }

      const directorUid = approvalTarget.approvalTargetUid;
      const directorName = approvalTarget.approvalTargetName || "Direktur/Manajemen";

      const reqRef = doc(firestore, 'leave_requests', req.id!);
      await updateDoc(reqRef, {
        approvalFlowType: "manager_to_director_to_hrd",
        currentApprovalStep: "director",
        currentApproverUid: directorUid,
        currentApproverName: directorName,
        approvalTargetUid: directorUid,
        directorUid: directorUid,
        directorId: directorUid,
        directorName: directorName,
        updatedAt: serverTimestamp()
      });

      toast({
        title: "Migrasi Berhasil",
        description: `Field approver Direktur (${directorName}) berhasil ditambahkan ke dokumen.`
      });

      setSelectedRequest({
        ...req,
        approvalFlowType: "manager_to_director_to_hrd",
        currentApprovalStep: "director",
        currentApproverUid: directorUid,
        currentApproverName: directorName,
        approvalTargetUid: directorUid,
        directorUid: directorUid,
        directorId: directorUid,
        directorName: directorName,
      } as any);

      mutateRequests();
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: "Gagal Migrasi",
        description: e.message
      });
    } finally {
      setIsMigrating(false);
    }
  };

  // Action handlers
  const handleViewDetails = (req: LeaveRequest) => {
    setSelectedRequest(req);
    setIsDetailOpen(true);
  };

  const handleOpenAction = (type: 'approve' | 'reject', req: LeaveRequest) => {
    setSelectedRequest(req);
    setActionType(type);
    setNotes('');
    setReasonError(false);
    setIsActionOpen(true);
  };

  // AUTOMATED ATOMIC FINAL APPROVAL DEDUCTIONS
  const handleConfirmAction = async () => {
    if (!selectedRequest || !actionType || !userProfile || !firestore) return;

    // Defense-in-depth on top of the button's own disabled/hidden state —
    // a stale dialog left open across a status change (another tab, a race)
    // must not still let HRD approve/reject/revise before the request has
    // actually reached the HRD stage (pengganti confirmed + atasan decided).
    if (!getLeaveProcessStage(selectedRequest).hrdCanApprove) {
      toast({
        variant: 'destructive',
        title: 'Belum Masuk Tahap HRD',
        description: 'Pengajuan ini masih menunggu konfirmasi pengganti / persetujuan atasan.',
      });
      return;
    }

    if (actionType === 'reject' && notes.trim().length < 5) {
      toast({
        variant: 'destructive',
        title: "Keterangan Wajib Diisi",
        description: "Harap masukkan keterangan/alasan minimal 5 karakter."
      });
      return;
    }

    setIsSaving(true);
    try {
      const reqRef = doc(firestore, 'leave_requests', selectedRequest.id!);
      const batch = writeBatch(firestore);

      let newStatus: LeaveRequest['status'] = 'approved_by_hrd';
      let notificationType: any = "hrd_approval";

      if (actionType === 'reject') {
        newStatus = 'rejected_by_hrd';
        notificationType = "hrd_rejection";
      }

      // 1. Update Leave Request Status
      batch.update(reqRef, {
        status: newStatus,
        hrdId: userProfile.uid,
        hrdName: userProfile.fullName,
        hrdNotes: notes,
        hrdReviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 2. Audit ledger only — leave_requests.status above is what actually
      // drives the displayed numbers (via calculateLeaveBalance reading
      // approved leave_requests). This write is informational history only;
      // approve must never depend on it or on the legacy leave_balances doc
      // existing/being in sync.
      if (actionType === 'approve') {
        const balData = balances?.find(b => b.employeeId === selectedRequest.employeeId);
        const adjRef = doc(collection(firestore, 'leave_balance_adjustments'));
        batch.set(adjRef, {
          employeeId: selectedRequest.employeeId,
          employeeName: selectedRequest.employeeName,
          brandId: selectedRequest.brandId || '',
          brandName: selectedRequest.brandName || '',
          divisionId: selectedRequest.divisionId || '',
          divisionName: selectedRequest.divisionName || '',
          previousBalance: balData?.currentBalance || 0,
          newBalance: Math.max(0, (balData?.currentBalance || 0) - selectedRequest.durationDays),
          adjustmentValue: -selectedRequest.durationDays,
          reason: `Cuti ${selectedRequest.leaveType === 'tahunan' ? 'Tahunan' : selectedRequest.leaveType === 'besar' ? 'Besar' : selectedRequest.leaveType === 'menikah' ? 'Menikah' : selectedRequest.leaveType === 'melahirkan' ? 'Melahirkan' : 'Tahunan'} disetujui HRD`,
          type: 'cuti_disetujui',
          adjustedBy: userProfile.uid,
          adjustedByName: userProfile.fullName,
          createdAt: serverTimestamp()
        });
      }

      await batch.commit();

      // Trigger leave notification
      await sendLeaveNotification(firestore, notificationType, {
        employeeId: selectedRequest.employeeId,
        employeeName: selectedRequest.employeeName,
        managerId: selectedRequest.managerId,
        managerName: selectedRequest.managerName,
        startDate: selectedRequest.startDate,
        endDate: selectedRequest.endDate,
        reason: actionType === 'reject' ? notes : undefined,
        requestId: selectedRequest.id!
      });

      toast({
        title: actionType === 'approve' ? "Cuti Disetujui (Final)" : "Cuti Ditolak",
        description:
          actionType === 'approve'
            ? "Pengajuan cuti berhasil disetujui."
            : "Pengajuan cuti berhasil ditolak.",
      });

      setIsActionOpen(false);
      setIsDetailOpen(false);
      mutateRequests();
      mutateBalances();
      mutateAdjustments();
      refetchSelectedBalance();
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Gagal Memproses", description: "Terjadi kesalahan saat memproses keputusan." });
    } finally {
      setIsSaving(false);
    }
  };



  const handleInitializeBalance = async (profile: any, employee: any, user: any) => {
    if (!firestore || !userProfile) return;
    setIsSaving(true);
    try {
      const uid = profile.uid || profile.id;
      const balanceRef = doc(firestore, 'leave_balances', uid);
      const bBrandId = profile.hrdEmploymentInfo?.brandId || profile.brandId || '';
      const bBrandName = profile.hrdEmploymentInfo?.brandName || profile.brandName || '';
      const bDivId = profile.hrdEmploymentInfo?.divisionId || profile.divisionId || '';
      const bDivName = profile.hrdEmploymentInfo?.divisionName || profile.divisionName || '';
      const resolvedName = resolveEmployeeName(profile, employee, user, null);
      
      const newBal = {
        employeeId: uid,
        employeeName: resolvedName,
        brandId: bBrandId,
        brandName: bBrandName,
        divisionId: bDivId,
        divisionName: bDivName,
        employmentType: profile.hrdEmploymentInfo?.employeeType || '',
        contractDurationMonths: profile.hrdEmploymentInfo?.contractDurationMonths || 0,
        initialQuota: 12, // Default
        allocatedLeave: 0,
        pendingLeave: 0,
        currentBalance: 12,
        annualAllowance: 12,
        usedDays: 0,
        pendingDays: 0,
        remainingDays: 12,
        cashoutRatePerDay: 0,
        updatedAt: serverTimestamp(),
      };
      
      const batch = writeBatch(firestore);
      batch.set(balanceRef, newBal);
      
      const adjRef = doc(collection(firestore, 'leave_balance_adjustments'));
      batch.set(adjRef, {
        employeeId: newBal.employeeId,
        employeeName: newBal.employeeName,
        brandId: newBal.brandId,
        brandName: newBal.brandName,
        divisionId: newBal.divisionId,
        divisionName: newBal.divisionName,
        previousBalance: 0,
        newBalance: 12,
        adjustmentValue: 12,
        reason: 'Inisialisasi kuota cuti tahunan awal',
        type: 'inisialisasi_kuota',
        adjustedBy: userProfile.uid,
        adjustedByName: userProfile.fullName,
        createdAt: serverTimestamp()
      });
      
      await batch.commit();
      toast({ title: "Saldo Diinisialisasi", description: `Saldo cuti ${profile.fullName} berhasil dibuat.` });
      mutateBalances();
      mutateAdjustments();
    } catch(e:any) {
      toast({ variant: 'destructive', title: "Gagal Inisialisasi", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenCashout = (bal: any, profile: any) => {
    setSelectedBalance(bal);
    const currentDays = bal ? (bal.remainingDays !== undefined ? bal.remainingDays : bal.currentBalance || 0) : 0;
    setCashoutDays(currentDays);
    setCashoutAmount(0);
    setCashoutReason('');
    setIsCashoutOpen(true);
  };

  const handleConfirmCashout = async () => {
    if (!selectedBalance || !userProfile || !firestore) return;
    const prevRemaining = (selectedBalance as any).remainingDays !== undefined ? (selectedBalance as any).remainingDays : selectedBalance.currentBalance || 0;
    
    if (prevRemaining <= 0) {
      toast({ variant: 'destructive', title: "Validasi Gagal", description: "Tidak ada sisa cuti yang bisa dicairkan." });
      return;
    }
    if (cashoutAmount <= 0) {
      toast({ variant: 'destructive', title: "Validasi Gagal", description: "Nominal cashout harus lebih dari 0." });
      return;
    }
    setIsSaving(true);
    try {
      const balanceRef = doc(firestore, 'leave_balances', selectedBalance.employeeId);
      const newRemaining = 0; // Automatically empty all balance on cashout

      const batch = writeBatch(firestore);

      batch.update(balanceRef, {
        currentBalance: newRemaining,
        remainingDays: newRemaining,
        updatedAt: serverTimestamp()
      } as any);

      const adjRef = doc(collection(firestore, 'leave_balance_adjustments'));
      batch.set(adjRef, {
        employeeId: selectedBalance.employeeId,
        employeeName: selectedBalance.employeeName,
        brandId: (selectedBalance as any).brandId || '',
        brandName: (selectedBalance as any).brandName || '',
        divisionId: (selectedBalance as any).divisionId || '',
        divisionName: (selectedBalance as any).divisionName || '',
        previousBalance: prevRemaining,
        newBalance: newRemaining,
        adjustmentValue: -prevRemaining,
        cashoutAmount: cashoutAmount,
        reason: cashoutReason || 'Sisa cuti dicairkan ke payroll',
        type: 'cashout_cuti',
        adjustedBy: userProfile.uid,
        adjustedByName: userProfile.fullName,
        createdAt: serverTimestamp()
      });

      await batch.commit();

      toast({ title: "Cashout Berhasil", description: `Saldo cuti ${selectedBalance.employeeName} dikurangi ${prevRemaining} hari sejumlah ${formatRupiah(cashoutAmount)}.` });
      setIsCashoutOpen(false);
      mutateBalances();
      mutateAdjustments();
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Gagal", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Overall status badge (detail dialog header) — same replacement-first
  // gate as getSupervisorStatusLabel/getHrdStatusLabel below, so the
  // headline badge and the two per-stage columns never contradict each
  // other (e.g. badge saying "Menunggu Persetujuan Atasan" while the HRD
  // column correctly says "Menunggu Konfirmasi Pengganti").
  // Visual priority accent for table rows — a colored left border so HRD can
  // scan which rows need action vs. which are already resolved, without
  // reading every status badge individually.
  const getRowAccentClass = (request: LeaveRequest) => {
    const stage = getLeaveProcessStage(request);
    // Butuh tindakan HRD right now — the row that actually matters most to
    // this workspace — gets the strongest accent (blue), per spec.
    if (stage.stage === 'hrd_pending') return 'border-l-4 border-l-blue-500';
    if (stage.stage === 'approved') return 'border-l-4 border-l-emerald-500';
    if (stage.stage === 'replacement_pending' || stage.stage === 'manager_pending') return 'border-l-4 border-l-amber-400';
    if (stage.stage === 'replacement_rejected') return 'border-l-4 border-l-red-400';
    if (request.status.includes('rejected')) return 'border-l-4 border-l-red-400';
    if (request.status.includes('revision')) return 'border-l-4 border-l-amber-400';
    return 'border-l-4 border-l-transparent';
  };

  const renderRequestsTable = (list: LeaveRequest[], emptyMessage: string, isFilteredEmpty?: boolean) => {
    const EmptyState = ({ compact }: { compact?: boolean }) => (
      <div className={`flex flex-col items-center justify-center gap-3 text-center px-4 ${compact ? 'h-44' : 'h-56'}`}>
        <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${isFilteredEmpty ? 'bg-slate-100 dark:bg-slate-900' : 'bg-emerald-50 dark:bg-emerald-950/20'}`}>
          {isFilteredEmpty ? (
            <Search className="h-6 w-6 text-slate-400 dark:text-slate-600" />
          ) : (
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          )}
        </div>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
          {isFilteredEmpty ? 'Tidak ada pengajuan cuti ditemukan.' : emptyMessage}
        </p>
        {isFilteredEmpty && (
          <p className="text-xs text-slate-500 dark:text-slate-500 max-w-xs">Coba ubah filter atau pilih tab lain.</p>
        )}
      </div>
    );

    return (
      <Card className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {/* Mobile card list (< md) — same data/logic as the desktop table below, just laid out as stacked cards instead of a squeezed table. */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
            {list.length > 0 ? (
              list.map(r => {
                const profile = getRequestEmployeeProfile(r, employeeProfilesMap);
                const rBrand = profile?.brandName || profile?.hrdEmploymentInfo?.brandName || profile?.hrdEmploymentInfo?.brand || r.brandName || '-';
                const rDivision = resolveCurrentEmployeeDivision(r, profile).divisionName;
                const jobTitle = getRequesterPositionLabel(r);
                const needsAction = getLeaveProcessStage(r).hrdCanApprove;
                return (
                  <div
                    key={r.id}
                    onClick={() => handleViewDetails(r)}
                    className={`p-4 space-y-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors ${getRowAccentClass(r)}`}
                  >
                    <div className="min-w-0">
                      <p className="text-slate-900 dark:text-white font-bold text-base truncate">{r.employeeName}</p>
                      <p className="text-sm font-semibold text-slate-500 capitalize truncate">{jobTitle}</p>
                    </div>
                    <div className="overflow-x-auto -mx-1 px-1">{renderApprovalFlowSteps(r)}</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
                      <div>
                        <p className="text-xs uppercase font-bold text-slate-400 tracking-wide">Brand / Divisi</p>
                        <p className="font-semibold text-slate-600 dark:text-slate-300 truncate">{rBrand}</p>
                        <p className="text-xs text-slate-400 font-medium truncate">{rDivision}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase font-bold text-slate-400 tracking-wide">Jenis Cuti</p>
                        <p className="font-semibold text-indigo-500 capitalize">
                          Cuti {r.leaveType === 'tahunan' ? 'Tahunan' : r.leaveType === 'besar' ? 'Besar' : r.leaveType === 'menikah' ? 'Menikah' : r.leaveType === 'melahirkan' ? 'Melahirkan' : 'Tahunan'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs uppercase font-bold text-slate-400 tracking-wide">Periode</p>
                        <p className="font-medium text-slate-600 dark:text-slate-300">
                          {format(r.startDate.toDate(), 'dd MMM yyyy', { locale: idLocale })} - {format(r.endDate.toDate(), 'dd MMM yyyy', { locale: idLocale })}
                          <span className="ml-1.5 font-bold text-slate-800 dark:text-slate-100">({r.durationDays} Hari)</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase font-bold text-slate-400 tracking-wide">Status Atasan</p>
                        <Badge variant="outline" className={`mt-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${getSupervisorStatusBadgeClass(r)}`}>
                          {getSupervisorStatusLabel(r)}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs uppercase font-bold text-slate-400 tracking-wide">Status HRD</p>
                        <Badge variant="outline" className={`mt-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${getHrdStatusBadgeClass(r)}`}>
                          {getHrdStatusLabel(r)}
                        </Badge>
                      </div>
                    </div>
                    <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant={needsAction ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => handleViewDetails(r)}
                        className={
                          needsAction
                            ? 'w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1 shadow-sm'
                            : 'w-full rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs gap-1'
                        }
                      >
                        <Eye className="h-3.5 w-3.5" /> Detail
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState compact />
            )}
          </div>

          {/* Desktop/tablet table (>= md) */}
          <div className="hidden md:block overflow-x-auto w-full min-w-0">
            <Table className="w-full min-w-[1260px]">
              <TableHeader className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10">
                <TableRow className="border-b border-slate-200 dark:border-slate-800">
                  <TableHead className="pl-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Karyawan</TableHead>
                  <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Brand / Divisi</TableHead>
                  <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Jenis Cuti</TableHead>
                  <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Periode Cuti</TableHead>
                  <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Durasi</TableHead>
                  <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Alur Approval</TableHead>
                  <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status Atasan</TableHead>
                  <TableHead className="py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status HRD</TableHead>
                  <TableHead className="text-right pr-6 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.length > 0 ? (
                  list.map(r => {
                    const profile = getRequestEmployeeProfile(r, employeeProfilesMap);
                    const rBrand = profile?.brandName || profile?.hrdEmploymentInfo?.brandName || profile?.hrdEmploymentInfo?.brand || r.brandName || '-';
                    const rDivision = resolveCurrentEmployeeDivision(r, profile).divisionName;
                    const jobTitle = getRequesterPositionLabel(r);
                    const needsAction = getLeaveProcessStage(r).hrdCanApprove;

                    return (
                      <TableRow
                        key={r.id}
                        onClick={() => handleViewDetails(r)}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors border-b border-slate-100 dark:border-slate-800/80 cursor-pointer ${getRowAccentClass(r)}`}
                      >
                        <TableCell className="pl-6 py-4">
                          <span className="text-slate-900 dark:text-white font-bold text-base block">{r.employeeName}</span>
                          <span className="text-sm font-semibold text-slate-500 capitalize block">{jobTitle}</span>
                        </TableCell>
                        <TableCell className="py-4 text-sm">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">{rBrand}</span>
                            <span className="text-xs text-slate-400 font-medium">{rDivision}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-sm font-semibold text-indigo-500 capitalize">
                          Cuti {r.leaveType === 'tahunan' ? 'Tahunan' : r.leaveType === 'besar' ? 'Besar' : r.leaveType === 'menikah' ? 'Menikah' : r.leaveType === 'melahirkan' ? 'Melahirkan' : 'Tahunan'}
                        </TableCell>
                        <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300 font-medium">
                          {format(r.startDate.toDate(), 'dd MMM yyyy', { locale: idLocale })} - {format(r.endDate.toDate(), 'dd MMM yyyy', { locale: idLocale })}
                        </TableCell>
                        <TableCell className="py-4 font-bold text-slate-800 dark:text-slate-100 text-base">
                          {r.durationDays} Hari
                        </TableCell>
                        <TableCell className="py-4">
                          {renderApprovalFlowSteps(r)}
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge variant="outline" className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getSupervisorStatusBadgeClass(r)}`}>
                            {getSupervisorStatusLabel(r)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge variant="outline" className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getHrdStatusBadgeClass(r)}`}>
                            {getHrdStatusLabel(r)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant={needsAction ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => handleViewDetails(r)}
                            className={
                              needsAction
                                ? 'rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1 shadow-sm'
                                : 'rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 font-bold text-xs gap-1'
                            }
                          >
                            <Eye className="h-3.5 w-3.5" /> Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={9}>
                      <EmptyState />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  };



  if (!isScopeConfigured) {
    return (
      <DashboardLayout pageTitle="Persetujuan Cuti HRD">
        <HrdScopeEmptyState message={emptyStateMessage} />
      </DashboardLayout>
    );
  }

  if (isLoadingRequests || isLoadingBalances || isLoadingAdjustments) {
    return (
      <DashboardLayout pageTitle="Persetujuan Cuti HRD">
        <div className="flex flex-col justify-center items-center h-64 gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
          <p className="text-sm font-medium text-slate-400">Menyinkronkan data cuti karyawan...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Workspace Monitoring Cuti HRD">
      {/* w-full + min-w-0 (no max-w cap, no mx-auto centering, no fixed
          width) — the page must grow/shrink to fill whatever content area
          SidebarInset actually gives it as the sidebar collapses/expands,
          not lock itself to a capped centered column. Horizontal scroll is
          confined to the table's own wrapper (overflow-x-auto) below, never
          this outer wrapper. */}
      <div className="w-full min-w-0 space-y-5 md:space-y-6 px-3 sm:px-4 md:px-6 lg:px-8 animate-in fade-in duration-500">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 py-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="shrink-0 p-3 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-600/10">
              <Calendar className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">Workspace Cuti & Saldo Karyawan</h1>
                <Badge className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-black border border-indigo-100/80 hover:bg-indigo-50 text-[10px] uppercase shrink-0">HRD Workspace</Badge>
              </div>
              <p className="text-xs text-slate-400 font-semibold mt-0.5 line-clamp-2">Pantau realisasi cuti, finalisasi approval secara otomatis, dan kelola audit mutasi lintas brand.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {activeFilterChips.length > 0 && (
              <Button variant="ghost" onClick={handleResetFilters} className="rounded-xl font-bold text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white">
                Reset Filter
              </Button>
            )}
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
                <span className="text-[13px] leading-none">×</span>
              </button>
            ))}
          </div>
        )}

        {/* TOP SUMMARY CARDS PANEL */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          
          <Card className="border-indigo-100/60 dark:border-indigo-950/40 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-indigo-500/5 to-transparent relative overflow-hidden group">
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Menunggu Approval HRD</p>
                  <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-2">{pendingHrdCount}</p>
                </div>
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                  <UserCheck className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-[10px] text-indigo-500 font-black tracking-wider uppercase bg-indigo-500/5 py-1 px-2 rounded w-fit">Menunggu Keputusan</div>
            </CardContent>
          </Card>

          <Card className="border-emerald-100/60 dark:border-emerald-950/40 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-emerald-500/5 to-transparent relative overflow-hidden group">
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Disetujui Bulan Ini</p>
                  <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{approvedThisMonthCount}</p>
                </div>
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-[10px] text-emerald-600 font-black tracking-wider uppercase bg-emerald-500/5 py-1 px-2 rounded w-fit">Direncanakan & Berjalan</div>
            </CardContent>
          </Card>

          <Card className="border-blue-100/60 dark:border-blue-950/40 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-blue-500/5 to-transparent relative overflow-hidden group">
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cuti Aktif Hari Ini</p>
                  <p className="text-3xl font-black text-blue-600 dark:text-blue-400 mt-2">{activeTodayCount}</p>
                </div>
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                  <Sparkles className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-[10px] text-blue-600 font-black tracking-wider uppercase bg-blue-500/5 py-1 px-2 rounded w-fit">Sedang Menjalani Cuti</div>
            </CardContent>
          </Card>

          <Card className="border-violet-100/60 dark:border-violet-950/40 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-violet-500/5 to-transparent relative overflow-hidden group">
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Hari Terpakai</p>
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="text-3xl font-black text-violet-600 dark:text-violet-400">{totalUsedDays}</span>
                    <span className="text-xs font-bold text-slate-400">Hari</span>
                  </div>
                </div>
                <div className="p-2.5 bg-violet-50 dark:bg-violet-950/40 rounded-xl text-violet-600 dark:text-violet-400 group-hover:scale-110 transition-transform">
                  <FileClock className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-[10px] text-violet-600 font-black tracking-wider uppercase bg-violet-500/5 py-1 px-2 rounded w-fit">Total Keseluruhan Cuti</div>
            </CardContent>
          </Card>

          <Card className="border-amber-100/60 dark:border-amber-950/40 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-amber-500/5 to-transparent relative overflow-hidden group">
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Hampir Habis (≤2)</p>
                  <p className="text-3xl font-black text-amber-600 dark:text-amber-400 mt-2">{lowBalanceEmployees.length}</p>
                </div>
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-[10px] text-amber-600 font-black tracking-wider uppercase bg-amber-500/5 py-1 px-2 rounded w-fit">Butuh Perhatian</div>
            </CardContent>
          </Card>

        </div>

        {/* ALWAYS-VISIBLE FILTER TOOLBAR — never hidden behind a "Buka
            Filter" toggle. HRD sees and uses every filter directly above
            the table. */}
        <Card className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">

                {/* Search */}
                <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Cari Karyawan</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Nama, jabatan, brand, divisi, status..."
                      value={filterSearch}
                      onChange={e => setFilterSearch(e.target.value)}
                      className="pl-9 rounded-xl text-sm font-semibold h-10"
                    />
                  </div>
                </div>

                {/* Brand */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Brand</label>
                  {brandOptions.length === 1 ? (
                    <div className="w-full h-10 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-white truncate">
                      {brandOptions[0].name}
                    </div>
                  ) : (
                    <select
                      value={filterBrand}
                      onChange={e => {
                        setFilterBrand(e.target.value);
                        setFilterDivision('all');
                      }}
                      className="w-full h-10 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    >
                      <option value="all">Semua Brand</option>
                      {brandOptions.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Division */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Divisi</label>
                  <select
                    value={filterDivision}
                    onChange={e => setFilterDivision(e.target.value)}
                    disabled={filterBrand === 'all'}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-700 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">{filterBrand === 'all' ? 'Semua brand dulu' : (divisionOptions.length === 0 ? 'Belum ada divisi' : 'Semua Divisi')}</option>
                    {divisionOptions.map(d => (
                      <option key={`${d.brandId}-${d.id}`} value={`${d.brandId}__${d.id}`}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {/* Status Atasan */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status Atasan</label>
                  <select
                    value={filterSupervisorStatus}
                    onChange={e => setFilterSupervisorStatus(e.target.value)}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">Semua</option>
                    <option value="pending">Menunggu</option>
                    <option value="approved">Disetujui</option>
                    <option value="rejected">Ditolak</option>
                  </select>
                </div>

                {/* Status HRD */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status HRD</label>
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">Semua Status</option>
                    <option value="pending_hrd">Menunggu Tindakan HRD</option>
                    <option value="approved">Disetujui HRD</option>
                    <option value="rejected_by_hrd">Ditolak HRD</option>
                  </select>
                </div>

                {/* Leave Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Jenis Cuti</label>
                  <select
                    value={filterLeaveType}
                    onChange={e => setFilterLeaveType(e.target.value)}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">Semua Cuti</option>
                    <option value="tahunan">Cuti Tahunan</option>
                    <option value="besar">Cuti Besar</option>
                    <option value="menikah">Cuti Menikah</option>
                    <option value="melahirkan">Cuti Melahirkan</option>
                  </select>
                </div>

                {/* Periode — single YYYY-MM field via MonthYearPicker, replacing
                    the old separate Bulan + Tahun dropdowns. */}
                <div className="space-y-1.5 md:col-span-1">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Periode</label>
                  <MonthYearPicker value={filterPeriod} onChange={setFilterPeriod} />
                </div>

                {/* Requester Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tipe Pengaju</label>
                  <select
                    value={filterRequesterType}
                    onChange={e => setFilterRequesterType(e.target.value)}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">Semua Tipe</option>
                    <option value="staff">Staff/Karyawan</option>
                    <option value="manager">Manager Divisi</option>
                  </select>
                </div>

                {/* Manager Penyetuju */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Manager Penyetuju</label>
                  <select
                    value={filterManager}
                    onChange={e => setFilterManager(e.target.value)}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">Semua Atasan</option>
                    {managerOptions.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                {/* Reset Filter */}
                <div className="space-y-1.5 flex flex-col justify-end">
                  <Button
                    variant="outline"
                    onClick={handleResetFilters}
                    disabled={activeFilterChips.length === 0}
                    className="w-full h-10 rounded-xl font-bold text-sm border-slate-300 dark:border-slate-700 disabled:opacity-50"
                  >
                    Reset Filter
                  </Button>
                </div>

              </div>
            </CardContent>
          </Card>
          {/* WORKSPACE TABS SECTION — 4 tabs only: pending/history are never
              shown stacked, and the old separate Manager Divisi / Staff tabs
              are now just the "Tipe Pengaju" filter (already in the filter
              panel) applied to the single "Riwayat / Semua Pengajuan" tab,
              so HRD isn't juggling 6 tabs to find one request. */}
        <Tabs defaultValue="pending" className="w-full min-w-0">
          <div className="w-full min-w-0 overflow-x-auto [scrollbar-width:thin] mb-6 rounded-2xl bg-slate-100 dark:bg-slate-950 shadow-sm border border-slate-200/40">
            <TabsList className="inline-flex h-12 w-max min-w-full items-center gap-1 bg-transparent p-1 px-2">
              <TabsTrigger value="pending" className="shrink-0 whitespace-nowrap rounded-xl font-bold text-xs gap-1.5 transition-all py-2">
                Butuh Tindakan HRD
                <Badge className="bg-indigo-600 text-white font-black text-[9px] rounded-full px-1.5 py-0.5">{needHrdActionList.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="history" className="shrink-0 whitespace-nowrap rounded-xl font-bold text-xs gap-1.5 transition-all py-2">
                Riwayat / Semua Pengajuan
                <Badge className="bg-slate-500 text-white font-black text-[9px] rounded-full px-1.5 py-0.5">{allRequestsList.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="balances" className="shrink-0 whitespace-nowrap rounded-xl font-bold text-xs transition-all py-2">Saldo & Hak Cuti</TabsTrigger>
              <TabsTrigger value="adjustments" className="shrink-0 whitespace-nowrap rounded-xl font-bold text-xs transition-all py-2">Mutasi Saldo Cuti</TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: BUTUH TINDAKAN HRD */}
          <TabsContent value="pending" className="space-y-6 focus:outline-none">
            {renderRequestsTable(
              needHrdActionList,
              "Luar Biasa! Semua antrean approval cuti HRD telah bersih.",
              activeFilterChips.length > 0
            )}
          </TabsContent>

          {/* TAB 2: RIWAYAT / SEMUA PENGAJUAN */}
          <TabsContent value="history" className="space-y-6 focus:outline-none">
            {renderRequestsTable(
              allRequestsList,
              "Belum ada riwayat pengajuan cuti yang terdaftar.",
              activeFilterChips.length > 0
            )}
          </TabsContent>

          {/* TAB 3: SALDO CUTI KARYAWAN (Employee Balances) */}
          <TabsContent value="balances" className="space-y-6 focus:outline-none">
            <Card className="border-slate-100 dark:border-slate-800 shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="border-b pb-4 bg-slate-50/50 dark:bg-slate-900/50">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">Kuota Tahunan & Sisa Saldo Cuti Staf</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto w-full">
                  <Table className="w-full min-w-[1100px]">
                    <TableHeader className="bg-slate-50/20 dark:bg-slate-900/10">
                      <TableRow>
                        <TableHead className="pl-8 py-4 font-bold text-slate-800 dark:text-slate-200">Nama Karyawan</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Brand / Divisi</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Tipe</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Kuota Awal</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Cuti Disetujui</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Dalam Approval</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Sisa Saldo</TableHead>
                        <TableHead className="text-right pr-8 py-4 font-bold text-slate-800 dark:text-slate-200">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBalances.length > 0 ? filteredBalances.map(item => {
                        const { profile, employee, user, liveBalance } = item as any;
                        // Old leave_balances doc — kept ONLY as the write target for
                        // "Proses Cashout"/"Inisialisasi Saldo" (a real, separate ledger
                        // feature), never as the source for the numbers displayed below.
                        const oldBalanceDoc = (balances || []).find((bal: any) => bal.employeeId === (profile.uid || profile.id)) || null;
                        const bBrand = profile?.brandName || profile?.hrdEmploymentInfo?.brandName || profile?.hrdEmploymentInfo?.brand || '-';
                        const bDivision = resolveCurrentEmployeeDivision({}, profile).divisionName;
                        const employeeName = resolveEmployeeName(profile, employee, user, oldBalanceDoc);

                        const noPolicy = !liveBalance.found && liveBalance.reason === 'no_policy';
                        const contractIncomplete = !liveBalance.found && liveBalance.reason === 'contract_incomplete';
                        const notInitialized = liveBalance.found && liveBalance.entitlementDays === 0 && liveBalance.carryOverDays === 0;
                        const currBal = liveBalance.found ? liveBalance.remainingDays : 0;
                        const lowBal = liveBalance.found && currBal <= 2;

                        return (
                          <TableRow key={profile.uid || profile.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/10 transition-colors border-b border-slate-100 dark:border-slate-800/80">
                            <TableCell className="pl-8 py-5">
                              <span className="text-slate-800 dark:text-white font-black text-sm block">{employeeName}</span>
                            </TableCell>
                            <TableCell className="py-5 font-bold text-slate-500 text-xs uppercase tracking-wider">
                              <div className="flex flex-col">
                                <span>{bBrand}</span>
                                <span className="text-[10px] text-slate-400 font-semibold">{bDivision}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-5 text-xs font-black uppercase tracking-widest text-slate-400">
                              {profile?.hrdEmploymentInfo?.employeeType || '-'}
                            </TableCell>
                            {noPolicy ? (
                              <TableCell colSpan={4} className="py-5">
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200 dark:bg-slate-800 dark:border-slate-700">Belum Ada Policy</span>
                              </TableCell>
                            ) : contractIncomplete ? (
                              <TableCell colSpan={4} className="py-5">
                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">Periode Kontrak Belum Diatur</span>
                              </TableCell>
                            ) : notInitialized ? (
                              <TableCell colSpan={4} className="py-5">
                                <span className="text-[10px] font-bold text-amber-500 bg-amber-50 px-2 py-1 rounded border border-amber-200">Belum Inisialisasi</span>
                              </TableCell>
                            ) : (
                              <>
                                <TableCell className="py-5 font-bold text-slate-600 text-sm">
                                  {liveBalance.entitlementDays} Hari
                                </TableCell>
                                <TableCell className="py-5 font-bold text-emerald-600 text-sm">
                                  {liveBalance.usedDays} Hari
                                </TableCell>
                                <TableCell className="py-5 font-bold text-amber-500 text-sm">
                                  {liveBalance.pendingDays} Hari
                                </TableCell>
                                <TableCell className="py-5 font-black text-sm">
                                  <span className={lowBal ? 'text-red-500 animate-pulse' : 'text-indigo-600 dark:text-indigo-400'}>
                                    {currBal} Hari
                                  </span>
                                </TableCell>
                              </>
                            )}
                            <TableCell className="text-right pr-8 py-5">
                              <div className="flex items-center justify-end gap-2">
                                {oldBalanceDoc ? (
                                  <Button size="sm" variant="outline" onClick={() => handleOpenCashout(oldBalanceDoc, profile)} className="rounded-xl font-bold text-[10px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200">
                                    Proses Cashout
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline" onClick={() => handleInitializeBalance(profile, employee, user)} className="rounded-xl border-amber-200 text-amber-600 font-bold text-[10px] hover:bg-amber-50">
                                    Inisialisasi Saldo
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow>
                          <TableCell colSpan={8} className="h-28 text-center text-slate-400">
                            Belum ada rekap saldo cuti karyawan yang sesuai kriteria.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: MUTASI SALDO CUTI (Audit logs ledger) */}
          <TabsContent value="adjustments" className="space-y-6 focus:outline-none">
            
            {/* Mutasi Specific Filters */}
            <div className="flex flex-wrap gap-3">
              <select 
                className="h-10 px-4 text-xs font-bold border-2 border-slate-200 rounded-xl bg-white dark:bg-slate-900 focus:outline-none focus:border-indigo-500"
                value={filterAdjustmentType} 
                onChange={e => setFilterAdjustmentType(e.target.value)}
              >
                <option value="all">Semua Jenis Aktivitas</option>
                <option value="inisialisasi_kuota">Jatah Cuti Dibuat</option>
                <option value="pengurangan_cuti">Cuti Disetujui</option>
                <option value="cashout_cuti">Pencairan Ke Payroll</option>
                <option value="pengembalian_cuti">Saldo Dikembalikan</option>
                <option value="pembatalan_cuti">Pengajuan Dibatalkan</option>
              </select>
              
              <select 
                className="h-10 px-4 text-xs font-bold border-2 border-slate-200 rounded-xl bg-white dark:bg-slate-900 focus:outline-none focus:border-indigo-500"
                value={filterAdjustmentChange} 
                onChange={e => setFilterAdjustmentChange(e.target.value)}
              >
                <option value="all">Semua Perubahan Saldo</option>
                <option value="positive">Penambahan Saldo (+)</option>
                <option value="negative">Pengurangan Saldo (-)</option>
              </select>
            </div>

            <Card className="border-slate-100 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto w-full">
                  <Table className="w-full min-w-[1200px]">
                    <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
                      <TableRow>
                        <TableHead className="pl-6 py-4 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Tanggal & Jam</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Nama Karyawan</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Brand / Divisi</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Aktivitas</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200 text-center whitespace-nowrap">Perubahan</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200 text-center whitespace-nowrap">Sblm</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200 text-center whitespace-nowrap">Ssdh</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Oleh</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200 min-w-[200px]">Catatan</TableHead>
                        <TableHead className="text-right pr-6 py-4 font-bold text-slate-800 dark:text-slate-200">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedAdjustmentsFiltered.length > 0 ? sortedAdjustmentsFiltered.map(a => {
                        const profile = employeeProfilesMap.get(a.employeeId);
                        const bBrand = a.brandName || profile?.hrdEmploymentInfo?.brandName || profile?.hrdEmploymentInfo?.brand || '-';
                        const bDivision = a.divisionName || profile?.hrdEmploymentInfo?.divisionName || profile?.hrdEmploymentInfo?.division || '-';
                        
                        const isPositive = a.adjustmentValue > 0;
                        const isZero = a.adjustmentValue === 0;
                        
                        let mutationBadge = a.type === 'cashout_cuti' ? 'Sisa cuti dicairkan ke payroll' : 'Cuti disetujui HRD';
                        if (a.reason?.toLowerCase().includes('inisialisasi') || a.adjustedBy === 'system' || a.type === 'inisialisasi_kuota') {
                          mutationBadge = 'Jatah cuti tahunan dibuat';
                        } else if (a.type === 'pembatalan_cuti' || a.reason?.toLowerCase().includes('batal')) {
                          mutationBadge = 'Pengajuan cuti dibatalkan';
                        } else if (a.type === 'pengembalian_cuti' || a.reason?.toLowerCase().includes('kembali')) {
                          mutationBadge = 'Saldo cuti dikembalikan';
                        }

                        return (
                          <TableRow key={a.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors border-b border-slate-100 dark:border-slate-800/80">
                            <TableCell className="pl-6 py-4 whitespace-nowrap">
                              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                {a.createdAt ? format(a.createdAt.toDate(), "dd MMM yyyy 'pukul' HH:mm", { locale: idLocale }) : '-'}
                              </span>
                            </TableCell>
                            <TableCell className="py-4 whitespace-nowrap">
                              <span className="text-sm font-black text-slate-800 dark:text-white block">{a.employeeName}</span>
                            </TableCell>
                            <TableCell className="py-4">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{bBrand}</span>
                                <span className="text-[10px] font-semibold text-slate-500">{bDivision}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-4 whitespace-nowrap">
                              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{mutationBadge}</span>
                            </TableCell>
                            <TableCell className="py-4 text-center">
                              <Badge variant="outline" className={`font-black text-xs px-2 py-0.5 rounded ${isPositive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : isZero ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                {isPositive ? `+${a.adjustmentValue}` : a.adjustmentValue} Hari
                              </Badge>
                            </TableCell>
                            <TableCell className="py-4 text-center">
                              <span className="text-xs font-bold text-slate-400">{a.previousBalance}</span>
                            </TableCell>
                            <TableCell className="py-4 text-center">
                              <span className="text-sm font-black text-slate-700 dark:text-slate-300">{a.newBalance}</span>
                            </TableCell>
                            <TableCell className="py-4 whitespace-nowrap">
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                                {a.adjustedByName === 'System' || !a.adjustedByName ? 'Sistem' : a.adjustedByName}
                              </span>
                            </TableCell>
                            <TableCell className="py-4 max-w-[200px]">
                              <p className="text-xs font-semibold text-slate-500 truncate" title={a.reason}>
                                {a.reason === 'Inisialisasi kuota cuti tahunan awal' ? 'Jatah cuti tahunan dibuat otomatis oleh sistem.' : a.reason}
                              </p>
                            </TableCell>
                            <TableCell className="text-right pr-6 py-4">
                              <Button size="sm" variant="outline" onClick={() => { setSelectedAdjustment(a); setIsAdjustmentDetailOpen(true); }} className="rounded-xl font-bold text-[10px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border-indigo-200">
                                Detail
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow>
                          <TableCell colSpan={10} className="h-40 text-center text-slate-400">
                            Belum ada mutasi saldo cuti sesuai filter ini.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>


        </Tabs>
      </div>

      {/* PREMIUM DETAILS VIEW TIMELINE DIALOG */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-6xl p-0 overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl max-h-[90vh] flex flex-col my-auto top-[50%] translate-y-[-50%]">
          <DialogHeader className="p-6 border-b bg-slate-50/70 dark:bg-slate-900/70 flex-none space-y-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <DialogTitle className="text-2xl font-semibold text-slate-900 dark:text-white">Detail Pengajuan Cuti</DialogTitle>
                  {selectedRequest && (() => {
                    const detailProfile = getRequestEmployeeProfile(selectedRequest, employeeProfilesMap);
                    const currentDivision = resolveCurrentEmployeeDivision(selectedRequest, detailProfile);
                    const snapshotDivision = selectedRequest.divisionName || '';
                    const divisionChanged =
                      snapshotDivision && currentDivision.divisionName && snapshotDivision !== currentDivision.divisionName;
                    return (
                      <p className="text-xl font-semibold text-slate-600 dark:text-slate-300 mt-1">
                        {selectedRequest.employeeName} <span className="text-slate-400 font-normal">•</span> {currentDivision.divisionName} / {selectedRequest.brandName}
                        {divisionChanged && (
                          <span className="ml-1.5 text-sm font-medium text-slate-400">
                            (Divisi saat pengajuan: {snapshotDivision})
                          </span>
                        )}
                      </p>
                    );
                  })()}
                </div>
                {selectedRequest && (
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge variant="outline" className={`px-2.5 py-1 rounded-full text-xs font-semibold border uppercase tracking-wider ${getSupervisorStatusBadgeClass(selectedRequest)}`}>
                      Atasan: {getSupervisorStatusLabel(selectedRequest)}
                    </Badge>
                    <Badge variant="outline" className={`px-2.5 py-1 rounded-full text-xs font-semibold border uppercase tracking-wider ${getHrdStatusBadgeClass(selectedRequest)}`}>
                      HRD: {getHrdStatusLabel(selectedRequest)}
                    </Badge>
                  </div>
                )}
              </div>

              {/* A. Ringkasan Pengajuan — kept in the sticky header (not the
                  scrollable body) so it stays visible while HRD scrolls
                  through B-G below; content matches the section list 1:1. */}
              {selectedRequest && (() => {
                return (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-widest">A. Ringkasan Pengajuan</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-white/50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Jenis Cuti</p>
                      <p className="text-base font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                        {selectedRequest.leaveType === 'tahunan' ? 'Tahunan' : selectedRequest.leaveType === 'besar' ? 'Besar' : selectedRequest.leaveType === 'menikah' ? 'Menikah' : selectedRequest.leaveType === 'melahirkan' ? 'Melahirkan' : 'Tahunan'}
                      </p>
                    </div>
                    <div className="bg-white/50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Durasi</p>
                      <p className="text-base font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">{selectedRequest.durationDays} Hari</p>
                    </div>
                    <div className="bg-white/50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Mulai</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">{selectedRequest.startDate ? format(selectedRequest.startDate.toDate(), 'd MMM', { locale: idLocale }) : '-'}</p>
                    </div>
                    <div className="bg-white/50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Selesai</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">{selectedRequest.endDate ? format(selectedRequest.endDate.toDate(), 'd MMM yyyy', { locale: idLocale }) : '-'}</p>
                    </div>
                    <div className="bg-white/50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Status Saat Ini</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5 truncate">{getHrdStatusLabel(selectedRequest)}</p>
                    </div>
                    <div className="bg-white/50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Pengganti Sementara</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5 truncate">
                        {selectedRequest.handoverEmployeeName || '-'}
                      </p>
                    </div>
                  </div>
                </div>
                );
              })()}
            </div>
          </DialogHeader>

          {/* Internal Scroll Content Area */}
          <div className="p-6 space-y-5 overflow-y-auto flex-1 max-h-[calc(90vh-200px)]">
            
            {/* Legacy Migration Alert for HRD */}
            {selectedRequest && (() => {
              const requesterStructuralLevel = String(
                selectedRequest.requesterStructuralPosition ||
                (selectedRequest as any).structuralLevel ||
                ""
              ).toLowerCase();

              const reqAny = selectedRequest as any;
              const isDivisionManager = requesterStructuralLevel.includes("manager");
              const isMissingApprover =
                !reqAny.currentApproverUid &&
                !reqAny.approvalTargetUid &&
                !reqAny.directorUid &&
                !reqAny.directorId &&
                !reqAny.directSupervisorUid;

              if (isDivisionManager && isMissingApprover) {
                return (
                  <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl space-y-3">
                    <p className="text-xs font-bold text-rose-800 dark:text-rose-400 flex items-center gap-1.5">
                      ⚠️ Pengajuan cuti Division Manager ini belum memiliki field approver Direktur (Data Legacy).
                    </p>
                    <Button 
                      size="sm" 
                      onClick={() => handleMigrateLegacyRequest(selectedRequest)} 
                      disabled={isMigrating}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs gap-1"
                    >
                      {isMigrating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Migrasikan Data Approver
                    </Button>
                  </div>
                );
              }
              return null;
            })()}

            {/* B. Informasi Pengajuan */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-widest">B. Informasi Pengajuan</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Waktu Pengajuan</p>
                  <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    {selectedRequest?.submittedAtStr || (selectedRequest?.createdAt ? format(selectedRequest.createdAt.toDate(), "EEEE, dd MMMM yyyy", { locale: idLocale }) : '-')}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {selectedRequest?.createdAt ? format(selectedRequest.createdAt.toDate(), "'pukul' HH:mm 'WIB'", { locale: idLocale }) : '-'}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Periode Cuti</p>
                  <p className="text-base font-semibold text-indigo-700 dark:text-indigo-300">
                    {selectedRequest && format(selectedRequest.startDate.toDate(), 'dd MMMM yyyy', { locale: idLocale })}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    s/d {selectedRequest && format(selectedRequest.endDate.toDate(), 'dd MMMM yyyy', { locale: idLocale })}
                  </p>
                </div>
                {selectedRequest && (() => {
                  const infoProfile = getRequestEmployeeProfile(selectedRequest, employeeProfilesMap);
                  const infoDivision = resolveCurrentEmployeeDivision(selectedRequest, infoProfile);
                  return (
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                      <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Brand / Divisi</p>
                      <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
                        {selectedRequest.brandName || '-'} / {infoDivision.divisionName || '-'}
                      </p>
                    </div>
                  );
                })()}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                  <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Jabatan Karyawan</p>
                  <p className="text-base font-semibold text-slate-800 dark:text-slate-100 capitalize">
                    {selectedRequest ? getRequesterPositionLabel(selectedRequest) : '-'}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1 md:col-span-2">
                  <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide">Alamat Selama Cuti</p>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {selectedRequest?.leaveAddress || <span className="text-slate-500 italic">Belum diisi</span>}
                  </p>
                </div>
              </div>
              {selectedRequest?.attachmentUrl && (
                <Button variant="outline" asChild className="w-full rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800">
                  <a href={selectedRequest.attachmentUrl} target="_blank" rel="noopener noreferrer">
                    Lihat Dokumen Pendukung
                  </a>
                </Button>
              )}
            </div>

            {/* B. Ringkasan Saldo Cuti — sourced from calculateLeaveBalance()
                (src/lib/leave-balance.ts) called with the exact same
                arguments as the "Saldo & Hak Cuti" tab and Directory
                Karyawan / Policy Cuti, so every number here is guaranteed to
                match what those pages show for this employee right now. */}
            {selectedRequest && isLoadingSelectedBalance && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-widest">C. Ringkasan Saldo Cuti</p>
                <div className="p-5 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 h-16 animate-pulse" />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedRequest && !isLoadingSelectedBalance && selectedRequestBalance?.found && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-widest">C. Ringkasan Saldo Cuti</p>
                <div className="p-5 bg-blue-50/60 dark:bg-blue-950/10 border border-blue-200 dark:border-blue-900/40 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{selectedRequestBalance.policyName}</span>
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      Periode: {format(selectedRequestBalance.periodStart, 'dd MMM yyyy', { locale: idLocale })} – {format(selectedRequestBalance.periodEnd, 'dd MMM yyyy', { locale: idLocale })}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                      { label: 'Jatah Cuti', value: selectedRequestBalance.entitlementDays, tone: 'text-slate-700 dark:text-slate-200' },
                      { label: 'Carry Over', value: selectedRequestBalance.carryOverDays, tone: 'text-slate-700 dark:text-slate-200' },
                      { label: 'Terpakai', value: selectedRequestBalance.usedDays, tone: 'text-amber-600 dark:text-amber-400' },
                      { label: 'Pending', value: selectedRequestBalance.pendingDays, tone: 'text-amber-600 dark:text-amber-400' },
                      { label: 'Sisa Resmi', value: selectedRequestBalance.remainingDays, tone: 'text-blue-600 dark:text-blue-400' },
                      { label: 'Sisa Bisa Diajukan', value: selectedRequestBalance.availableDays, tone: 'text-emerald-600 dark:text-emerald-400' },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
                        <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide mb-1">{stat.label}</p>
                        <p className={`text-2xl font-black ${stat.tone}`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedRequest && !isLoadingSelectedBalance && selectedRequestBalance && !selectedRequestBalance.found && selectedRequestBalance.reason === 'contract_incomplete' && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-2xl text-sm text-amber-800 dark:text-amber-300 font-semibold">
                Periode kontrak belum diatur — lengkapi tanggal mulai/selesai kontrak karyawan ini agar sisa cuti dapat dihitung.
              </div>
            )}

            {/* D. Delegasi / Handover — pengganti sementara ONLY; the
                requesting employee's own emergency contact is a separate
                person/topic and lives in section E below, never here.
                Status pengganti is shown ONCE, as the title badge — no
                separate "Status Konfirmasi Pengganti" card duplicating it. */}
            {selectedRequest && (() => {
              const hasPengganti = Boolean(selectedRequest.handoverEmployeeName);
              // getReplacementConfirmationStatus() is the single shared
              // resolver (also used by the table, timeline, manager page,
              // and staff page) — it only distinguishes accepted/declined/
              // pending, so "no pengganti assigned at all" is handled here
              // as its own neutral badge state rather than being reported
              // as "Menunggu Konfirmasi".
              const replacementStatus = getReplacementConfirmationStatus(selectedRequest);
              const badgeLabel = hasPengganti ? replacementStatus.label : 'Belum Ada Konfirmasi';
              const badgeClass = hasPengganti
                ? getReplacementStatusBadgeClass(replacementStatus.tone)
                : 'bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400';
              return (
              <div className="p-5 bg-purple-50/60 dark:bg-purple-950/10 rounded-2xl border border-purple-200 dark:border-purple-900/40 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-widest">D. Delegasi / Handover</p>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${badgeClass}`}>
                    {badgeLabel}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide mb-2">Pengganti Sementara</p>
                    <p className="text-base font-semibold text-slate-900 dark:text-white">
                      {selectedRequest.handoverEmployeeName || <span className="text-slate-400 italic font-normal">Tidak ada pengganti</span>}
                    </p>
                  </div>

                  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide mb-2">Jabatan Pengganti</p>
                    <p className="text-base font-semibold text-slate-900 dark:text-white">
                      {selectedRequest.handoverEmployeePosition || <span className="text-slate-400 italic font-normal">-</span>}
                    </p>
                  </div>
                </div>

                {selectedRequest.handoverNotes && (
                  <div className="pt-2 border-t border-purple-200 dark:border-purple-900/30">
                    <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide mb-2">Catatan Serah Terima Tugas</p>
                    <div className="text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-200 bg-white/60 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      {selectedRequest.handoverNotes}
                    </div>
                  </div>
                )}
              </div>
              );
            })()}

            {/* E. Kontak Darurat Karyawan — the REQUESTING employee's own
                emergency contact (not the pengganti's), split out from
                Delegasi/Handover above so it doesn't read as belonging to
                the replacement employee. Resolved via resolveEmergencyContact()
                across every known field-name variant on both the request
                snapshot and the current employee profile. */}
            {selectedRequest && (() => {
              const contactProfile = getRequestEmployeeProfile(selectedRequest, employeeProfilesMap);
              const { name: contactName, phone: contactPhone, relation: contactRelation } = resolveEmergencyContact(selectedRequest, contactProfile);
              const hasName = Boolean(contactName);
              const hasPhone = Boolean(contactPhone);
              return (
                <div className="p-5 bg-rose-50/60 dark:bg-rose-950/10 rounded-2xl border border-rose-200 dark:border-rose-900/40 space-y-4">
                  <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-widest">E. Kontak Darurat Karyawan</p>
                  {!hasName && !hasPhone ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 italic">Kontak darurat belum diisi.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide mb-2">Nama Kontak Darurat</p>
                        <p className="text-base font-semibold text-slate-900 dark:text-white">
                          {hasName ? contactName : (hasPhone ? 'Nama kontak darurat' : '-')}
                        </p>
                      </div>
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide mb-2">Nomor Telepon</p>
                        <p className="text-base font-semibold text-slate-900 dark:text-white">
                          {hasPhone ? contactPhone : <span className="text-slate-400 italic font-normal">Nomor belum tersedia</span>}
                        </p>
                      </div>
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <p className="text-xs uppercase font-semibold text-slate-400 tracking-wide mb-2">Hubungan</p>
                        <p className="text-base font-semibold text-slate-900 dark:text-white">
                          {contactRelation || <span className="text-slate-400 italic font-normal">-</span>}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* F. Timeline Approval */}
            <div className="p-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-widest">F. Timeline Approval</p>
              {(() => {
                const timelineStage = selectedRequest ? getLeaveProcessStage(selectedRequest) : null;
                const replacementBlocking = timelineStage?.stage === 'replacement_pending' || timelineStage?.stage === 'replacement_rejected';
                const replacementName =
                  (selectedRequest as any)?.replacementEmployeeName ||
                  (selectedRequest as any)?.handoverEmployeeName ||
                  'pengganti sementara';
                // Same getReplacementConfirmationStatus() helper as section D
                // and the table — this milestone can never say "Menunggu"
                // while the rest of the modal already reads "Pengganti
                // Bersedia".
                const replacementStatus = selectedRequest ? getReplacementConfirmationStatus(selectedRequest) : null;
                const hasReplacementAssigned =
                  Boolean((selectedRequest as any)?.replacementEmployeeUid) ||
                  (Boolean((selectedRequest as any)?.handoverEmployeeId) && (selectedRequest as any)?.handoverEmployeeId !== 'manual');
                return (
              <div className="relative pl-6 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200 dark:before:bg-slate-800">

                {/* Milestone 1: Staff Submission */}
                <div className="relative">
                  <div className="absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full bg-emerald-500 ring-4 ring-white dark:ring-slate-900" />
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Diajukan oleh Staff</div>
                  <div className="text-sm text-slate-500 font-medium mt-0.5">
                    {selectedRequest?.submittedAtStr || (selectedRequest?.createdAt ? format(selectedRequest.createdAt.toDate(), "EEEE, dd MMMM yyyy 'pukul' HH:mm", { locale: idLocale }) : 'Sudah diajukan ke sistem.')}
                  </div>
                </div>

                {/* Milestone 2: Konfirmasi Pengganti Sementara — the FIRST real
                    gate, before the atasan's queue in spirit and (once
                    firestore.rules' replacementReadyForApproval lands) in
                    practice too. */}
                {hasReplacementAssigned && replacementStatus && (
                  <div className="relative">
                    <div className={`absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full ring-4 ring-white dark:ring-slate-900 ${
                      replacementStatus.key === 'pending'
                        ? 'bg-amber-500 animate-pulse'
                        : (replacementStatus.key === 'declined' ? 'bg-red-500' : 'bg-emerald-500')
                    }`} />
                    <div className="text-sm font-semibold text-slate-800 dark:text-white">Konfirmasi Pengganti Sementara</div>
                    <div className="text-sm text-slate-500 font-medium mt-0.5">
                      {replacementName} — {replacementStatus.label}
                    </div>
                  </div>
                )}

                {/* Milestone 3: Atasan Persetujuan */}
                <div className="relative">
                  <div className={`absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full ring-4 ring-white dark:ring-slate-900 ${
                    replacementBlocking
                      ? 'bg-slate-300'
                      : (selectedRequest && ['pending_manager', 'pending_manager_review'].includes(selectedRequest.status)
                        ? 'bg-amber-500 animate-pulse'
                        : (selectedRequest && (selectedRequest.status === 'rejected_by_manager' || ['revision_requested', 'revision_requested_by_manager'].includes(selectedRequest.status))
                          ? 'bg-red-500'
                          : (selectedRequest && selectedRequest.status === 'cancelled'
                            ? 'bg-gray-400'
                            : 'bg-emerald-500')))
                  }`} />
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Persetujuan Atasan ({selectedRequest?.managerName || 'Atasan Langsung'})</div>
                  <div className="text-sm text-slate-500 font-medium mt-0.5">
                    {replacementBlocking && 'Belum masuk tahap atasan.'}
                    {!replacementBlocking && selectedRequest && ['pending_manager', 'pending_manager_review'].includes(selectedRequest.status) && 'Menunggu Persetujuan Atasan'}
                    {!replacementBlocking && selectedRequest && selectedRequest.status === 'rejected_by_manager' && `Ditolak Atasan: "${selectedRequest.managerNotes}"`}
                    {!replacementBlocking && selectedRequest && ['revision_requested', 'revision_requested_by_manager'].includes(selectedRequest.status) && `Perlu Revisi: "${selectedRequest.managerNotes}"`}
                    {!replacementBlocking && selectedRequest && selectedRequest.status === 'cancelled' && 'Pengajuan Dibatalkan'}
                    {!replacementBlocking && selectedRequest && !['pending_manager', 'pending_manager_review', 'rejected_by_manager', 'revision_requested', 'revision_requested_by_manager', 'cancelled'].includes(selectedRequest.status) && (
                      <div className="space-y-1">
                        <span>Disetujui Atasan pada {selectedRequest.managerReviewedAt ? format(selectedRequest.managerReviewedAt.toDate(), "EEEE, dd MMMM yyyy 'pukul' HH:mm", { locale: idLocale }) : '-'}</span>
                        {selectedRequest.managerNotes && <p className="italic text-slate-500 bg-slate-100 p-1.5 rounded text-sm mt-0.5">"{selectedRequest.managerNotes}"</p>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Milestone 4: HRD Verifikasi */}
                <div className="relative">
                  <div className={`absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full ring-4 ring-white dark:ring-slate-900 ${
                    replacementBlocking || (selectedRequest && ['pending_manager', 'pending_manager_review', 'rejected_by_manager', 'revision_requested', 'revision_requested_by_manager', 'cancelled'].includes(selectedRequest.status))
                      ? 'bg-slate-300'
                      : (selectedRequest && ['pending_hrd', 'pending_hrd_review'].includes(selectedRequest.status)
                        ? 'bg-amber-500 animate-pulse'
                        : (selectedRequest && (selectedRequest.status === 'rejected_by_hrd' || selectedRequest.status === 'revision_requested_by_hrd')
                          ? 'bg-red-500'
                          : 'bg-emerald-500'))
                  }`} />
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Verifikasi & Approval HRD</div>
                  <div className="text-sm text-slate-500 font-medium mt-0.5">
                    {replacementBlocking && 'Belum masuk tahap HRD.'}
                    {!replacementBlocking && selectedRequest && ['pending_manager', 'pending_manager_review', 'rejected_by_manager', 'revision_requested', 'revision_requested_by_manager', 'cancelled'].includes(selectedRequest.status) && 'Menunggu persetujuan atasan'}
                    {!replacementBlocking && selectedRequest && ['pending_hrd', 'pending_hrd_review'].includes(selectedRequest.status) && 'Menunggu Verifikasi HRD'}
                    {!replacementBlocking && selectedRequest && selectedRequest.status === 'rejected_by_hrd' && `Ditolak HRD: "${selectedRequest.hrdNotes}"`}
                    {!replacementBlocking && selectedRequest && selectedRequest.status === 'revision_requested_by_hrd' && `Perlu Revisi: "${selectedRequest.hrdNotes}"`}
                    {!replacementBlocking && selectedRequest && ['approved', 'approved_by_hrd', 'active_leave', 'completed'].includes(selectedRequest.status) && (
                      <div className="space-y-1">
                        <span>Disetujui HRD pada {selectedRequest.hrdReviewedAt ? format(selectedRequest.hrdReviewedAt.toDate(), "EEEE, dd MMMM yyyy 'pukul' HH:mm", { locale: idLocale }) : '-'}</span>
                        {selectedRequest.hrdNotes && <p className="italic text-slate-500 bg-slate-100 p-1.5 rounded text-sm mt-0.5">"{selectedRequest.hrdNotes}"</p>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Milestone 4: Realisasi Status */}
                <div className="relative">
                  <div className={`absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full ring-4 ring-white dark:ring-slate-900 ${
                    selectedRequest && ['active_leave', 'completed'].includes(selectedRequest.status)
                      ? 'bg-emerald-500'
                      : (selectedRequest && ['approved', 'approved_by_hrd'].includes(selectedRequest.status)
                        ? 'bg-indigo-500 animate-pulse'
                        : 'bg-slate-300')
                  }`} />
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">Status Realisasi Cuti</div>
                  <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider mt-0.5">
                    {selectedRequest && ['approved', 'approved_by_hrd'].includes(selectedRequest.status) && 'Menunggu Tanggal Mulai Cuti'}
                    {selectedRequest?.status === 'active_leave' && 'Cuti Aktif (Sedang Berlangsung)'}
                    {selectedRequest?.status === 'completed' && 'Cuti Selesai'}
                    {selectedRequest && !['approved', 'approved_by_hrd', 'active_leave', 'completed'].includes(selectedRequest.status) && 'Belum Aktif'}
                  </div>
                </div>

              </div>
                );
              })()}
            </div>

            {/* G. Keputusan HRD — informational only; the actual Setujui/
                Tolak buttons live exclusively in the sticky footer below,
                never here. No Alasan Cuti field and no tombol Revisi
                anywhere in this modal. */}
            {selectedRequest && getLeaveProcessStage(selectedRequest).hrdCanApprove && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-widest">G. Keputusan HRD</p>
                <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Setelah meninjau seluruh informasi di atas, gunakan tombol{' '}
                  <span className="font-semibold text-red-600 dark:text-red-400">Tolak</span> atau{' '}
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Setujui</span>{' '}
                  pada bagian bawah untuk memberikan keputusan. Catatan HRD (opsional untuk Setujui, wajib untuk Tolak) diisi pada dialog konfirmasi.
                </div>
              </div>
            )}

          </div>

          {/* Sticky Footer with Action Buttons — a single row: Tutup, Tolak,
              Setujui. Every decision opens the 2-step confirmation dialog
              below; nothing here submits directly. */}
          <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 flex-none space-y-2">
            {selectedRequest && !getLeaveProcessStage(selectedRequest).hrdCanApprove && (
              <p className="text-center text-xs font-semibold text-slate-400" title="Pengajuan ini masih menunggu konfirmasi pengganti / persetujuan atasan.">
                Belum Masuk Tahap HRD — {getLeaveProcessStage(selectedRequest).label}
              </p>
            )}
            <div className={`grid gap-2 ${selectedRequest && getLeaveProcessStage(selectedRequest).hrdCanApprove ? 'grid-cols-3' : 'grid-cols-1'}`}>
              <Button
                variant="outline"
                onClick={() => setIsDetailOpen(false)}
                className="rounded-xl font-semibold text-sm h-10 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Tutup
              </Button>
              {selectedRequest && getLeaveProcessStage(selectedRequest).hrdCanApprove && (
                <>
                  <Button
                    onClick={() => handleOpenAction('reject', selectedRequest)}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl h-10"
                  >
                    Tolak
                  </Button>
                  <Button
                    onClick={() => handleOpenAction('approve', selectedRequest)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl h-10"
                  >
                    Setujui
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Action Confirmation Dialog (Approve/Reject/Revise) — always opened
          from the detail modal's footer, on top of it, with a distinct
          title/message/summary per action and required-reason validation for
          Tolak. HRD's only two decisions are Setujui and Tolak — no Revisi. */}
      <Dialog open={isActionOpen} onOpenChange={setIsActionOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl my-auto top-[50%] translate-y-[-50%]">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-white">
              {actionType === 'approve' ? 'Konfirmasi Persetujuan' : 'Konfirmasi Penolakan'}
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-slate-500 mt-1">
              {actionType === 'approve'
                ? 'Yakin ingin menyetujui pengajuan cuti ini?'
                : 'Anda yakin ingin menolak pengajuan cuti ini?'}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Karyawan</p>
                <p className="font-semibold text-slate-900 dark:text-slate-200">{selectedRequest.employeeName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Jenis Cuti</p>
                <p className="font-semibold text-slate-900 dark:text-slate-200 capitalize">
                  Cuti {selectedRequest.leaveType === 'tahunan' ? 'Tahunan' : selectedRequest.leaveType === 'besar' ? 'Besar' : selectedRequest.leaveType === 'menikah' ? 'Menikah' : selectedRequest.leaveType === 'melahirkan' ? 'Melahirkan' : 'Tahunan'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Periode Cuti</p>
                <p className="font-semibold text-slate-900 dark:text-slate-200">
                  {format(selectedRequest.startDate.toDate(), 'dd MMM yyyy', { locale: idLocale })} – {format(selectedRequest.endDate.toDate(), 'dd MMM yyyy', { locale: idLocale })}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Durasi</p>
                <p className="font-semibold text-slate-900 dark:text-slate-200">{selectedRequest.durationDays} Hari</p>
              </div>
            </div>
          )}

          <div className="space-y-1.5 py-1">
            <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              {actionType === 'reject' ? 'Alasan Penolakan (wajib)' : 'Catatan Persetujuan (opsional)'}
            </label>
            <Textarea
              rows={3}
              placeholder={actionType === 'approve' ? 'Catatan persetujuan final (opsional)...' : 'Keterangan/alasan (wajib, minimal 5 karakter)...'}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={`rounded-xl bg-white dark:bg-slate-950 text-sm focus:ring-indigo-500 ${
                actionType === 'reject' && reasonError && !notes.trim()
                  ? 'border-red-500 dark:border-red-500 focus:border-red-500'
                  : 'border-slate-300 dark:border-slate-800 focus:border-indigo-500 dark:focus:border-indigo-500'
              }`}
            />
            {actionType === 'reject' && reasonError && !notes.trim() && (
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                Alasan penolakan wajib diisi.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsActionOpen(false)} disabled={isSaving} className="rounded-xl font-semibold text-sm">Batal</Button>
            <Button
              onClick={() => {
                if (actionType === 'reject' && !notes.trim()) {
                  setReasonError(true);
                  return;
                }
                handleConfirmAction();
              }}
              disabled={isSaving}
              className={`font-semibold text-sm rounded-xl px-5 disabled:opacity-60 ${actionType === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memproses...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {actionType === 'approve' ? 'Ya, Setujui' : 'Ya, Tolak'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cashout Modal */}
      <Dialog open={isCashoutOpen} onOpenChange={setIsCashoutOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl my-auto top-[50%] translate-y-[-50%]">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-white">Proses Cashout Cuti Tahunan</DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-500 mt-1">
              Uangkan sisa cuti {selectedBalance?.employeeName} ke dalam nominal pencairan ke payroll.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl space-y-3 border border-slate-100 dark:border-slate-800">
               <div className="flex justify-between items-center text-sm">
                 <span className="font-semibold text-slate-500">Sisa Cuti Tersedia</span>
                 <span className="font-black text-indigo-600">{selectedBalance ? ((selectedBalance as any).remainingDays || selectedBalance.currentBalance || 0) : 0} Hari</span>
               </div>
               <div className="flex justify-between items-center text-sm">
                 <span className="font-semibold text-slate-500">Jumlah Hari Dicairkan</span>
                 <span className="font-black text-emerald-600">{selectedBalance ? ((selectedBalance as any).remainingDays || selectedBalance.currentBalance || 0) : 0} Hari</span>
               </div>
               <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200 dark:border-slate-700">
                 <span className="font-semibold text-slate-500">Sisa Setelah Cashout</span>
                 <span className="font-black text-slate-400">0 Hari</span>
               </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 dark:text-slate-400">Total Nominal Cashout</Label>
              <Input type="number" min={0} value={cashoutAmount || ''} onChange={e => setCashoutAmount(Number(e.target.value))} placeholder="Contoh: 1000000" className="h-12 bg-slate-950 dark:bg-slate-950 text-white border-slate-700 focus:border-emerald-500 font-bold" />
              <p className="text-[10px] text-slate-500 font-semibold text-right">Nominal yang akan dicairkan: <span className="font-black text-emerald-600 dark:text-emerald-400">{formatRupiah(cashoutAmount || 0)}</span></p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase">Catatan HRD (Opsional)</label>
              <Textarea
                rows={2}
                placeholder="Catatan HRD..."
                value={cashoutReason}
                onChange={e => setCashoutReason(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsCashoutOpen(false)} className="rounded-xl font-bold">Batal</Button>
            <Button onClick={handleConfirmCashout} disabled={isSaving || (selectedBalance ? ((selectedBalance as any).remainingDays !== undefined ? (selectedBalance as any).remainingDays : selectedBalance.currentBalance || 0) : 0) <= 0 || cashoutAmount <= 0} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-5">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Proses Cashout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjustment Detail Modal */}
      <Dialog open={isAdjustmentDetailOpen} onOpenChange={setIsAdjustmentDetailOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-white">Detail Mutasi Saldo Cuti</DialogTitle>
          </DialogHeader>

          {selectedAdjustment && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Nama Karyawan</p>
                  <p className="text-sm font-black text-slate-800 dark:text-white">{selectedAdjustment.employeeName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tanggal & Jam</p>
                  <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    {selectedAdjustment.createdAt ? format(selectedAdjustment.createdAt.toDate(), "dd MMM yyyy 'pukul' HH:mm", { locale: idLocale }) : '-'}
                  </p>
                </div>
                <div className="space-y-1 col-span-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Brand / Divisi</p>
                  <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    {selectedAdjustment.brandName || '-'} / {selectedAdjustment.divisionName || '-'}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Pergerakan Saldo</span>
                  <Badge variant="outline" className={`font-black text-xs px-2 py-0.5 rounded ${selectedAdjustment.adjustmentValue > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : selectedAdjustment.adjustmentValue === 0 ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                    {selectedAdjustment.adjustmentValue > 0 ? `+${selectedAdjustment.adjustmentValue}` : selectedAdjustment.adjustmentValue} Hari
                  </Badge>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div className="text-center w-full">
                    <p className="text-xs font-bold text-slate-400 mb-1">Sebelum</p>
                    <p className="text-lg font-black text-slate-600 dark:text-slate-300">{selectedAdjustment.previousBalance}</p>
                  </div>
                  <div className="text-slate-300">→</div>
                  <div className="text-center w-full">
                    <p className="text-xs font-bold text-slate-400 mb-1">Sesudah</p>
                    <p className="text-lg font-black text-slate-800 dark:text-white">{selectedAdjustment.newBalance}</p>
                  </div>
                </div>
              </div>

              {selectedAdjustment.type === 'cashout_cuti' && selectedAdjustment.cashoutAmount && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-100 dark:border-amber-800/50 flex justify-between items-center">
                  <span className="text-xs font-black text-amber-600 dark:text-amber-500 uppercase tracking-wider">Total Pencairan</span>
                  <span className="text-sm font-black text-amber-700 dark:text-amber-400">{formatRupiah(selectedAdjustment.cashoutAmount)}</span>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Aktivitas & Catatan</p>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <p className="font-bold text-slate-800 dark:text-white mb-1">
                    {selectedAdjustment.type === 'cashout_cuti' ? 'Sisa cuti dicairkan ke payroll' : 
                     (selectedAdjustment.reason?.toLowerCase().includes('inisialisasi') || selectedAdjustment.adjustedBy === 'system' || selectedAdjustment.type === 'inisialisasi_kuota') ? 'Jatah cuti tahunan dibuat' : 
                     (selectedAdjustment.type === 'pembatalan_cuti' || selectedAdjustment.reason?.toLowerCase().includes('batal')) ? 'Pengajuan cuti dibatalkan' : 
                     (selectedAdjustment.type === 'pengembalian_cuti' || selectedAdjustment.reason?.toLowerCase().includes('kembali')) ? 'Saldo cuti dikembalikan' : 
                     'Cuti disetujui HRD'}
                  </p>
                  <p>{selectedAdjustment.reason === 'Inisialisasi kuota cuti tahunan awal' ? 'Jatah cuti tahunan dibuat otomatis oleh sistem.' : selectedAdjustment.reason}</p>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Dilakukan Oleh</span>
                <span className="text-xs font-bold text-slate-600 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                  {selectedAdjustment.adjustedByName === 'System' || !selectedAdjustment.adjustedByName ? 'Sistem' : selectedAdjustment.adjustedByName}
                </span>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAdjustmentDetailOpen(false)} className="rounded-xl font-bold w-full">Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
