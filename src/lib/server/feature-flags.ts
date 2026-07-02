import 'server-only';
import admin from '@/lib/firebase/admin';
import { FEATURE_DEFAULTS, FEATURE_SETTINGS_COLLECTION, FEATURE_SETTINGS_DOC, type FeatureConfig, type FeatureKey } from '@/lib/feature-flags';

/**
 * Server-side (Admin SDK) feature flag check for API routes — this is the
 * enforcement that actually matters. Frontend disabling a button is UX only;
 * an API route that skips this check can still be called directly.
 * Fails CLOSED on any read error (never silently allow on a Firestore outage).
 */
export async function isFeatureEnabledServer(key: FeatureKey): Promise<boolean> {
  try {
    const snap = await admin.firestore().collection(FEATURE_SETTINGS_COLLECTION).doc(FEATURE_SETTINGS_DOC).get();
    const data = snap.exists ? (snap.data() as FeatureConfig) : null;
    const flag = data?.[key];
    if (flag && typeof flag.enabled === 'boolean') return flag.enabled;
    return FEATURE_DEFAULTS[key].enabled;
  } catch {
    return false;
  }
}

/** Convenience guard for route handlers: returns a 403 NextResponse.json if the feature is off, else null. */
export async function requireFeatureEnabled(key: FeatureKey) {
  const enabled = await isFeatureEnabledServer(key);
  if (!enabled) {
    const { NextResponse } = await import('next/server');
    return NextResponse.json(
      { success: false, message: `Fitur "${FEATURE_DEFAULTS[key].label}" sedang dinonaktifkan oleh Super Admin.` },
      { status: 403 },
    );
  }
  return null;
}
