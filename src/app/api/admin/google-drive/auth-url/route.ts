import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { verifySuperAdmin, isAuthError } from '@/lib/api/verify-super-admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const actor = await verifySuperAdmin(req);
  if (isAuthError(actor)) return NextResponse.json({ error: actor.error }, { status: actor.status });

  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, atau GOOGLE_OAUTH_REDIRECT_URI belum dikonfigurasi di server.' },
      { status: 500 },
    );
  }

  // returnUrl dikirim dari client agar setelah OAuth bisa redirect balik ke halaman yang benar
  const { searchParams } = new URL(req.url);
  const returnUrl = searchParams.get('returnUrl') ?? '/';

  // State berisi uid + timestamp + returnUrl (base64url encoded)
  const statePayload = { uid: actor.uid, ts: Date.now(), returnUrl };
  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',        // selalu minta refresh_token
    scope: ['https://www.googleapis.com/auth/drive'],
    state,
    include_granted_scopes: true,
  });

  return NextResponse.json({ authUrl });
}
