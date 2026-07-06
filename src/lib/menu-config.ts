"use client";
import { createElement, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  User,
  Calendar,
  DollarSign,
  Settings,
  ShieldCheck,
  Database,
  History,
  Contact,
  UserPlus,
  FolderKanban,
  CalendarOff,
  UserMinus,
  KanbanSquare,
  CheckSquare,
  BarChart,
  ClipboardCheck,
  Award,
  Search,
  FileText,
  FileUp,
  Video,
  BrainCircuit,
  Timer,
  MapPin,
  BookUser,
  FileHeart,
  FileClock,
  GraduationCap,
  PenSquare,
  Globe,
  Wallet,
  Wrench,
  CalendarClock,
  Home,
  Megaphone,
  ScanSearch,
  RefreshCw,
  ToggleLeft,
  HardDrive,
  Server,
  Briefcase as BriefcaseIcon,
  Package,
} from "lucide-react";
import type { UserRole } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export type MenuItem = {
  key: string; // Unique identifier
  href: string;
  label: string;
  icon: ReactNode;
  badge?: ReactNode | number;
  /** Opens href in a new tab via window.open instead of client-side routing — for links to other apps (e.g. Inventory Portal). */
  external?: boolean;
};

export type MenuGroup = {
  title?: string;
  items: MenuItem[];
};

const MENU_KEY_ALIASES: Record<string, string> = {
  pengajuan_izin: "employee.permission",
  pengajuan_cuti: "employee.leave",
  perjalanan_dinas: "management.business_trip_missions",
  data_karyawan: "employee.data.karyawan",
  data_saya: "employee.profile",
  "personal.interviews.manager": "personal.interviews",
  "personal.interviews.hrd": "personal.interviews",
  "pengajuan-izin": "employee.permission",
  "pengajuan-cuti": "employee.leave",
  "perjalanan-dinas": "management.business_trip_missions",
  "data-karyawan": "employee.data.karyawan",
  "data-saya": "employee.profile",
};

export function normalizeMenuKey(menuKey?: string | null): string {
  if (!menuKey) return "";

  const normalizedKey = menuKey.toLowerCase().trim();
  return MENU_KEY_ALIASES[normalizedKey] || menuKey;
}

export function normalizeMenuVisibilityKeys(
  menuKeys?: string[] | null,
): string[] {
  if (!Array.isArray(menuKeys)) return [];

  return Array.from(
    new Set(
      menuKeys.map((menuKey) => normalizeMenuKey(menuKey)).filter(Boolean),
    ),
  );
}

const RECRUITMENT_MENU_ITEMS: MenuGroup = {
  title: "Rekrutmen",
  items: [
    {
      key: "recruitment.dashboard",
      href: "/admin/hrd/dashboard-rekrutmen",
      label: "Dashboard Rekrutmen",
      icon: createElement(Users),
    },
    {
      key: "recruitment.jobs",
      href: "/admin/jobs",
      label: "Job Postings",
      icon: createElement(Briefcase),
    },
    {
      key: "recruitment.applications",
      href: "/admin/recruitment",
      label: "Manajemen Aplikasi",
      icon: createElement(FolderKanban),
    },
    {
      key: "recruitment.templates",
      href: "/admin/recruitment/templates",
      label: "Master Template Offering",
      icon: createElement(FileText),
    },
    {
      key: "recruitment.assessments",
      href: "/admin/hrd/assessments",
      label: "Assessments",
      icon: createElement(ClipboardCheck),
    },
  ],
};

const EMPLOYEE_MANAGEMENT_ITEMS: MenuGroup = {
  title: "Manajemen Karyawan",
  items: [
    {
      key: "employee.data.karyawan",
      href: "/admin/hrd/employee-data/karyawan",
      label: "Data Karyawan",
      icon: createElement(Users),
    },
  ],
};

