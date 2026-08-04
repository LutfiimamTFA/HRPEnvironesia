import 'server-only';
import { google } from 'googleapis';
import { FieldValue } from 'firebase-admin/firestore';
import admin from '@/lib/firebase/admin';

export const DRIVE_NOT_CONNECTED_MESSAGE =
  'Google Drive belum terhubung. Hubungkan Google Drive terlebih dahulu di menu Backup & Export.';

export const DRIVE_TOKEN_EXPIRED_MESSAGE =
  'Koneksi Google Drive sudah kedaluwarsa atau dicabut. Silakan sambungkan ulang Google Drive di menu Backup & Export.';

/**
 * Thrown by buildOAuthDriveClient()/downloadTemplateFromDrive() with a
 * message that's already safe to show the user directly, plus a `code` a
 * caller can branch on without re-parsing the message string.
 */
export class DriveAccessError extends Error {
  code: 'not_connected' | 'token_expired' | 'not_found' | 'permission_denied' | 'invalid_file' | 'unknown';
  constructor(code: DriveAccessError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

function isInvalidGrant(message: string): boolean {
  return /invalid_grant/i.test(message);
}

/**
 * A saved refreshToken doc / driveConnected:true flag doesn't mean the
 * connection actually works — Google can revoke or expire it silently
 * (very common while the OAuth consent screen is still in "Testing" mode,
 * where refresh tokens expire after 7 days). Whenever any caller — the
 * Backup & Export status check, or a payroll template download — actually
 * proves the refresh token is dead via invalid_grant, this stamps that
 * fact back onto both Firestore docs so the Backup & Export UI stops
 * showing a false "OAuth Terhubung" badge on its next read, no matter
 * which feature discovered the problem first.
 */
export async function markDriveConnectionExpired(reason: string): Promise<void> {
  try {
    const db = admin.firestore();
    const batch = db.batch();
    batch.set(db.collection('system_settings').doc('backup_export'), {
      driveConnected: false,
      driveConnectionStatus: 'expired',
      driveConnectionError: reason,
      driveConnectionCheckedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    batch.set(db.collection('system_settings').doc('google_drive_oauth'), {
      accessToken: FieldValue.delete(),
      tokenExpiry: FieldValue.delete(),
      refreshTokenInvalid: true,
      refreshTokenInvalidAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  } catch (err) {
    // Best-effort — a failure here must never mask the original DriveAccessError.
    console.error('[google-drive-oauth] markDriveConnectionExpired failed:', err);
  }
}

/**
 * Same OAuth Google Drive connection used by Backup & Export and every
 * payroll-template route (upload/download/test) — never a service account,
 * since service accounts have no storage quota of their own.
 */
export async function buildOAuthDriveClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new DriveAccessError('not_connected', DRIVE_NOT_CONNECTED_MESSAGE);
  }

  const oauthDoc = await admin.firestore().collection('system_settings').doc('google_drive_oauth').get();
  const refreshToken = oauthDoc.data()?.refreshToken as string | undefined;
  if (!refreshToken) {
    throw new DriveAccessError('not_connected', DRIVE_NOT_CONNECTED_MESSAGE);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  try {
    // Force a refresh now so an expired/near-expiry access token doesn't
    // fail mid-upload/mid-download with a vague error later.
    await oauth2Client.getAccessToken();
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (isInvalidGrant(msg)) {
      await markDriveConnectionExpired(msg);
      throw new DriveAccessError('token_expired', DRIVE_TOKEN_EXPIRED_MESSAGE);
    }
    throw new DriveAccessError('unknown', `Gagal menghubungkan ke Google Drive: ${msg || 'kesalahan tidak diketahui'}.`);
  }

  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Downloads a file's raw bytes from Drive by fileId, translating Google's
 * generic HTTP errors (404/403/etc.) into messages a Super Admin can act on
 * without needing to read server logs.
 */
export async function downloadTemplateFromDrive(fileId: string): Promise<Buffer> {
  if (!fileId) {
    throw new DriveAccessError('invalid_file', 'Template payroll tidak memiliki fileId Google Drive. Upload ulang template dari menu Template Payroll.');
  }

  const drive = await buildOAuthDriveClient();

  try {
    const fileResponse = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    );
    return Buffer.from(fileResponse.data as ArrayBuffer);
  } catch (err: any) {
    const status = err?.code || err?.response?.status;
    const msg = String(err?.message || '');
    if (status === 404) {
      throw new DriveAccessError('not_found', `File template tidak ditemukan di Google Drive (fileId: ${fileId}). File mungkin sudah dihapus/dipindahkan. Upload ulang template.`);
    }
    if (status === 403) {
      throw new DriveAccessError('permission_denied', `Akses ke file template di Google Drive ditolak (fileId: ${fileId}). Periksa izin file atau upload ulang template.`);
    }
    if (isInvalidGrant(msg)) {
      await markDriveConnectionExpired(msg);
      throw new DriveAccessError('token_expired', DRIVE_TOKEN_EXPIRED_MESSAGE);
    }
    throw new DriveAccessError('unknown', `Gagal mengambil file template dari Google Drive (fileId: ${fileId}): ${msg || 'kesalahan tidak diketahui'}.`);
  }
}
