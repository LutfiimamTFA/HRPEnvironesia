import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JobApplicationStatus } from "@/lib/types";
import { ORDERED_RECRUITMENT_STAGES } from "@/lib/types";

export const statusDisplayLabels: Record<JobApplicationStatus, string> = {
    draft: 'Draf',
    submitted: 'Lamaran Diterima',
    screening: 'Screening',
    tes_kepribadian: 'Tes Kepribadian',
    document_submission: 'Dokumen',
    interview: 'Wawancara',
    hired: 'Diterima Kerja',
    rejected: 'Ditolak',
    verification: "Verifikasi Dokumen", // Fallback, should not be used
};

interface ApplicationStatusBadgeProps {
  status: JobApplicationStatus;
  className?: string;
}

export function ApplicationStatusBadge({ status, className }: ApplicationStatusBadgeProps) {
  const statusConfig = {
    draft: { label: statusDisplayLabels.draft, variant: 'secondary' as const },
    submitted: { label: statusDisplayLabels.submitted, variant: 'default' as const },
    screening: { label: statusDisplayLabels.screening, variant: 'default' as const, className: 'bg-cyan-600 hover:bg-cyan-700' },
    tes_kepribadian: { label: statusDisplayLabels.tes_kepribadian, variant: 'default' as const, className: 'bg-blue-600 hover:bg-blue-700' },
    document_submission: { label: statusDisplayLabels.document_submission, variant: 'default' as const, className: 'bg-indigo-500 hover:bg-indigo-600' },
    verification: { label: statusDisplayLabels.verification, variant: 'default' as const, className: 'bg-purple-600 hover:bg-purple-700' },
    interview: { label: statusDisplayLabels.interview, variant: 'default' as const, className: 'bg-orange-500 hover:bg-orange-600' },
    hired: { label: statusDisplayLabels.hired, variant: 'default' as const, className: 'bg-green-600 hover:bg-green-700' },
    rejected: { label: statusDisplayLabels.rejected, variant: 'destructive' as const },
  };

  const config = statusConfig[status] || statusConfig.draft;

  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