const EMPLOYEE_MONITORING_ITEMS: MenuGroup = {
  title: "Monitoring Karyawan",
  items: [
    {
      key: "monitoring.dashboard",
      href: "/admin/hrd/dashboard-karyawan",
      label: "Dashboard Karyawan",
      icon: createElement(LayoutDashboard),
    },
    {
      key: "monitoring.invites",
      href: "/admin/hrd/invites",
      label: "Employee Invites",
      icon: createElement(UserPlus),
    },
    {
      key: "monitoring.interns",
      href: "/admin/hrd/employee-data/intern",
      label: "Profil Magang",
      icon: createElement(BookUser),
    },
    {
      key: "monitoring.attendance",
      href: "/admin/hrd/monitoring/absen",
      label: "Monitoring Absen",
      icon: createElement(FileClock),
    },
    {
      key: "hrd.overtime_approval",
      href: "/admin/hrd/persetujuan-lembur",
      label: "Persetujuan Lembur",
      icon: createElement(Timer),
    },
    {
      key: "overtime_payroll_recap",
      href: "/admin/overtime-payroll-recap",
      label: "Rekap Lembur Payroll",
      icon: createElement(CalendarClock),
    },
    {
      key: "monitoring.attendance-payroll-recap",
      href: "/admin/hrd/attendance-payroll-recap",
      label: "Rekap Absensi Payroll",
      icon: createElement(CalendarClock),
    },
    {
      key: "hrd.permission_approval",
      href: "/admin/hrd/persetujuan-izin",
      label: "Persetujuan Izin",
      icon: createElement(FileHeart),
    },
    {
      key: "hrd.dinas.monitoring",
      href: "/admin/hrd/monitoring/dinas",
      label: "Dinas (Tracking)",
      icon: createElement(MapPin),
    },
    {
      key: "hrd.surat_tugas",
      href: "/admin/hrd/surat-tugas",
      label: "Surat Perintah Dinas",
      icon: createElement(FileText),
    },
    {
      key: "hrd.leave_approval",
      href: "/admin/hrd/persetujuan-cuti",
      label: "Persetujuan Cuti",
      icon: createElement(CalendarOff),
    },
    {
      key: "monitoring.leave",
      href: "/admin/hrd/monitoring/cuti",
      label: "Cuti",
      icon: createElement(CalendarOff),
    },
    {
      key: "monitoring.training",
      href: "/admin/hrd/monitoring/pelatihan",
      label: "Pengembangan SDM",
      icon: createElement(GraduationCap),
    },
    {
      key: "monitoring.settings",
      href: "/admin/hrd/monitoring/settings",
      label: "Pengaturan Absensi",
      icon: createElement(Settings),
    },
  ],
};

const REVIEW_ITEMS: MenuGroup = {
  title: "Review",
  items: [
    {
      key: "review.reports",
      href: "/admin/review/laporan-magang",
      label: "Review Laporan Magang",
      icon: createElement(PenSquare),
    },
    {
      key: "manager.overtime_approval",
      href: "/admin/manager/persetujuan-lembur",
      label: "Persetujuan Lembur Tim",
      icon: createElement(CheckSquare),
    },
    {
      key: "manager.permission_approval",
      href: "/admin/manager/persetujuan-izin",
      label: "Persetujuan Izin Tim",
      icon: createElement(FileHeart),
    },
    {
      key: "manager.leave_approval",
      href: "/admin/manager/persetujuan-cuti",
      label: "Persetujuan Cuti Tim",
      icon: createElement(CalendarOff),
    },
    {
      key: "review.business_trip_approval",
      href: "/admin/review/persetujuan-dinas",
      label: "Persetujuan Perjalanan Dinas",
      icon: createElement(CheckSquare),
    },
  ],
};

const MANAGEMENT_MENU_ITEMS: MenuGroup = {
  title: "Management",
  items: [
    {
      key: "management.business_trip_missions",
      href: "/admin/management/perjalanan-dinas",
      label: "Perjalanan Dinas / Misi Dinas",
      icon: createElement(MapPin),
    },
  ],
};

const MANAGER_MENU_GROUP: MenuGroup = {
  title: "Manager",
  items: [
    {
      key: "manager.team",
      href: "/admin/manager",
      label: "My Team",
      icon: createElement(Users),
    },
  ],
};

const DEVELOPER_MENU_ITEMS: MenuGroup = {
  title: "Developer Tools",
  items: [
    {
      key: "dev.storage-test",
      href: "/admin/dev/storage-test",
      label: "Storage Test",
      icon: createElement(Wrench),
    },
  ],
};

/**
 * Pendataan barang (CRUD) happens IN HRP. The separate Scan Portal
 * (localhost:3002 in dev) is only for employees to log in, scan a QR code,
 * borrow, and return items — it reads the same Firestore collections but has
 * no menu link from HRP; HRP never redirects here.
 */
