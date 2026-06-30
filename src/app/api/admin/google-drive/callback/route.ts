import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Timestamp } from 'firebase-admin/firestore';
import admin from '@/lib/firebase/admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code       = searchParams.get('code');
  const stateRaw   = searchParams.get('state');
  const oauthError = searchParams.get('error');

  // Decode state untuk mendapatkan returnUrl dan uid
  let returnUrl = '/';
  let uid       = 'unknown';
  if (stateRaw) {
    try {
      const decoded = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf-8'));
      returnUrl = decoded.returnUrl ?? '/';
      uid       = decoded.uid ?? 'unknown';
    } catch { /* state rusak, lanjut dengan default */ }
  }

  const buildRedirect = (params: Record<string, string>) => {
    const url = new URL(returnUrl, process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return NextResponse.redirect(url.toString());
  };

  if (oauthError) {
    return buildRedirect({ driveError: oauthError });
  }

  if (!code) {
    return buildRedirect({ driveError: 'no_code' });
  }

  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return buildRedirect({ driveError: 'server_misconfigured' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      // Tidak ada refresh_token — mungkin user sudah pernah authorize sebelumnya tanpa prompt=consent
      return buildRedirect({ driveError: 'no_refresh_token' });
    }

    // Ambil email akun Google yang di-authorize
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const driveAccountEmail = userInfo.data.email ?? '';

    const now = Timestamp.now();

    // Simpan refresh token ke Firestore (server-only, tidak boleh dibaca client)
    await admin.firestore().collection('system_settings').doc('google_drive_oauth').set({
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token ?? null,
      tokenExpiry: tokens.expiry_date ?? null,
      driveAccountEmail,
      authorizedByUid: uid,
      updatedAt: now,
    });

    // Update status di backup_export (bisa dibaca Super Admin dari client)
    await admin.firestore().collection('system_settings').doc('backup_export').set({
      driveAuthMode: 'oauth_user',
      driveConnected: true,
      driveAccountEmail,
      driveConnectedAt: now,
      driveConnectedByUid: uid,
    }, { merge: true });

    return buildRedirect({ driveConnected: 'true', driveEmail: driveAccountEmail });

  } catch (err: any) {
    console.error('[google-drive/callback] Error:', err.message);
    return buildRedirect({ driveError: encodeURIComponent(err.message ?? 'token_exchange_failed') });
  }
}
