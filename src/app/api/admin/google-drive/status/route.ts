import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, isAuthError } from '@/lib/api/verify-super-admin';

export const runtime = 'nodejs';

async function buildOAuthClient() {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;

  const oauthDoc = await admin.firestore().collection('system_settings').doc('google_drive_oauth').get();
  if (!oauthDoc.exists) return null;

  const refreshToken = oauthDoc.data()?.refreshToken as string | undefined;
  if (!refreshToken) return null;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

export async function GET(req: NextRequest) {
  const actor = await verifySuperAdmin(req);
  if (isAuthError(actor)) return NextResponse.json({ error: actor.error }, { status: actor.status });

  // Baca status dari backup_export (non-sensitive)
  const settingsSnap = await admin.firestore().collection('system_settings').doc('backup_export').get();
  const settings = settingsSnap.exists ? settingsSnap.data() ?? {} : {};

  const driveConnected   = settings.driveConnected === true;
  const driveAuthMode    = (settings.driveAuthMode as string) ?? 'service_account';
  const driveAccountEmail = (settings.driveAccountEmail as string) ?? null;
  const driveConnectedAt = settings.driveConnectedAt ?? null;
  const folderId = (settings.googleDriveBackupFolderId as string) ?? process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID ?? '';

  // Verifikasi koneksi aktif (hanya untuk oauth_user)
  let folderAccessible: boolean | null = null;
  let folderLink: string | null = null;
  let tokenValid: boolean | null = null;
  let verifyError: string | null = null;

  if (driveAuthMode === 'oauth_user' && driveConnected) {
    try {
      const oauthClient = await buildOAuthClient();
      if (!oauthClient) {
        verifyError = 'Refresh token tidak ditemukan di server.';
        tokenValid = false;
      } else {
        const drive = google.drive({ version: 'v3', auth: oauthClient });
        try {
          const folderRes = await drive.files.get({ fileId: folderId, fields: 'id, name, webViewLink', supportsAllDrives: true });
          folderAccessible = true;
          folderLink = folderRes.data.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`;
          tokenValid = true;
        } catch (err: any) {
          folderAccessible = false;
          verifyError = err.message ?? 'Folder tidak dapat diakses';
          tokenValid = err.message?.includes('invalid_grant') || err.message?.includes('Token') ? false : null;
        }
      }
    } catch (err: any) {
      verifyError = err.message;
      tokenValid = false;
    }
  }

  return NextResponse.json({
    driveAuthMode,
    driveConnected,
    driveAccountEmail,
    driveConnectedAt: driveConnectedAt?.toDate?.()?.toISOString() ?? driveConnectedAt,
    folderId,
    folderLink,
    folderAccessible,
    tokenValid,
    verifyError,
    oauthConfigured: !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REDIRECT_URI),
  });
}

// POST /api/admin/google-drive/status → test upload kecil ke folder backup
export async function POST(req: NextRequest) {
  const actor = await verifySuperAdmin(req);
  if (isAuthError(actor)) return NextResponse.json({ error: actor.error }, { status: actor.status });

  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const folderId     = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: 'OAuth belum dikonfigurasi di server.' }, { status: 500 });
  }
  if (!folderId) {
    return NextResponse.json({ error: 'GOOGLE_DRIVE_BACKUP_FOLDER_ID belum dikonfigurasi.' }, { status: 500 });
  }

  try {
    const oauthDoc = await admin.firestore().collection('system_settings').doc('google_drive_oauth').get();
    const refreshToken = oauthDoc.data()?.refreshToken as string | undefined;
    if (!refreshToken) {
      return NextResponse.json({ error: 'Refresh token tidak tersedia. Hubungkan Google Drive terlebih dahulu.' }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const content = `HRP Drive Test — ${new Date().toISOString()} — by ${actor.email}`;
    const stream = new Readable();
    stream.push(content);
    stream.push(null);

    const res = await drive.files.create({
      requestBody: { name: `hrp_drive_test_${Date.now()}.txt`, parents: [folderId] },
      media: { mimeType: 'text/plain', body: stream },
      fields: 'id, webViewLink, size',
    });

    // Hapus file test setelah upload (opsional, biarkan sebagai bukti)
    // await drive.files.delete({ fileId: res.data.id! });

    return NextResponse.json({
      success: true,
      message: 'Test upload berhasil!',
      fileId: res.data.id,
      webViewLink: res.data.webViewLink,
    });

  } catch (err: any) {
    const isQuota = String(err.message).toLowerCase().includes('quota');
    const isPermission = String(err.message).toLowerCase().includes('permission') || String(err.message).toLowerCase().includes('forbidden');
    return NextResponse.json({
      error: isQuota
        ? 'Folder backup berada di My Drive biasa. Gunakan koneksi OAuth Google Drive atau pindahkan folder ke Shared Drive.'
        : isPermission
        ? 'Akun Google Drive tidak memiliki akses ke folder backup. Pastikan folder sudah di-share ke akun yang terhubung.'
        : err.message,
    }, { status: 500 });
  }
}
