
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JobApplication } from "@/lib/types";

export const APPLICATION_STATUSES: JobApplication['status'][] = ['submitted', 'psychotest', 'reviewed', 'interview', 'hired', 'rejected'];

interface ApplicationStatusBadgeProps {
  status: JobApplication['status'];
  className?: string;
}

export function ApplicationStatusBadge({ status, className }: ApplicationStatusBadgeProps) {
  const statusConfig = {
    draft: { label: 'Draft', variant: 'secondary' as const },
    submitted: { label: 'Submitted', variant: 'default' as const },
    psychotest: { label: 'Psychotest', variant: 'default' as const, className: 'bg-blue-600 hover:bg-blue-700' },
    reviewed: { label: 'Reviewed', variant: 'default' as const, className: 'bg-purple-600 hover:bg-purple-700' },
    interview: { label: 'Interview', variant: 'default' as const, className: 'bg-orange-500 hover:bg-orange-600' },
    hired: { label: 'Hired', variant: 'default' as const, className: 'bg-green-600 hover:bg-green-700' },
    rejected: { label: 'Rejected', variant: 'destructive' as const },
  };

  const config = statusConfig[status] || statusConfig.draft;

  return (
    <Badge variant={config.variant} className={cn('capitalize', config.className, className)}>
      {config.label}
    </Badge>
  );
}
