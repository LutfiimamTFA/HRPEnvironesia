'use client';

import { useAuth } from '@/providers/auth-provider';
import { useAuth as useFirebaseAuth, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { ROLES_INTERNAL } from '@/lib/types';
import { useIdleSessionTimeout, IDLE_TIMEOUT_MS, WARNING_BEFORE_MS } from '@/hooks/useIdleSessionTimeout';
import { IdleTimeoutModal } from '@/components/IdleTimeoutModal';
import { useSessionTracking } from '@/hooks/useSessionTracking';
import {
  FORCE_LOGOUT_STORAGE_KEY,
  markIdleSession,
  signOutWithSessionStatus,
  SYSTEM_SETTINGS_COLLECTION,
  SESSION_SECURITY_DOC,
} from '@/lib/session-tracking';
import { useMaintenanceGuard } from '@/hooks/useMaintenance';
import { timestampToMillis } from '@/lib/session-tracking';
import { getMaintenanceSource } from '@/lib/maintenance';
import { useToast } from '@/hooks/use-toast';
import { HrdScopeProvider } from '@/providers/hrd-scope-provider';

/** Paths inside /admin that don't need auth or idle-timeout protection. */
const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/change-password'];

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { userProfile, loading } = useAuth();
  const auth   = useFirebaseAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const isPublicPath = PUBLIC_ADMIN_PATHS.includes(pathname);
  const isLoggedIn   = !loading && !!userProfile;

  // ── Maintenance Control: checks the user's real role against
  // system_maintenance/global and system_maintenance/role_{role} ONLY.
  // This is the single source of truth for access locking — Pengumuman Sistem
  // (system_announcements) is never read here.
  const { blocked: maintenanceBlocked, rule: maintenanceRule, rules: maintenanceRules } = useMaintenanceGuard(pathname);

  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG_MAINTENANCE === 'true' && userProfile) {
    // eslint-disable-next-line no-console
    console.log('[maintenance-check]', {
      actualRole: userProfile.role,
      globalMaintenance: maintenanceRules.find((r) => r.targetType === 'global') ?? null,
      roleMaintenance: maintenanceRules.find((r) => r.targetType === 'role') ?? null,
      shouldBlock: maintenanceBlocked,
      source: maintenanceRule ? getMaintenanceSource(maintenanceRule) : null,
    });
  }

  // ── Session settings from Firestore (idle timeout config) ───────────────
  const settingsRef = useMemoFirebase(
    () => doc(firestore, SYSTEM_SETTINGS_COLLECTION, SESSION_SECURITY_DOC),
    [firestore],
  );
  const { data: sessionSettings } = useDoc(settingsRef);
  const rawSettings = sessionSettings as any;
  const idleTimeoutMs   = rawSettings?.idleTimeoutMinutes
    ? rawSettings.idleTimeoutMinutes * 60 * 1000
    : IDLE_TIMEOUT_MS;
  // Prefer the seconds-based field if present; fall back to the older
  // minutes-based one so existing configs keep working.
  const warningBeforeMs = rawSettings?.warningBeforeLogoutSeconds
    ? rawSettings.warningBeforeLogoutSeconds * 1000
    : rawSettings?.warningBeforeLogoutMinutes
      ? rawSettings.warningBeforeLogoutMinutes * 60 * 1000
      : WARNING_BEFORE_MS;
  const autoLogoutEnabled = rawSettings?.autoLogoutEnabled !== false; // default true
  const trackMouseMove    = rawSettings?.trackMouseMove !== false;    // default true
  const trackKeyboard     = rawSettings?.trackKeyboard !== false;     // default true
  const trackScroll       = rawSettings?.trackScroll !== false;       // default true

  // ── Redirect logic ──────────────────────────────────────────────────────
  // Never redirects while `loading` is true — Firebase Auth/profile restore
  // must finish first, otherwise a still-authenticated user briefly looks
  // "logged out" and gets bounced to /admin/login before their session is
  // even done loading.
  useEffect(() => {
    if (isPublicPath) return;
    if (loading) return;

    if (!userProfile) {
      console.log('[session-debug]', { reason: 'auth_null', pathname });
      router.replace('/admin/login');
      return;
    }

    if (!ROLES_INTERNAL.includes(userProfile.role as any)) {
      console.log('[session-debug]', { reason: 'role_missing', role: userProfile.role, pathname });
      router.replace('/careers/login');
      return;
    }

    if ((userProfile as any).mustChangePassword === true) {
      router.replace('/admin/change-password');
      return;
    }

    if (maintenanceBlocked && maintenanceRule) {
      console.log('[session-debug]', { reason: 'maintenance_redirect', pathname, rule: maintenanceRule.title });
      const estimatedEndMs = timestampToMillis(maintenanceRule.estimatedEndAt);
      const params = new URLSearchParams({
        title: maintenanceRule.title || 'Fitur Sedang Dalam Perbaikan',
        message: maintenanceRule.message || 'Fitur ini sedang dalam perbaikan. Silakan coba lagi nanti.',
        source: getMaintenanceSource(maintenanceRule),
        ...(estimatedEndMs ? { estimatedEndAt: String(estimatedEndMs) } : {}),
      });
      router.replace(`/maintenance?${params.toString()}`);
    }
  }, [userProfile, loading, router, pathname, isPublicPath, maintenanceBlocked, maintenanceRule]);

  // ── Idle timeout ────────────────────────────────────────────────────────
  const handleIdleTimeout = useCallback(async () => {
    console.log('[session-debug]', { reason: 'idle_timeout', uid: userProfile?.uid, timeoutMinutes: Math.round(idleTimeoutMs / 60000) });
    try {
      await signOutWithSessionStatus(
        auth,
        firestore,
        userProfile?.uid,
        'idle_timeout',
        'auto_logged_out',
      );
    } catch { /* signOut failed — still redirect */ }
    // Clear any sensitive session keys
    try {
      [FORCE_LOGOUT_STORAGE_KEY].forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
    // Never log the user out silently — always say why.
    toast({
      title: 'Sesi berakhir',
      description: `Sesi berakhir karena tidak ada aktivitas selama ${Math.round(idleTimeoutMs / 60000)} menit.`,
    });
    router.replace('/admin/login');
  }, [auth, firestore, router, userProfile?.uid, idleTimeoutMs, toast]);

  const handleIdleWarning = useCallback(async () => {
    if (!userProfile?.uid) return;
    try {
      await markIdleSession(firestore, userProfile.uid);
    } catch {
      // Session status should not block the idle warning UI.
    }
  }, [firestore, userProfile?.uid]);

  useSessionTracking({
    enabled: isLoggedIn && !isPublicPath,
    userProfile,
    auth,
    firestore,
    loginPath: '/admin/login',
  });

  const { showWarning, secondsRemaining, keepAlive } = useIdleSessionTimeout({
    enabled:        isLoggedIn && !isPublicPath && autoLogoutEnabled,
    idleTimeoutMs,
    warningBeforeMs,
    trackMouseMove,
    trackKeyboard,
    trackScroll,
    onTimeout:      handleIdleTimeout,
    onWarning:      handleIdleWarning,
  });

  // ── Render: public admin paths ──────────────────────────────────────────
  if (isPublicPath) return <>{children}</>;

  // ── Render: loading / auth gate ─────────────────────────────────────────
  if (
    loading ||
    !userProfile ||
    !ROLES_INTERNAL.includes(userProfile.role as any) ||
    (userProfile as any).mustChangePassword === true ||
    maintenanceBlocked
  ) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // ── Render: protected page + idle-timeout modal ─────────────────────────
  // HrdScopeProvider reads roles_hrd/{uid} exactly once here for the whole
  // dashboard tree — child pages/components consume it via
  // useHrdScopeContext() instead of each opening their own listener.
  return (
    <HrdScopeProvider>
      {children}
      {showWarning && (
        <IdleTimeoutModal
          secondsRemaining={secondsRemaining}
          onKeepAlive={keepAlive}
          onLogoutNow={handleIdleTimeout}
        />
      )}
    </HrdScopeProvider>
  );
}
