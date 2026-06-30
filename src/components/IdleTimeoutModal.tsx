'use client';
/**
 * IdleTimeoutModal
 *
 * Shown when the user has been idle for (IDLE_TIMEOUT - WARNING_BEFORE) ms.
 * Displays a countdown and two actions: keep-alive or immediate logout.
 */
import { ShieldAlert, LogOut, Clock } from 'lucide-react';

interface IdleTimeoutModalProps {
  secondsRemaining: number;
  onKeepAlive:  () => void;
  onLogoutNow:  () => void;
}

export function IdleTimeoutModal({
  secondsRemaining,
  onKeepAlive,
  onLogoutNow,
}: IdleTimeoutModalProps) {
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const countdown = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    /* ── Overlay ──────────────────────────────────────────────────────── */
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      {/* ── Card ────────────────────────────────────────────────────────── */}
      <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">

        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-teal-500 to-emerald-400" />

        <div className="px-7 py-7 space-y-6">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/30">
              <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <h2
                id="idle-modal-title"
                className="text-[17px] font-bold leading-snug text-slate-900 dark:text-slate-50"
              >
                Sesi Anda Akan Berakhir
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                Tidak ada aktivitas terdeteksi. Demi keamanan akun, Anda akan
                otomatis logout dalam:
              </p>
            </div>
          </div>

          {/* ── Countdown ───────────────────────────────────────────────── */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 py-5 text-center dark:border-amber-800/60 dark:bg-amber-900/20">
            <div className="flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400">
              <Clock className="h-4 w-4 shrink-0 opacity-70" />
              <span
                aria-live="polite"
                aria-label={`${mins} menit ${secs} detik`}
                className="font-mono text-4xl font-bold tabular-nums leading-none tracking-tight"
              >
                {countdown}
              </span>
            </div>
            <p className="mt-1.5 text-xs font-medium text-amber-600/80 dark:text-amber-500/80 tracking-wide uppercase">
              menit : detik
            </p>
          </div>

          {/* ── Actions ─────────────────────────────────────────────────── */}
          <div className="flex gap-3">
            {/* Secondary: logout now */}
            <button
              type="button"
              onClick={onLogoutNow}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              Logout Sekarang
            </button>

            {/* Primary: keep alive */}
            <button
              type="button"
              onClick={onKeepAlive}
              className="flex flex-1 items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              Tetap Login
            </button>
          </div>

          {/* Fine print */}
          <p className="text-center text-[11px] text-slate-400 dark:text-slate-600">
            Fitur ini melindungi akun Anda dari akses tidak sah.
          </p>
        </div>
      </div>
    </div>
  );
}
