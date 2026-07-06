import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, jsonError } from '@/lib/server/sync-helpers';
import { getFirebaseBucket, getStorageProviderConfig, resolveDriveClient, getDriveConnectedEmail, DriveTokenError } from '@/lib/server/storage-admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

const TEST_FILE_NAME = 'hrp-connection-test.txt';

interface TestResult {
  status: 'success' | 'failed';
  message: string;
  details: Record<string, any>;
}

/**
 * Test Koneksi — checks whether a storage provider can be reached. Does NOT
 * scan/index files (that's Sinkronkan Storage's job). Always server-side
 * (Admin SDK / OAuth token), never called directly from the browser.
 */
async function testGoogleDrive(db: FirebaseFirestore.Firestore, folderId: string | null): Promise<TestResult> {
  if (!folderId) {
    return { status: 'failed', message: 'Folder Google Drive belum dikonfigurasi.', details: { canRead: false, canUpload: false } };
  }

  let drive;
  try {
    const resolved = await resolveDriveClient(db);
    drive = resolved.drive;
  } catch (err) {
    if (err instanceof DriveTokenError) {
      return { status: 'failed', message: err.message, details: { canRead: false, canUpload: false, needsReconnect: true } };
    }
    return { status: 'failed', message: 'Google Drive API gagal diakses.', details: { canRead: false, canUpload: false } };
  }

  const connectedEmail = await getDriveConnectedEmail(drive);

  let folderName: string | null = null;
  try {
    const folderRes = await drive.files.get({ fileId: folderId, fields: 'id, name', supportsAllDrives: true });
    folderName = folderRes.data.name ?? null;
  } catch (err: any) {
    const msg = String(err?.message ?? '');
    if (msg.toLowerCase().includes('not found') || err?.code === 404) {
      return { status: 'failed', message: 'Folder Google Drive tidak ditemukan.', details: { connectedEmail, canRead: false, canUpload: false } };
    }
    if (msg.toLowerCase().includes('forbidden') || msg.toLowerCase().includes('permission') || err?.code === 403) {
      return { status: 'failed', message: 'Akses ke folder ditolak.', details: { connectedEmail, canRead: false, canUpload: false } };
    }
    return { status: 'failed', message: 'Google Drive API gagal diakses.', details: { connectedEmail, canRead: false, canUpload: false } };
  }

  let canRead = false;
  try {
    await drive.files.list({ q: `'${folderId}' in parents and trashed = false`, fields: 'files(id)', pageSize: 1, supportsAllDrives: true, includeItemsFromAllDrives: true });
    canRead = true;
  } catch {
    return { status: 'failed', message: 'Akses ke folder ditolak.', details: { connectedEmail, folderId, folderName, canRead: false, canUpload: false } };
  }

  let canUpload = false;
  let testFileDeleted = true;
  let warning: string | null = null;
  try {
    const stream = new Readable();
    stream.push(`HRP connection test — ${new Date().toISOString()}`);
    stream.push(null);
    const created = await drive.files.create({
      requestBody: { name: TEST_FILE_NAME, parents: [folderId] },
      media: { mimeType: 'text/plain', body: stream },
      fields: 'id',
      supportsAllDrives: true,
    });
    canUpload = true;
    if (created.data.id) {
      try {
        await drive.files.delete({ fileId: created.data.id, supportsAllDrives: true });
      } catch {
        testFileDeleted = false;
        warning = 'Upload berhasil, tetapi file test tidak bisa dihapus otomatis.';
      }
    }
  } catch {
    canUpload = false;
  }

  return {
    status: 'success',
    message: 'Google Drive berhasil diakses',
    details: { connectedEmail, folderId, folderName, canRead, canUpload, testFileDeleted, warning },
  };
}

async function testFirebaseStorage(): Promise<TestResult> {
  try {
    const bucket = getFirebaseBucket();
    const [exists] = await bucket.exists();
    if (!exists) return { status: 'failed', message: 'Bucket Firebase Storage tidak ditemukan.', details: { canRead: false, canUpload: false } };

    let canUpload = false;
    let testFileDeleted = true;
    let warning: string | null = null;
    const file = bucket.file(`_storage_connection_test/${TEST_FILE_NAME}`);
    try {
      await file.save(`HRP connection test — ${new Date().toISOString()}`, { contentType: 'text/plain' });
      canUpload = true;
      try {
        await file.delete();
      } catch {
        testFileDeleted = false;
        warning = 'Upload berhasil, tetapi file test tidak bisa dihapus otomatis.';
      }
    } catch {
      canUpload = false;
    }

    return {
      status: 'success',
      message: 'Firebase Storage berhasil diakses',
      details: { bucketName: bucket.name, canRead: true, canUpload, testFileDeleted, warning },
    };
  } catch (err: any) {
    return { status: 'failed', message: err?.message ?? 'Gagal terhubung ke Firebase Storage.', details: { canRead: false, canUpload: false } };
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) return jsonError(auth.error, auth.status);

  const db = admin.firestore();
  const body = await req.json().catch(() => ({}));
  const provider: 'google_drive' | 'firebase_storage' = body.provider === 'firebase_storage' ? 'firebase_storage' : 'google_drive';

  const providerConfig = await getStorageProviderConfig(db);

  const result = provider === 'google_drive'
    ? await testGoogleDrive(db, providerConfig.googleDrive.folderId)
    : await testFirebaseStorage();

  const testedAt = admin.firestore.Timestamp.now();

  try {
    await db.collection('storage_provider_logs').add({
      provider,
      action: 'test_connection',
      status: result.status,
      message: result.message,
      details: result.details,
      testedAt,
      testedByUid: auth.uid,
      testedByName: auth.name,
    });

    if (provider === 'google_drive') {
      await db.collection('system_settings').doc('storage_provider').set({
        googleDrive: {
          ...providerConfig.googleDrive,
          folderName: result.details.folderName ?? providerConfig.googleDrive.folderName,
          connectedEmail: result.details.connectedEmail ?? providerConfig.googleDrive.connectedEmail,
          status: result.status === 'success' ? 'connected' : 'error',
          canRead: result.details.canRead ?? false,
          canUpload: result.details.canUpload ?? false,
          lastTestedAt: testedAt,
          lastError: result.status === 'failed' ? result.message : null,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedByUid: auth.uid,
      }, { merge: true });
    } else {
      await db.collection('system_settings').doc('storage_provider').set({
        firebaseStorage: {
          ...providerConfig.firebaseStorage,
          status: result.status === 'success' ? 'connected' : 'error',
          canRead: result.details.canRead ?? false,
          canUpload: result.details.canUpload ?? false,
          lastTestedAt: testedAt,
          lastError: result.status === 'failed' ? result.message : null,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedByUid: auth.uid,
      }, { merge: true });
    }
  } catch (err: any) {
    return jsonError(err?.message ?? 'Gagal menyimpan hasil tes provider.', 500);
  }

  return NextResponse.json({
    success: true,
    provider,
    status: result.status,
    message: result.message,
    details: result.details,
    testedAt: testedAt.toDate().toISOString(),
  });
}
