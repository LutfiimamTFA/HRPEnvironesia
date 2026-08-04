'use client';

import { getMessaging, getToken, deleteToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
}

/** Docs live at push_subscriptions/{uid}/devices/{deviceId} — device token is the doc id (sanitized) so re-subscribing on the same device/browser updates the same doc instead of piling up duplicates. */
function devicesCollection(firestore: Firestore, uid: string) {
  return collection(firestore, 'push_subscriptions', uid, 'devices');
}

function sanitizeTokenForDocId(token: string): string {
  // Firestore doc ids can't contain "/" — FCM tokens sometimes do.
  return token.replace(/\//g, '_');
}

function describeDevice(): { deviceLabel: string; platform: string } {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const platform = isIosDevice() ? 'ios' : /android/i.test(ua) ? 'android' : /mac/i.test(ua) ? 'mac' : /win/i.test(ua) ? 'windows' : 'unknown';
  let deviceLabel = 'Perangkat tidak dikenal';
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) deviceLabel = 'Chrome';
  else if (/edg/i.test(ua)) deviceLabel = 'Edge';
  else if (/firefox/i.test(ua)) deviceLabel = 'Firefox';
  else if (/safari/i.test(ua)) deviceLabel = 'Safari';
  deviceLabel += ` — ${platform === 'ios' ? 'iPhone/iPad' : platform === 'android' ? 'Android' : platform === 'mac' ? 'Mac' : platform === 'windows' ? 'Windows' : 'Unknown'}`;
  return { deviceLabel, platform };
}

async function getMessagingInstance(): Promise<Messaging | null> {
  if (!isPushSupported()) return null;
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  return getMessaging(getApp());
}

export type PushSetupResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'unsupported' | 'ios-needs-home-screen' | 'permission-denied' | 'no-vapid-key' | 'error'; message: string };

/**
 * User-initiated ("Aktifkan Notifikasi Perangkat") — registers the service
 * worker, asks for Notification permission, and saves the resulting FCM token
 * under push_subscriptions/{uid}/devices/{token}. Never called automatically
 * on login; the user must press the button at least once per device.
 */
export async function enablePushForDevice(firestore: Firestore, uid: string): Promise<PushSetupResult> {
  if (isIosDevice() && !isStandalonePwa()) {
    return { ok: false, reason: 'ios-needs-home-screen', message: 'Di iPhone, tambahkan HRP Environesia ke Home Screen terlebih dahulu agar notifikasi bisa diterima.' };
  }
  if (!isPushSupported()) {
    return { ok: false, reason: 'unsupported', message: 'Perangkat/browser ini tidak mendukung notifikasi push.' };
  }
  if (!VAPID_KEY) {
    return { ok: false, reason: 'no-vapid-key', message: 'Konfigurasi VAPID key belum diisi di server.' };
  }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, reason: 'permission-denied', message: 'Izin notifikasi ditolak. Aktifkan lewat pengaturan browser untuk mencoba lagi.' };
    }

    const messaging = await getMessagingInstance();
    if (!messaging) return { ok: false, reason: 'unsupported', message: 'Perangkat/browser ini tidak mendukung notifikasi push.' };

    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, reason: 'error', message: 'Gagal membuat token notifikasi.' };

    const { deviceLabel, platform } = describeDevice();
    const deviceId = sanitizeTokenForDocId(token);
    const deviceRef = doc(devicesCollection(firestore, uid), deviceId);
    await setDoc(deviceRef, {
      uid,
      deviceId,
      token,
      fcmToken: token,
      endpoint: token, // FCM's equivalent of a raw PushSubscription.endpoint — this app dispatches via admin.messaging() (FCM token), not the raw Web Push protocol, so there is no separate p256dh/auth "keys" pair to store.
      keys: null,
      deviceName: deviceLabel,
      deviceLabel,
      platform,
      userAgent: navigator.userAgent,
      permission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
      enabled: true,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
    }, { merge: true });

    // Don't report success unless the write actually landed — a rules
    // rejection or offline write wouldn't throw from setDoc() alone.
    const verifySnap = await getDoc(deviceRef);
    if (!verifySnap.exists() || verifySnap.data()?.enabled !== true) {
      return { ok: false, reason: 'error', message: 'Subscription gagal tersimpan, coba lagi.' };
    }

    return { ok: true, token };
  } catch (error: any) {
    return { ok: false, reason: 'error', message: error?.message || 'Gagal mengaktifkan notifikasi perangkat.' };
  }
}

