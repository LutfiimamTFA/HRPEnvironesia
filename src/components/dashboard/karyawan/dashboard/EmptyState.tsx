import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  compact?: boolean;
};

/** Shared "nothing here yet" treatment — icon + title + short copy + optional
 * CTA — used across the dashboard instead of a bare empty div/paragraph. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-6" : "py-10"}`}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <Icon className="h-5 w-5 text-slate-400" />
      </div>
      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">{description}</p>
      {actionLabel && (actionHref || onAction) && (
        <div className="mt-3">
          {actionHref ? (
            <Button asChild size="sm" variant="outline" className="rounded-lg font-semibold text-xs">
              <Link href={actionHref}>{actionLabel}</Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onAction} className="rounded-lg font-semibold text-xs">
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
