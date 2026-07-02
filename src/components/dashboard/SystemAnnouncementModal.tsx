'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import {
  Info, AlertTriangle, Wrench, Lock, CheckCircle2, X,
  CalendarClock, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import type { SystemAnnouncement } from '@/hooks/useSystemAnnouncements';

// ── Helpers ────────────────────────────────────────────────────────────────────

function tsToMs(ts: Timestamp | null | undefined): number | null {
  if (!ts) return null;
  try { return ts.toDate ? ts.toDate().getTime() : (ts as any)._seconds * 1000; }
  catch { return null; }
}

function formatWIB(ts: Timestamp | null | undefined): string {
  const ms = tsToMs(ts);
  if (!ms) return '';
  return new Date(ms).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  }) + ' WIB';
}

function seenKey(uid: string, id: string, updatedAtMs: number | null) {
  return `hrp_ann_modal_${uid}_${id}_${updatedAtMs ?? 'x'}`;
}

function wasAlreadySeen(uid: string, a: SystemAnnouncement): boolean {
  try { return !!localStorage.getItem(seenKey(uid, a.id, tsToMs(a.updatedAt))); }
  catch { return false; }
}

function markSeen(uid: string, a: SystemAnnouncement) {
  try { localStorage.setItem(seenKey(uid, a.id, tsToMs(a.updatedAt)), '1'); }
  catch { /* ignore */ }
}

// ── Level config ───────────────────────────────────────────────────────────────

const LEVEL = {
  info: {
    label: 'Info Sistem',
    icon: Info,
    // icon circle
    iconBg: 'bg-blue-50',
    iconRing: 'ring-4 ring-blue-100',
    iconColor: 'text-blue-500',
    // badge
    badgeCls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    // impact box
    impactBg: 'bg-blue-50 border-blue-100',
    impactText: 'text-blue-700',
    impactIcon: Info,
    impactIconCls: 'text-blue-400',
    impactMsg: 'Informasi sistem. Akses HRP tetap berjalan normal.',
    // button
    btnCls: 'bg-blue-600 hover:bg-blue-700 text-white',
    // schedule accent
    scheduleAccent: 'text-blue-600',
  },
  warning: {
    label: 'Warning Sistem',
    icon: AlertTriangle,
    iconBg: 'bg-amber-50',
    iconRing: 'ring-4 ring-amber-100',
    iconColor: 'text-amber-500',
    badgeCls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    impactBg: 'bg-amber-50 border-amber-100',
    impactText: 'text-amber-700',
    impactIcon: AlertTriangle,
    impactIconCls: 'text-amber-400',
    impactMsg: 'Peringatan sistem. Akses HRP tetap berjalan normal.',
    btnCls: 'bg-amber-500 hover:bg-amber-600 text-white',
    scheduleAccent: 'text-amber-600',
  },
  maintenance: {
    label: 'Maintenance Terjadwal',
    icon: Wrench,
    iconBg: 'bg-orange-50',
    iconRing: 'ring-4 ring-orange-100',
    iconColor: 'text-orange-500',
    badgeCls: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
    impactBg: 'bg-orange-50 border-orange-100',
    impactText: 'text-orange-700',
    impactIcon: Clock,
    impactIconCls: 'text-orange-400',
    impactMsg: 'Sistem belum dikunci. Ini hanya pemberitahuan jadwal maintenance.',
    btnCls: 'bg-orange-500 hover:bg-orange-600 text-white',
    scheduleAccent: 'text-orange-600',
  },
  maintenance_lock: {
    label: 'Maintenance Lock',
    icon: Lock,
    iconBg: 'bg-red-50',
    iconRing: 'ring-4 ring-red-100',
    iconColor: 'text-red-500',
    badgeCls: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    impactBg: 'bg-red-50 border-red-100',
    impactText: 'text-red-700',
    impactIcon: Lock,
    impactIconCls: 'text-red-400',
    impactMsg: 'Akses user target dikunci sementara selama maintenance.',
    btnCls: 'bg-red-600 hover:bg-red-700 text-white',
    scheduleAccent: 'text-red-600',
  },
} as const;

// ── Modal card ─────────────────────────────────────────────────────────────────

interface CardProps {
  a: SystemAnnouncement;
  queueLeft: number;
  onDismiss: () => void;
  onAcknowledge: () => Promise<void>;
  acknowledging: boolean;
}

