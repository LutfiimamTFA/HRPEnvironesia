/**
 * Daily Attendance Summary utilities
 * Generates comprehensive daily attendance summaries from employee profiles and events
 */

import type { EmployeeProfile, AttendanceEvent } from '@/lib/types';
import { differenceInMinutes, format } from 'date-fns';

export interface DailyAttendanceSummary {
  uid: string;
  employeeNumber: string;
  employeeName: string;
  brandId?: string;
  brandName: string;
  divisionName: string;
  attendanceDate: string;

  // Attendance times
  tapInTime: string | null;
  tapOutTime: string | null;

  // Status
  status: 'belum-tap-in' | 'sedang-bekerja' | 'selesai' | 'cuti' | 'invalid';

  // Metrics
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  workDurationMinutes: number | null;

  // Metadata
  isInvalid: boolean;
  payrollExcluded: boolean;
  attendanceMethod: 'id_card' | 'web_absen' | 'not_set';

  // Raw event data
  checkInEvent?: AttendanceEvent;
  checkOutEvent?: AttendanceEvent;
}

/**
 * Generate daily attendance summary for a single employee
 */
export function generateDailySummary(
  employee: EmployeeProfile,
  attendanceDate: string,
  checkInEvent?: AttendanceEvent,
  checkOutEvent?: AttendanceEvent,
  graceLateMinutes: number = 0
): DailyAttendanceSummary {
  const brandName = (employee as any).hrdEmploymentInfo?.brandName ||
                   employee.brandName ||
                   (employee as any).companyName ||
                   '-';

  const divisionName = (employee as any).hrdEmploymentInfo?.divisionName ||
                       (employee as any).hrdEmploymentInfo?.divisi ||
                       employee.divisionName ||
                       (employee as any).division ||
                       '-';

  const employeeName = employee.fullName ||
                      employee.dataDiriIdentitas?.fullName ||
                      (employee as any).namaLengkap ||
                      employee.name ||
                      'Data karyawan belum lengkap';

  const employeeNumber = employee.employeeNumber ||
                        (employee as any).employeeId ||
                        (employee as any).employeeCode ||
                        'ID belum diatur';

  // Get timestamps
  const tapInTime = checkInEvent ? getTimeString(checkInEvent) : null;
  const tapOutTime = checkOutEvent ? getTimeString(checkOutEvent) : null;

  // Check if marked invalid
  const isInvalid = checkInEvent?.isInvalid || checkOutEvent?.isInvalid || false;

  // Determine status
  let status: DailyAttendanceSummary['status'] = 'belum-tap-in';
  if (isInvalid) {
    status = 'invalid';
  } else if (tapInTime && tapOutTime) {
    status = 'selesai';
  } else if (tapInTime && !tapOutTime) {
    status = 'sedang-bekerja';
  }

  // Calculate late minutes
  let lateMinutes: number | null = null;
  if (checkInEvent && tapInTime) {
    const shiftStart = new Date(attendanceDate);
    // Default shift start: 09:00
    shiftStart.setHours(9, graceLateMinutes, 0, 0);

    const tapInDate = getEventDate(checkInEvent);
    if (tapInDate && tapInDate > shiftStart) {
      lateMinutes = differenceInMinutes(tapInDate, shiftStart);
    }
  }

  // Calculate early leave minutes
  let earlyLeaveMinutes: number | null = null;
  if (checkOutEvent && tapOutTime) {
    const shiftEnd = new Date(attendanceDate);
    // Default shift end: 17:00
    shiftEnd.setHours(17, 0, 0, 0);

    const tapOutDate = getEventDate(checkOutEvent);
    if (tapOutDate && tapOutDate < shiftEnd) {
      earlyLeaveMinutes = differenceInMinutes(shiftEnd, tapOutDate);
    }
  }

  // Calculate work duration
  let workDurationMinutes: number | null = null;
  if (checkInEvent && checkOutEvent) {
    const tapInDate = getEventDate(checkInEvent);
    const tapOutDate = getEventDate(checkOutEvent);
    if (tapInDate && tapOutDate) {
      workDurationMinutes = differenceInMinutes(tapOutDate, tapInDate);
    }
  }

  return {
    uid: employee.id || '',
    employeeNumber,
    employeeName,
    brandId: (employee as any).hrdEmploymentInfo?.brandId || employee.brandId,
    brandName,
    divisionName,
    attendanceDate,
    tapInTime,
    tapOutTime,
    status,
    lateMinutes,
    earlyLeaveMinutes,
    workDurationMinutes,
    isInvalid,
    payrollExcluded: (checkInEvent?.payrollExcluded || checkOutEvent?.payrollExcluded) || false,
    attendanceMethod: (employee.attendanceMethod || 'not_set') as 'id_card' | 'web_absen' | 'not_set',
    checkInEvent,
    checkOutEvent,
  };
}

/**
 * Helper: Get event timestamp as Date
 */
function getEventDate(event: AttendanceEvent): Date | null {
  // Try different timestamp fields
  const timestamp = event.tsServer || event.tsClient || event.createdAt;
  if (!timestamp) return null;

  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'number') return new Date(timestamp);
  if (typeof timestamp === 'string') return new Date(timestamp);

  // Try Firestore Timestamp
  if (typeof timestamp === 'object' && 'toDate' in timestamp) {
    return (timestamp as any).toDate();
  }

  return null;
}

/**
 * Helper: Format event time as HH:mm
 */
function getTimeString(event: AttendanceEvent): string {
  const date = getEventDate(event);
  if (!date) return '-';

  try {
    return format(date, 'HH:mm');
  } catch {
    return '-';
  }
}

/**
 * Calculate summary statistics from attendance summaries
 */
export function calculateDailySummaryStats(summaries: DailyAttendanceSummary[]) {
  return {
    total: summaries.length,
    hadir: summaries.filter(s => s.status === 'selesai' || s.status === 'sedang-bekerja').length,
    belumTapIn: summaries.filter(s => s.status === 'belum-tap-in').length,
    sedangBekerja: summaries.filter(s => s.status === 'sedang-bekerja').length,
    selesai: summaries.filter(s => s.status === 'selesai').length,
    terlambat: summaries.filter(s => s.lateMinutes && s.lateMinutes > 0).length,
    tidakValid: summaries.filter(s => s.isInvalid).length,
    perluReview: summaries.filter(s =>
      s.isInvalid ||
      (s.lateMinutes && s.lateMinutes > 15) ||
      (s.status === 'selesai' && s.workDurationMinutes && s.workDurationMinutes < 420) // Less than 7 hours
    ).length,
  };
}
