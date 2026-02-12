import { createElement, type ReactNode } from 'react';
import { Briefcase, FileText, Users, ClipboardList, CheckSquare, User, Search, Calendar, DollarSign } from 'lucide-react';

export type MenuItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

export const ALL_MENU_ITEMS: Record<string, MenuItem[]> = {
  hrd: [
    { href: '#', label: 'Recruitment', icon: createElement(Users, { className: "h-4 w-4" }) },
    { href: '#', label: 'Job Postings', icon: createElement(Briefcase, { className: "h-4 w-4" }) },
    { href: '#', label: 'Applications', icon: createElement(FileText, { className: "h-4 w-4" }) },
  ],
  manager: [
    { href: '#', label: 'My Team', icon: createElement(Users, { className: "h-4 w-4" }) },
    { href: '#', label: 'Open Requisitions', icon: createElement(ClipboardList, { className: "h-4 w-4" }) },
    { href: '#', label: 'Approvals', icon: createElement(CheckSquare, { className: "h-4 w-4" }) },
  ],
  kandidat: [
    { href: '#', label: 'My Profile', icon: createElement(User, { className: "h-4 w-4" }) },
    { href: '#', label: 'Job Search', icon: createElement(Search, { className: "h-4 w-4" }) },
    { href: '#', label: 'My Applications', icon: createElement(FileText, { className: "h-4 w-4" }) },
  ],
  karyawan: [
    { href: '#', label: 'My Information', icon: createElement(User, { className: "h-4 w-4" }) },
    { href: '#', label: 'Leave Request', icon: createElement(Calendar, { className: "h-4 w-4" }) },
    { href: '#', label: 'Payslips', icon: createElement(DollarSign, { className: "h-4 w-4" }) },
  ],
};
