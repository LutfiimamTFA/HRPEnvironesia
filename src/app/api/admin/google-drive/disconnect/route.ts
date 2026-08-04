import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Timestamp } from 'firebase-admin/firestore';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, isAuthError } from '@/lib/api/verify-super-admin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const actor = await verifySuperAdmin(req);
  if (isAuthError(actor)) return NextResponse.json({ error: actor.error }, { status: actor.status });

  try {
    // Baca refresh token untuk dicabut dari Google
    const oauthDoc = await admin.firestore().collection('system_settings').doc('google_drive_oauth').get();
    const refreshToken = oauthDoc.exists ? (oauthDoc.data()?.refreshToken as string | undefined) : undefined;

    // Cabut token di Google (best-effort, tidak gagalkan disconnect jika ini error)
    if (refreshToken) {
      try {
        const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
        const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI;
        if (clientId && clientSecret && redirectUri) {
          const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
          oauth2Client.setCredentials({ refresh_token: refreshToken });
          await oauth2Client.revokeCredentials();
        }
      } catch { /* best-effort */ }
    }

    // Hapus token dari Firestore
    await admin.firestore().collection('system_settings').doc('google_drive_oauth').delete();

    // Update status di backup_export
    await admin.firestore().collection('system_settings').doc('backup_export').set({
      driveAuthMode: 'service_account',
      driveConnected: false,
      driveAccountEmail: null,
      driveConnectedAt: null,
      driveConnectedByUid: null,
      driveDisconnectedAt: Timestamp.now(),
      driveDisconnectedByUid: actor.uid,
    }, { merge: true });

    // Tulis audit log
    try {
      await admin.firestore().collection('audit_logs').add({
        actorUid: actor.uid,
        actorName: actor.name,
        actorEmail: actor.email,
        actorRole: 'super-admin',
        action: 'disconnect_google_drive',
        category: 'backup_export',
        targetType: 'system',
        targetName: 'Google Drive OAuth',
        reason: 'Koneksi Google Drive diputus oleh Super Admin',
        createdAt: Timestamp.now(),
      });
    } catch { /* non-blocking */ }

    return NextResponse.json({ success: true, message: 'Koneksi Google Drive berhasil diputus.' });

  } catch (err: any) {
    return NextResponse.json({ error: `Gagal memutus koneksi: ${err.message}` }, { status: 500 });
  }
}
