import { Briefcase, FileText, Users, ClipboardList, CheckSquare, User, Search, Calendar, DollarSign } from 'lucide-react';
import type { ReactNode } from 'react';

export type MenuItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

export const ALL_MENU_ITEMS: Record<string, MenuItem[]> = {
  hrd: [
    { href: '#', label: 'Recruitment', icon: <Users className="h-4 w-4" /> },
    { href: '#', label: 'Job Postings', icon: <Briefcase className="h-4 w-4" /> },
    { href: '#', label: 'Applications', icon: <FileText className="h-4 w-4" /> },
  ],
  manager: [
    { href: '#', label: 'My Team', icon: <Users className="h-4 w-4" /> },
    { href: '#', label: 'Open Requisitions', icon: <ClipboardList className="h-4 w-4" /> },
    { href: '#', label: 'Approvals', icon: <CheckSquare className="h-4 w-4" /> },
  ],
  kandidat: [
    { href: '#', label: 'My Profile', icon: <User className="h-4 w-4" /> },
    { href: '#', label: 'Job Search', icon: <Search className="h-4 w-4" /> },
    { href: '#', label: 'My Applications', icon: <FileText className="h-4 w-4" /> },
  ],
  karyawan: [
    { href: '#', label: 'My Information', icon: <User className="h-4 w-4" /> },
    { href: '#', label: 'Leave Request', icon: <Calendar className="h-4 w-4" /> },
    { href: '#', label: 'Payslips', icon: <DollarSign className="h-4 w-4" /> },
  ],
};
