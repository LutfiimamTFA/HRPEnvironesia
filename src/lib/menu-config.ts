'use client';
import { createElement, type ReactNode } from 'react';
import { Briefcase, FileText, Users, ClipboardList, CheckSquare, User, Search, Calendar, DollarSign, LayoutDashboard, Settings, List, FileUp, ClipboardCheck } from 'lucide-react';

export type MenuItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

export const SUPER_ADMIN_MENU_ITEMS: MenuItem[] = [
    { href: '/admin/super-admin', label: 'Overview', icon: createElement(LayoutDashboard, { className: "h-4 w-4" }) },
    { href: '/admin/super-admin/user-management', label: 'User Management', icon: createElement(Users, { className: "h-4 w-4" }) },
    { href: '/admin/jobs', label: 'Job Postings', icon: createElement(Briefcase, { className: "h-4 w-4" }) },
    { href: '/admin/super-admin/departments-brands', label: 'Brands', icon: createElement(Briefcase, { className: "h-4 w-4" }) },
    { href: '/admin/super-admin/menu-settings', label: 'Menu Settings', icon: createElement(List, { className: "h-4 w-4" }) },
    { href: '#', label: 'System Settings', icon: createElement(Settings, { className: "h-4 w-4" }) },
];

export const ALL_MENU_ITEMS: Record<string, MenuItem[]> = {
  'super-admin': SUPER_ADMIN_MENU_ITEMS,
  hrd: [
    { href: '/admin/hrd', label: 'Dashboard', icon: createElement(LayoutDashboard, { className: "h-4 w-4" }) },
    { href: '/admin/jobs', label: 'Job Postings', icon: createElement(Briefcase, { className: "h-4 w-4" }) },
    { href: '/admin/recruitment', label: 'Recruitment', icon: createElement(Users, { className: "h-4 w-4" }) },
    { href: '/admin/hrd/assessments', label: 'Assessments', icon: createElement(ClipboardCheck, { className: "h-4 w-4" }) },
  ],
  manager: [
    { href: '#', label: 'My Team', icon: createElement(Users, { className: "h-4 w-4" }) },
    { href: '#', label: 'Open Requisitions', icon: createElement(ClipboardList, { className: "h-4 w-4" }) },
    { href: '#', label: 'Approvals', icon: createElement(CheckSquare, { className: "h-4 w-4" }) },
  ],
  kandidat: [
    { href: '/careers/portal', label: 'Dashboard', icon: createElement(LayoutDashboard, { className: "h-4 w-4" }) },
    { href: '/careers/portal/jobs', label: 'Daftar Lowongan', icon: createElement(Briefcase, { className: "h-4 w-4" }) },
    { href: '/careers/portal/applications', label: 'Lamaran Saya', icon: createElement(FileText, { className: "h-4 w-4" }) },
    { href: '/careers/portal/assessment/personality', label: 'Tes Kepribadian', icon: createElement(ClipboardCheck, { className: "h-4 w-4" }) },
    { href: '/careers/portal/documents', label: 'Dokumen', icon: createElement(FileUp, { className: "h-4 w-4" }) },
    { href: '/careers/portal/profile', label: 'Profil Saya', icon: createElement(User, { className: "h-4 w-4" }) },
  ],
  karyawan: [
    { href: '#', label: 'My Information', icon: createElement(User, { className: "h-4 w-4" }) },
    { href: '#', label: 'Leave Request', icon: createElement(Calendar, { className: "h-4 w-4" }) },
    { href: '#', label: 'Payslips', icon: createElement(DollarSign, { className: "h-4 w-4" }) },
  ],
};

const allMenusForUniqueness = Object.values(ALL_MENU_ITEMS).flat();
export const ALL_UNIQUE_MENU_ITEMS = Array.from(new Map(allMenusForUniqueness.map(item => [item.label, item])).values())
  .sort((a, b) => a.label.localeCompare(b.label));