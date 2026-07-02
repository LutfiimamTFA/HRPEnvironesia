'use client';

import { useEffect, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, onSnapshot } from 'firebase/firestore';

export const FEATURE_SETTINGS_DOC = 'features';
export const FEATURE_SETTINGS_COLLECTION = 'system_settings';

export type FeatureRiskLevel = 'low' | 'medium' | 'high';

export type FeatureKey =
  | 'backup_auto'
  | 'google_drive_backup'
  | 'candidate_portal'
  | 'employee_invite'
  | 'offering_letter'
  | 'maintenance_lock';

export interface FeatureFlag {
  enabled: boolean;
  label: string;
  description: string;
  riskLevel: FeatureRiskLevel;
  updatedAt?: any;
  updatedByUid?: string | null;
  updatedByName?: string | null;
}

export type FeatureConfig = Partial<Record<FeatureKey, FeatureFlag>>;

/** Default config used both to seed Firestore ("Inisialisasi Feature Config") and as
 * the fail-safe fallback if the doc/field doesn't exist yet — features default to
 * their documented enabled state, not silently OFF, so a missing doc never breaks
 * existing usage on first deploy. */
export const FEATURE_DEFAULTS: Record<FeatureKey, Omit<FeatureFlag, 'updatedAt' | 'updatedByUid' | 'updatedByName'>> = {
  backup_auto: {
    enabled: false,
    label: 'Backup Otomatis',
    description: 'Jalankan backup otomatis ke Google Drive setiap hari.',
    riskLevel: 'low',
  },
  google_drive_backup: {
    enabled: false,
    label: 'Google Drive Backup',
    description: 'Aktifkan integrasi Google Drive untuk menyimpan hasil backup.',
    riskLevel: 'low',
  },
  candidate_portal: {
    enabled: true,
    label: 'Candidate Portal',
    description: 'Izinkan kandidat eksternal mendaftar dan melacak status lamaran via portal publik.',
    riskLevel: 'medium',
  },
  employee_invite: {
    enabled: true,
    label: 'Employee Invite',
    description: 'Kirim undangan email ke karyawan baru agar bisa mengaktifkan akun HRP.',
    riskLevel: 'low',
  },
  offering_letter: {
    enabled: true,
    label: 'Offering Letter',
    description: 'Aktifkan fitur generate dan pengiriman offering letter ke kandidat yang diterima.',
    riskLevel: 'medium',
  },
  maintenance_lock: {
    enabled: true,
    label: 'Maintenance Lock',
    description: 'Kunci akses dashboard untuk role tertentu saat maintenance sistem berlangsung.',
    riskLevel: 'high',
  },
};

export const FEATURE_KEYS = Object.keys(FEATURE_DEFAULTS) as FeatureKey[];

function featureDocRef(firestore: Firestore) {
  return doc(firestore, FEATURE_SETTINGS_COLLECTION, FEATURE_SETTINGS_DOC);
}

/** Creates system_settings/features with default values for any feature not yet configured. */
export async function initializeFeatureConfig(firestore: Firestore, actorUid: string, actorName: string) {
  const ref = featureDocRef(firestore);
  const snap = await getDoc(ref);
  const existing = (snap.exists() ? snap.data() : {}) as FeatureConfig;

  const merged: FeatureConfig = { ...existing };
  for (const key of FEATURE_KEYS) {
    if (!merged[key]) {
      merged[key] = {
        ...FEATURE_DEFAULTS[key],
        updatedAt: serverTimestamp(),
        updatedByUid: actorUid,
        updatedByName: actorName,
      };
    }
  }

  await setDoc(ref, merged, { merge: true });
  return merged;
}

/** Toggles a single feature ON/OFF and writes the required audit_logs entry. */
export async function toggleFeature(
  firestore: Firestore,
  key: FeatureKey,
  enabled: boolean,
  actorUid: string,
  actorName: string,
  previousEnabled: boolean,
) {
  const ref = featureDocRef(firestore);
  const base = FEATURE_DEFAULTS[key];
  await setDoc(
    ref,
    {
      [key]: {
        enabled,
        label: base.label,
        description: base.description,
        riskLevel: base.riskLevel,
        updatedAt: serverTimestamp(),
        updatedByUid: actorUid,
        updatedByName: actorName,
      },
    },
    { merge: true },
  );

  await addDoc(collection(firestore, 'audit_logs'), {
    action: 'feature_toggle',
    featureKey: key,
    oldValue: previousEnabled,
    newValue: enabled,
    changedByUid: actorUid,
    changedByName: actorName,
    createdAt: serverTimestamp(),
  });
}

/**
 * One-shot check for use inside handlers/guards, e.g.:
 *   const isOfferingEnabled = await isFeatureEnabled(firestore, "offering_letter");
 * Fails open to the documented default if the doc/field is missing (never blocks
 * a brand-new deployment before Feature Control has been configured), but fails
 * CLOSED (false) on a read error — a Firestore error must never be silently
 * treated as "feature enabled".
 */
export async function isFeatureEnabled(firestore: Firestore, key: FeatureKey): Promise<boolean> {
  try {
    const snap = await getDoc(featureDocRef(firestore));
    const data = snap.exists() ? (snap.data() as FeatureConfig) : null;
    const flag = data?.[key];
    if (flag && typeof flag.enabled === 'boolean') return flag.enabled;
    return FEATURE_DEFAULTS[key].enabled;
  } catch {
    return false;
  }
}

/** Realtime hook for components that need to react to feature toggles live (buttons, gates, banners). */
export function useFeatureFlags(firestore: Firestore | null | undefined) {
  const [config, setConfig] = useState<FeatureConfig>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firestore) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      featureDocRef(firestore),
      (snap) => {
        setConfig(snap.exists() ? (snap.data() as FeatureConfig) : {});
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [firestore]);

  const isEnabled = (key: FeatureKey): boolean => {
    const flag = config[key];
    if (flag && typeof flag.enabled === 'boolean') return flag.enabled;
    return FEATURE_DEFAULTS[key].enabled;
  };

  return { config, loading, isEnabled };
}
