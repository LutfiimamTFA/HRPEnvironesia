'use client';

import { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Lock, RefreshCw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SystemAnnouncement } from '@/hooks/useSystemAnnouncements';

function tsToDate(ts: Timestamp | null | undefined): Date | null {
  if (!ts) return null;
  try {
    return ts.toDate ? ts.toDate() : new Date((ts as any)._seconds * 1000);
  } catch {
    return null;
  }
}

function formatWIB(ts: Timestamp | null | undefined): string {
  const d = tsToDate(ts);
  if (!d) return '—';
  return d.toLocaleString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  }) + ' WIB';
}

export function MaintenanceLockScreen({ announcement }: { announcement: SystemAnnouncement }) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    window.location.reload();
  };

  const endDate = tsToDate(announcement.endAt);
  const now = new Date();
  const isEnded = endDate ? endDate < now : false;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg">
        {/* Icon */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20 ring-1 ring-red-500/30">
            <Lock className="h-10 w-10 text-red-400" />
          </div>
        </div>

        {/* Content card */}
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-8 text-center shadow-2xl">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-red-400">
            Sistem Sedang Maintenance
          </p>
          <h1 className="mt-2 text-xl font-bold text-white">{announcement.title}</h1>

          {announcement.content && (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
              {announcement.content}
            </p>
          )}

          {/* Time range */}
          {(announcement.startAt || announcement.endAt) && (
            <div className="mt-5 space-y-2 rounded-xl border border-slate-600 bg-slate-700/50 p-4 text-left">
              {announcement.startAt && (
                <div className="flex items-start gap-2.5">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Mulai</p>
                    <p className="text-xs text-slate-200">{formatWIB(announcement.startAt)}</p>
                  </div>
                </div>
              )}
              {announcement.endAt && (
                <div className="flex items-start gap-2.5">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Perkiraan Selesai</p>
                    <p className="text-xs text-slate-200">{formatWIB(announcement.endAt)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ended hint */}
          {isEnded && (
            <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5">
              <p className="text-xs text-emerald-400">
                Maintenance seharusnya sudah selesai. Coba refresh halaman.
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2.5">
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-700"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Memuat ulang...' : 'Cek Kembali'}
            </Button>
          </div>

          <p className="mt-4 text-[11px] text-slate-500">
            Hubungi Super Admin jika maintenance melebihi estimasi waktu.
          </p>
        </div>
      </div>
    </div>
  );
}
