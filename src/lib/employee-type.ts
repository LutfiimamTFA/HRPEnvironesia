/**
 * Employee TYPE (magang/probation/kontrak/tetap/freelance) — deliberately
 * separate from employee-status.ts's operational status (active/inactive/
 * resigned/terminated). Mixing the two is exactly what caused Dashboard
 * Staff to show "Probation" for an employee HRD had already updated to
 * "Kontrak": the old combined resolver checked employmentStatus/statusKerja
 * (an operational-status field that can be left stale as "probation" after
 * HRD changes only the type) ahead of hrdEmploymentInfo.tipeKaryawan. This
 * module reads ONLY type-shaped fields — never employmentStatus/statusKerja
 * — so it can never regress to a stale status value once HRD updates the
 * employee's type.
 */

export type EmployeeTypeKey =
  | "magang"
  | "probation"
  | "kontrak"
  | "tetap"
  | "freelance"
  | "unknown";

export function normalizeEmployeeTypeValue(value: any): EmployeeTypeKey {
  const raw = String(value || "").trim().toLowerCase();

  if (["magang", "intern", "internship"].includes(raw)) return "magang";
  if (["probation", "masa percobaan", "percobaan"].includes(raw)) return "probation";
  if (["kontrak", "contract"].includes(raw)) return "kontrak";
  if (["tetap", "permanent", "karyawan tetap"].includes(raw)) return "tetap";
  if (["freelance", "harian"].includes(raw)) return "freelance";

  return "unknown";
}

/**
 * Tries every type-shaped field a profile/user doc might carry, in priority
 * order — hrdEmploymentInfo.tipeKaryawan first (the field HRD's "Ubah Tipe
 * Karyawan" form actually writes), down to the legacy top-level/user-profile
 * mirrors. Stops at the first candidate that normalizes to something other
 * than "unknown", so a fresh hrdEmploymentInfo.tipeKaryawan always wins over
 * a stale top-level employeeType left over from an older write path.
 */
export function resolveEmployeeType(employeeProfile: any, userProfile?: any): {
  type: EmployeeTypeKey;
  label: string;
  rawSource: string;
} {
  const hrdInfo = employeeProfile?.hrdEmploymentInfo || {};

  const candidates = [
    { key: "hrdEmploymentInfo.tipeKaryawan", value: hrdInfo.tipeKaryawan },
    { key: "hrdEmploymentInfo.employeeType", value: hrdInfo.employeeType },
    { key: "employeeProfile.tipeKaryawan", value: employeeProfile?.tipeKaryawan },
    { key: "employeeProfile.employeeType", value: employeeProfile?.employeeType },
    { key: "employeeProfile.employmentType", value: employeeProfile?.employmentType },
    { key: "userProfile.employmentType", value: userProfile?.employmentType },
  ];

  for (const item of candidates) {
    const type = normalizeEmployeeTypeValue(item.value);
    if (type !== "unknown") {
      return {
        type,
        label:
          type === "magang"
            ? "Magang"
            : type === "probation"
            ? "Probation"
            : type === "kontrak"
            ? "Kontrak"
            : type === "tetap"
            ? "Tetap"
            : type === "freelance"
            ? "Freelance"
            : "Belum Diatur",
        rawSource: item.key,
      };
    }
  }

  return {
    type: "unknown",
    label: "Belum Diatur",
    rawSource: "none",
  };
}
