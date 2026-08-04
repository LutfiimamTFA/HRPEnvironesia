'use client';

import {
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  subDays,
  format,
  differenceInMinutes,
} from 'date-fns';
import type { Timestamp } from 'firebase/firestore';
import type {
  FilterState,
  Kpi,
  AttendanceRecord,
  ChartData,
} from './HrdDashboardTypes';
import type {
  UserProfile,
  AttendanceEvent,
  AttendanceSite,
  Brand,
  JobApplication,
} from '@/lib/types';

const getTimestamp = (event: any): Timestamp | undefined =>
  event.tsServer || event.timestamp || event.ts || event.createdAt;

export function calculateKpisAndRecords(
  users: UserProfile[] | null,
  attendanceEvents: AttendanceEvent[] | null,
  sites: AttendanceSite[] | null,
  brands: Brand[] | null,
  newApplications: JobApplication[] | null,
  filters: FilterState,
  pendingIzin?: any[] | null,
  pendingCuti?: any[] | null,
  pendingLembur?: any[] | null,
): { kpis: Kpi[]; attendanceRecords: AttendanceRecord[] } {
  const defaultKpis: Kpi[] = [
    { title: 'Karyawan Aktif', value: 0, color: 'slate', icon: '👥' },
    { title: 'Hadir Hari Ini', value: 0, color: 'teal', icon: '✅' },
    { title: 'On-Time', value: 0, color: 'teal', icon: '⏰' },
    { title: 'Terlambat', value: 0, color: 'amber', icon: '⚠️', deltaType: 'inverse' },
    { title: 'Belum Tap In', value: 0, color: 'red', icon: '🚫', deltaType: 'inverse' },
    { title: 'Belum Tap Out', value: 0, color: 'amber', icon: '⏳', deltaType: 'inverse' },
    { title: 'Izin Hari Ini', value: 0, color: 'blue', icon: '📋' },
    { title: 'Cuti Hari Ini', value: 0, color: 'blue', icon: '🏖️' },
    { title: 'Anomali Absensi', value: 0, color: 'red', icon: '⚡', deltaType: 'inverse' },
    { title: 'Pending Approval', value: 0, color: 'amber', icon: '🔔' },
  ];

  if (!users || !sites || !brands) {
    return { kpis: defaultKpis, attendanceRecords: [] };
  }

  const brandMap = new Map(brands.map(b => [b.id, b.name]));
  const todayEvents =
    attendanceEvents?.filter(e => {
      const eventDate = getTimestamp(e)?.toDate();
      return eventDate && eventDate >= startOfDay(filters.date) && eventDate <= endOfDay(filters.date);
    }) || [];

  // Filter users based on global filters
  const filteredUsers = users.filter(user => {
    if (!user.isActive) return false;
    const userBrandIds = Array.isArray(user.brandId) ? user.brandId : (user.brandId ? [user.brandId] : []);
    if (filters.brandId && !userBrandIds.includes(filters.brandId)) return false;
    if (filters.employmentType && user.employmentType !== filters.employmentType) return false;
    if (filters.searchTerm && !user.fullName.toLowerCase().includes(filters.searchTerm.toLowerCase())) return false;
    // HRD is also an active employee, include them alongside regular employees
    return ['karyawan', 'magang', 'training'].includes(user.role) ||
      (user.role === 'hrd' && user.isActive === true);
  });

  const activeSite = filters.siteId ? sites.find(s => s.id === filters.siteId) : sites.find(s => s.isActive);
  let shiftStart: Date | null = null;
  let shiftEnd: Date | null = null;
  let graceMinutes = 0;

  if (activeSite) {
    const today = filters.date;
    const [startHour, startMinute] = activeSite.shift.startTime.split(':').map(Number);
    const [endHour, endMinute] = activeSite.shift.endTime.split(':').map(Number);
    graceMinutes = activeSite.shift.graceLateMinutes || 0;

    shiftStart = new Date(today);
    shiftStart.setHours(startHour, startMinute + graceMinutes, 0, 0);

    shiftEnd = new Date(today);
    shiftEnd.setHours(endHour, endMinute, 0, 0);
  }

  const attendanceRecords: AttendanceRecord[] = filteredUsers.map(user => {
    const userEvents = todayEvents.filter(e => (e.uid === user.uid || e.userId === user.uid));
    const tapIn = userEvents.find(e => e.type === 'tap_in' || e.type === 'IN');
    const tapOut = userEvents.find(e => e.type === 'tap_out' || e.type === 'OUT');

    const tapInTimestamp = tapIn ? getTimestamp(tapIn) : null;
    const tapOutTimestamp = tapOut ? getTimestamp(tapOut) : null;

    let status: AttendanceRecord['status'] = 'Belum Tap In';
    if (tapIn && !tapOut && shiftEnd && new Date() > shiftEnd) {
      status = 'Belum Tap Out';
    } else if (tapIn && !tapOut) {
      status = 'Sedang Bekerja';
    } else if (tapIn && tapOut) {
      status = 'Selesai';
    }

    const lateMinutes = (shiftStart && tapInTimestamp && tapInTimestamp.toDate() > shiftStart)
      ? differenceInMinutes(tapInTimestamp.toDate(), shiftStart)
      : null;

    const earlyLeaveMinutes = (shiftEnd && tapOutTimestamp && tapOutTimestamp.toDate() < shiftEnd)
      ? differenceInMinutes(shiftEnd, tapOutTimestamp.toDate())
      : null;

    const flags: ('late' | 'early' | 'no_tap_out')[] = [];
    if (lateMinutes !== null && lateMinutes > 0) flags.push('late');
    if (earlyLeaveMinutes !== null && earlyLeaveMinutes > 0) flags.push('early');
    if (status === 'Belum Tap Out') flags.push('no_tap_out');

    return {
      id: user.uid,
      name: user.fullName,
      brandId: user.brandId,
      brandName: Array.isArray(user.brandId) ? user.brandId.map(id => brandMap.get(id)).join(', ') : brandMap.get(user.brandId as string) || '-',
      employmentType: user.employmentType,
      siteId: activeSite?.id,
      siteName: activeSite?.name,
      tapIn: tapInTimestamp ? format(tapInTimestamp.toDate(), 'HH:mm') : '-',
      tapOut: tapOutTimestamp ? format(tapOutTimestamp.toDate(), 'HH:mm') : '-',
      tapInId: tapIn?.id || null,
      tapOutId: tapOut?.id || null,
      status: status,
      mode: (tapIn?.mode as string)?.toLowerCase() as 'onsite' | 'offsite' || '-',
      photoUrl: tapIn?.photoUrl,
      address: tapIn?.address || '-',
      location: tapIn?.location || null,
      lateMinutes,
      earlyLeaveMinutes,
      flags,
    };
  });

  const totalActive = filteredUsers.length;
  const hadir = attendanceRecords.filter(r => r.status !== 'Belum Tap In' && r.status !== 'Cuti/Izin').length;
  const onTime = attendanceRecords.filter(r => r.status !== 'Belum Tap In' && (r.lateMinutes === null || r.lateMinutes <= 0)).length;
  const late = attendanceRecords.filter(r => r.lateMinutes !== null && r.lateMinutes > 0).length;
  const belumTapIn = totalActive - hadir;
  const belumTapOut = attendanceRecords.filter(r => r.status === 'Belum Tap Out').length;
  const anomali = attendanceRecords.filter(r => r.flags.length > 0).length;

  // Pending approval counts
  const totalPendingIzin = pendingIzin?.length || 0;
  const totalPendingCuti = pendingCuti?.length || 0;
  const totalPendingLembur = pendingLembur?.length || 0;
  const totalPending = totalPendingIzin + totalPendingCuti + totalPendingLembur;

  const pct = (val: number, total: number) =>
    total > 0 ? Math.round((val / total) * 100) : 0;

  const kpis: Kpi[] = [
    {
      title: 'Karyawan Aktif',
      value: totalActive,
      color: 'slate',
      icon: '👥',
      description: 'Total karyawan aktif',
    },
    {
      title: 'Hadir Hari Ini',
      value: hadir,
      color: 'teal',
      icon: '✅',
      percentage: pct(hadir, totalActive),
      description: `dari ${totalActive} aktif`,
    },
    {
      title: 'On-Time',
      value: onTime,
      color: 'teal',
      icon: '⏰',
      percentage: pct(onTime, hadir),
      description: 'dari yang hadir',
    },
    {
      title: 'Terlambat',
      value: late,
      color: late > 0 ? 'amber' : 'teal',
      icon: '⚠️',
      deltaType: 'inverse',
      percentage: pct(late, hadir),
      description: 'dari yang hadir',
    },
    {
      title: 'Belum Tap In',
      value: belumTapIn,
      color: belumTapIn > 0 ? 'red' : 'teal',
      icon: '🚫',
      deltaType: 'inverse',
      percentage: pct(belumTapIn, totalActive),
      description: 'dari total aktif',
    },
    {
      title: 'Belum Tap Out',
      value: belumTapOut,
      color: belumTapOut > 0 ? 'amber' : 'teal',
      icon: '⏳',
      deltaType: 'inverse',
      percentage: pct(belumTapOut, hadir),
      description: 'dari yang hadir',
    },
    {
      title: 'Izin Pending',
      value: totalPendingIzin,
      color: totalPendingIzin > 0 ? 'blue' : 'slate',
      icon: '📋',
      href: '/admin/hrd/persetujuan-izin',
      description: 'menunggu persetujuan',
    },
    {
      title: 'Cuti Pending',
      value: totalPendingCuti,
      color: totalPendingCuti > 0 ? 'blue' : 'slate',
      icon: '🏖️',
      href: '/admin/hrd/persetujuan-cuti',
      description: 'menunggu persetujuan',
    },
    {
      title: 'Anomali Absensi',
      value: anomali,
      color: anomali > 0 ? 'red' : 'teal',
      icon: '⚡',
      deltaType: 'inverse',
      description: 'perlu diperiksa',
    },
    {
      title: 'Pending Approval',
      value: totalPending,
      color: totalPending > 0 ? 'amber' : 'slate',
      icon: '🔔',
      description: `izin+cuti+lembur`,
    },
  ];

  return { kpis, attendanceRecords };
}

