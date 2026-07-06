import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, jsonError } from '@/lib/server/sync-helpers';
import { getStorageProviderConfig } from '@/lib/server/storage-admin';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * Jadikan Provider Aktif — switches which storage provider Sinkronkan
 * Storage/uploads treat as primary. Does not test connectivity or scan files
 * by itself — Super Admin should Test Koneksi first.
 */
export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) return jsonError(auth.error, auth.status);

  const body = await req.json().catch(() => ({}));
  const provider: 'google_drive' | 'firebase_storage' | undefined = body.provider;
  if (provider !== 'google_drive' && provider !== 'firebase_storage') {
    return jsonError('Provider tidak valid.', 400);
  }

  const db = admin.firestore();

  try {
    const current = await getStorageProviderConfig(db);
    await db.collection('system_settings').doc('storage_provider').set({
      activeProvider: provider,
      // Only one provider may be active at a time — the inactive one is
      // always marked disabled, regardless of its last connection test.
      googleDrive: { ...current.googleDrive, enabled: provider === 'google_drive' },
      firebaseStorage: { ...current.firebaseStorage, enabled: provider === 'firebase_storage' },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: auth.uid,
    }, { merge: true });

    await db.collection('storage_provider_logs').add({
      provider,
      action: 'set_active_provider',
      status: 'success',
      message: `Provider aktif diubah menjadi ${provider === 'google_drive' ? 'Google Drive' : 'Firebase Storage'}.`,
      details: {},
      testedAt: admin.firestore.Timestamp.now(),
      testedByUid: auth.uid,
      testedByName: auth.name,
    });

    return NextResponse.json({ success: true, activeProvider: provider });
  } catch (err: any) {
    return jsonError(err?.message ?? 'Gagal mengubah provider aktif.', 500);
  }
}
