'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getInitials } from '@/lib/utils';
import { AlertTriangle, Clock, LogIn, CheckCircle2, FileText, Briefcase, CalendarOff, AlertOctagon } from 'lucide-react';
import { Link } from '@/navigation';
import type { AttendanceRecord } from './HrdDashboardTypes';

const ActionItem = ({ record, message }: { record: AttendanceRecord; message: string }) => (
  <div className="flex items-center gap-3 py-2 px-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md transition-colors">
    <Avatar className="h-8 w-8 shrink-0">
      <AvatarFallback className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
        {getInitials(record.name)}
      </AvatarFallback>
    </Avatar>
    <div className="text-sm min-w-0">
      <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{record.name}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  </div>
);

interface PendingItem {
  id: string;
  employeeName?: string;
  name?: string;
  status?: string;
  brandName?: string;
  divisionName?: string;
  reason?: string;
  startDate?: any;
  endDate?: any;
  type?: string;
}

const PendingActionItem = ({
  item,
  processHref,
  label,
}: {
  item: PendingItem;
  processHref: string;
  label: string;
}) => {
  const displayName = item.employeeName || item.name || 'Karyawan';
  const meta = [item.brandName, item.divisionName].filter(Boolean).join(' · ');

  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-md transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="text-sm min-w-0">
          <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{displayName}</p>
          {meta && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{meta}</p>}
          {item.status && (
            <Badge variant="outline" className="text-xs px-1 py-0 mt-0.5 h-4 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
              {item.status}
            </Badge>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 h-7 text-xs border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
        asChild
      >
        <Link href={processHref}>Proses</Link>
      </Button>
    </div>
  );
};

const EmptyState = ({ message }: { message: string }) => (
  <p className="text-sm text-slate-500 dark:text-slate-400 py-3 px-2 text-center bg-slate-50 dark:bg-slate-800/50 rounded-md">
    {message}
  </p>
);

const ActionSection = ({
  title,
  icon,
  count,
  badge,
  actionHref,
  actionLabel,
  children,
  collapsed
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  badge: 'red' | 'blue' | 'amber' | 'slate';
  actionHref?: string;
  actionLabel?: string;
  children: React.ReactNode;
  collapsed?: boolean;
}) => {
  const badgeColors = {
    red: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  };

  if (collapsed && count === 0) return null;

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-900/20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h4>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColors[badge]}`}>
              {count} item
            </span>
          </div>
        </div>
        {actionHref && actionLabel && (
          <Button size="sm" variant="outline" asChild className="h-7 text-xs">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        )}
      </div>
      {count > 0 && children}
    </div>
  );
};

interface NeedsActionPanelProps {
  records: AttendanceRecord[];
  pendingIzin?: any[] | null;
  pendingCuti?: any[] | null;
  pendingLembur?: any[] | null;
  pendingDinas?: any[] | null;
  pendingProfiles?: any[] | null;
}

export function NeedsActionPanel({ records, pendingIzin, pendingCuti, pendingLembur, pendingDinas, pendingProfiles }: NeedsActionPanelProps) {
  const belumTapIn = records.filter(r => r.status === 'Belum Tap In');
  const terlambat = records
    .filter(r => r.lateMinutes !== null && r.lateMinutes > 0)
    .sort((a, b) => b.lateMinutes! - a.lateMinutes!);
  const belumTapOut = records.filter(r => r.status === 'Belum Tap Out');

  const safeIzin: PendingItem[] = pendingIzin || [];
  const safeCuti: PendingItem[] = pendingCuti || [];
  const safeLembur: PendingItem[] = pendingLembur || [];
  const safeDinas: PendingItem[] = pendingDinas || [];
  const safeProfiles: PendingItem[] = pendingProfiles || [];

  const totalAction = belumTapIn.length + belumTapOut.length + terlambat.length +
                      safeIzin.length + safeCuti.length + safeLembur.length +
                      safeDinas.length + safeProfiles.length;

  if (totalAction === 0) {
    return (
      <Card className="bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <CheckCircle2 className="h-5 w-5 text-teal-500" />
            Tindakan Tidak Diperlukan
          </CardTitle>
          <CardDescription className="text-slate-500 dark:text-slate-400">
            Semua laporan hari ini sudah tertangani dengan baik.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Action Center ({totalAction} item)
        </CardTitle>
        <CardDescription className="text-slate-500 dark:text-slate-400">
          Karyawan dan pengajuan yang memerlukan tindakan segera.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* ABSENSI Section */}
        <ActionSection
          title="ABSENSI"
          icon="📍"
          count={belumTapIn.length + belumTapOut.length + terlambat.length}
          badge="red"
          collapsed
        >
          <div className="space-y-2">
            {belumTapIn.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Belum Tap In ({belumTapIn.length})</span>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" asChild>
                    <Link href="/admin/hrd/monitoring/absen">Tindak Lanjut</Link>
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                  {belumTapIn.slice(0, 4).map(r => (
                    <ActionItem key={r.id} record={r} message="Belum check-in" />
                  ))}
                </div>
              </div>
            )}
            {belumTapOut.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Belum Tap Out ({belumTapOut.length})</span>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" asChild>
                    <Link href="/admin/hrd/monitoring/absen">Perbarui</Link>
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                  {belumTapOut.slice(0, 4).map(r => (
                    <ActionItem key={r.id} record={r} message="Melebihi jam kerja" />
                  ))}
                </div>
              </div>
            )}
            {terlambat.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Terlambat ({terlambat.length})</span>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" asChild>
                    <Link href="/admin/hrd/monitoring/absen">Lihat List</Link>
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                  {terlambat.slice(0, 4).map(r => (
                    <ActionItem key={r.id} record={r} message={`Terlambat ${r.lateMinutes}m`} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </ActionSection>

        {/* IZIN & CUTI Section */}
        {(safeIzin.length > 0 || safeCuti.length > 0) && (
          <ActionSection
            title="IZIN & CUTI"
            icon="📋"
            count={safeIzin.length + safeCuti.length}
            badge="blue"
            collapsed
          >
            <div className="space-y-2">
              {safeIzin.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Izin Pending ({safeIzin.length})</span>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" asChild>
                      <Link href="/admin/hrd/persetujuan-izin">Proses</Link>
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {safeIzin.slice(0, 3).map(item => (
                      <PendingActionItem
                        key={item.id}
                        item={item}
                        processHref="/admin/hrd/persetujuan-izin"
                        label="Proses"
                      />
                    ))}
                  </div>
                </div>
              )}
              {safeCuti.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Cuti Pending ({safeCuti.length})</span>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" asChild>
                      <Link href="/admin/hrd/persetujuan-cuti">Proses</Link>
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {safeCuti.slice(0, 3).map(item => (
                      <PendingActionItem
                        key={item.id}
                        item={item}
                        processHref="/admin/hrd/persetujuan-cuti"
                        label="Proses"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ActionSection>
        )}

        {/* LEMBUR Section */}
        {safeLembur.length > 0 && (
          <ActionSection
            title="LEMBUR"
            icon="⚡"
            count={safeLembur.length}
            badge="amber"
            actionHref="/admin/hrd/persetujuan-lembur"
            actionLabel="Review"
            collapsed
          >
            <div className="space-y-1">
              {safeLembur.slice(0, 5).map(item => (
                <PendingActionItem
                  key={item.id}
                  item={item}
                  processHref="/admin/hrd/persetujuan-lembur"
                  label="Review"
                />
              ))}
            </div>
          </ActionSection>
        )}

        {/* DATA KARYAWAN Section */}
        {safeProfiles.length > 0 && (
          <ActionSection
            title="DATA KARYAWAN"
            icon="📊"
            count={safeProfiles.length}
            badge="slate"
            actionHref="/admin/hrd/employee-data/karyawan"
            actionLabel="Update"
            collapsed
          >
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {safeProfiles.length} karyawan memiliki data yang belum lengkap.
            </p>
          </ActionSection>
        )}

        {/* DINAS Section */}
        {safeDinas.length > 0 && (
          <ActionSection
            title="DINAS"
            icon="✈️"
            count={safeDinas.length}
            badge="blue"
            actionHref="/admin/hrd/monitoring/dinas"
            actionLabel="Setujui"
            collapsed
          >
            <div className="space-y-1">
              {safeDinas.slice(0, 5).map(item => (
                <PendingActionItem
                  key={item.id}
                  item={item}
                  processHref="/admin/hrd/monitoring/dinas"
                  label="Setujui"
                />
              ))}
            </div>
          </ActionSection>
        )}
      </CardContent>
    </Card>
  );
}
