import {
  addDoc,
  collection,
  Timestamp,
  type Firestore,
} from "firebase/firestore";
import type { Notification } from "./types";

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
}
