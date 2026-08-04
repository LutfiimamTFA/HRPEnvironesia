'use client';

import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import {
  doc,
  collection,
  serverTimestamp,
  updateDoc,
  setDoc,
  addDoc,
} from 'firebase/firestore';
import { trackSystemEvent } from '@/lib/analytics/trackSystemEvent';
import { isMonitoringDisabled } from '@/lib/monitoring-flags';

export type SessionStatus =
  | 'online'
  | 'idle'
  | 'offline'
  | 'auto_logged_out'
  | 'never_logged_in';

export type LogoutReason =
  | 'manual_logout'
  | 'idle_timeout'
  | 'force_logout'
  | null;

export const SESSION_ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;
export const SESSION_START_STORAGE_KEY = 'hrp:sessionStartedAt';
export const SESSION_ID_STORAGE_KEY = 'hrp:currentSessionId';
export const FORCE_LOGOUT_STORAGE_KEY = 'hrp:forceLogout';

const ANALYTICS_DISABLED = isMonitoringDisabled();

/**
 * Simple cross-tab leader election backed by localStorage. Only the tab
 * holding a fresh lock is allowed to perform a given periodic Firestore
 * write (e.g. heartbeat), so opening N tabs doesn't multiply writes by N.
 */
const TAB_ID =
  typeof window !== 'undefined'
    ? typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    : '';

export function claimTabLeadership(lockKey: string, ttlMs = 90 * 1000): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(lockKey);
    const now = Date.now();
    if (raw) {
      const parsed = JSON.parse(raw) as { tabId: string; ts: number };
      if (parsed.tabId !== TAB_ID && now - parsed.ts < ttlMs) {
        return false;
      }
    }
    localStorage.setItem(lockKey, JSON.stringify({ tabId: TAB_ID, ts: now }));
    return true;
  } catch {
    return true;
  }
}

function getSafeNavigator() {
  if (typeof navigator === 'undefined') return null;
  return navigator;
}

export function getCurrentDeviceInfo() {
  const nav = getSafeNavigator();
  if (!nav) return null;

  return {
    userAgent: nav.userAgent || null,
    language: nav.language || null,
    platform: nav.platform || null,
  };
}

export function getOrCreateSessionId(uid: string) {
  if (typeof window === 'undefined') return `${uid}-${Date.now()}`;

  const existing = localStorage.getItem(SESSION_ID_STORAGE_KEY);
  if (existing) return existing;

  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${uid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  localStorage.setItem(SESSION_ID_STORAGE_KEY, generated);
  return generated;
}

export function markSessionStarted() {
  const startedAt = Date.now();
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_START_STORAGE_KEY, String(startedAt));
  }
  return startedAt;
}

export function getStoredSessionStartedAt() {
  if (typeof window === 'undefined') return Date.now();
  const stored = Number(localStorage.getItem(SESSION_START_STORAGE_KEY));
  if (Number.isFinite(stored) && stored > 0) return stored;
  return markSessionStarted();
}

export function clearLocalSessionTracking() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_START_STORAGE_KEY);
  localStorage.removeItem(SESSION_ID_STORAGE_KEY);
}