/** Silently (no permission prompt) resolves this browser's current device doc id, if push was already enabled here — used to render the dropdown's active/inactive status card without side effects. */
export async function getCurrentDeviceId(): Promise<string | null> {
  if (!isPushSupported() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
  if (!VAPID_KEY) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    if (!registration) return null;
    const messaging = await getMessagingInstance();
    if (!messaging) return null;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    return token ? sanitizeTokenForDocId(token) : null;
  } catch {
    return null;
  }
}

/** Only called when the user explicitly picks "Nonaktifkan" for one device — never from the logout flow. Actually unsubscribes the browser's push registration, then marks the Firestore doc inactive (kept, not deleted, so history/audit isn't lost). */
export async function disableDevice(firestore: Firestore, uid: string, deviceId: string): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch { /* best-effort */ }
  try {
    const messaging = await getMessagingInstance();
    if (messaging) await deleteToken(messaging).catch(() => {});
  } catch { /* best-effort */ }
  await updateDoc(doc(devicesCollection(firestore, uid), deviceId), { isActive: false, enabled: false, updatedAt: serverTimestamp(), disabledAt: serverTimestamp() });
}

/** "Nonaktifkan semua perangkat" — marks every device doc for this user inactive. */
export async function disableAllDevices(firestore: Firestore, uid: string): Promise<void> {
  const snap = await getDocs(devicesCollection(firestore, uid));
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { isActive: false, enabled: false, updatedAt: serverTimestamp(), disabledAt: serverTimestamp() })));
}

export async function removeDevice(firestore: Firestore, uid: string, deviceId: string): Promise<void> {
  await deleteDoc(doc(devicesCollection(firestore, uid), deviceId));
}

/** Foreground handler — tab is open, so we don't need a system push, just refresh the in-app dropdown/toast. */
export async function listenForegroundPush(onPush: (payload: { title: string; body: string; url: string }) => void): Promise<() => void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};
  const unsubscribe = onMessage(messaging, (payload) => {
    onPush({
      title: payload?.notification?.title || 'HRP Environesia',
      body: payload?.notification?.body || 'Anda memiliki notifikasi baru.',
      url: (payload?.data as any)?.url || '/admin',
    });
  });
  return unsubscribe;
}

async function authedFetch(path: string, body: unknown): Promise<any> {
  const auth = getAuth(getApp());
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Belum login.');
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  // Deliberately NOT throwing on a non-2xx here — callers need the parsed
  // body (message/code) even on failure to tell a real send failure apart
  // from "not authorized", and to avoid ever treating a bare HTTP 200 as
  // proof of delivery (that check belongs to the caller, on `.messageId`).
  return res.json().catch(() => ({ success: false, message: 'Respons server tidak valid.' }));
}

export type PushTestResult =
  | { success: true; messageId: string; tokenCount: 1; deviceId: string; sentAt: string }
  | { success: false; message: string; deviceId?: string; code?: string };

export type PushScheduleResult =
  | { success: true; scheduled: true; deviceId: string; scheduledAt: string; willSendAt: string; delaySeconds: number; message: string }
  | { success: false; message: string };

/** "Kirim Sekarang" — only ever trust `.messageId` as proof, never the bare HTTP status. */
export async function sendTestPush(deviceId: string): Promise<PushTestResult> {
  return authedFetch('/api/push/test', { deviceId });
}

/** "Kirim dalam 10 Detik" — the actual delay/send runs server-side (see /api/push/test-scheduled), never a frontend setTimeout, so it survives the tab being closed. */
export async function scheduleTestPush(deviceId: string, delaySeconds = 10): Promise<PushScheduleResult> {
  return authedFetch('/api/push/test-scheduled', { deviceId, delaySeconds });
}
