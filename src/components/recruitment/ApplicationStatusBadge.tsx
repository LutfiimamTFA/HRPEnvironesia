import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JobApplication } from "@/lib/types";

export const APPLICATION_STATUSES: JobApplication['status'][] = ['submitted', 'psychotest', 'verification', 'document_submission', 'interview', 'hired', 'rejected'];

interface ApplicationStatusBadgeProps {
  status: JobApplication['status'];
  className?: string;
}

export function ApplicationStatusBadge({ status, className }: ApplicationStatusBadgeProps) {
  const statusConfig = {
    draft: { label: 'Draf', variant: 'secondary' as const },
    submitted: { label: 'Terkirim', variant: 'default' as const },
    psychotest: { label: 'Tes Kepribadian', variant: 'default' as const, className: 'bg-blue-600 hover:bg-blue-700' },
    verification: { label: 'Verifikasi', variant: 'default' as const, className: 'bg-purple-600 hover:bg-purple-700' },
    document_submission: { label: 'Dokumen', variant: 'default' as const, className: 'bg-cyan-600 hover:bg-cyan-700' },
    interview: { label: 'Wawancara', variant: 'default' as const, className: 'bg-orange-500 hover:bg-orange-600' },
    hired: { label: 'Diterima', variant: 'default' as const, className: 'bg-green-600 hover:bg-green-700' },
    rejected: { label: 'Ditolak', variant: 'destructive' as const },
  };

  const config = statusConfig[status] || statusConfig.draft;

  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
