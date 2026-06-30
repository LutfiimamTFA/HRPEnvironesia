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

  console.log('[google-drive/callback] code received:', !!code, '| oauthError:', oauthError ?? 'none');

  // Decode state
  let returnUrl = '/admin/super-admin/backup-export';
  let uid       = 'unknown';
  if (stateRaw) {
    try {
      const decoded = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf-8'));
      returnUrl = decoded.returnUrl ?? returnUrl;
      uid       = decoded.uid ?? 'unknown';
    } catch { /* state rusak, gunakan default */ }
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const buildRedirect = (params: Record<string, string>) => {
    const url = new URL(returnUrl, baseUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return NextResponse.redirect(url.toString());
  };

  if (oauthError) {
    console.warn('[google-drive/callback] oauthError from Google:', oauthError);
    return buildRedirect({ driveError: oauthError });
  }

  if (!code) {
    console.warn('[google-drive/callback] missing code from Google');
    return buildRedirect({ driveError: 'missing_code' });
  }

  const clientId    = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    console.error('[google-drive/callback] ENV OAuth tidak lengkap');
    return buildRedirect({ driveError: 'server_misconfigured' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    console.log('[google-drive/callback] refresh_token received:', !!tokens.refresh_token);

    // Ambil refresh token lama dari Firestore sebagai fallback
    let existingRefreshToken: string | null = null;
    try {
      const oauthDoc = await admin.firestore()
        .collection('system_settings')
        .doc('google_drive_oauth')
        .get();
      existingRefreshToken = oauthDoc.data()?.refreshToken ?? null;
    } catch (err: any) {
      console.warn('[google-drive/callback] gagal baca token lama dari Firestore:', err.message);
    }

    const refreshToken = tokens.refresh_token ?? existingRefreshToken ?? null;
    console.log('[google-drive/callback] using old refresh_token fallback:', !tokens.refresh_token && !!existingRefreshToken);

    if (!refreshToken) {
      console.warn('[google-drive/callback] tidak ada refresh_token baru maupun lama');
      return buildRedirect({ driveError: 'no_refresh_token' });
    }

    // Ambil email akun Google — wrap dalam try/catch karena scope mungkin belum aktif
    let driveAccountEmail = 'Google Drive OAuth User';
    try {
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      driveAccountEmail = userInfo.data.email ?? driveAccountEmail;
    } catch (err: any) {
      console.warn('[google-drive/callback] gagal ambil userinfo (non-fatal):', err.message);
    }

    const now = Timestamp.now();

    // Simpan token ke Firestore server-side (TIDAK pernah dikirim ke client)
    await admin.firestore()
      .collection('system_settings')
      .doc('google_drive_oauth')
      .set({
        refreshToken,
        accessToken:  tokens.access_token  ?? null,
        tokenExpiry:  tokens.expiry_date   ?? null,
        driveAccountEmail,
        authorizedByUid: uid,
        updatedAt: now,
      });

    console.log('[google-drive/callback] token saved successfully for uid:', uid);

    // Update status koneksi Drive (aman dibaca Super Admin dari client)
    await admin.firestore()
      .collection('system_settings')
      .doc('backup_export')
      .set({
        driveAuthMode:      'oauth_user',
        driveConnected:     true,
        driveAccountEmail,
        driveConnectedAt:   now,
        driveConnectedByUid: uid,
      }, { merge: true });

    console.log('[google-drive/callback] backup_export status updated: driveConnected=true');

    return buildRedirect({ driveConnected: 'true', driveEmail: driveAccountEmail });

  } catch (err: any) {
    console.error('[google-drive/callback] error:', err.message);
    const safeMsg = encodeURIComponent(err.message?.slice(0, 120) ?? 'callback_failed');
    return buildRedirect({ driveError: safeMsg });
  }
}
