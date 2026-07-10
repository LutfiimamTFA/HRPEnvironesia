/**
 * Helper functions untuk Monitoring Absensi HRP
 * Mengelola resolusi UID, event type, foto, dan alamat dari Web Absen data
 */

import type { EmployeeProfile, AttendanceEvent, AttendanceSite, WorkScheduleDay, WorkScheduleGroup } from '@/lib/types';

const DAY_ORDER: WorkScheduleDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABEL_ID: Record<WorkScheduleDay, string> = {
  monday: 'Senin', tuesday: 'Selasa', wednesday: 'Rabu', thursday: 'Kamis',
  friday: 'Jumat', saturday: 'Sabtu', sunday: 'Minggu',
};
const DAY_LABEL_SHORT: Record<WorkScheduleDay, string> = {
  monday: 'Sen', tuesday: 'Sel', wednesday: 'Rab', thursday: 'Kam',
  friday: 'Jum', saturday: 'Sab', sunday: 'Min',
};
const LEGACY_DAY_CODE_TO_SCHEDULE_DAY: Record<string, WorkScheduleDay> = {
  Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday',
  Fri: 'friday', Sat: 'saturday', Sun: 'sunday',
};

/** Compresses a set of days into a readable range, e.g. ["monday".."friday"] -> "Senin–Jumat". */
export function formatDaysRangeLabel(days: WorkScheduleDay[] | undefined | null, short = false): string {
  if (!days || days.length === 0) return 'Belum diatur';
  const labelMap = short ? DAY_LABEL_SHORT : DAY_LABEL_ID;
  const sorted = [...new Set(days)].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));

  // Detect one contiguous run over DAY_ORDER (no wraparound past Sunday).
  const indices = sorted.map((d) => DAY_ORDER.indexOf(d));
  const isContiguous = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);

  if (isContiguous && sorted.length > 1) {
    return `${labelMap[sorted[0]]}–${labelMap[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => labelMap[d]).join(', ');
}

/** Resolves the employee-facing "Hari Aktif" label, falling back to the legacy 3-letter `workDays` field. */
export function getActiveDaysLabel(site: Partial<Pick<AttendanceSite, 'activeDays' | 'workDays'>> | null | undefined): string {
  if (!site) return 'Belum diatur';
  if (site.activeDays && site.activeDays.length > 0) return formatDaysRangeLabel(site.activeDays);
  if (site.workDays && site.workDays.length > 0) {
    const mapped = site.workDays.map((code) => LEGACY_DAY_CODE_TO_SCHEDULE_DAY[code]).filter(Boolean) as WorkScheduleDay[];
    return formatDaysRangeLabel(mapped);
  }
  return 'Belum diatur';
}

/** Resolves the "Jadwal Kerja" label, e.g. "Senin–Kamis 08:00–17:00, Jumat 08:00–16:30". */
export function getWorkSchedulesLabel(site: Partial<Pick<AttendanceSite, 'workSchedules' | 'shift'>> | null | undefined): string {
  if (!site) return 'Belum diatur';
  if (site.workSchedules && site.workSchedules.length > 0) {
    return site.workSchedules
      .map((group) => `${formatDaysRangeLabel(group.days, true)} ${group.startTime}–${group.endTime}`)
      .join(', ');
  }
  if (site.shift) return `${site.shift.startTime}–${site.shift.endTime}`;
  return 'Belum diatur';
}

/**
 * Resolves the work schedule (start/end/break) that applies to a given day
 * for a site — checks the grouped workSchedules first, falling back to the
 * legacy single `shift`. Used by Monitoring Absensi so each brand's site can
 * have its own Mon-Thu vs Friday hours (item 11 of the site-settings spec).
 */
export function resolveScheduleForDay(
  site: Partial<Pick<AttendanceSite, 'workSchedules' | 'shift'>> | null | undefined,
  day: WorkScheduleDay,
): WorkScheduleGroup | null {
  if (!site) return null;
  const match = site.workSchedules?.find((group) => group.days.includes(day));
  if (match) return match;
  if (site.shift) return { days: [day], startTime: site.shift.startTime, endTime: site.shift.endTime };
  return null;
}

/**
 * Picks the attendance_sites doc that applies to a given employee's brand —
 * so "karyawan PT A ikut site PT A, karyawan PT B ikut site PT B" instead of
 * Monitoring Absensi using whichever site happens to be first/active.
 */
export function resolveSiteForBrand(
  sites: AttendanceSite[] | null | undefined,
  brandId: string | null | undefined,
): AttendanceSite | null {
  if (!sites || sites.length === 0) return null;
  if (brandId) {
    const matched = sites.find(
      (s) => s.isActive && (s.brandIds?.includes(brandId) || s.brandId === brandId),
    );
    if (matched) return matched;
  }
  return sites.find((s) => s.isActive) || null;
}

/** Looks up a single brand's display name — never returns the raw id. */
export function getBrandDisplayName(brandId: string, brandMap: Map<string, string>): string | null {
  return brandMap.get(brandId) || null;
}

/**
 * Resolves human-readable brand names for a site — never falls back to a raw
 * brandId. `brandIds` + `brandMap` is the primary source of truth (brandMap
 * comes from the live `brands` collection, so it's always current); any id
 * that can't be resolved there is dropped entirely rather than shown raw
 * (e.g. "9NTHilEqYtY4p7eANC6C"). The denormalized `site.brandNames` (written
 * at save time) is only used as a fallback for the rare case a site has no
 * `brandIds` at all — and even then, any stale entry that looks like it was
 * never resolved (i.e. matches one of the ids literally) is filtered out, since
 * that's exactly what an old buggy save-path used to embed as a "name".
 */
export function getBrandNamesForSite(
  site: Partial<Pick<AttendanceSite, 'brandNames' | 'brandIds' | 'brandId'>> | null | undefined,
  brandMap: Map<string, string>,
): string[] {
  if (!site) return [];

  const ids = site.brandIds && site.brandIds.length > 0 ? site.brandIds : (site.brandId ? [site.brandId] : []);
  if (ids.length > 0) {
    return ids.map((id) => getBrandDisplayName(id, brandMap)).filter((name): name is string => !!name);
  }

  if (site.brandNames && site.brandNames.length > 0) {
    return site.brandNames.filter(Boolean);
  }

  return [];
}

/** Same as getWorkSchedulesLabel but phrased as a full sentence fragment for the summary preview. */
export function getWorkSchedulesSentence(site: Partial<Pick<AttendanceSite, 'workSchedules' | 'shift'>> | null | undefined): string {
  if (!site) return 'jadwal belum diatur';
  if (site.workSchedules && site.workSchedules.length > 0) {
    return site.workSchedules
      .map((group) => {
        const breakPart = group.breakStart && group.breakEnd ? `, istirahat ${group.breakStart}–${group.breakEnd}` : '';
        return `${formatDaysRangeLabel(group.days, true)} masuk ${group.startTime} pulang ${group.endTime}${breakPart}`;
      })
      .join('; ');
  }
  if (site.shift) return `masuk ${site.shift.startTime} pulang ${site.shift.endTime}`;
  return 'jadwal belum diatur';
}

export interface ScheduleLine {
  daysLabel: string;
  timeLabel: string;
  breakLabel: string | null;
}

/**
 * Structured (non-paragraph) per-group schedule lines — e.g.
 * [{ daysLabel: "Sen–Kam", timeLabel: "08:00–17:00", breakLabel: "12:00–13:00" }, ...]
 * for rendering as short list items in cards instead of one long sentence.
 */
export function getWorkScheduleLines(site: Partial<Pick<AttendanceSite, 'workSchedules' | 'shift'>> | null | undefined): ScheduleLine[] {
  if (!site) return [];
  if (site.workSchedules && site.workSchedules.length > 0) {
    return site.workSchedules.map((group) => ({
      daysLabel: formatDaysRangeLabel(group.days, true),
      timeLabel: `${group.startTime}–${group.endTime}`,
      breakLabel: group.breakStart && group.breakEnd ? `${group.breakStart}–${group.breakEnd}` : null,
    }));
  }
  if (site.shift) return [{ daysLabel: '', timeLabel: `${site.shift.startTime}–${site.shift.endTime}`, breakLabel: null }];
  return [];
}

/**
 * One-paragraph plain-language summary of a site's rules — used as the
 * "Preview Pengaturan" panel in the create/edit dialog and as the recap line
 * under each row in the site list, so HRD doesn't have to piece the rules
 * together from separate table cells.
 */
export function getSiteSummaryText(
  site: Partial<Pick<
    AttendanceSite,
    | 'activeDays' | 'workDays' | 'workSchedules' | 'shift'
    | 'checkInRadiusMeters' | 'checkOutRadiusMeters' | 'radiusM' | 'useSameRadiusForCheckOut'
    | 'lateToleranceMinutes'
  >> | null | undefined,
  brandNames: string[],
): string {
  if (!site) return 'Pengaturan belum lengkap.';

  const brandPart = brandNames.length > 0
    ? `Site ini berlaku untuk ${brandNames.join(', ')}.`
    : 'Brand belum dipilih.';

  const hariPart = `Hari aktif ${getActiveDaysLabel(site)}.`;

  const jadwalPart = `${getWorkSchedulesSentence(site).replace(/^./, (c) => c.toUpperCase())}.`;

  const checkInRadius = site.checkInRadiusMeters ?? site.radiusM;
  const checkOutRadius = site.checkOutRadiusMeters ?? site.radiusM;
  const radiusPart = checkInRadius === checkOutRadius
    ? `Radius masuk/pulang ${checkInRadius} meter.`
    : `Radius masuk ${checkInRadius} meter, radius pulang ${checkOutRadius} meter.`;

  const toleransiPart = typeof site.lateToleranceMinutes === 'number'
    ? `Toleransi telat ${site.lateToleranceMinutes} menit.`
    : '';

  return [brandPart, hariPart, jadwalPart, radiusPart, toleransiPart].filter(Boolean).join(' ');
}

/**
 * Resolve UID dari employee profile dengan fallback logic
 */
export function resolveProfileUid(profile: any): string | null {
  return (
    profile.uid ||
    profile.userId ||
    profile.authUid ||
    profile.employeeUid ||
    profile.id ||
    profile.__id ||
    null
  );
}

/**
 * Resolve UID dari attendance event dengan fallback logic
 */
export function resolveEventUid(event: any): string | null {
  // employeeId is deliberately NOT used here — many events don't have it set,
  // whereas the uid-family fields are populated by the Web Absen/AbsenHRP app
  // on every event. employeeUid takes priority since it's the field name that
  // app uses most consistently for the acting employee.
  return (
    event.employeeUid ||
    event.uid ||
    event.userId ||
    event.ownerUid ||
    event.createdBy ||
    event.employee?.uid ||
    null
  );
}

/**
 * Monitoring Absensi join key #1 — employee UID. Multiple field names have
 * been observed on real attendance_events docs depending on which write path
 * produced them; employeeId is included as a last resort here even though
 * resolveEventUid() above deliberately omits it, per the Monitoring Absensi
 * join-fix spec.
 */
export function getEventEmployeeUid(event: any): string {
  if (!event) return '';
  return event.employeeUid || event.uid || event.userId || event.employeeId || '';
}

/**
 * Monitoring Absensi join key #2 — the event's calendar date, in Asia/Jakarta
 * local time. Falls back to deriving it from whichever timestamp field the
 * doc actually has when `dateKey` (or its aliases) is missing.
 */
export function getEventDateKey(event: any): string {
  if (!event) return '';
  const direct = event.dateKey || event.attendanceDate || event.localDate;
  if (direct) return direct;

  const raw = event.createdAt || event.timestamp || event.tsServer || event.tsClient;
  if (!raw) return '';
  try {
    const date = raw.toDate ? raw.toDate() : new Date(raw);
    if (isNaN(date.getTime())) return '';
    // en-CA locale formats as YYYY-MM-DD, which is exactly dateKey's format.
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
  } catch {
    return '';
  }
}

/**
 * Monitoring Absensi join key #3 — normalized event type. Recognizes every
 * field name and value spelling seen across write paths and buckets them into
 * "tap_in" / "tap_out" (or "" if unrecognized).
 */
export function getEventType(event: any): 'tap_in' | 'tap_out' | '' {
  if (!event) return '';
  const raw = (event.eventType || event.type || event.action || event.tapType || event.checkType || '').toString().toLowerCase();
  if (['tap_in', 'in', 'check_in', 'clock_in', 'masuk', 'kehadiran_masuk'].includes(raw)) return 'tap_in';
  if (['tap_out', 'out', 'check_out', 'clock_out', 'pulang', 'kehadiran_pulang'].includes(raw)) return 'tap_out';
  return '';
}

/**
 * Event type yang menunjukkan Kehadiran Masuk (Check In)
 * Support: IN, in, tap_in, check_in, clock_in, kehadiran_masuk, masuk
 */
export function isCheckInEvent(type: string): boolean {
  const checkInTypes = [
    'in',
    'tap_in',
    'check_in',
    'clock_in',
    'kehadiran_masuk',
    'masuk',
  ];
  const normalizedType = (type || '').toLowerCase();
  return checkInTypes.includes(normalizedType);
}

/**
 * Event type yang menunjukkan Kehadiran Pulang (Check Out)
 * Support: OUT, out, tap_out, check_out, clock_out, kehadiran_pulang, pulang
 */
export function isCheckOutEvent(type: string): boolean {
  const checkOutTypes = [
    'out',
    'tap_out',
    'check_out',
    'clock_out',
    'kehadiran_pulang',
    'pulang',
  ];
  const normalizedType = (type || '').toLowerCase();
  return checkOutTypes.includes(normalizedType);
}

/**
 * Resolve foto/evidence dari attendance event
 */
export function resolvePhotoUrl(event: any): string | null {
  if (!event) return null;

  // Cari di evidence object
  if (event.evidence) {
    return (
      event.evidence.driveViewUrl ||
      event.evidence.driveDownloadUrl ||
      event.evidence.selfieUrl ||
      event.evidence.watermarkedSelfieUrl ||
      null
    );
  }

  // Fallback ke top-level fields
  return (
    event.photoUrl ||
    event.photoURL ||
    event.selfieUrl ||
    event.imageUrl ||
    event.evidenceUrl ||
    null
  );
}

/**
 * Resolve alamat lengkap dari attendance event
 */
export function resolveAddress(event: any): string {
  if (!event) return '-';

  // Priority 1: Direct address fields
  if (event.address) return event.address;
  if (event.fullAddress) return event.fullAddress;

  // Priority 2: Location object
  if (event.location?.address) return event.location.address;
  if (event.location?.fullAddress) return event.location.fullAddress;

  // Priority 3: Address detail object
  if (event.addressDetail?.fullAddress) return event.addressDetail.fullAddress;

  // Priority 4: Build from addressDetail components
  if (event.addressDetail) {
    const { road, village, city, state } = event.addressDetail;
    const parts = [road, village, city, state].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(', ');
    }
  }

  // Priority 5: Coordinates
  if (event.coordinates?.latitude && event.coordinates?.longitude) {
    return `${event.coordinates.latitude}, ${event.coordinates.longitude}`;
  }

  // Priority 6: Geo object
  if (event.geo?.lat && event.geo?.lng) {
    return `${event.geo.lat}, ${event.geo.lng}`;
  }

  // Priority 7: location.coordinates
  if (event.location?.coordinates?.lat && event.location?.coordinates?.lng) {
    return `${event.location.coordinates.lat}, ${event.location.coordinates.lng}`;
  }

  return '-';
}

/**
 * Resolve coordinates dari attendance event
 */
export function resolveCoordinates(event: any): { latitude: number; longitude: number } | null {
  if (!event) return null;

  if (event.coordinates?.latitude && event.coordinates?.longitude) {
    return {
      latitude: event.coordinates.latitude,
      longitude: event.coordinates.longitude,
    };
  }

  if (event.location?.latitude && event.location?.longitude) {
    return {
      latitude: event.location.latitude,
      longitude: event.location.longitude,
    };
  }

  return null;
}

/**
 * Get timestamp dari event dengan berbagai fallback
 */
export function getEventTimestamp(event: any): Date | null {
  if (!event) return null;

  const isValidDate = (date: any): boolean => {
    return date instanceof Date && !isNaN(date.getTime());
  };

  // Priority 1: tsClient
  if (event.tsClient) {
    try {
      const date = event.tsClient.toDate ? event.tsClient.toDate() : new Date(event.tsClient);
      if (isValidDate(date)) return date;
    } catch {}
  }

  // Priority 2: tsServer
  if (event.tsServer) {
    try {
      const date = event.tsServer.toDate ? event.tsServer.toDate() : new Date(event.tsServer);
      if (isValidDate(date)) return date;
    } catch {}
  }

  // Priority 3: datetime.iso
  if (event.datetime?.iso) {
    try {
      const date = new Date(event.datetime.iso);
      if (isValidDate(date)) return date;
    } catch {}
  }

  // Priority 4: Build from datetime components
  if (event.datetime?.year && event.datetime?.month && event.datetime?.day) {
    try {
      const hour = event.datetime.hour || 0;
      const minute = event.datetime.minute || 0;
      const second = event.datetime.second || 0;
      const date = new Date(
        event.datetime.year,
        event.datetime.month - 1, // JS month is 0-indexed
        event.datetime.day,
        hour,
        minute,
        second
      );
      if (isValidDate(date)) return date;
    } catch {}
  }

  // Priority 5: createdAt
  if (event.createdAt) {
    try {
      const date = event.createdAt.toDate ? event.createdAt.toDate() : new Date(event.createdAt);
      if (isValidDate(date)) return date;
    } catch {}
  }

  // Priority 6: timestamp / ts (documented aliases on AttendanceEvent)
  const aliasTimestamp = event.timestamp || event.ts;
  if (aliasTimestamp) {
    try {
      const date = aliasTimestamp.toDate ? aliasTimestamp.toDate() : new Date(aliasTimestamp);
      if (isValidDate(date)) return date;
    } catch {}
  }

  return null;
}

/**
 * Format jam dari timestamp/Date
 */
export function formatTime(timestamp: any): string {
  if (!timestamp) return '-';

  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '-';
  }
}

/**
 * Hitung late minutes dari jam masuk vs jam kerja
 */
export function calculateLateMinutes(
  checkInTime: any,
  shiftStartTime: string // format "HH:mm"
): number | null {
  if (!checkInTime || !shiftStartTime) return null;

  try {
    const checkInDate = checkInTime.toDate ? checkInTime.toDate() : new Date(checkInTime);
    const [shiftHour, shiftMinute] = shiftStartTime.split(':').map(Number);

    const shiftStart = new Date(checkInDate);
    shiftStart.setHours(shiftHour, shiftMinute, 0, 0);

    if (checkInDate > shiftStart) {
      const diffMs = checkInDate.getTime() - shiftStart.getTime();
      return Math.round(diffMs / 60000); // Convert to minutes
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Hitung early leave minutes dari jam pulang vs jam kerja
 */
export function calculateEarlyLeaveMinutes(
  checkOutTime: any,
  shiftEndTime: string // format "HH:mm"
): number | null {
  if (!checkOutTime || !shiftEndTime) return null;

  try {
    const checkOutDate = checkOutTime.toDate ? checkOutTime.toDate() : new Date(checkOutTime);
    const [shiftHour, shiftMinute] = shiftEndTime.split(':').map(Number);

    const shiftEnd = new Date(checkOutDate);
    shiftEnd.setHours(shiftHour, shiftMinute, 0, 0);

    if (checkOutDate < shiftEnd) {
      const diffMs = shiftEnd.getTime() - checkOutDate.getTime();
      return Math.round(diffMs / 60000); // Convert to minutes
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Haversine distance in meters between two lat/lng points.
 */
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const LOW_GPS_ACCURACY_THRESHOLD_M = 100;

// How far past the site's configured radius before it's "signifikan" rather
// than "ringan" — e.g. radius 20m + 15m tolerance = up to 35m is still just
// a minor overshoot (matches the "0-20 sesuai / 21-35 ringan / >35 signifikan" spec).
const RADIUS_MINOR_EXCESS_TOLERANCE_M = 15;

export type LocationMatchResult = "match" | "no_match" | "unknown";

export type RadiusStatus = "sesuai" | "ringan" | "signifikan" | "unknown";

export const RADIUS_STATUS_LABEL: Record<RadiusStatus, string> = {
  sesuai: "Sesuai Radius",
  ringan: "Melebihi Radius Ringan",
  signifikan: "Melebihi Radius Signifikan",
  unknown: "Perlu Verifikasi Lokasi",
};

export interface LocationValidation {
  addressMatch: LocationMatchResult;
  radiusMatch: LocationMatchResult;
  gpsAccuracyLow: boolean;
  /** true when the check-in should be treated as automatically valid (jalan cocok OR radius cocok, and GPS accuracy is acceptable). */
  isValidAuto: boolean;
  /** Plain-language badges to render, in priority order. */
  badges: string[];
  /** Actual GPS distance from the site's office point, in meters (null if not computable). */
  distanceM: number | null;
  /** The site's configured radius, in meters (null if not configured). */
  radiusM: number | null;
  /** distanceM - radiusM — positive means outside the radius, null if not computable. */
  excessM: number | null;
  radiusStatus: RadiusStatus;
  /** Ready-to-render sentence, e.g. "Melebihi radius 10 m dari batas 20 m" or "Lokasi terdeteksi 15 m dari titik kantor". */
  radiusSummary: string;
}

/**
 * Validates a tap-in/out location against BOTH GPS radius and street-name
 * keywords from the site's master config — never radius alone. A mismatch or
 * missing data never auto-rejects; it always falls into "Perlu Review" so an
 * HRD can look at it, per "jangan otomatis ditolak".
 */
export function validateAttendanceLocation(
  event: any,
  site: { office?: { lat: number; lng: number }; radiusM?: number; validAddressKeywords?: string[] } | null | undefined,
): LocationValidation {
  const address = resolveAddress(event);
  const coords = event?.location?.lat != null && event?.location?.lng != null
    ? { lat: event.location.lat, lng: event.location.lng }
    : resolveCoordinates(event)
      ? { lat: resolveCoordinates(event)!.latitude, lng: resolveCoordinates(event)!.longitude }
      : null;
  const gpsAccuracy: number | null = typeof event?.gpsAccuracy === "number" ? event.gpsAccuracy : null;

  // Address / street-name match
  let addressMatch: LocationMatchResult = "unknown";
  const keywords = site?.validAddressKeywords?.filter(Boolean) ?? [];
  if (keywords.length > 0 && address && address !== "-") {
    const normalizedAddress = address.toLowerCase();
    addressMatch = keywords.some((kw) => normalizedAddress.includes(kw.toLowerCase())) ? "match" : "no_match";
  }

  // GPS radius match + distance/excess bookkeeping for a professional readout
  // (not just "match"/"no_match" — HRD wants to see the actual meters).
  let radiusMatch: LocationMatchResult = "unknown";
  let distanceM: number | null = null;
  let radiusM: number | null = typeof site?.radiusM === "number" ? site.radiusM : null;
  let excessM: number | null = null;
  let radiusStatus: RadiusStatus = "unknown";

  if (coords && site?.office && typeof site.radiusM === "number") {
    distanceM = Math.round(distanceMeters(coords, site.office));
    radiusMatch = distanceM <= site.radiusM ? "match" : "no_match";
    excessM = distanceM - site.radiusM;
    if (excessM <= 0) radiusStatus = "sesuai";
    else if (excessM <= RADIUS_MINOR_EXCESS_TOLERANCE_M) radiusStatus = "ringan";
    else radiusStatus = "signifikan";
  }

  const radiusSummary =
    excessM !== null && radiusM !== null
      ? excessM <= 0
        ? `Sesuai radius (${distanceM} m dari titik kantor, batas ${radiusM} m)`
        : `Melebihi radius ${excessM} m dari batas ${radiusM} m`
      : distanceM !== null
        ? `Lokasi terdeteksi ${distanceM} m dari titik kantor`
        : "Radius kantor belum dikonfigurasi — perlu verifikasi lokasi";

  const gpsAccuracyLow = gpsAccuracy !== null && gpsAccuracy > LOW_GPS_ACCURACY_THRESHOLD_M;

  const isValidAuto = !gpsAccuracyLow && (addressMatch === "match" || radiusMatch === "match");

  const badges: string[] = [];
  if (addressMatch === "match") badges.push("Jalan Cocok");
  if (radiusStatus === "sesuai") badges.push("Radius Sesuai");
  if (radiusStatus === "ringan") badges.push(`+${excessM}m dari batas`);
  if (radiusStatus === "signifikan") badges.push("Melebihi Radius");
  if (addressMatch === "no_match") badges.push("Nama Jalan Tidak Cocok");
  if (gpsAccuracyLow) badges.push("GPS Akurasi Rendah");
  if (badges.length === 0) badges.push(isValidAuto ? "Valid Otomatis" : "Perlu Review");

  return {
    addressMatch,
    radiusMatch,
    gpsAccuracyLow,
    isValidAuto,
    badges,
    distanceM,
    radiusM,
    excessM,
    radiusStatus,
    radiusSummary,
  };
}

// ── Kondisi Lapangan — categorizes the employee's own explanation for an ──
// off-site/out-of-radius tap, so HRD sees "Kendala Perjalanan: ban bocor"
// instead of a bare "Perlu Review". Real docs may carry an explicit category
// field (fieldConditionCategory/conditionCategory/kondisiLapangan) from
// newer Web Absen versions; older ones only have a free-text note, so this
// also infers a category from keywords as a fallback — never blocking, just
// a best-effort label for HRD to scan quickly.
export type FieldConditionCategory =
  | "normal"
  | "tugas_kantor"
  | "perjalanan_dinas"
  | "kendala_perjalanan"
  | "kendaraan_bermasalah"
  | "kondisi_darurat"
  | "alasan_pribadi"
  | "gps_bermasalah"
  | "lupa_tap_out"
  | "lokasi_perlu_review";

export const FIELD_CONDITION_LABEL: Record<FieldConditionCategory, string> = {
  normal: "Normal / Sesuai Area",
  tugas_kantor: "Tugas Kantor",
  perjalanan_dinas: "Perjalanan Dinas",
  kendala_perjalanan: "Kendala Perjalanan",
  kendaraan_bermasalah: "Kendaraan Bermasalah",
  kondisi_darurat: "Kondisi Darurat",
  alasan_pribadi: "Alasan Pribadi",
  gps_bermasalah: "GPS/Internet Bermasalah",
  lupa_tap_out: "Lupa Tap Out",
  lokasi_perlu_review: "Lokasi Perlu Review",
};

const FIELD_CONDITION_KEYWORDS: Array<[FieldConditionCategory, string[]]> = [
  ["kendaraan_bermasalah", ["ban bocor", "mogok", "kendaraan bermasalah", "kendaraan rusak", "motor mogok", "mobil mogok"]],
  ["kendala_perjalanan", ["macet", "kemacetan", "kendala perjalanan", "terjebak macet", "banjir", "kecelakaan"]],
  ["perjalanan_dinas", ["dinas luar", "perjalanan dinas", "sedang dinas", "tugas dinas", "dinas ke"]],
  ["tugas_kantor", ["tugas kantor", "kunjungan lapangan", "visit klien", "bertemu klien", "kunjungan klien", "meeting klien", "tugas kerja", "tugas perusahaan"]],
  ["kondisi_darurat", ["darurat", "emergency", "kecelakaan", "sakit mendadak", "rumah sakit"]],
  ["alasan_pribadi", ["keperluan pribadi", "urusan pribadi", "alasan pribadi", "keperluan keluarga", "keperluan mendesak"]],
  ["gps_bermasalah", ["gps tidak akurat", "gps error", "sinyal", "internet bermasalah", "lokasi tidak akurat", "gps bermasalah"]],
  ["lupa_tap_out", ["lupa tap out", "lupa absen pulang", "lupa checkout"]],
];

export interface FieldConditionResult {
  category: FieldConditionCategory;
  categoryLabel: string;
  /** The employee's own free-text explanation, if any. */
  reasonText: string | null;
}

export function classifyFieldCondition(
  event: any,
  locationValidation?: LocationValidation | null,
): FieldConditionResult {
  const explicitCategory: string | null =
    event?.fieldConditionCategory || event?.conditionCategory || event?.kondisiLapangan || null;
  const reasonText: string | null =
    event?.specialCondition || event?.reasonText || event?.conditionNote || event?.employeeNote || null;

  if (explicitCategory) {
    const normalized = explicitCategory.toString().toLowerCase().replace(/\s+/g, "_");
    if (normalized in FIELD_CONDITION_LABEL) {
      const category = normalized as FieldConditionCategory;
      return { category, categoryLabel: FIELD_CONDITION_LABEL[category], reasonText };
    }
  }

  if (reasonText) {
    const normalizedReason = reasonText.toLowerCase();
    for (const [category, keywords] of FIELD_CONDITION_KEYWORDS) {
      if (keywords.some((kw) => normalizedReason.includes(kw))) {
        return { category, categoryLabel: FIELD_CONDITION_LABEL[category], reasonText };
      }
    }
  }

  if (locationValidation && !locationValidation.isValidAuto) {
    return { category: "lokasi_perlu_review", categoryLabel: FIELD_CONDITION_LABEL.lokasi_perlu_review, reasonText };
  }

  return { category: "normal", categoryLabel: FIELD_CONDITION_LABEL.normal, reasonText };
}

/**
 * Determine status dari check in/out events
 */
export function determineStatus(
  hasCheckIn: boolean,
  hasCheckOut: boolean,
  isOnLeave: boolean
): string {
  if (isOnLeave) return 'Cuti Tahunan';
  if (hasCheckIn && hasCheckOut) return 'Selesai';
  if (hasCheckIn && !hasCheckOut) return 'Sedang Bekerja';
  return 'Belum Tap In';
}
