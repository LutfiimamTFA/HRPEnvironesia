'use client';

import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, UserCheck, UserX, Clock, Plane, CalendarOff, AlertTriangle } from 'lucide-react';

function MonitoringSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
            <Skeleton className="h-96" />
        </div>
    );
}

const kpiCards = [
    { title: "Hadir Hari Ini", value: 0, icon: UserCheck, color: "text-green-500" },
    { title: "Belum Tap In", value: 0, icon: UserX, color: "text-red-500" },
    { title: "Offsite", value: 0, icon: Plane, color: "text-blue-500" },
    { title: "Anomali", value: 0, icon: AlertTriangle, color: "text-yellow-500" },
    { title: "Cuti Hari Ini", value: 0, icon: CalendarOff, color: "text-purple-500" },
    { title: "Izin Hari Ini", value: 0, icon: Clock, color: "text-orange-500" },
    { title: "Dinas Aktif", value: 0, icon: Users, color: "text-indigo-500" },
]

export default function EmployeeMonitoringDashboard() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') return MENU_CONFIG['hrd'];
    return [];
  }, [userProfile]);

  if (!hasAccess) {
    return (
      <DashboardLayout pageTitle="Employee Monitoring" menuConfig={menuConfig}>
        <MonitoringSkeleton />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Dashboard Karyawan" menuConfig={menuConfig}>
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                {kpiCards.map(card => (
                    <Card key={card.title}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                            <card.icon className={`h-4 w-4 text-muted-foreground ${card.color}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{card.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Kehadiran Hari Ini</CardTitle>
                    <CardDescription>Daftar kehadiran karyawan untuk hari ini.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nama</TableHead>
                                <TableHead>Brand/Divisi</TableHead>
                                <TableHead>Tap In</TableHead>
                                <TableHead>Tap Out</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Mode</TableHead>
                                <TableHead>Flags</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
                                    Data belum tersedia. Pastikan modul absensi aktif.
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    </DashboardLayout>
  );
}

    