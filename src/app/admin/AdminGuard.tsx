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

/** Paths inside /admin that don't need auth or idle-timeout protection. */
const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/change-password'];

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { userProfile, loading } = useAuth();
  const auth   = useFirebaseAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const pathname = usePathname();

  const isPublicPath = PUBLIC_ADMIN_PATHS.includes(pathname);
  const isLoggedIn   = !loading && !!userProfile;

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
  const warningBeforeMs = rawSettings?.warningBeforeLogoutMinutes
    ? rawSettings.warningBeforeLogoutMinutes * 60 * 1000
    : WARNING_BEFORE_MS;

  // ── Redirect logic ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isPublicPath) return;
    if (loading) return;

    if (!userProfile) {
      router.replace('/admin/login');
      return;
    }

    if (!ROLES_INTERNAL.includes(userProfile.role as any)) {
      router.replace('/careers/login');
      return;
    }

    if ((userProfile as any).mustChangePassword === true) {
      router.replace('/admin/change-password');
    }
  }, [userProfile, loading, router, pathname, isPublicPath]);

  // ── Idle timeout ────────────────────────────────────────────────────────
  const handleIdleTimeout = useCallback(async () => {
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
    router.replace('/admin/login');
  }, [auth, firestore, router, userProfile?.uid]);

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
    enabled:        isLoggedIn && !isPublicPath,
    idleTimeoutMs,
    warningBeforeMs,
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
    (userProfile as any).mustChangePassword === true
  ) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // ── Render: protected page + idle-timeout modal ─────────────────────────
  return (
    <>
      {children}
      {showWarning && (
        <IdleTimeoutModal
          secondsRemaining={secondsRemaining}
          onKeepAlive={keepAlive}
          onLogoutNow={handleIdleTimeout}
        />
      )}
    </>
  );
}