export async function updateUserSession(
  firestore: Firestore,
  uid: string,
  data: Record<string, unknown>,
) {
  const userRef = doc(firestore, 'users', uid);
  await updateDoc(userRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function markLoginSession(
  firestore: Firestore,
  uid: string,
  extra?: { email?: string | null; displayName?: string | null; role?: string | null },
) {
  const sessionId = getOrCreateSessionId(uid);
  markSessionStarted();

  await setDoc(
    doc(firestore, 'users', uid),
    {
      sessionStatus: 'online' satisfies SessionStatus,
      lastLoginAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
      lastLogoutAt: null,
      logoutReason: null satisfies LogoutReason,
      currentSessionId: sessionId,
      currentDeviceInfo: getCurrentDeviceInfo(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // Write session log (non-blocking)
  writeSessionLog(firestore, {
    uid,
    email: extra?.email ?? null,
    displayName: extra?.displayName ?? null,
    role: extra?.role ?? null,
    action: 'login',
    deviceInfo: getCurrentDeviceInfo(),
  });

  trackSystemEvent({
    eventType: 'login',
    module: 'Authentication',
    action: 'login',
    status: 'success',
    uid,
    email: extra?.email ?? null,
    role: extra?.role ?? null,
  });

  return sessionId;
}

export async function markActiveSession(firestore: Firestore, uid: string) {
  if (ANALYTICS_DISABLED) return;
  await updateUserSession(firestore, uid, {
    sessionStatus: 'online' satisfies SessionStatus,
    lastActiveAt: serverTimestamp(),
    currentSessionId: getOrCreateSessionId(uid),
    currentDeviceInfo: getCurrentDeviceInfo(),
  });
}

export async function markIdleSession(firestore: Firestore, uid: string) {
  if (ANALYTICS_DISABLED) return;
  await updateUserSession(firestore, uid, {
    sessionStatus: 'idle' satisfies SessionStatus,
    lastActiveAt: serverTimestamp(),
  });
}

export async function markLogoutSession(
  firestore: Firestore,
  uid: string,
  reason: Exclude<LogoutReason, null>,
  status: Extract<SessionStatus, 'offline' | 'auto_logged_out'> = 'offline',
) {
  await updateUserSession(firestore, uid, {
    sessionStatus: status,
    lastLogoutAt: serverTimestamp(),
    logoutReason: reason,
    currentSessionId: null,
  });
  clearLocalSessionTracking();
}

export async function markForceLogoutSession(
  firestore: Firestore,
  targetUid: string,
  reason: string,
  actorUid: string,
  extra?: { targetEmail?: string | null; targetName?: string | null; targetRole?: string | null; actorName?: string | null },
) {
  await updateUserSession(firestore, targetUid, {
    forceLogoutAt: serverTimestamp(),
    forceLogoutReason: reason,
    forceLogoutByUid: actorUid,
    forceLogoutByName: extra?.actorName ?? null,
    sessionStatus: 'offline' satisfies SessionStatus,
    lastLogoutAt: serverTimestamp(),
    logoutReason: 'force_logout' satisfies LogoutReason,
    currentSessionId: null,
  });
  // Write session log (non-blocking)
  writeSessionLog(firestore, {
    uid: targetUid,
    email: extra?.targetEmail ?? null,
    displayName: extra?.targetName ?? null,
    role: extra?.targetRole ?? null,
    action: 'force_logout',
    reason,
    actorUid,
    actorName: extra?.actorName ?? null,
  });
}

export async function signOutWithSessionStatus(
  auth: Auth,
  firestore: Firestore,
  uid: string | undefined,
  reason: Exclude<LogoutReason, null>,
  status: Extract<SessionStatus, 'offline' | 'auto_logged_out'> = 'offline',
  extra?: { email?: string | null; displayName?: string | null; role?: string | null; actorUid?: string | null; actorName?: string | null },
) {
  if (uid) {
    try {
      await markLogoutSession(firestore, uid, reason, status);
    } catch (error) {
      console.warn('Failed to update session status before sign out:', error);
    }
    // Write session log (non-blocking)
    writeSessionLog(firestore, {
      uid,
      email: extra?.email ?? null,
      displayName: extra?.displayName ?? null,
      role: extra?.role ?? null,
      action: reason as SessionLogAction,
      reason: reason,
      actorUid: extra?.actorUid ?? null,
      actorName: extra?.actorName ?? null,
      deviceInfo: getCurrentDeviceInfo(),
    });
    trackSystemEvent({
      eventType: 'logout',
      module: 'Authentication',
      action: reason,
      status: 'success',
      uid,
      email: extra?.email ?? null,
      role: extra?.role ?? null,
    });
  }

  await auth.signOut();
}

export const SYSTEM_SETTINGS_COLLECTION = 'system_settings';
export const SESSION_SECURITY_DOC = 'session_security';
export const SESSION_LOGS_COLLECTION = 'session_logs';

export type SessionLogAction =
  | 'login'
  | 'manual_logout'
  | 'idle_timeout'
  | 'force_logout'
  | 'force_logout_all';

export interface SessionLogEntry {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  role?: string | null;
  action: SessionLogAction;
  reason?: string | null;
  actorUid?: string | null;
  actorName?: string | null;
  deviceInfo?: object | null;
  createdAt?: any;
}

export async function writeSessionLog(
  firestore: Firestore,
  entry: Omit<SessionLogEntry, 'createdAt'>,
) {
  if (ANALYTICS_DISABLED) return;
  try {
    await addDoc(collection(firestore, SESSION_LOGS_COLLECTION), {
      ...entry,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking — log failures should never interrupt auth flows.
  }
}

export async function markForceLogoutAll(
  firestore: Firestore,
  actorUid: string,
  actorName: string,
  reason: string,
) {
  await setDoc(
    doc(firestore, SYSTEM_SETTINGS_COLLECTION, SESSION_SECURITY_DOC),
    {
      forceLogoutAllAt: serverTimestamp(),
      forceLogoutAllReason: reason,
      forceLogoutAllByUid: actorUid,
      forceLogoutAllByName: actorName,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function saveSessionSettings(
  firestore: Firestore,
  settings: {
    idleTimeoutMinutes: number;
    warningBeforeLogoutMinutes: number;
    autoLogoutEnabled: boolean;
    crossTabLogoutEnabled: boolean;
  },
  actorUid: string,
  actorName: string,
) {
  await setDoc(
    doc(firestore, SYSTEM_SETTINGS_COLLECTION, SESSION_SECURITY_DOC),
    {
      ...settings,
      updatedAt: serverTimestamp(),
      updatedByUid: actorUid,
      updatedByName: actorName,
    },
    { merge: true },
  );
}

export function timestampToMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return null;
}
