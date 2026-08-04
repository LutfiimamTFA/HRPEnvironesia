'use client';

import { useState } from 'react';
import type { AttendanceRecord } from './HrdDashboardTypes';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, cn } from '@/lib/utils';
import Link from 'next/link';
import { XCircle, MoreVertical, Eye, FileText, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, deleteDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { DeleteConfirmationDialog } from '../DeleteConfirmationDialog';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AttendanceTableProps {
  records: AttendanceRecord[];
}

export function AttendanceTable({ records }: AttendanceTableProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [eventsToDelete, setEventsToDelete] = useState<{ tapInId: string | null; tapOutId: string | null; userName: string | null }>({ tapInId: null, tapOutId: null, userName: null });

  const handleCancelClick = (row: AttendanceRecord) => {
    setEventsToDelete({ tapInId: row.tapInId, tapOutId: row.tapOutId, userName: row.name });
    setIsDeleteConfirmOpen(true);
  };

  const confirmCancelAttendance = async () => {
    const { tapInId, tapOutId } = eventsToDelete;
    if (!tapInId && !tapOutId) return;

    try {
      const promises: Promise<any>[] = [];
      if (tapInId) {
        promises.push(deleteDocumentNonBlocking(doc(firestore, 'attendance_events', tapInId)));
      }
      if (tapOutId) {
        promises.push(deleteDocumentNonBlocking(doc(firestore, 'attendance_events', tapOutId)));
      }

      await Promise.all(promises);

      toast({
        title: 'Absensi Dibatalkan',
        description: `Catatan absensi untuk ${eventsToDelete.userName} telah dihapus.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal Membatalkan',
        description: error.message || 'Terjadi kesalahan pada server.',
      });
    } finally {
      setIsDeleteConfirmOpen(false);
    }
  };

  const getStatusVariant = (status: AttendanceRecord['status']) => {
    switch (status) {
      case 'Selesai': return 'default';
      case 'Sedang Bekerja': return 'secondary';
      case 'Belum Tap In': return 'destructive';
      case 'Belum Tap Out': return 'outline';
      default: return 'secondary';
    }
  };

  const getStatusColor = (status: AttendanceRecord['status'], flags: string[]) => {
    if (flags.includes('late')) return 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30';
    if (status === 'Belum Tap In') return 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30';
    if (status === 'Belum Tap Out') return 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30';
    if (status === 'Cuti/Izin') return 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30';
    return 'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/30';
  };

  return (
    <>
      <Card className="bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-800 dark:text-slate-100">Laporan Kehadiran Hari Ini</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <TableHead className="text-slate-600 dark:text-slate-300">Nama</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">Brand/Divisi</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">Jadwal Kerja</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">Tap In</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">Tap Out</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">Status</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">Mode</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">Flag</TableHead>
                  <TableHead className="text-right text-slate-600 dark:text-slate-300">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length > 0 ? records.map(row => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      'border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30',
                      row.flags.length > 0 && 'bg-amber-50/50 dark:bg-amber-950/20'
                    )}
                  >
                    <TableCell className="font-medium text-slate-800 dark:text-slate-100">
                      <Link href={`/admin/hrd/employee-data/karyawan`} className="hover:underline">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={row.photoUrl || undefined} />
                            <AvatarFallback className="text-xs bg-slate-200 dark:bg-slate-700">
                              {getInitials(row.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{row.name}</span>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300">
                      <Badge variant="outline" className="text-xs bg-slate-50 dark:bg-slate-800/60">
                        {row.brandName}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300 text-xs">
                      {row.siteName ? `${row.siteName}` : '-'}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300 font-mono text-sm font-semibold">{row.tapIn}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300 font-mono text-sm font-semibold">{row.tapOut}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs font-medium',
                          getStatusColor(row.status, row.flags)
                        )}
                      >
                        {row.status === 'Sedang Bekerja' ? '🕐 Sedang Bekerja' : row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize text-slate-600 dark:text-slate-300 text-sm">
                      <Badge variant="secondary" className="text-xs">
                        {row.mode === '-' ? '~' : row.mode === 'onsite' ? '🏢 Onsite' : '🏠 Offsite'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.flags.length > 0 ? (
                          row.flags.map(flag => {
                            if (flag === 'late') return <Badge key="late" variant="destructive" className="text-xs">⏱️ {row.lateMinutes}m</Badge>;
                            if (flag === 'early') return <Badge key="early" variant="outline" className="text-xs border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300">🚪 Early</Badge>;
                            if (flag === 'no_tap_out') return <Badge key="no_tap_out" variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">⏳ No Out</Badge>;
                            return null;
                          })
                        ) : (
                          <Badge variant="outline" className="text-xs border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-300">✓ Ok</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/hrd/employee-data/karyawan`} className="cursor-pointer">
                              <Eye className="mr-2 h-4 w-4" />
                              Lihat Detail
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/hrd/monitoring/absen`} className="cursor-pointer">
                              <FileText className="mr-2 h-4 w-4" />
                              Buka Absensi
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/hrd/employee-data/karyawan`} className="cursor-pointer">
                              <UserIcon className="mr-2 h-4 w-4" />
                              Buka Profil
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleCancelClick(row)}
                            disabled={!row.tapInId && !row.tapOutId}
                            className="text-red-600 dark:text-red-400"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Batalkan Absensi
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/30">
                      Data absensi untuk filter yang dipilih belum tersedia.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <DeleteConfirmationDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={confirmCancelAttendance}
        itemName={`catatan absensi untuk ${eventsToDelete.userName}`}
        itemType=""
      />
    </>
  );
}
