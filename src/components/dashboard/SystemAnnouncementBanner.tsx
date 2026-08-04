'use client';

import { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { X, Info, AlertTriangle, Wrench, Lock, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SystemAnnouncement } from '@/hooks/useSystemAnnouncements';

function tsToDate(ts: Timestamp | null | undefined): Date | null {
  if (!ts) return null;
  try { return ts.toDate ? ts.toDate() : new Date((ts as any)._seconds * 1000); }
  catch { return null; }
}

function formatShort(ts: Timestamp | null | undefined): string {
  const d = tsToDate(ts);
  if (!d) return '';
  return d.toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  }) + ' WIB';
}

const LEVEL_STYLE = {
  info: {
    wrapper: 'border-blue-200 bg-blue-50',
    text: 'text-blue-900',
    icon: Info,
    iconCls: 'text-blue-500',
    badge: 'bg-blue-100 text-blue-700',
    btn: 'text-blue-500 hover:text-blue-700 hover:bg-blue-100',
    label: 'Info Sistem',
  },
  warning: {
    wrapper: 'border-amber-200 bg-amber-50',
    text: 'text-amber-900',
    icon: AlertTriangle,
    iconCls: 'text-amber-500',
    badge: 'bg-amber-100 text-amber-700',
    btn: 'text-amber-500 hover:text-amber-700 hover:bg-amber-100',
    label: 'Warning Sistem',
  },
  maintenance: {
    wrapper: 'border-orange-200 bg-orange-50',
    text: 'text-orange-900',
    icon: Wrench,
    iconCls: 'text-orange-500',
    badge: 'bg-orange-100 text-orange-700',
    btn: 'text-orange-500 hover:text-orange-700 hover:bg-orange-100',
    label: 'Maintenance Terjadwal',
  },
  maintenance_lock: {
    wrapper: 'border-red-300 bg-red-50',
    text: 'text-red-900',
    icon: Lock,
    iconCls: 'text-red-600',
    badge: 'bg-red-100 text-red-700',
    btn: 'text-red-500 hover:text-red-700 hover:bg-red-100',
    label: 'Maintenance Lock',
  },
} as const;

// ── Single banner row ──────────────────────────────────────────────────────────

function SingleBanner({
  announcement: a,
  superAdminMode,
  onDismiss,
}: {
  announcement: SystemAnnouncement;
  superAdminMode: boolean;
  onDismiss: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const s = LEVEL_STYLE[a.announcementLevel] ?? LEVEL_STYLE.info;
  const Icon = s.icon;
  const isLock = a.announcementLevel === 'maintenance_lock';
  const startFmt = formatShort(a.startAt);
  const endFmt = formatShort(a.endAt);

  return (
    <div className={cn('rounded-xl border px-4 py-3', s.wrapper)}>
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', s.iconCls)} />

        <div className={cn('min-w-0 flex-1 text-sm', s.text)}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', s.badge)}>
              {s.label}
            </span>
            {superAdminMode && isLock && (
              <span className="text-[11px] font-semibold text-red-700">
                Maintenance Lock sedang aktif untuk user yang ditargetkan.
              </span>
            )}
          </div>

          <p className="mt-1 font-semibold leading-snug">{a.title}</p>

          {expanded && a.content && (
            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed opacity-80">
              {a.content}
            </p>
          )}

          {(startFmt || endFmt) && (
            <p className="mt-1 text-[11px] opacity-60">
              {startFmt && <>Mulai: {startFmt}</>}
              {startFmt && endFmt && <> · </>}
              {endFmt && <>Selesai: {endFmt}</>}
            </p>
          )}

          {superAdminMode && isLock && (
            <a
              href="/admin/super-admin/announcements"
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-red-600 underline-offset-2 hover:underline"
            >
              <Settings className="h-3 w-3" />
              Kelola Pengumuman
            </a>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {a.content && (
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className={cn('rounded-md p-1.5 transition-colors', s.btn)}
              aria-label={expanded ? 'Sembunyikan' : 'Lihat detail'}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
          {/* Lock banner pinned for regular users; dismissible for super admin */}
          {(!isLock || superAdminMode) && (
            <button
              type="button"
              onClick={() => onDismiss(a.id)}
              className={cn('rounded-md p-1.5 transition-colors', s.btn)}
              aria-label="Tutup"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────────

export function SystemAnnouncementBanner({
  announcements,
  superAdminMode = false,
}: {
  announcements: SystemAnnouncement[];
  superAdminMode?: boolean;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = announcements.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const dismiss = (id: string) => setDismissed(prev => new Set([...prev, id]));

  return (
    <div className="mb-5 space-y-2">
      {visible.map(a => (
        <SingleBanner
          key={a.id}
          announcement={a}
          superAdminMode={superAdminMode}
          onDismiss={dismiss}
        />
      ))}
    </div>
  );
}
