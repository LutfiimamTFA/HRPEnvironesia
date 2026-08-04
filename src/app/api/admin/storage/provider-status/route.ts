import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, jsonError } from '@/lib/server/sync-helpers';
import { getStorageProviderConfig } from '@/lib/server/storage-admin';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * Provider Status — one-shot read of system_settings/storage_provider (no
 * live test). Used to render the Storage Provider cards without re-testing
 * the connection on every page load; Super Admin refreshes it explicitly via
 * "Test Koneksi".
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) return jsonError(auth.error, auth.status);

  const db = admin.firestore();

  try {
    const providerConfig = await getStorageProviderConfig(db);
    return NextResponse.json({ success: true, ...providerConfig });
  } catch (err: any) {
    return jsonError(err?.message ?? 'Gagal memuat status provider.', 500);
  }
}
