import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status = 'draft' | 'submitted' | 'pending' | 'approved' | 'rejected' | 'result';

interface AssessmentStatusBadgeProps {
  status: Status;
  label?: string;
  className?: string;
}

export function AssessmentStatusBadge({ status, label, className }: AssessmentStatusBadgeProps) {
  const statusConfig: Record<Status, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-gray-200 text-gray-800 border-transparent' },
    submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-800 border-transparent' },
    pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800 border-transparent' },
    approved: { label: 'Approved', className: 'bg-green-100 text-green-800 border-transparent' },
    rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-transparent' },
    result: { label: label || 'Result', className: 'bg-indigo-100 text-indigo-800 border-transparent' },
  };

  const config = statusConfig[status] || statusConfig.draft;

  return (
    <Badge className={cn('capitalize', config.className, className)}>
      {label || config.label}
    </Badge>
  );
}
