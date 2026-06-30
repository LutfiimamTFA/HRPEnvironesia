'use client';

import { useMemo, useState } from 'react';
import { getAuth, signOut } from 'firebase/auth';
import { collection } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { UserProfile, Brand, EmployeeProfile } from '@/lib/types';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  PlusCircle,
  Eye,
  Lock,
  Power,
  Copy,
  CheckCircle2,
  Search,
  Users,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import { UserFormDialog } from './UserFormDialog';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { useRouter } from 'next/navigation';
import { resetUserPassword, toggleUserStatus, copyToClipboard } from '@/lib/user-management-utils';
import { MENU_CONFIG } from '@/lib/menu-config';
import { cn } from '@/lib/utils';
import {
  markForceLogoutSession,
  timestampToMillis,
  type LogoutReason,
  type SessionStatus,
} from '@/lib/session-tracking';

const groupConfig = {
  'super-admin': {
    label: 'Super Admin',
    icon: '👑',
    color: 'destructive',
    description: 'Akses penuh sistem dan manajemen user',
  },
  'hrd': {
    label: 'HRD',
    icon: '👨‍💼',
    color: 'default',
    description: 'Pengelola data karyawan dan approval cuti/izin',
  },
  'manager': {
    label: 'Manager',
    icon: '🏢',
    color: 'secondary',
    description: 'Atasan/pemberi approval tim mereka',
  },
  'karyawan_aktif': {
    label: 'Karyawan Aktif',
    icon: '👤',
    color: 'outline',
    description: 'User karyawan aktif dengan kontrak tetap',
  },
  'probation': {
    label: 'Probation',
    icon: '⏳',
    color: 'outline',
    description: 'Karyawan dalam masa percobaan',
  },
  'magang': {
    label: 'Magang',
    icon: '🎓',
    color: 'outline',
    description: 'Peserta magang dan program bimbingan',
  },
  'kandidat': {
    label: 'Kandidat',
    icon: '✋',
    color: 'outline',
    description: 'Pelamar atau kandidat rekrutmen',
  },
};

const displayOrder = ['super-admin', 'hrd', 'manager', 'karyawan_aktif', 'probation', 'magang', 'kandidat'];

const groupDisplayConfig: Record<string, { label: string; icon: string; description: string }> = {
  'super-admin': {
    label: 'Super Admin',
    icon: 'SA',
    description: 'Akses penuh sistem dan manajemen user',
  },
  hrd: {
    label: 'HRD',
    icon: 'HR',
    description: 'Pengelola data karyawan dan approval cuti/izin',
  },
  manager: {
    label: 'Manager',
    icon: 'MN',
    description: 'Atasan/pemberi approval tim mereka',
  },
  karyawan_aktif: {
    label: 'Karyawan Aktif',
    icon: 'KA',
    description: 'User karyawan aktif dengan kontrak tetap',
  },
  probation: {
    label: 'Probation',
    icon: 'PB',
    description: 'Karyawan dalam masa percobaan',
  },
  magang: {
    label: 'Magang',
    icon: 'MG',
    description: 'Peserta magang dan program bimbingan',
  },
  kandidat: {
    label: 'Kandidat',
    icon: 'KD',
    description: 'Pelamar atau kandidat rekrutmen',
  },
};

type AccountStatusKey = 'active' | 'inactive' | 'suspended' | 'pending_activation' | 'must_change_password' | 'resigned_alumni';
type QuickFilterKey = 'all' | 'online' | 'idle' | 'offline' | 'never_logged_in' | 'must_change_password' | 'incomplete_profile';
type SessionStatusKey = SessionStatus;

type UserHealth = {
  accountStatus: {
    key: AccountStatusKey;
    label: string;
    className: string;
  };
  securityStatus: {
    label: string;
    className: string;
  };
  session: {
    key: SessionStatusKey;
    label: string;
    className: string;
    dotClassName: string;
    subtext: string;
    lastLogin: string;
    lastActive: string;
    lastLogout: string;
    logoutReason: string;
    deviceInfo: string;
    forceLogout: string;
  };
  issues: string[];
  employee: {
    brand: string;
    division: string;
    position: string;
    type: string;
    status: string;
    supervisor: string;
  };
  lastLogin: string;
  createdAt: string;
  updatedAt: string;
};

const quickFilters: { key: QuickFilterKey; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'online', label: 'Online' },
  { key: 'idle', label: 'Idle' },
  { key: 'offline', label: 'Offline' },
  { key: 'never_logged_in', label: 'Belum Pernah Login' },
  { key: 'must_change_password', label: 'Harus Ganti Password' },
  { key: 'incomplete_profile', label: 'Profil Belum Lengkap' },
];