function AnnouncementCard({ a, queueLeft, onDismiss, onAcknowledge, acknowledging }: CardProps) {
  const cfg = LEVEL[a.announcementLevel] ?? LEVEL.info;
  const Icon = cfg.icon;
  const ImpactIcon = cfg.impactIcon;
  const requireAck = !!a.requireAcknowledgement;
  const startFmt = formatWIB(a.startAt);
  const endFmt = formatWIB(a.endAt);

  return (
    /* ── Overlay ── */
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ann-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={requireAck ? undefined : onDismiss}
      />

      {/* Card */}
      <div className="relative z-10 flex w-full max-w-[520px] flex-col rounded-2xl bg-white shadow-xl ring-1 ring-black/[0.06]">

        {/* Close */}
        {!requireAck && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* ── Header section ── */}
        <div className="px-8 pb-0 pt-8 text-center">
          {/* Icon circle */}
          <div className={cn(
            'mx-auto mb-5 inline-flex h-[72px] w-[72px] items-center justify-center rounded-full',
            cfg.iconBg, cfg.iconRing,
          )}>
            <Icon className={cn('h-9 w-9', cfg.iconColor)} strokeWidth={1.75} />
          </div>

          {/* Badge */}
          <span className={cn(
            'inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider',
            cfg.badgeCls,
          )}>
            {cfg.label}
          </span>

          {/* Title */}
          <h2
            id="ann-modal-title"
            className="mt-3 text-[19px] font-bold leading-tight text-slate-900"
          >
            {a.title}
          </h2>
        </div>

        {/* ── Scrollable body ── */}
        <div className="max-h-[55vh] overflow-y-auto px-8 pb-2 pt-4 space-y-4">

          {/* Content */}
          {a.content && (
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-500">
              {a.content}
            </p>
          )}

          {/* Schedule box */}
          {(startFmt || endFmt) && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <CalendarClock className="h-3.5 w-3.5" />
                Jadwal
              </p>
              <div className="space-y-1.5">
                {startFmt && (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[12px] text-slate-400">Berlaku mulai</span>
                    <span className={cn('text-right text-[12px] font-semibold', cfg.scheduleAccent)}>{startFmt}</span>
                  </div>
                )}
                {endFmt && (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[12px] text-slate-400">
                      {a.announcementLevel === 'maintenance_lock' ? 'Estimasi selesai' : 'Berlaku sampai'}
                    </span>
                    <span className={cn('text-right text-[12px] font-semibold', cfg.scheduleAccent)}>{endFmt}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Impact box */}
          <div className={cn(
            'flex items-start gap-3 rounded-xl border px-4 py-3',
            cfg.impactBg,
          )}>
            <ImpactIcon className={cn('mt-0.5 h-4 w-4 shrink-0', cfg.impactIconCls)} />
            <div>
              <p className={cn('text-[11px] font-semibold uppercase tracking-wide', cfg.impactText)}>
                Dampak ke User
              </p>
              <p className={cn('mt-0.5 text-[13px] leading-snug', cfg.impactText)}>
                {cfg.impactMsg}
              </p>
            </div>
          </div>

          {/* Queue hint */}
          {queueLeft > 0 && (
            <p className="text-center text-[11px] text-slate-400">
              +{queueLeft} pengumuman lain menunggu setelah ini.
            </p>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-8 pb-7 pt-4">
          {requireAck ? (
            <Button
              onClick={onAcknowledge}
              disabled={acknowledging}
              className={cn('h-11 w-full gap-2 text-[14px] font-semibold', cfg.btnCls)}
            >
              <CheckCircle2 className="h-4 w-4" />
              {acknowledging ? 'Menyimpan...' : 'Saya Sudah Membaca'}
            </Button>
          ) : (
            <Button
              onClick={onDismiss}
              className={cn('h-11 w-full text-[14px] font-semibold', cfg.btnCls)}
            >
              Mengerti
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function SystemAnnouncementModal({ announcements }: { announcements: SystemAnnouncement[] }) {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const [queue, setQueue] = useState<SystemAnnouncement[]>([]);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    if (!userProfile?.uid) return;
    const uid = userProfile.uid;
    setQueue(announcements.filter(a => !wasAlreadySeen(uid, a)));
  }, [announcements, userProfile?.uid]);

  const current = queue[0] ?? null;

  const dismissCurrent = useCallback(() => {
    if (!current || !userProfile?.uid) return;
    markSeen(userProfile.uid, current);
    setQueue(prev => prev.slice(1));
  }, [current, userProfile?.uid]);

  const acknowledgeAndDismiss = useCallback(async () => {
    if (!current || !userProfile || !firestore) return;
    setAcknowledging(true);
    try {
      await setDoc(
        doc(collection(firestore, 'system_announcements', current.id, 'reads'), userProfile.uid),
        {
          uid: userProfile.uid,
          displayName: (userProfile as any).fullName ?? userProfile.email ?? '',
          email: userProfile.email ?? '',
          role: userProfile.role ?? '',
          readAt: serverTimestamp(),
          acknowledgedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch { /* non-fatal */ }
    markSeen(userProfile.uid, current);
    setQueue(prev => prev.slice(1));
    setAcknowledging(false);
  }, [current, userProfile, firestore]);

  if (!current) return null;

  return (
    <AnnouncementCard
      a={current}
      queueLeft={queue.length - 1}
      onDismiss={dismissCurrent}
      onAcknowledge={acknowledgeAndDismiss}
      acknowledging={acknowledging}
    />
  );
}