const INVENTORY_ITEMS_BASIC: MenuItem[] = [
  {
    key: "inventory_dashboard",
    href: "/admin/inventory/dashboard",
    label: "Dashboard Inventory",
    icon: createElement(Package),
  },
  {
    key: "inventory_barang",
    href: "/admin/inventory/items",
    label: "Barang",
    icon: createElement(Package),
  },
  {
    key: "inventory_categories",
    href: "/admin/inventory/categories",
    label: "Kategori Barang",
    icon: createElement(Package),
  },
  {
    key: "inventory_borrowings",
    href: "/admin/inventory/borrowings",
    label: "Data Peminjaman",
    icon: createElement(Package),
  },
];

/**
 * Full Inventory group — used in Super Admin's default menu, and as the
 * toggleable row set in ALL_MENU_GROUPS / Menu Visibility for every role.
 * It is NOT added to any non-super-admin role's default MENU_CONFIG: an
 * active Inventory Admin sees the 4 CRUD items via the dynamic injection in
 * DashboardLayout (tied to inventory_access/{uid}.status == "active"), not
 * via a fixed role default — Inventory Admin is an additive access flag, not
 * an HRP role. "Manajemen Akses Inventory" itself stays Super-Admin-only,
 * always enforced regardless of Menu Visibility.
 */
const INVENTORY_MENU_GROUP_FULL: MenuGroup = {
  title: "Inventory",
  items: [
    ...INVENTORY_ITEMS_BASIC,
    {
      key: "inventory_access",
      href: "/admin/inventory-access",
      label: "Manajemen Akses Inventory",
      icon: createElement(Package),
    },
  ],
};

