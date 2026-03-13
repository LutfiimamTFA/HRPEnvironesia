'use client';

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type OvertimeSubmissionStatus } from "@/lib/types";

// Define a more detailed status configuration
const statusConfig: Record<OvertimeSubmissionStatus, {
  managerLabel: string;
  hrdLabel: string;
  className: string;
}> = {
    draft: { managerLabel: 'Draf', hrdLabel: 'Draf', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
    pending_manager: { managerLabel: 'Menunggu Persetujuan Anda', hrdLabel: 'Menunggu Manajer', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200' },
    rejected_manager: { managerLabel: 'Ditolak Anda', hrdLabel: 'Ditolak Manajer', className: 'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200' },
    revision_manager: { managerLabel: 'Revisi Diminta', hrdLabel: 'Revisi dari Manajer', className: 'bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200' },
    approved_by_manager: { managerLabel: 'Disetujui Anda', hrdLabel: 'Menunggu Persetujuan HRD', className: 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200' },
    pending_hrd: { managerLabel: 'Menunggu HRD', hrdLabel: 'Menunggu Persetujuan Anda', className: 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200' },
    rejected_hrd: { managerLabel: 'Ditolak HRD', hrdLabel: 'Ditolak Anda', className: 'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200' },
    revision_hrd: { managerLabel: 'Revisi dari HRD', hrdLabel: 'Revisi Diminta', className: 'bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200' },
    approved: { managerLabel: 'Disetujui Penuh', hrdLabel: 'Disetujui Penuh', className: 'bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-200' },
};

interface OvertimeApprovalStatusBadgeProps {
  status: OvertimeSubmissionStatus;
  mode: 'manager' | 'hrd';
  className?: string;
}

export function OvertimeApprovalStatusBadge({ status, mode, className }: OvertimeApprovalStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft;
  const label = mode === 'manager' ? config.managerLabel : config.hrdLabel;

  return (
    <Badge className={cn("border-transparent font-medium", config.className, className)}>
      {label}
    </Badge>
  );
}
