import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, isAuthError } from '@/lib/api/verify-super-admin';

export const runtime = 'nodejs';

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

async function buildOAuthClient() {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;

  try {
    const oauthDoc = await admin.firestore().collection('system_settings').doc('google_drive_oauth').get();
    if (!oauthDoc.exists) return null;
    const refreshToken = oauthDoc.data()?.refreshToken as string | undefined;
    if (!refreshToken) return null;
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
  } catch (err: any) {
    console.error('[google-drive/status] buildOAuthClient error:', err.message);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const actor = await verifySuperAdmin(req);
  if (isAuthError(actor)) return NextResponse.json({ error: actor.error }, { status: actor.status });

  const envStatus = getOAuthEnvStatus();

  // Jika admin SDK belum siap, return status minimal tanpa crash
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
      driveAccountEmail: null,
      driveConnectedAt: null,
      folderId: process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID ?? '',
      folderLink: null,
      folderAccessible: null,
      tokenValid: null,
      verifyError: `Firestore tidak dapat diakses: ${err.message}`,
    });
  }

  const driveConnected    = settings.driveConnected === true;
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

  if (driveAuthMode === 'oauth_user' && driveConnected && envStatus.oauthConfigured && folderId) {
    try {
      const oauthClient = await buildOAuthClient();
      if (!oauthClient) {
        verifyError = 'Refresh token tidak ditemukan di server.';
        tokenValid = false;
      } else {
        const drive = google.drive({ version: 'v3', auth: oauthClient });
        try {
          const folderRes = await drive.files.get({
            fileId: folderId,
            fields: 'id,name,webViewLink',
            supportsAllDrives: true,
          });
          folderAccessible = true;
          folderLink = folderRes.data.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`;
          tokenValid = true;
        } catch (err: any) {
          folderAccessible = false;
          verifyError = err.message ?? 'Folder tidak dapat diakses';
          tokenValid = String(err.message).includes('invalid_grant') ? false : null;
        }
      }
    } catch (err: any) {
      verifyError = err.message;
      tokenValid = false;
    }
  }

  return NextResponse.json({
    ...envStatus,
    driveAuthMode,
    driveConnected,
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

  try {
    const oauthDoc = await admin.firestore().collection('system_settings').doc('google_drive_oauth').get();
    const refreshToken = oauthDoc.data()?.refreshToken as string | undefined;
    if (!refreshToken) {
      return NextResponse.json({ error: 'Refresh token tidak tersedia. Hubungkan Google Drive terlebih dahulu.' }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URI,
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

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
