/**
 * Helper functions untuk Monitoring Absensi HRP
 * Mengelola resolusi UID, event type, foto, dan alamat dari Web Absen data
 */

import type { EmployeeProfile, AttendanceEvent } from '@/lib/types';

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
  return (
    event.uid ||
    event.employeeUid ||
    event.userId ||
    event.ownerUid ||
    event.createdBy ||
    event.employee?.uid ||
    null
  );
}

/**
 * Event type yang menunjukkan Kehadiran Masuk (Check In)
 * Support: IN, in, tap_in, check_in, kehadiran_masuk, masuk
 */
export function isCheckInEvent(type: string): boolean {
  const checkInTypes = [
    'in',
    'tap_in',
    'check_in',
    'kehadiran_masuk',
    'masuk',
  ];
  const normalizedType = (type || '').toLowerCase();
  return checkInTypes.includes(normalizedType);
}

/**
 * Event type yang menunjukkan Kehadiran Pulang (Check Out)
 * Support: OUT, out, tap_out, check_out, kehadiran_pulang, pulang
 */
export function isCheckOutEvent(type: string): boolean {
  const checkOutTypes = [
    'out',
    'tap_out',
    'check_out',
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
    event.selfieUrl ||
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
