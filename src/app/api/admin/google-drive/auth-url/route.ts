import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { verifySuperAdmin, isAuthError } from '@/lib/api/verify-super-admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const actor = await verifySuperAdmin(req);
  if (isAuthError(actor)) return NextResponse.json({ error: actor.error }, { status: actor.status });

  const clientId    = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  const missing: string[] = [];
  if (!clientId)     missing.push('GOOGLE_OAUTH_CLIENT_ID');
  if (!clientSecret) missing.push('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!redirectUri)  missing.push('GOOGLE_OAUTH_REDIRECT_URI');

  if (missing.length > 0) {
    console.warn('[google-drive/auth-url] ENV belum lengkap:', missing.join(', '));
    return NextResponse.json(
      { error: `ENV belum dikonfigurasi di server: ${missing.join(', ')}` },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const returnUrl = searchParams.get('returnUrl') ?? '/admin/super-admin/backup-export';

  const statePayload = { uid: actor.uid, ts: Date.now(), returnUrl };
  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    state,
    include_granted_scopes: true,
  });

  console.log('[google-drive/auth-url] generated auth URL for uid:', actor.uid);
  return NextResponse.json({ authUrl });
}
