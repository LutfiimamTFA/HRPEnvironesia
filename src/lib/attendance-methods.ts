import type { Timestamp } from "firebase/firestore";

export const ATTENDANCE_METHODS = {
  FINGERPRINT: "fingerprint",
  WEB_PHOTO: "web_photo",
  HYBRID: "hybrid",
  EXEMPT: "exempt",
} as const;

export const ATTENDANCE_METHOD_LABELS = {
  fingerprint: "Fingerprint",
  web_photo: "Web Absen Foto",
  hybrid: "Hybrid",
  exempt: "Tidak Wajib Absen",
} as const;

export const ATTENDANCE_LOCATION_MODES = {
  OFFICE_SITE: "office_site",
  FREE_GPS: "free_gps",
  SPECIFIC_SITE: "specific_site",
} as const;

export const ATTENDANCE_LOCATION_MODE_LABELS = {
  office_site: "Kantor / Site Terdaftar",
  free_gps: "Bebas GPS",
  specific_site: "Site Tertentu",
} as const;

export interface AttendanceSettings {
  method: string;
  required: boolean;
  locationMode: string;
  siteIds: string[];
  policyNote?: string;
  updatedAt?: Timestamp | null;
  updatedBy?: string | null;
  updatedByName?: string | null;
}

/**
 * Default attendance settings based on employment type.
 * Interns/training get web_photo, regular employees get fingerprint.
 */
export function getDefaultAttendanceSettings(
  employmentType?: string,
  brandId?: string,
  sites?: Array<{ id?: string; brandId?: string; isActive: boolean }>
): AttendanceSettings {
  const defaultSiteIds = getDefaultSiteIds(brandId, sites);

  if (employmentType && ["magang", "training"].includes(employmentType)) {
    return {
      method: "web_photo",
      required: true,
      locationMode: "office_site",
      siteIds: defaultSiteIds,
    };
  }

  if (
    employmentType &&
    ["karyawan", "kontrak", "bulanan", "tahunan", "staff"].includes(
      employmentType
    )
  ) {
    return {
      method: "fingerprint",
      required: true,
      locationMode: "office_site",
      siteIds: defaultSiteIds,
    };
  }

  // Default for other types
  return {
    method: "exempt",
    required: false,
    locationMode: "office_site",
    siteIds: [],
  };
}

/**
 * Get default site IDs based on brand.
 * Returns active sites for the given brand.
 */
export function getDefaultSiteIds(
  brandId?: string,
  sites?: Array<{ id?: string; brandId?: string; isActive: boolean }>
): string[] {
  if (!sites || !brandId) return [];

  const brandSites = sites.filter(
    (s) => s.brandId === brandId && s.isActive
  );
  return brandSites
    .map((s) => s.id)
    .filter((id): id is string => id !== undefined);
}

/**
 * Get label for attendance method
 */
export function getAttendanceMethodLabel(method?: string): string {
  if (!method)
    return "Belum Diatur";
  return (
    ATTENDANCE_METHOD_LABELS[method as keyof typeof ATTENDANCE_METHOD_LABELS] ||
    method
  );
}

/**
 * Get label for location mode
 */
export function getLocationModeLabel(mode?: string): string {
  if (!mode) return "-";
  return (
    ATTENDANCE_LOCATION_MODE_LABELS[
      mode as keyof typeof ATTENDANCE_LOCATION_MODE_LABELS
    ] || mode
  );
}