export const ALL_MENU_GROUPS: MenuGroup[] = [
  RECRUITMENT_MENU_ITEMS,
  EMPLOYEE_MANAGEMENT_ITEMS,
  EMPLOYEE_MONITORING_ITEMS,
  REVIEW_ITEMS,
  MANAGEMENT_MENU_ITEMS,
  MANAGER_MENU_GROUP,
  {
    title: "Administrasi",
    items: [
      {
        key: "admin.users",
        href: "/admin/super-admin/user-management",
        label: "User Management",
        icon: createElement(Users),
      },
      {
        key: "admin.structure",
        href: "/admin/super-admin/struktur-organisasi",
        label: "Organisasi Perusahaan",
        icon: createElement(KanbanSquare),
      },
      {
        key: "admin.master",
        href: "/admin/super-admin/departments-brands",
        label: "Master Data",
        icon: createElement(Database),
      },
      {
        key: "admin.ecosystem",
        href: "/admin/super-admin/ecosystem",
        label: "Ecosystem",
        icon: createElement(Globe),
      },
      {
        key: "admin.access",
        href: "/admin/super-admin/menu-settings",
        label: "Access & Roles",
        icon: createElement(ShieldCheck),
      },
    ],
  },
  INVENTORY_MENU_GROUP_FULL,
  {
    title: "Keamanan & Sistem",
    items: [
      {
        key: "admin.session-security",
        href: "/admin/super-admin/session-security",
        label: "Session & Security",
        icon: createElement(ShieldCheck),
      },
      {
        key: "admin.audit-log",
        href: "/admin/super-admin/audit-log",
        label: "Audit Log",
        icon: createElement(History),
      },
      {
        key: "admin.backup-export",
        href: "/admin/super-admin/backup-export",
        label: "Backup & Export",
        icon: createElement(Database),
      },
      {
        key: "admin.announcements",
        href: "/admin/super-admin/announcements",
        label: "Pengumuman Sistem",
        icon: createElement(Settings),
      },
    ],
  },
  {
    title: "Kontrol Sistem",
    items: [
      {
        key: "admin.maintenance-control",
        href: "/admin/super-admin/maintenance-control",
        label: "Maintenance Control",
        icon: createElement(Wrench),
      },
      {
        key: "admin.feature-control",
        href: "/admin/super-admin/feature-control",
        label: "Feature Control",
        icon: createElement(ToggleLeft),
      },
      {
        key: "admin.analytics-system",
        href: "/admin/super-admin/analytics-system",
        label: "Analytics Sistem",
        icon: createElement(BarChart),
      },
      {
        key: "admin.data-integrity",
        href: "/admin/super-admin/data-integrity",
        label: "Data Integrity",
        icon: createElement(ScanSearch),
      },
      {
        key: "admin.sync-center",
        href: "/admin/super-admin/sync-center",
        label: "Technical Sync Center",
        icon: createElement(RefreshCw),
      },
      {
        key: "admin.storage-management",
        href: "/admin/super-admin/storage-management",
        label: "Storage Management",
        icon: createElement(HardDrive),
      },
      {
        key: "admin.environment-info",
        href: "/admin/super-admin/environment-info",
        label: "Environment Info",
        icon: createElement(Server),
      },
    ],
  },
  {
    title: "Personal",
    items: [
      {
        key: "personal.interviews",
        href: "/admin/interviews",
        label: "My Interviews",
        icon: createElement(Video),
      },
      {
        key: "recruitment.tasks",
        href: "/admin/recruitment/my-tasks",
        label: "Tugas Rekrutmen",
        icon: createElement(Briefcase),
      },
    ],
  },
  {
    title: "Karyawan",
    items: [
      {
        key: "employee.dashboard",
        href: "/admin/karyawan/dashboard",
        label: "Dashboard",
        icon: createElement(LayoutDashboard),
      },
      {
        key: "employee.profile",
        href: "/admin/karyawan/profile",
        label: "Data Diri Karyawan",
        icon: createElement(User),
      },
      {
        key: "employee.laporan.harian",
        href: "/admin/karyawan/magang/laporan-harian",
        label: "Laporan Harian",
        icon: createElement(FileText),
      },
      {
        key: "employee.laporan.rekap",
        href: "/admin/karyawan/magang/rekap-laporan",
        label: "Rekap Laporan",
        icon: createElement(BarChart),
      },
      {
        key: "employee.laporan.evaluasi",
        href: "/admin/karyawan/magang/evaluasi",
        label: "Evaluasi & Feedback",
        icon: createElement(CheckSquare),
      },
      {
        key: "employee.overtime",
        href: "/admin/karyawan/pengajuan-lembur",
        label: "Pengajuan Lembur",
        icon: createElement(FileClock),
      },
      {
        key: "employee.permission",
        href: "/admin/karyawan/pengajuan-izin",
        label: "Pengajuan Izin",
        icon: createElement(FileHeart),
      },
      {
        key: "employee.leave",
        href: "/admin/karyawan/pengajuan-cuti",
        label: "Pengajuan Cuti",
        icon: createElement(CalendarOff),
      },
      {
        key: "employee.dinas.confirmation",
        href: "/admin/karyawan/konfirmasi-dinas",
        label: "Konfirmasi & Laporan Dinas",
        icon: createElement(MapPin),
      },
      {
        key: "employee.dashboard.training",
        href: "/admin/karyawan/dashboard-training",
        label: "Dashboard Training",
        icon: createElement(LayoutDashboard),
      },
    ],
  },
  {
    title: "Karir",
    items: [
      {
        key: "candidate.dashboard",
        href: "/careers/portal",
        label: "Dashboard",
        icon: createElement(LayoutDashboard),
      },
      {
        key: "candidate.jobs",
        href: "/careers/portal/jobs",
        label: "Daftar Lowongan",
        icon: createElement(Briefcase),
      },
      {
        key: "candidate.applications",
        href: "/careers/portal/applications",
        label: "Lamaran Saya",
        icon: createElement(FileText),
      },
    ],
  },
  {
    title: "Proses Seleksi",
    items: [
      {
        key: "candidate.profile",
        href: "/careers/portal/profile",
        label: "Profil Pelamar",
        icon: createElement(User),
      },
      {
        key: "candidate.assessment",
        href: "/careers/portal/assessment/personality",
        label: "Tes Kepribadian",
        icon: createElement(BrainCircuit),
      },
      {
        key: "candidate.documents",
        href: "/careers/portal/documents",
        label: "Pengumpulan Dokumen",
        icon: createElement(FileUp),
      },
      {
        key: "candidate.interviews",
        href: "/careers/portal/interviews",
        label: "Jadwal Wawancara",
        icon: createElement(Calendar),
      },
    ],
  },
  DEVELOPER_MENU_ITEMS,
];

