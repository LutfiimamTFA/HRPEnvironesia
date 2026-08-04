"use client";

import { getAuth } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { initializeFirebase } from "@/firebase";
import { isMonitoringDisabled } from "@/lib/monitoring-flags";

export type SystemAnalyticsEventType =
  | "login"
  | "logout"
  | "page_view"
  | "module_opened"
  | "export_to_drive"
  | "export_download"
  | "backup_started"
  | "backup_completed"
  | "sync_started"
  | "error_occurred"
  | "api_failed"
  | "file_uploaded"
  | "upload_failed";

type EventStatus = "success" | "failed" | "started" | "completed" | "info";

const BLOCKED_METADATA_KEYS = [
  "token",
  "password",
  "privatekey",
  "private_key",
  "clientsecret",
  "client_secret",
  "refresh_token",
  "refreshtoken",
  "secret",
];

function sanitizeMetadata(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeMetadata);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => {
        const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
        return !BLOCKED_METADATA_KEYS.some((blocked) => normalized.includes(blocked));
      })
      .slice(0, 30)
      .map(([key, item]) => [key, sanitizeMetadata(item)]),
  );
}

export async function trackSystemEvent({
  eventType,
  module,
  action,
  status = "info",
  path,
  metadata,
  uid,
  email,
  role,
}: {
  eventType: SystemAnalyticsEventType;
  module: string;
  action: string;
  status?: EventStatus;
  path?: string;
  metadata?: Record<string, unknown>;
  uid?: string | null;
  email?: string | null;
  role?: string | null;
}) {
  if (isMonitoringDisabled()) {
    return;
  }

  try {
    const { firestore } = initializeFirebase();
    const currentUser = getAuth().currentUser;

    await addDoc(collection(firestore, "system_analytics_events"), {
      eventType,
      uid: uid ?? currentUser?.uid ?? null,
      email: email ?? currentUser?.email ?? null,
      role: role ?? null,
      module,
      action,
      status,
      path: path ?? (typeof window !== "undefined" ? window.location.pathname : null),
      metadata: sanitizeMetadata(metadata ?? {}),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn("[analytics] Failed to track system event:", error);
  }
}
