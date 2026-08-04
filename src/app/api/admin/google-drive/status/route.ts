import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, isAuthError } from '@/lib/api/verify-super-admin';
import { buildOAuthDriveClient, markDriveConnectionExpired, DriveAccessError } from '@/lib/server/google-drive-oauth';

export const runtime = 'nodejs';

const TOKEN_EXPIRED_TEST_MESSAGE = 'Token Google Drive kedaluwarsa/dicabut. Sambungkan ulang akun Google Drive.';

// Cek env OAuth tanpa expose value
function getOAuthEnvStatus() {
  const missing: string[] = [];
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID)     missing.push('GOOGLE_OAUTH_CLIENT_ID');
  if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET)  missing.push('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!process.env.GOOGLE_OAUTH_REDIRECT_URI)   missing.push('GOOGLE_OAUTH_REDIRECT_URI');
  if (!process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID) missing.push('GOOGLE_DRIVE_BACKUP_FOLDER_ID');
  return {
    oauthConfigured: missing.filter(k => k !== 'GOOGLE_DRIVE_BACKUP_FOLDER_ID').length === 0,
    folderEnvSet: !!process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID,
    missingEnv: missing,
  };
}

// "OAuth Terhubung" harus mencerminkan koneksi yang benar-benar berfungsi,
// bukan sekadar "ada dokumen refreshToken di Firestore" — token itu bisa
// sudah invalid_grant (revoked/expired) tanpa ada yang memutus koneksinya
// secara eksplisit di UI. GET ini selalu melakukan live-check ke Drive
// ketika Firestore bilang "connected", dan menurunkan statusnya sendiri
// (via markDriveConnectionExpired) begitu terbukti invalid_grant — supaya
// badge di Backup & Export tidak pernah berbohong ke Super Admin.
export async function GET(req: NextRequest) {
  const actor = await verifySuperAdmin(req);
  if (isAuthError(actor)) return NextResponse.json({ error: actor.error }, { status: actor.status });

  const envStatus = getOAuthEnvStatus();

  let settings: Record<string, any> = {};
  try {
    const settingsSnap = await admin.firestore().collection('system_settings').doc('backup_export').get();
    settings = settingsSnap.exists ? (settingsSnap.data() ?? {}) : {};
  } catch (err: any) {
    console.error('[google-drive/status] Firestore read error:', err.message);
    return NextResponse.json({
      ...envStatus,
      driveAuthMode: 'service_account',
      driveConnected: false,
      connectionStatus: 'unknown',
      driveAccountEmail: null,
      driveConnectedAt: null,
      folderId: process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID ?? '',
      folderLink: null,
      folderAccessible: null,
      tokenValid: null,
      verifyError: `Firestore tidak dapat diakses: ${err.message}`,
    });
  }

  let driveConnected      = settings.driveConnected === true;
  const driveAuthMode     = (settings.driveAuthMode as string) ?? 'service_account';
  const driveAccountEmail = (settings.driveAccountEmail as string) ?? null;
  const driveConnectedAt  = settings.driveConnectedAt ?? null;
  const folderId = (settings.googleDriveBackupFolderId as string)
    ?? process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID
    ?? '';

  let folderAccessible: boolean | null = null;
  let folderLink: string | null = null;
  let tokenValid: boolean | null = null;
  let verifyError: string | null = null;
  let connectionStatus: 'connected' | 'expired' | 'not_connected' | 'service_account' | 'unverified' =
    driveAuthMode === 'service_account' ? 'service_account' : driveConnected ? 'connected' : 'not_connected';

  if (driveAuthMode === 'oauth_user' && driveConnected && envStatus.oauthConfigured && folderId) {
    try {
      const drive = await buildOAuthDriveClient();
      try {
        const folderRes = await drive.files.get({
          fileId: folderId,
          fields: 'id,name,webViewLink',
          supportsAllDrives: true,
        });
        folderAccessible = true;
        folderLink = folderRes.data.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`;
        tokenValid = true;
        connectionStatus = 'connected';
      } catch (err: any) {
        folderAccessible = false;
        const msg = String(err?.message ?? 'Folder tidak dapat diakses');
        verifyError = msg;
        if (/invalid_grant/i.test(msg)) {
          await markDriveConnectionExpired(msg);
          tokenValid = false;
          driveConnected = false;
          connectionStatus = 'expired';
        } else {
          // Token itself refreshed fine, folder is just unreachable (wrong
          // account added, folder moved/trashed, etc.) — not the same
          // failure mode as an expired token, so don't downgrade the badge.
          tokenValid = null;
          connectionStatus = 'unverified';
        }
      }
    } catch (err) {
      if (err instanceof DriveAccessError) {
        verifyError = err.message;
        if (err.code === 'token_expired') {
          tokenValid = false;
          driveConnected = false;
          connectionStatus = 'expired';
        } else {
          tokenValid = false;
          connectionStatus = 'not_connected';
        }
      } else {
        verifyError = (err as any)?.message ?? 'Gagal memverifikasi koneksi Google Drive.';
        tokenValid = false;
        connectionStatus = 'unverified';
      }
    }
  }

  return NextResponse.json({
    ...envStatus,
    driveAuthMode,
    driveConnected,
    connectionStatus,
    driveAccountEmail,
    driveConnectedAt: driveConnectedAt?.toDate?.()?.toISOString?.() ?? driveConnectedAt,
    folderId,
    folderLink,
    folderAccessible,
    tokenValid,
    verifyError,
  });
}

// POST → test upload kecil ke folder backup
export async function POST(req: NextRequest) {
  const actor = await verifySuperAdmin(req);
  if (isAuthError(actor)) return NextResponse.json({ error: actor.error }, { status: actor.status });

  const envStatus = getOAuthEnvStatus();
  if (!envStatus.oauthConfigured) {
    return NextResponse.json({
      error: `OAuth belum dikonfigurasi. ENV yang belum tersedia: ${envStatus.missingEnv.join(', ')}`,
    }, { status: 400 });
  }

  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;
  if (!folderId) {
    return NextResponse.json({ error: 'GOOGLE_DRIVE_BACKUP_FOLDER_ID belum dikonfigurasi.' }, { status: 400 });
  }

  let drive;
  try {
    drive = await buildOAuthDriveClient();
  } catch (err) {
    if (err instanceof DriveAccessError && err.code === 'token_expired') {
      return NextResponse.json({ success: false, error: TOKEN_EXPIRED_TEST_MESSAGE, code: 'token_expired' }, { status: 502 });
    }
    if (err instanceof DriveAccessError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Gagal menghubungkan ke Google Drive.' }, { status: 502 });
  }

  try {
    const content = `HRP Drive Test — ${new Date().toISOString()} — by ${actor.email}`;
    const stream = new Readable();
    stream.push(content);
    stream.push(null);

    const res = await drive.files.create({
      requestBody: { name: `hrp_drive_test_${Date.now()}.txt`, parents: [folderId] },
      media: { mimeType: 'text/plain', body: stream },
      fields: 'id,webViewLink',
    });

    return NextResponse.json({
      success: true,
      message: 'Test upload berhasil! File berhasil diunggah ke Google Drive.',
      fileId: res.data.id,
      fileLink: res.data.webViewLink,
    });
  } catch (err: any) {
    const msg = String(err.message ?? '');
    if (/invalid_grant/i.test(msg)) {
      await markDriveConnectionExpired(msg);
      return NextResponse.json({ success: false, error: TOKEN_EXPIRED_TEST_MESSAGE, code: 'token_expired' }, { status: 502 });
    }
    const isQuota = msg.toLowerCase().includes('quota');
    const isPermission = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('forbidden');
    return NextResponse.json({
      success: false,
      error: isQuota
        ? 'Error quota: Folder backup berada di My Drive biasa tapi diakses via service account. Pastikan koneksi OAuth aktif.'
        : isPermission
        ? 'Akun Google tidak memiliki akses ke folder backup.'
        : msg,
    }, { status: 500 });
  }
}
