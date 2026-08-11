import { EmployeeMasterData, EmployeeProfile, UserProfile } from "./types";
import { resolveEmployeeType } from "./employee-type";

/**
 * OperationalStatus defines the high-level operational status for filtering and grouping.
 */
export type OperationalStatus = 
  | "active" 
  | "training" 
  | "intern" 
  | "probation" 
  | "contract" 
  | "resigned" 
  | "terminated" 
  | "unknown";

/**
 * Normalizes various status and type fields from employees, profiles, and users 
 * into a single operational status string.
 */
export function normalizeEmployeeOperationalStatus(
  employee?: any,
  profile?: any,
  user?: any
): OperationalStatus {
  // Extract and clean values from multiple possible locations
  const getCleanVal = (val: any) => String(val || "").toLowerCase().trim();

  // employmentStatus/statusKerja are OPERATIONAL fields — active/inactive/
  // resigned/terminated — never a source of employee TYPE. They used to be
  // checked ahead of the type fields below, which meant a stale
  // employmentStatus="probation" left over from before HRD updated the
  // employee's type kept overriding a fresh hrdEmploymentInfo.tipeKaryawan
  // of "Kontrak" — exactly the Dashboard Staff mismatch this was fixed for.
  const statusFields = [
    employee?.employmentStatus,
    employee?.hrdEmploymentInfo?.employmentStatus,
    employee?.status,
    employee?.statusKerja,
    employee?.hrdEmploymentInfo?.statusKerja,
    profile?.hrdEmploymentInfo?.statusKerja,
    profile?.hrdEmploymentInfo?.employmentStatus,
    employee?.workStatus,
  ];

  const roleFallback = getCleanVal(user?.role);

  // Check Resigned / Terminated first as they are final states, regardless
  // of employee type — a resigned ex-contract-employee is "resigned", not
  // "contract".
  for (const s of statusFields) {
    const val = getCleanVal(s);
    if (val === "resigned") return "resigned";
    if (val === "terminated") return "terminated";
  }

  // "training" is a genuine legacy operational-status value (not a type),
  // kept as its own bucket for parity with pre-existing callers/dashboards
  // that treat it the same as probation.
  for (const s of statusFields) {
    const val = getCleanVal(s);
    if (val === "training") return "training";
  }

  // Employee TYPE (magang/probation/kontrak/tetap) comes from
  // resolveEmployeeType() (employee-type.ts) ONLY — it never reads
  // employmentStatus/statusKerja, so a fresh hrdEmploymentInfo.tipeKaryawan
  // always wins here regardless of what the legacy status fields still say.
  // Tries `profile` first (employee_profiles — the canonical HRD-managed
  // doc), then `employee` (the older employees/master-data doc) as a
  // fallback for records that predate employee_profiles.
  const resolvedType = resolveEmployeeType(profile, user).type !== "unknown"
    ? resolveEmployeeType(profile, user).type
    : resolveEmployeeType(employee, user).type;

  if (resolvedType === "magang") return "intern";
  if (resolvedType === "probation") return "probation";
  if (resolvedType === "kontrak") return "contract";
  if (resolvedType === "tetap") return "active";

  // No type field resolved — fall back to legacy status-field values, then role.
  for (const s of statusFields) {
    const val = getCleanVal(s);
    if (["karyawan", "active", "aktif"].includes(val)) return "active";
  }

  if (roleFallback === "karyawan") return "active";

  return "unknown";
}

/**
 * Helper to get user-friendly label for the operational status
 */
export function getOperationalStatusLabel(status: OperationalStatus): string {
  switch (status) {
    case "active": return "Aktif";
    case "training": return "Training";
    case "intern": return "Magang";
    case "probation": return "Percobaan";
    case "contract": return "Kontrak";
    case "resigned": return "Resigned";
    case "terminated": return "Terminated";
    default: return "Belum diatur";
  }
}

/**
 * Helper to get color/variant for status badges
 */
export function getOperationalStatusVariant(status: OperationalStatus): string {
  switch (status) {
    case "active": return "success";
    case "training": return "warning";
    case "intern": return "info";
    case "probation": return "warning";
    case "contract": return "default";
    case "resigned": return "destructive";
    case "terminated": return "destructive";
    default: return "outline";
  }
}
