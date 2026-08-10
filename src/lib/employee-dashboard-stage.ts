import type { EmployeeProfile, UserProfile } from "@/lib/types";
import { normalizeEmployeeOperationalStatus } from "@/lib/employee-status";

/**
 * The four buckets the karyawan dashboard adapts its content around. Built
 * on top of normalizeEmployeeOperationalStatus() (employee-status.ts) rather
 * than re-deriving from the raw hrdEmploymentInfo fields, so this dashboard
 * and every other status-aware screen in the app never disagree about which
 * bucket someone is in. "training" folds into "probation" (same dashboard
 * treatment — masa evaluasi); resigned/terminated fall back to "unknown"
 * since neither should normally be looking at this dashboard.
 */
export type EmploymentStageKey = "magang" | "probation" | "kontrak" | "tetap" | "unknown";

export type EmploymentStageInfo = {
  stage: EmploymentStageKey;
  label: string;
};

export function resolveEmploymentStage(
  user: UserProfile | null | undefined,
  profile: EmployeeProfile | null | undefined,
): EmploymentStageInfo {
  const operational = normalizeEmployeeOperationalStatus(profile, profile, user);
  switch (operational) {
    case "intern":
      return { stage: "magang", label: "Magang" };
    case "probation":
    case "training":
      return { stage: "probation", label: "Probation" };
    case "contract":
      return { stage: "kontrak", label: "Kontrak" };
    case "active":
      return { stage: "tetap", label: "Tetap" };
    default:
      return { stage: "unknown", label: "Belum Diatur" };
  }
}

/** Accepts a Firestore Timestamp, ISO/date string, or Date — returns a Date or null. */
export function toJsDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fallbackText(value: any, fallback = "Belum diatur"): string {
  if (value === null || value === undefined) return fallback;
  const str = String(value).trim();
  return str.length > 0 ? str : fallback;
}