export function generateChartData(
  records: AttendanceRecord[],
  allEvents: AttendanceEvent[] | null,
  currentDate: Date
): ChartData {

  // Trend Data for last 7 days
  const trendDays = eachDayOfInterval({ start: subDays(currentDate, 6), end: currentDate });
  const trend = trendDays.map(day => {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const dayEvents = allEvents?.filter(e => {
      const eventDate = getTimestamp(e)?.toDate();
      return eventDate && eventDate >= dayStart && eventDate <= dayEnd;
    }) || [];

    const hadirCount = new Set(dayEvents.filter(e => e.type === 'tap_in' || e.type === 'IN').map(e => e.uid || e.userId)).size;
    const lateCount = dayEvents.filter(e => e.flags?.includes('late')).length;
    const offsiteCount = dayEvents.filter(e => (e.mode as string)?.toLowerCase() === 'offsite').length;

    return {
      date: format(day, 'dd/MM'),
      hadir: hadirCount,
      terlambat: lateCount,
      offsite: offsiteCount,
    };
  });

  // Status Distribution
  const hadir = records.filter(r => ['Sedang Bekerja', 'Selesai'].includes(r.status)).length;
  const belumTapIn = records.filter(r => r.status === 'Belum Tap In').length;
  const cuti = 0;
  const statusDistribution = [
    { name: 'Hadir', value: hadir, color: 'hsl(var(--chart-1))' },
    { name: 'Belum Tap In', value: belumTapIn, color: 'hsl(var(--chart-2))' },
    { name: 'Cuti/Izin', value: cuti, color: 'hsl(var(--chart-3))' },
  ].filter(item => item.value > 0);

  // Top Late
  const topLate = records
    .filter(r => r.lateMinutes !== null && r.lateMinutes > 0)
    .sort((a, b) => b.lateMinutes! - a.lateMinutes!)
    .slice(0, 10)
    .map(r => ({ name: r.name, totalLateMinutes: r.lateMinutes! }));

  return { trend, statusDistribution, topLate };
}