const softBadgeClasses: Record<AccountStatusKey, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  inactive: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300',
  suspended: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  pending_activation: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  must_change_password: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  resigned_alumni: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300',
};

const issueBadgeClass = 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300';
const idleTimeoutFallbackMs = 15 * 60 * 1000;
const idleWarningFallbackMs = 13 * 60 * 1000;

const sessionBadgeClasses: Record<SessionStatusKey, { className: string; dotClassName: string; label: string }> = {
  online: {
    label: 'Online',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
    dotClassName: 'bg-emerald-500',
  },
  idle: {
    label: 'Idle',
    className: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300',
    dotClassName: 'bg-orange-500',
  },
  offline: {
    label: 'Offline',
    className: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300',
    dotClassName: 'bg-slate-400',
  },
  auto_logged_out: {
    label: 'Logout Otomatis',
    className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
    dotClassName: 'bg-red-500',
  },
  never_logged_in: {
    label: 'Belum Pernah Login',
    className: 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400',
    dotClassName: 'bg-slate-300',
  },
};

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function prettifyValue(value?: string | null) {
  if (!value) return '-';
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function isResignedStatus(value?: string | null) {
  return /(resign|resigned|terminated|alumni|nonaktif|berhenti)/i.test(value || '');
}

function getTimestampValue(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

function formatDateTime(value: any) {
  const date = getTimestampValue(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatRelativeActivity(value: any) {
  const millis = timestampToMillis(value);
  if (!millis) return null;
  const diffMs = Math.max(0, Date.now() - millis);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Aktif baru saja';
  if (minutes < 60) return `Tidak aktif ${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Tidak aktif ${hours} jam`;
  const days = Math.floor(hours / 24);
  return `Tidak aktif ${days} hari`;
}

function formatLogoutReason(reason?: LogoutReason | string | null) {
  switch (reason) {
    case 'manual_logout':
      return 'Logout manual';
    case 'idle_timeout':
      return 'Logout otomatis karena idle';
    case 'force_logout':
      return 'Force logout oleh Super Admin';
    default:
      return '-';
  }
}

function formatDeviceInfo(value: any) {
  if (!value) return '-';
  if (typeof value === 'string') return value;
  const parts = [value.platform, value.language].filter(Boolean);
  if (parts.length > 0) return parts.join(' / ');
  return value.userAgent || '-';
}

function buildSessionInfo(user: UserProfile): UserHealth['session'] {
  const rawUser = user as any;
  const lastLoginAt = rawUser.lastLoginAt || rawUser.lastLogin || rawUser.lastSignInAt || rawUser.lastSignInTime || rawUser.metadata?.lastSignInTime;
  const lastActiveAt = rawUser.lastActiveAt || rawUser.lastSeenAt;
  const lastLogoutAt = rawUser.lastLogoutAt;
  const lastActiveMillis = timestampToMillis(lastActiveAt);
  const hasLoggedIn = Boolean(lastLoginAt);
  const rawStatus = rawUser.sessionStatus as SessionStatus | undefined;
  const now = Date.now();

  let key: SessionStatusKey;
  if (!hasLoggedIn) {
    key = 'never_logged_in';
  } else if (rawStatus && sessionBadgeClasses[rawStatus]) {
    key = rawStatus;
  } else if (lastActiveMillis && now - lastActiveMillis >= idleTimeoutFallbackMs) {
    key = 'offline';
  } else if (lastActiveMillis && now - lastActiveMillis >= idleWarningFallbackMs) {
    key = 'idle';
  } else {
    key = 'offline';
  }

  if ((key === 'online' || key === 'idle') && lastActiveMillis && now - lastActiveMillis >= idleTimeoutFallbackMs) {
    key = 'offline';
  }

  const config = sessionBadgeClasses[key];
  const logoutTime = formatDateTime(lastLogoutAt);
  let subtext = 'Belum ada aktivitas';
  if (key === 'online') {
    subtext = formatRelativeActivity(lastActiveAt) || 'Aktif baru saja';
  } else if (key === 'idle') {
    subtext = formatRelativeActivity(lastActiveAt) || 'Sedang idle';
  } else if (key === 'offline') {
    subtext = logoutTime !== '-' ? `Logout ${logoutTime}` : (formatRelativeActivity(lastActiveAt) || 'Offline');
  } else if (key === 'auto_logged_out') {
    subtext = logoutTime !== '-' ? `Logout ${logoutTime}` : 'Logout otomatis';
  }

  return {
    key,
    label: config.label,
    className: config.className,
    dotClassName: config.dotClassName,
    subtext,
    lastLogin: formatDateTime(lastLoginAt),
    lastActive: formatDateTime(lastActiveAt),
    lastLogout: logoutTime,
    logoutReason: formatLogoutReason(rawUser.logoutReason),
    deviceInfo: formatDeviceInfo(rawUser.currentDeviceInfo),
    forceLogout: rawUser.forceLogoutAt
      ? `${formatDateTime(rawUser.forceLogoutAt)}${rawUser.forceLogoutReason ? ` - ${rawUser.forceLogoutReason}` : ''}`
      : '-',
  };
}

function getBrandDisplay(user: UserProfile, employeeProfile: EmployeeProfile | undefined, brandMap: Record<string, string>) {
  const profileBrand = employeeProfile?.brandName || employeeProfile?.hrdEmploymentInfo?.brandName || employeeProfile?.hrdEmploymentInfo?.brand;
  if (profileBrand) return profileBrand;
  if (!user.brandId) return user.brandName || '-';
  if (Array.isArray(user.brandId)) return user.brandId.map(id => brandMap[id] || id).join(', ');
  return brandMap[user.brandId] || user.brandName || user.brandId || '-';
}

function getMenuAccessLabels(role?: string | null) {
  const groups = MENU_CONFIG[role || ''] || [];
  return groups.flatMap(group => group.items.map(item => item.label));
}

function buildUserHealth(user: UserProfile, employeeProfile: EmployeeProfile | undefined, brandMap: Record<string, string>): UserHealth {
  const rawUser = user as any;
  const hrdInfo = employeeProfile?.hrdEmploymentInfo;
  const role = normalizeText(user.role);
  const brand = getBrandDisplay(user, employeeProfile, brandMap);
  const division = normalizeText(employeeProfile?.division || (employeeProfile as any)?.divisionName || hrdInfo?.divisionName || hrdInfo?.divisi || user.divisionName || user.division);
  const position = normalizeText(employeeProfile?.positionTitle || hrdInfo?.jabatan || hrdInfo?.structuralPosition || user.positionTitle || user.jobTitle);
  const employeeType = normalizeText(hrdInfo?.employeeType || hrdInfo?.tipeKaryawan || employeeProfile?.employmentType || user.employmentType || user.contractType);
  const employeeStatus = normalizeText(hrdInfo?.employmentStatus || hrdInfo?.statusKerja || employeeProfile?.employmentStatus || rawUser.employmentStatus);
  const supervisor = normalizeText(hrdInfo?.directSupervisorName || hrdInfo?.atasanLangsung || employeeProfile?.managerName || employeeProfile?.supervisorName || user.directSupervisorName);
  const session = buildSessionInfo(user);
  const lastLoginSource = rawUser.lastLoginAt || rawUser.lastLogin || rawUser.lastSignInAt || rawUser.lastSignInTime || rawUser.metadata?.lastSignInTime;
  const hasLoggedIn = session.key !== 'never_logged_in' || rawUser.hasLoggedIn;
  const mustChangePassword = rawUser.mustChangePassword === true;
  const isSuspended = rawUser.isSuspended === true || /suspend/i.test(rawUser.accountStatus || rawUser.status || '');
  const isPendingActivation = /pending|menunggu|invite/i.test(rawUser.accountStatus || rawUser.status || '') || rawUser.emailVerified === false;
  const isEmployeeResigned = isResignedStatus(employeeStatus);

  let accountStatus: UserHealth['accountStatus'];
  if (isSuspended) {
    accountStatus = { key: 'suspended', label: 'Suspended', className: softBadgeClasses.suspended };
  } else if (isEmployeeResigned) {
    accountStatus = { key: 'resigned_alumni', label: 'Resign / Alumni', className: softBadgeClasses.resigned_alumni };
  } else if (!user.isActive) {
    accountStatus = { key: 'inactive', label: 'Nonaktif', className: softBadgeClasses.inactive };
  } else if (isPendingActivation) {
    accountStatus = { key: 'pending_activation', label: 'Menunggu Aktivasi', className: softBadgeClasses.pending_activation };
  } else if (mustChangePassword) {
    accountStatus = { key: 'must_change_password', label: 'Harus Ganti Password', className: softBadgeClasses.must_change_password };
  } else {
    accountStatus = { key: 'active', label: 'Aktif', className: softBadgeClasses.active };
  }

  const issues: string[] = [];
  if (!role) issues.push('Belum Ada Role');
  if (user.role !== 'kandidat' && !employeeProfile) issues.push('Belum Ada Profil Karyawan');
  if (user.role !== 'kandidat' && (brand === '-' || !division)) issues.push('Belum Ada Brand/Divisi');
  if (user.role !== 'kandidat' && !supervisor && user.role !== 'super-admin') issues.push('Belum Ada Atasan');
  if (!hasLoggedIn) issues.push('Belum Pernah Login');
  if (mustChangePassword) issues.push('Harus Ganti Password');
  if (user.isActive && isEmployeeResigned) issues.push('Akun Aktif tapi Karyawan Resign');
  if (user.role !== 'kandidat' && (user.isProfileComplete === false || employeeProfile?.completeness?.isComplete === false || employeeProfile?.dataCompleteness === 'belum_lengkap')) {
    issues.push('Profil Belum Lengkap');
  }

  const securityStatus = issues.length > 0
    ? {
        label: `${issues.length} Perlu Dicek`,
        className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
      }
    : {
        label: 'Normal',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
      };

  return {
    accountStatus,
    securityStatus,
    session,
    issues,
    employee: {
      brand,
      division: division || '-',
      position: position || '-',
      type: prettifyValue(employeeType || user.employmentType || user.role),
      status: prettifyValue(employeeStatus || (user.isActive ? 'active' : 'nonaktif')),
      supervisor: supervisor || '-',
    },
    lastLogin: session.lastLogin,
    createdAt: formatDateTime(user.createdAt),
    updatedAt: formatDateTime(user.updatedAt || rawUser.lastUpdatedAt),
  };
}

function UserTableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

interface UserStats {
  total: number;
  active: number;
  disabled: number;
  mustChangePassword: number;
  byRole: Record<string, number>;
}

export function UserManagementClient() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { firebaseUser } = useAuth();
  const router = useRouter();

  // State
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [isForceLogoutDialogOpen, setIsForceLogoutDialogOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('super-admin');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilterKey>('all');
  const [forceLogoutReason, setForceLogoutReason] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [isForceLoggingOut, setIsForceLoggingOut] = useState(false);

  // Data fetching
  const usersRef = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
  const { data: users, isLoading: isLoadingUsers, error } = useCollection<UserProfile>(usersRef);

  const brandsRef = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands } = useCollection<Brand>(brandsRef);

  const employeeProfilesRef = useMemoFirebase(() => collection(firestore, 'employee_profiles'), [firestore]);
  const { data: employeeProfiles } = useCollection<EmployeeProfile>(employeeProfilesRef);

  // Derived data
  const brandMap = useMemo(() => {
    if (!brands) return {};
    return brands.reduce((acc, brand) => {
      if (brand.id) acc[brand.id] = brand.name;
      return acc;
    }, {} as Record<string, string>);
  }, [brands]);

  const employeeProfileMap = useMemo(() => {
    if (!employeeProfiles) return new Map<string, EmployeeProfile>();
    return new Map(employeeProfiles.map(p => [p.uid, p]));
  }, [employeeProfiles]);

  const usersByGroup = useMemo(() => {
    if (!users) return {};
    const groups: { [key: string]: UserProfile[] } = {};

    users.forEach((user) => {
      let groupKey: string = user.role;
      if (user.role === 'karyawan') {
        if (user.employmentType === 'magang') {
          groupKey = 'magang';
        } else if (user.employmentType === 'training' || user.employmentStage === 'probation') {
          groupKey = 'probation';
        } else {
          groupKey = 'karyawan_aktif';
        }
      }

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(user);
    });

    // Sort each group
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
    });

    return groups;
  }, [users]);

  const stats = useMemo((): UserStats => {
    if (!users) return { total: 0, active: 0, disabled: 0, mustChangePassword: 0, byRole: {} };

    const byRole: Record<string, number> = {};
    let active = 0, disabled = 0, mustChangePassword = 0;

    users.forEach(user => {
      byRole[user.role] = (byRole[user.role] || 0) + 1;
      const health = buildUserHealth(user, employeeProfileMap.get(user.uid), brandMap);
      if (health.accountStatus.key === 'active') active++;
      if (health.accountStatus.key === 'inactive') disabled++;
      if ((user as any).mustChangePassword) mustChangePassword++;
    });

    return {
      total: users.length,
      active,
      disabled,
      mustChangePassword,
      byRole,
    };
  }, [users, employeeProfileMap, brandMap]);

  const filteredGroupUsers = useMemo(() => {
    const groupUsers = usersByGroup[activeTab] || [];
    const query = searchQuery.toLowerCase();
    return groupUsers.filter(user => {
      const employeeProfile = employeeProfileMap.get(user.uid);
      const health = buildUserHealth(user, employeeProfile, brandMap);
      const matchesSearch = !query ||
        user.fullName?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query) ||
        health.employee.brand.toLowerCase().includes(query) ||
        health.employee.division.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      switch (quickFilter) {
        case 'online':
          return health.session.key === 'online';
        case 'idle':
          return health.session.key === 'idle';
        case 'offline':
          return health.session.key === 'offline' || health.session.key === 'auto_logged_out';
        case 'must_change_password':
          return health.issues.includes('Harus Ganti Password');
        case 'never_logged_in':
          return health.session.key === 'never_logged_in';
        case 'incomplete_profile':
          return health.issues.some(issue => ['Belum Ada Profil Karyawan', 'Belum Ada Brand/Divisi', 'Belum Ada Atasan', 'Profil Belum Lengkap'].includes(issue));
        default:
          return true;
      }
    });
  }, [usersByGroup, activeTab, searchQuery, quickFilter, employeeProfileMap, brandMap]);

  // Handlers
  const handleCreateUser = () => {
    setSelectedUser(null);
    setIsFormDialogOpen(true);
  };

  const handleEditUser = (user: UserProfile) => {
    setSelectedUser(user);
    setIsFormDialogOpen(true);
  };

  const handleViewDetail = (user: UserProfile) => {
    setSelectedUser(user);
    setIsDetailDialogOpen(true);
  };

  const handleDeleteUser = (user: UserProfile) => {
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  };

  const handleResetPassword = async (user: UserProfile) => {
    if (!firebaseUser) return;
    setSelectedUser(user);
    setIsResettingPassword(true);

    try {
      const idToken = await firebaseUser.getIdToken();
      const result = await resetUserPassword(user.uid, idToken);

      if (result.success && result.tempPassword) {
        setTempPassword(result.tempPassword);
        setIsResetPasswordDialogOpen(true);
        toast({ title: 'Password Direset', description: result.message });
      } else {
        toast({ variant: 'destructive', title: 'Gagal', description: result.message });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleForceLogout = (user: UserProfile) => {
    setSelectedUser(user);
    setForceLogoutReason('');
    setIsForceLogoutDialogOpen(true);
  };

  const confirmForceLogout = async () => {
    if (!selectedUser || !firebaseUser || !forceLogoutReason.trim()) return;

    setIsForceLoggingOut(true);
    try {
      await markForceLogoutSession(
        firestore,
        selectedUser.uid,
        forceLogoutReason.trim(),
        firebaseUser.uid,
      );
      toast({
        title: 'Force Logout Berhasil',
        description: `${selectedUser.fullName} akan diminta login ulang.`,
      });
      setIsForceLogoutDialogOpen(false);
      setForceLogoutReason('');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal Force Logout',
        description: error.message || 'Tidak dapat mengakhiri sesi user.',
      });
    } finally {
      setIsForceLoggingOut(false);
    }
  };

  const handleToggleStatus = async (user: UserProfile) => {
    if (!firebaseUser) return;
    setSelectedUser(user);
    setIsTogglingStatus(true);

    try {
      const idToken = await firebaseUser.getIdToken();
      const newStatus = !user.isActive;
      const result = await toggleUserStatus(user.uid, newStatus, idToken);

      if (result.success) {
        setSelectedUser({ ...user, isActive: newStatus });
        toast({ title: 'Status Diubah', description: result.message });
      } else {
        toast({ variant: 'destructive', title: 'Gagal', description: result.message });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const confirmDelete = async () => {
    if (!userToDelete || !firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch(`/api/users/${userToDelete.uid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (res.status === 401) {
        toast({ variant: 'destructive', title: 'Sesi Habis', description: 'Silakan login kembali.' });
        await signOut(getAuth());
        router.push('/admin/login');
        return;
      }

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Gagal menghapus user');
      }

      toast({ title: 'User Dihapus', description: `${userToDelete.fullName} telah dihapus.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  if (isLoadingUsers) return <UserTableSkeleton />;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Gagal memuat users: {error.message}</AlertDescription>
      </Alert>
    );
  }

  const displayGroups = displayOrder.filter(g => usersByGroup[g]?.length > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">Kelola akun pengguna dan akses sistem</p>
        </div>
        <Button onClick={handleCreateUser} className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Tambah User
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total User</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Aktif</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</p>
              </div>
              <UserCheck className="h-8 w-8 text-green-600/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Nonaktif</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.disabled}</p>
              </div>
              <Power className="h-8 w-8 text-red-600/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-yellow-50/50 dark:bg-yellow-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Harus Ganti Pwd</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.mustChangePassword}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-600/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Magang</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.byRole.karyawan || 0}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama, email, brand, atau divisi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {quickFilters.map((filter) => (
              <Button
                key={filter.key}
                type="button"
                variant={quickFilter === filter.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setQuickFilter(filter.key)}
                className="h-8 rounded-full px-3 text-xs"
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* User Groups as Tabs */}
      {displayGroups.length > 0 ? (
        <div className="space-y-4">
          <Card>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full rounded-none border-b bg-muted/30 p-0 h-auto gap-0" style={{ gridTemplateColumns: `repeat(${Math.min(displayGroups.length, 7)}, minmax(0, 1fr))` }}>
                {displayGroups.map((groupKey) => {
                  const config = groupDisplayConfig[groupKey];
                  const count = usersByGroup[groupKey]?.length || 0;
                  const isActive = activeTab === groupKey;

                  return (
                    <TabsTrigger
                      key={groupKey}
                      value={groupKey}
                      className={`rounded-none border-b-2 px-4 py-4 flex-col gap-1 data-[state=active]:bg-background/80 data-[state=active]:border-primary transition-all ${
                        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      title={config?.label}
                    >
                      <span className="text-lg">{config?.icon}</span>
                      <span className="text-xs font-semibold leading-tight hidden xs:inline">{config?.label}</span>
                      <span className="text-xs font-bold text-primary">{count}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {/* Group Title Section */}
              <div className="px-6 py-4 border-b bg-muted/20">
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-primary/10 px-2 py-1 text-sm font-bold text-primary">{groupDisplayConfig[activeTab]?.icon}</span>
                  <div>
                    <h2 className="text-xl font-bold">{groupDisplayConfig[activeTab]?.label}</h2>
                    <p className="text-sm text-muted-foreground">{filteredGroupUsers.length} user{filteredGroupUsers.length !== 1 ? 's' : ''} - {groupDisplayConfig[activeTab]?.description}</p>
                  </div>
                </div>
              </div>

              {displayGroups.map((groupKey) => (
                <TabsContent key={groupKey} value={groupKey} className="mt-0">
                  {filteredGroupUsers.length > 0 ? (
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-0 bg-muted/50">
                          <TableHead className="min-w-[220px] py-3">User</TableHead>
                          <TableHead className="hidden min-w-[210px] md:table-cell">Email</TableHead>
                          <TableHead className="min-w-[120px]">Role</TableHead>
                          <TableHead className="hidden min-w-[150px] lg:table-cell">Tipe User/Karyawan</TableHead>
                          <TableHead className="hidden min-w-[190px] xl:table-cell">Brand / Divisi</TableHead>
                          <TableHead className="min-w-[150px]">Status Akun</TableHead>
                          <TableHead className="min-w-[180px]">Status Sesi</TableHead>
                          <TableHead className="hidden min-w-[170px] lg:table-cell">Status Keamanan</TableHead>
                          <TableHead className="hidden min-w-[150px] 2xl:table-cell">Terakhir Aktif</TableHead>
                          <TableHead className="hidden min-w-[150px] 2xl:table-cell">Terakhir Login</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredGroupUsers.map((user) => {
                          const employeeProfile = employeeProfileMap.get(user.uid);
                          const health = buildUserHealth(user, employeeProfile, brandMap);
                          const userInitial = user.fullName?.charAt(0).toUpperCase() || '?';

                          return (
                            <TableRow key={user.uid} className="border-b hover:bg-muted/50">
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold">
                                    {userInitial}
                                  </div>
                                  <div>
                                    <p className="font-medium">{user.fullName}</p>
                                    <p className="text-xs text-muted-foreground font-mono">{user.uid.slice(0, 8)}</p>
                                    <p className="mt-1 text-xs text-muted-foreground md:hidden">{user.email}</p>
                                    <div className="mt-2 flex flex-wrap gap-1 lg:hidden">
                                      {health.issues.slice(0, 2).map((issue) => (
                                        <Badge key={issue} variant="outline" className={cn('text-[10px]', issueBadgeClass)}>
                                          {issue}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden text-sm md:table-cell">{user.email}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize">{prettifyValue(user.role)}</Badge>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <Badge variant="outline">{health.employee.type}</Badge>
                              </TableCell>
                              <TableCell className="hidden text-sm xl:table-cell">
                                <div className="space-y-1">
                                  <p className="font-medium">{health.employee.brand}</p>
                                  <p className="text-xs text-muted-foreground">{health.employee.division}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn('whitespace-nowrap', health.accountStatus.className)}>
                                  {health.accountStatus.label}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <Badge variant="outline" className={cn('gap-1.5 whitespace-nowrap', health.session.className)}>
                                    <span className={cn('h-2 w-2 rounded-full', health.session.dotClassName)} />
                                    {health.session.label}
                                  </Badge>
                                  <p className="text-xs text-muted-foreground">{health.session.subtext}</p>
                                </div>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <div className="space-y-1.5">
                                  <Badge variant="outline" className={cn('whitespace-nowrap', health.securityStatus.className)}>
                                    {health.securityStatus.label}
                                  </Badge>
                                  {health.issues.length > 0 && (
                                    <div className="flex max-w-[240px] flex-wrap gap-1">
                                      {health.issues.slice(0, 2).map((issue) => (
                                        <Badge key={issue} variant="outline" className={cn('text-[10px]', issueBadgeClass)}>
                                          {issue}
                                        </Badge>
                                      ))}
                                      {health.issues.length > 2 && (
                                        <Badge variant="outline" className="text-[10px]">+{health.issues.length - 2}</Badge>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="hidden text-sm text-muted-foreground 2xl:table-cell">
                                {health.session.lastActive}
                              </TableCell>
                              <TableCell className="hidden text-sm text-muted-foreground 2xl:table-cell">
                                {health.lastLogin}
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuLabel>Akun</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleViewDetail(user)}>
                                      <Eye className="mr-2 h-4 w-4" />
                                      <span>Lihat Detail</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleEditUser(user)}>
                                      <Pencil className="mr-2 h-4 w-4" />
                                      <span>Edit Role & Akses</span>
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>Keamanan</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleResetPassword(user)} disabled={isResettingPassword}>
                                      <Lock className="mr-2 h-4 w-4" />
                                      <span>Reset Password</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleForceLogout(user)} disabled={isForceLoggingOut || user.uid === firebaseUser?.uid}>
                                      <Power className="mr-2 h-4 w-4" />
                                      <span>Force Logout</span>
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>Status</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleToggleStatus(user)} disabled={isTogglingStatus}>
                                      <Power className="mr-2 h-4 w-4" />
                                      <span>{user.isActive ? 'Nonaktifkan' : 'Aktifkan'}</span>
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleDeleteUser(user)}
                                      className="text-destructive focus:text-destructive"
                                      disabled={user.role === 'super-admin'}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      <span>Hapus</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-10 text-muted-foreground">
                    {searchQuery ? 'Tidak ada user yang cocok' : 'Tidak ada user di grup ini'}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-10 text-center text-muted-foreground">
            Tidak ada user ditemukan
          </CardContent>
        </Card>
      )}

      {/* Detail User Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail User</DialogTitle>
            <DialogDescription>Informasi lengkap akun user</DialogDescription>
          </DialogHeader>
          {selectedUser && (() => {
            const employeeProfile = employeeProfileMap.get(selectedUser.uid);
            const health = buildUserHealth(selectedUser, employeeProfile, brandMap);
            const accessLabels = getMenuAccessLabels(selectedUser.role);

            return (
              <div className="space-y-5 py-4">
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Informasi Akun</h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={health.accountStatus.className}>{health.accountStatus.label}</Badge>
                      <Badge variant="outline" className={health.securityStatus.className}>{health.securityStatus.label}</Badge>
                    </div>
                  </div>
                  <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 md:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Nama</Label>
                      <p className="font-medium">{selectedUser.fullName || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Email</Label>
                      <p className="break-all font-medium">{selectedUser.email || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">UID</Label>
                      <p className="break-all font-mono text-sm">{selectedUser.uid}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Role</Label>
                      <div><Badge variant="outline">{prettifyValue(selectedUser.role)}</Badge></div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Terakhir Login</Label>
                      <p className="font-medium">{health.lastLogin}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Dibuat pada</Label>
                      <p className="font-medium">{health.createdAt}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Terakhir diperbarui</Label>
                      <p className="font-medium">{health.updatedAt}</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Informasi Karyawan</h3>
                  <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 md:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Brand</Label>
                      <p className="font-medium">{health.employee.brand}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Divisi</Label>
                      <p className="font-medium">{health.employee.division}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Jabatan</Label>
                      <p className="font-medium">{health.employee.position}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Tipe karyawan</Label>
                      <p className="font-medium">{health.employee.type}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Status karyawan</Label>
                      <p className="font-medium">{health.employee.status}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Atasan langsung</Label>
                      <p className="font-medium">{health.employee.supervisor}</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Akses Sistem</h3>
                  <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Role aktif</Label>
                      <div className="mt-1"><Badge variant="outline">{prettifyValue(selectedUser.role)}</Badge></div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Menu / akses tersedia</Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {accessLabels.length > 0 ? accessLabels.map((label) => (
                          <Badge key={label} variant="outline" className="bg-background">{label}</Badge>
                        )) : (
                          <p className="text-sm text-muted-foreground">Belum ada daftar akses yang tersedia untuk role ini.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Status Sesi & Keamanan</h3>
                    <Badge variant="outline" className={cn('gap-1.5', health.session.className)}>
                      <span className={cn('h-2 w-2 rounded-full', health.session.dotClassName)} />
                      {health.session.label}
                    </Badge>
                  </div>
                  <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 md:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Status sesi saat ini</Label>
                      <p className="font-medium">{health.session.label}</p>
                      <p className="text-xs text-muted-foreground">{health.session.subtext}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Terakhir login</Label>
                      <p className="font-medium">{health.session.lastLogin}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Terakhir aktif</Label>
                      <p className="font-medium">{health.session.lastActive}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Terakhir logout</Label>
                      <p className="font-medium">{health.session.lastLogout}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Alasan logout terakhir</Label>
                      <p className="font-medium">{health.session.logoutReason}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Device/browser terakhir</Label>
                      <p className="font-medium">{health.session.deviceInfo}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">IP terakhir</Label>
                      <p className="font-medium">{(selectedUser as any).lastIpAddress || '-'}</p>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs text-muted-foreground">Status force logout</Label>
                      <p className="font-medium">{health.session.forceLogout}</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Catatan Keamanan</h3>
                  <div className="rounded-lg border bg-muted/20 p-4">
                    {health.issues.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {health.issues.map((issue) => (
                          <Badge key={issue} variant="outline" className={issueBadgeClass}>{issue}</Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className={softBadgeClasses.active}>Tidak ada catatan keamanan aktif</Badge>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              Tutup
            </Button>
            {selectedUser && (
              <>
                <Button variant="outline" onClick={() => { handleResetPassword(selectedUser); setIsDetailDialogOpen(false); }}>
                  Reset Password
                </Button>
                <Button onClick={() => { handleEditUser(selectedUser); setIsDetailDialogOpen(false); }}>
                  Edit
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Logout Dialog */}
      <Dialog open={isForceLogoutDialogOpen} onOpenChange={setIsForceLogoutDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Paksa logout user ini?</DialogTitle>
            <DialogDescription>
              User akan keluar dari semua sesi aktif dan harus login ulang.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="font-medium">{selectedUser.fullName}</p>
                <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="force-logout-reason">Alasan force logout *</Label>
                <Input
                  id="force-logout-reason"
                  value={forceLogoutReason}
                  onChange={(event) => setForceLogoutReason(event.target.value)}
                  placeholder="Contoh: sesi mencurigakan / perangkat hilang"
                />
                <p className="text-xs text-muted-foreground">
                  Alasan ini disimpan sebagai catatan keamanan user.
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsForceLogoutDialogOpen(false)}
              disabled={isForceLoggingOut}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={confirmForceLogout}
              disabled={isForceLoggingOut || !forceLogoutReason.trim()}
            >
              {isForceLoggingOut ? 'Memproses...' : 'Force Logout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Password Sementara Dibuat</DialogTitle>
            <DialogDescription>Salin password sementara dan beri ke user</DialogDescription>
          </DialogHeader>
          {tempPassword && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted rounded-lg border font-mono font-bold text-lg tracking-wider break-all">
                {tempPassword}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  copyToClipboard(tempPassword);
                  toast({ title: 'Disalin', description: 'Password sudah disalin ke clipboard' });
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Salin Password
              </Button>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Penting</AlertTitle>
                <AlertDescription>
                  Password ini hanya ditampilkan sekali. User wajib mengganti password setelah login.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsResetPasswordDialogOpen(false)}>Selesai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <UserFormDialog
        user={selectedUser}
        open={isFormDialogOpen}
        onOpenChange={setIsFormDialogOpen}
      />
      <DeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={confirmDelete}
        itemName={userToDelete?.fullName}
        itemType="user"
      />
    </div>
  );
}
