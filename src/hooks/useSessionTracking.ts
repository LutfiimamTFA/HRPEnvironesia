'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { doc, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import {
  FORCE_LOGOUT_STORAGE_KEY,
  SESSION_ACTIVITY_THROTTLE_MS,
  SYSTEM_SETTINGS_COLLECTION,
  SESSION_SECURITY_DOC,
  claimTabLeadership,
  getStoredSessionStartedAt,
  markActiveSession,
  signOutWithSessionStatus,
  timestampToMillis,
} from '@/lib/session-tracking';
import type { UserProfile } from '@/lib/types';
import { isMonitoringDisabled } from '@/lib/monitoring-flags';

const ANALYTICS_DISABLED = isMonitoringDisabled();

const ACTIVITY_EVENTS = [
  'click',
  'keydown',
  'mousemove',
  'scroll',
  'touchstart',
] as const;

type UseSessionTrackingOptions = {
  enabled: boolean;
  userProfile: UserProfile | null;
  auth: Auth;
  firestore: Firestore;
  loginPath: string;
};

export function useSessionTracking({
  enabled,
  userProfile,
  auth,
  firestore,
  loginPath,
}: UseSessionTrackingOptions) {
  const router = useRouter();
  const { toast } = useToast();
  const lastWriteAtRef = useRef(0);
  const forceLogoutHandledRef = useRef(false);
  const sessionStartedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!enabled || !userProfile?.uid) return;
    sessionStartedAtRef.current = getStoredSessionStartedAt();
  }, [enabled, userProfile?.uid]);

  const writeActivity = useCallback(
    async (force = false) => {
      if (ANALYTICS_DISABLED) return;
      if (!enabled || !userProfile?.uid) return;
      if (typeof document !== 'undefined' && document.hidden) return;

      const now = Date.now();
      if (!force && now - lastWriteAtRef.current < SESSION_ACTIVITY_THROTTLE_MS) {
        return;
      }
      if (!claimTabLeadership(`hrp:sessionHeartbeatLeader:${userProfile.uid}`)) {
        return;
      }

      lastWriteAtRef.current = now;
      try {
        await markActiveSession(firestore, userProfile.uid);
      } catch (error) {
        console.warn('Failed to update lastActiveAt:', error);
      }
    },
    [enabled, firestore, userProfile?.uid],
  );

  useEffect(() => {
    if (ANALYTICS_DISABLED) return;
    if (!enabled || !userProfile?.uid) return;

    writeActivity(true);

    const onActivity = () => {
      writeActivity();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        writeActivity(true);
      }
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      document.addEventListener(eventName, onActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        document.removeEventListener(eventName, onActivity);
      });
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, userProfile?.uid, writeActivity]);

  // ── Per-user force logout (forceLogoutAt on the user doc) ──────────────
  useEffect(() => {
    if (!enabled || !userProfile?.uid || forceLogoutHandledRef.current) return;

    const forceLogoutAt = timestampToMillis((userProfile as any).forceLogoutAt);
    if (!forceLogoutAt || forceLogoutAt <= sessionStartedAtRef.current) return;

    forceLogoutHandledRef.current = true;
    toast({
      variant: 'destructive',
      title: 'Sesi Diakhiri',
      description: 'Sesi Anda telah diakhiri oleh Super Admin. Silakan login ulang.',
    });

    try {
      localStorage.setItem(FORCE_LOGOUT_STORAGE_KEY, String(Date.now()));
    } catch {
      // Ignore storage failures.
    }

    signOutWithSessionStatus(auth, firestore, userProfile.uid, 'force_logout', 'offline')
      .catch(() => auth.signOut())
      .finally(() => router.replace(loginPath));
  }, [auth, enabled, firestore, loginPath, router, toast, userProfile]);

  // ── Global force logout (forceLogoutAllAt in system_settings) ──────────
  const forceLogoutAllHandledRef = useRef(false);

  useEffect(() => {
    if (!enabled || !userProfile?.uid) return;

    const settingsRef = doc(
      firestore,
      SYSTEM_SETTINGS_COLLECTION,
      SESSION_SECURITY_DOC,
    );

    const unsubscribe = onSnapshot(settingsRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const forceLogoutAllAt = timestampToMillis(data?.forceLogoutAllAt);
      if (!forceLogoutAllAt) return;
      if (forceLogoutAllAt <= sessionStartedAtRef.current) return;
      if (forceLogoutHandledRef.current || forceLogoutAllHandledRef.current) return;

      forceLogoutAllHandledRef.current = true;
      toast({
        variant: 'destructive',
        title: 'Sesi Diakhiri',
        description:
          'Semua sesi telah diakhiri oleh Super Admin. Silakan login ulang.',
      });

      try {
        localStorage.setItem(FORCE_LOGOUT_STORAGE_KEY, String(Date.now()));
      } catch { /* ignore */ }

      signOutWithSessionStatus(
        auth,
        firestore,
        userProfile!.uid,
        'force_logout',
        'offline',
      )
        .catch(() => auth.signOut())
        .finally(() => router.replace(loginPath));
    });

    return () => unsubscribe();
  // Intentionally broad deps: only re-subscribe when session identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userProfile?.uid]);
}
