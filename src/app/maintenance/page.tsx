'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Wrench, RefreshCw, LogOut, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useAuth as useFirebaseAuth, useFirestore } from '@/firebase';
import { signOutWithSessionStatus } from '@/lib/session-tracking';
import { useMyMaintenanceStatus } from '@/hooks/useMaintenance';
import { getMaintenanceSource, toMillis } from '@/lib/maintenance';
import type { UserRole } from '@/lib/types';

const ROLE_DASHBOARD_PATH: Record<string, string> = {
  'super-admin': '/admin/super-admin',
  hrd: '/admin/hrd/dashboard-karyawan',
  manager: '/admin/manager',
  karyawan: '/admin/karyawan/dashboard',
  kandidat: '/careers/portal',
};

function roleDashboardPath(role: UserRole | string | undefined): string {
  return ROLE_DASHBOARD_PATH[role ?? ''] ?? '/admin/login';
}

function roleLoginPath(role: UserRole | string | undefined): string {
  return role === 'kandidat' ? '/careers/login' : '/admin/login';
}

function clearMaintenanceLocalCache() {
  try {
    ['maintenanceStatus', 'activeMaintenance'].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  } catch {
    // ignore storage failures
  }
}

function formatEstimate(ms: number | null): string | null {
  if (!ms) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  }) + ' WIB';
}

function formatCountdown(estimateMs: number, nowMs: number): string {
  const diffMinutes = Math.round(Math.abs(estimateMs - nowMs) / 60000);
  const label = diffMinutes < 1 ? 'kurang dari 1 menit' : `${diffMinutes} menit`;
  return estimateMs > nowMs ? `Sisa waktu estimasi: ${label}` : `Melewati estimasi: ${label}`;
}

function MaintenanceContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const auth = useFirebaseAuth();
  const firestore = useFirestore();
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Live re-check against system_maintenance — the single source of truth.
  // Pengumuman Sistem (system_announcements) is never consulted here.
  const { blocked, rule, loading: maintenanceLoading } = useMyMaintenanceStatus('/maintenance');

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-redirect the moment maintenance clears for this user — they must
  // never stay stuck on /maintenance once system_maintenance says "allow".
  useEffect(() => {
    if (authLoading || maintenanceLoading) return;
    if (!userProfile) return;
    if (!blocked) {
      clearMaintenanceLocalCache();
      router.replace(roleDashboardPath(userProfile.role));
    }
  }, [authLoading, maintenanceLoading, blocked, userProfile, router]);

  const fallbackTitle = params.get('title') || 'Fitur Sedang Dalam Perbaikan';
  const fallbackMessage = params.get('message') || 'Fitur ini sedang diperbarui oleh tim kami. Mohon coba kembali beberapa saat lagi.';
  const fallbackEstimateMs = params.get('estimatedEndAt') ? Number(params.get('estimatedEndAt')) : null;
  const fallbackSource = params.get('source');

  // Prefer live data once loaded; fall back to the redirect-time snapshot in the URL
  // so there's no flash of empty content while the live listener connects.
  const title = rule?.title || fallbackTitle;
  const message = rule?.message || fallbackMessage;
  const estimatedEndMs = rule ? toMillis(rule.estimatedEndAt) : fallbackEstimateMs;
  const source = rule ? getMaintenanceSource(rule) : fallbackSource;
  const estimate = formatEstimate(estimatedEndMs);
  const isOverdue = !!estimatedEndMs && estimatedEndMs < nowMs;

  const handleRecheck = () => {
    setRefreshing(true);
    // The live listener above already re-evaluates on every snapshot and will
    // auto-redirect if maintenance has cleared; this just gives explicit
    // feedback and re-renders against the freshest local clock.
    setNowMs(Date.now());
    window.setTimeout(() => setRefreshing(false), 600);
  };

  const handleLogout = async () => {
    try {
      await signOutWithSessionStatus(auth, firestore, userProfile?.uid, 'manual_logout', 'offline');
    } catch { /* ignore, still redirect */ }
    router.replace(roleLoginPath(userProfile?.role));
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-500/30">
            <Wrench className="h-10 w-10 text-amber-400" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-8 text-center shadow-2xl">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-amber-400">
            Sedang Maintenance
          </p>
          <h1 className="mt-2 text-xl font-bold text-white">{title}</h1>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{message}</p>

          {isOverdue && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-left">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-xs leading-relaxed text-amber-200">
                Maintenance masih berlangsung dan membutuhkan waktu tambahan. Mohon menunggu informasi berikutnya.
              </p>
            </div>
          )}

          {estimate && (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-700/50 p-3 text-left">
              <Clock className="h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Estimasi Selesai</p>
                <p className="text-xs text-slate-200">{estimate}</p>
                <p className={`text-[11px] mt-0.5 ${isOverdue ? 'text-amber-400' : 'text-slate-400'}`}>
                  {formatCountdown(estimatedEndMs!, nowMs)}
                </p>
              </div>
            </div>
          )}

          {userProfile?.role === 'super-admin' && source && (
            <p className="mt-4 text-[11px] text-slate-500">
              Maintenance source: <span className="font-mono text-slate-400">{source}</span>
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2.5">
            <Button onClick={handleRecheck} disabled={refreshing} className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-700">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Mengecek...' : 'Cek Kembali'}
            </Button>
            {userProfile && (
              <Button onClick={handleLogout} variant="outline" className="w-full gap-2">
                <LogOut className="h-4 w-4" /> Keluar
              </Button>
            )}
          </div>

          <p className="mt-4 text-[11px] text-slate-500">
            Hubungi Super Admin jika maintenance melebihi estimasi waktu.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function MaintenancePage() {
  return (
    <Suspense fallback={null}>
      <MaintenanceContent />
    </Suspense>
  );
}
