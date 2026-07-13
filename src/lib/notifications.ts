import {
  addDoc,
  collection,
  Timestamp,
  type Firestore,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getApp } from "firebase/app";
import type { Notification } from "./types";

/**
 * Best-effort Web Push companion to a dropdown notification — never allowed
 * to throw into the caller, since push is an extra device channel, not the
 * source of truth (the dropdown doc above is already written by the time
 * this runs). Content is generic/non-sensitive since it can render on a lock
 * screen; the actionUrl is only used to open the right page on click.
 */
async function dispatchPushBestEffort(uid: string, title: string, message: string, url?: string) {
  try {
    const auth = getAuth(getApp());
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return;
    await fetch("/api/push/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ uid, title, message, url }),
    });
  } catch {
    // Push is best-effort — the in-app dropdown notification already succeeded.
  }
}

export async function sendNotification(
  firestore: Firestore,
  notification: Omit<Notification, "id" | "createdAt" | "isRead">,
) {
  const notificationsRef = collection(
    firestore,
    "users",
    notification.userId,
    "notifications",
  );

  await addDoc(notificationsRef, {
    ...notification,
    isRead: false,
    createdAt: Timestamp.now(),
  });

  void dispatchPushBestEffort(notification.userId, notification.title, notification.message, notification.actionUrl);
}

export async function sendHrdNotification(
  firestore: Firestore,
  notification: Omit<
    Omit<Notification, "id" | "createdAt" | "isRead" | "userId">,
    "targetType"
  > & { targetType: "user" | "job" | "application" | "employee"; recipientUid?: string },
) {
  const notificationsRef = collection(firestore, "hrd_notifications");

  await addDoc(notificationsRef, {
    ...notification,
    isRead: false,
    createdAt: Timestamp.now(),
  });

  if (notification.recipientUid) {
    void dispatchPushBestEffort(notification.recipientUid, notification.title, notification.message, notification.actionUrl);
  }
}