export const MENU_CONFIG: Record<string, MenuGroup[]> = {
  management: [
    MANAGEMENT_MENU_ITEMS,
    EMPLOYEE_MONITORING_ITEMS,
    {
      title: "Administrasi",
      items: [
        {
          key: "admin.structure",
          href: "/admin/super-admin/struktur-organisasi",
          label: "Organisasi Perusahaan",
          icon: createElement(KanbanSquare),
        },
      ],
    },
    {
      title: "Personal",
      items: [
        {
          key: "personal.interviews",
          href: "/admin/interviews",
          label: "My Interviews",
          icon: createElement(Video),
        },
      ],
    },
  ],
  "super-admin": [
    RECRUITMENT_MENU_ITEMS,
    EMPLOYEE_MANAGEMENT_ITEMS,
    EMPLOYEE_MONITORING_ITEMS,
    REVIEW_ITEMS,
    {
      title: "Administrasi",
      items: [
        {
          key: "admin.users",
          href: "/admin/super-admin/user-management",
          label: "User Management",
          icon: createElement(Users),
        },
        {
          key: "admin.structure",
          href: "/admin/super-admin/struktur-organisasi",
          label: "Organisasi Perusahaan",
          icon: createElement(KanbanSquare),
        },
        {
          key: "admin.master",
          href: "/admin/super-admin/departments-brands",
          label: "Master Data",
          icon: createElement(Database),
        },
        {
          key: "admin.ecosystem",
          href: "/admin/super-admin/ecosystem",
          label: "Ecosystem",
          icon: createElement(Globe),
        },
        {
          key: "admin.access",
          href: "/admin/super-admin/menu-settings",
          label: "Access & Roles",
          icon: createElement(ShieldCheck),
        },
      ],
    },
    INVENTORY_MENU_GROUP_FULL,
    {
      title: "Keamanan & Sistem",
      items: [
        {
          key: "admin.session-security",
          href: "/admin/super-admin/session-security",
          label: "Session & Security",
          icon: createElement(ShieldCheck),
        },
        {
          key: "admin.audit-log",
          href: "/admin/super-admin/audit-log",
          label: "Audit Log",
          icon: createElement(History),
        },
        {
          key: "admin.backup-export",
          href: "/admin/super-admin/backup-export",
          label: "Backup & Export",
          icon: createElement(Database),
        },
        {
          key: "admin.announcements",
          href: "/admin/super-admin/announcements",
          label: "Pengumuman Sistem",
          icon: createElement(Megaphone),
        },
      ],
    },
    {
      title: "Kontrol Sistem",
      items: [
        {
          key: "admin.maintenance-control",
          href: "/admin/super-admin/maintenance-control",
          label: "Maintenance Control",
          icon: createElement(Wrench),
        },
        {
          key: "admin.feature-control",
          href: "/admin/super-admin/feature-control",
          label: "Feature Control",
          icon: createElement(ToggleLeft),
        },
        {
          key: "admin.analytics-system",
          href: "/admin/super-admin/analytics-system",
          label: "Analytics Sistem",
          icon: createElement(BarChart),
        },
        {
          key: "admin.data-integrity",
          href: "/admin/super-admin/data-integrity",
          label: "Data Integrity",
          icon: createElement(ScanSearch),
        },
        {
          key: "admin.sync-center",
          href: "/admin/super-admin/sync-center",
          label: "Technical Sync Center",
          icon: createElement(RefreshCw),
        },
        {
          key: "admin.storage-management",
          href: "/admin/super-admin/storage-management",
          label: "Storage Management",
          icon: createElement(HardDrive),
        },
        {
          key: "admin.environment-info",
          href: "/admin/super-admin/environment-info",
          label: "Environment Info",
          icon: createElement(Server),
        },
      ],
    },
    {
      title: "Personal",
      items: [
        {
          key: "personal.interviews",
          href: "/admin/interviews",
          label: "My Interviews",
          icon: createElement(Video),
        },
        {
          key: "recruitment.tasks",
          href: "/admin/recruitment/my-tasks",
          label: "Tugas Rekrutmen",
          icon: createElement(Briefcase),
        },
      ],
    },
    DEVELOPER_MENU_ITEMS,
  ],
  hrd: [
    // ── A. REKRUTMEN ──────────────────────────────────────
    {
      title: "Rekrutmen",
      items: [
        {
          key: "hrd.dashboard.rekrutmen",
          href: "/admin/hrd/dashboard-rekrutmen",
          label: "Dashboard Rekrutmen",
          icon: createElement(LayoutDashboard),
        },
        {
          key: "recruitment.jobs",
          href: "/admin/jobs",
          label: "Lowongan Kerja",
          icon: createElement(Briefcase),
        },
        {
          key: "recruitment.applications",
          href: "/admin/recruitment",
          label: "Manajemen Lamaran",
          icon: createElement(FolderKanban),
        },
        {
          key: "recruitment.assessments",
          href: "/admin/hrd/assessments",
          label: "Asesmen",
          icon: createElement(ClipboardCheck),
        },
        {
          key: "recruitment.templates",
          href: "/admin/recruitment/templates",
          label: "Template Offering",
          icon: createElement(FileText),
        },
        {
          key: "personal.interviews",
          href: "/admin/interviews",
          label: "Interview Saya",
          icon: createElement(Video),
        },
        {
          key: "recruitment.tasks",
          href: "/admin/recruitment/my-tasks",
          label: "Tugas Rekrutmen",
          icon: createElement(CheckSquare),
        },
      ],
    },

    // ── B. DATA & ADMINISTRASI KARYAWAN ──────────────────
    {
      title: "Data Karyawan",
      items: [
        {
          key: "employee.data.karyawan",
          href: "/admin/hrd/employee-data/karyawan",
          label: "Direktori Karyawan",
          icon: createElement(Users),
        },
        {
          key: "monitoring.invites",
          href: "/admin/hrd/invites",
          label: "Undangan Karyawan",
          icon: createElement(UserPlus),
        },
        {
          key: "monitoring.interns",
          href: "/admin/hrd/employee-data/intern",
          label: "Profil Magang",
          icon: createElement(BookUser),
        },
      ],
    },

    // ── C. ABSENSI & KEHADIRAN ────────────────────────────
    {
      title: "Absensi & Kehadiran",
      items: [
        {
          key: "hrd.dashboard.karyawan",
          href: "/admin/hrd/dashboard-karyawan",
          label: "Dashboard Karyawan",
          icon: createElement(LayoutDashboard),
        },
        {
          key: "monitoring.attendance",
          href: "/admin/hrd/monitoring/absen",
          label: "Monitoring Absen",
          icon: createElement(FileClock),
        },
        {
          key: "monitoring.attendance-payroll-recap",
          href: "/admin/hrd/attendance-payroll-recap",
          label: "Rekap Absensi Payroll",
          icon: createElement(CalendarClock),
        },
        {
          key: "monitoring.settings",
          href: "/admin/hrd/monitoring/settings",
          label: "Pengaturan Absensi",
          icon: createElement(Settings),
        },
      ],
    },

    // ── D. LEMBUR ─────────────────────────────────────────
    {
      title: "Lembur",
      items: [
        {
          key: "hrd.overtime_approval",
          href: "/admin/hrd/persetujuan-lembur",
          label: "Persetujuan Lembur",
          icon: createElement(Timer),
        },
        {
          key: "overtime_payroll_recap",
          href: "/admin/overtime-payroll-recap",
          label: "Rekap Lembur Payroll",
          icon: createElement(CalendarClock),
        },
      ],
    },

    // ── E. IZIN, CUTI & PERJALANAN DINAS ─────────────────
    {
      title: "Izin, Cuti & Dinas",
      items: [
        {
          key: "hrd.permission_approval",
          href: "/admin/hrd/persetujuan-izin",
          label: "Persetujuan Izin",
          icon: createElement(FileHeart),
        },
        {
          key: "hrd.leave_approval",
          href: "/admin/hrd/persetujuan-cuti",
          label: "Persetujuan Cuti",
          icon: createElement(CalendarOff),
        },
        {
          key: "monitoring.leave",
          href: "/admin/hrd/monitoring/cuti",
          label: "Manajemen Cuti",
          icon: createElement(Calendar),
        },
        {
          key: "hrd.dinas.monitoring",
          href: "/admin/hrd/monitoring/dinas",
          label: "Dinas (Tracking)",
          icon: createElement(MapPin),
        },
        {
          key: "hrd.surat_tugas",
          href: "/admin/hrd/surat-tugas",
          label: "Surat Perintah Dinas",
          icon: createElement(FileText),
        },
        {
          key: "review.business_trip_approval",
          href: "/admin/review/persetujuan-dinas",
          label: "Persetujuan Dinas",
          icon: createElement(CheckSquare),
        },
      ],
    },

    // ── F. PENGEMBANGAN SDM ───────────────────────────────
    {
      title: "Pengembangan SDM",
      items: [
        {
          key: "monitoring.training",
          href: "/admin/hrd/monitoring/pelatihan",
          label: "Pengembangan SDM",
          icon: createElement(GraduationCap),
        },
      ],
    },

    // ── G. FITUR PRIBADI ──────────────────────────────────
    {
      title: "Fitur Pribadi",
      items: [
        {
          key: "hrd.personal.profile",
          href: "/admin/karyawan/profile",
          label: "Data Diri Saya",
          icon: createElement(User),
        },
        {
          key: "hrd.personal.permission",
          href: "/admin/karyawan/pengajuan-izin",
          label: "Pengajuan Izin",
          icon: createElement(FileHeart),
        },
        {
          key: "hrd.personal.leave",
          href: "/admin/karyawan/pengajuan-cuti",
          label: "Pengajuan Cuti",
          icon: createElement(CalendarOff),
        },
      ],
    },
  ],
  manager: [
    {
      // No title — Dashboard sits at the top without a section header
      items: [
        {
          key: "employee.dashboard",
          href: "/admin/karyawan/dashboard",
          label: "Dashboard",
          icon: createElement(LayoutDashboard),
        },
      ],
    },
    MANAGEMENT_MENU_ITEMS,
    {
      title: "Manager",
      items: [
        {
          key: "manager.team",
          href: "/admin/manager",
          label: "My Team",
          icon: createElement(Users),
        },
      ],
    },
    REVIEW_ITEMS,
    {
      title: "Personal",
      items: [
        {
          key: "personal.interviews",
          href: "/admin/interviews",
          label: "My Interviews",
          icon: createElement(Video),
        },
        {
          key: "recruitment.tasks",
          href: "/admin/recruitment/my-tasks",
          label: "Tugas Rekrutmen",
          icon: createElement(Briefcase),
        },
      ],
    },
  ],
  karyawan: [
    {
      // No title = no section header — Dashboard sits at the top as a standalone item
      items: [
        {
          key: "employee.dashboard",
          href: "/admin/karyawan/dashboard",
          label: "Dashboard",
          icon: createElement(LayoutDashboard),
        },
      ],
    },
    {
      title: "Personal",
      items: [
        {
          key: "employee.profile",
          href: "/admin/karyawan/profile",
          label: "Data Diri Karyawan",
          icon: createElement(User),
        },
        {
          key: "employee.permission",
          href: "/admin/karyawan/pengajuan-izin",
          label: "Pengajuan Izin",
          icon: createElement(FileHeart),
        },
        {
          key: "employee.leave",
          href: "/admin/karyawan/pengajuan-cuti",
          label: "Pengajuan Cuti",
          icon: createElement(CalendarOff),
        },
        {
          key: "employee.overtime",
          href: "/admin/karyawan/pengajuan-lembur",
          label: "Pengajuan Lembur",
          icon: createElement(FileClock),
        },
        {
          key: "employee.dinas.confirmation",
          href: "/admin/karyawan/konfirmasi-dinas",
          label: "Konfirmasi & Laporan Dinas",
          icon: createElement(MapPin),
        },
      ],
    },
    // NOTE: REVIEW_ITEMS and recruitment.tasks intentionally excluded from karyawan default.
    // Review menu is injected dynamically by DashboardLayout only when canUserReview() is true.
    // recruitment.tasks is injected under "Tugas Khusus" only when user has an active assignment.
  ],

  "karyawan-magang": [
    {
      title: "Internship",
      items: [
        {
          key: "employee.dashboard.magang",
          href: "/admin/karyawan/dashboard-magang",
          label: "Dashboard Magang",
          icon: createElement(LayoutDashboard),
        },
        {
          key: "employee.profile",
          href: "/admin/karyawan/magang/profile",
          label: "Data Diri Karyawan",
          icon: createElement(User),
        },
        {
          key: "employee.overtime",
          href: "/admin/karyawan/pengajuan-lembur",
          label: "Pengajuan Lembur",
          icon: createElement(FileClock),
        },
        {
          key: "employee.permission",
          href: "/admin/karyawan/pengajuan-izin",
          label: "Pengajuan Izin",
          icon: createElement(FileHeart),
        },
        {
          key: "employee.dinas.confirmation",
          href: "/admin/karyawan/konfirmasi-dinas",
          label: "Konfirmasi & Laporan Dinas",
          icon: createElement(MapPin),
        },
        // NOTE: recruitment.tasks intentionally excluded — magang are not part of recruitment team.
      ],
    },
    {
      title: "Laporan Magang",
      items: [
        {
          key: "employee.laporan.harian",
          href: "/admin/karyawan/magang/laporan-harian",
          label: "Laporan Harian",
          icon: createElement(FileText),
        },
        {
          key: "employee.laporan.rekap",
          href: "/admin/karyawan/magang/rekap-laporan",
          label: "Rekap Laporan",
          icon: createElement(BarChart),
        },
        {
          key: "employee.laporan.evaluasi",
          href: "/admin/karyawan/magang/evaluasi",
          label: "Evaluasi & Feedback",
          icon: createElement(CheckSquare),
        },
      ],
    },
  ],
  "karyawan-training": [
    {
      title: "Karyawan",
      items: [
        {
          key: "employee.dashboard.training",
          href: "/admin/karyawan/dashboard-training",
          label: "Dashboard Training",
          icon: createElement(LayoutDashboard),
        },
        {
          key: "employee.profile",
          href: "/admin/karyawan/profile",
          label: "Data Diri Karyawan",
          icon: createElement(User),
        },
        {
          key: "employee.overtime",
          href: "/admin/karyawan/pengajuan-lembur",
          label: "Pengajuan Lembur",
          icon: createElement(FileClock),
        },
        {
          key: "employee.permission",
          href: "/admin/karyawan/pengajuan-izin",
          label: "Pengajuan Izin",
          icon: createElement(FileHeart),
        },
        {
          key: "employee.dinas.confirmation",
          href: "/admin/karyawan/konfirmasi-dinas",
          label: "Konfirmasi & Laporan Dinas",
          icon: createElement(MapPin),
        },
        // NOTE: recruitment.tasks intentionally excluded — karyawan-training are not recruitment staff.
      ],
    },
  ],
  kandidat: [
    {
      title: "Karir",
      items: [
        {
          key: "candidate.dashboard",
          href: "/careers/portal",
          label: "Dashboard",
          icon: createElement(LayoutDashboard),
        },
        {
          key: "candidate.jobs",
          href: "/careers/portal/jobs",
          label: "Daftar Lowongan",
          icon: createElement(Briefcase),
        },
        {
          key: "candidate.applications",
          href: "/careers/portal/applications",
          label: "Lamaran Saya",
          icon: createElement(FileText),
        },
      ],
    },
    {
      title: "Proses Seleksi",
      items: [
        {
          key: "candidate.profile",
          href: "/careers/portal/profile",
          label: "Profil Pelamar",
          icon: createElement(User),
        },
        {
          key: "candidate.assessment",
          href: "/careers/portal/assessment/personality",
          label: "Tes Kepribadian",
          icon: createElement(BrainCircuit),
        },
        {
          key: "candidate.documents",
          href: "/careers/portal/documents",
          label: "Pengumpulan Dokumen",
          icon: createElement(FileUp),
        },
        {
          key: "candidate.interviews",
          href: "/careers/portal/interviews",
          label: "Jadwal Wawancara",
          icon: createElement(Calendar),
        },
      ],
    },
  ],
};

export function normalizeMenuRole(
  userRole: string | null | undefined,
  structuralLevel?: string,
): string {
  if (!userRole) {
    const structural = (structuralLevel || "").toLowerCase().trim();
    return /director|direktur|direksi|management|manajemen/.test(structural)
      ? "manager"
      : "karyawan";
  }

  const role = userRole.toLowerCase().trim();
  const structural = (structuralLevel || "").toLowerCase().trim();

  // Management / Director / Direksi / Manajemen should always use the manager visibility set.
  if (
    /director|direktur|direksi|management|manajemen/.test(role) ||
    /director|direktur|direksi|management|manajemen/.test(structural)
  ) {
    return "manager";
  }

  // Return role as-is if it matches known roles.
  if (
    ["super-admin", "hrd", "manager", "karyawan", "kandidat"].includes(role)
  ) {
    return role;
  }

  // Default to karyawan for unknown / staff roles.
  return "karyawan";
}
