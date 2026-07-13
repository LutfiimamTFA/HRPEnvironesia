import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { dispatchPushToUser } from '@/lib/server/push-dispatch';

export const runtime = 'nodejs';

/**
 * Fire-and-forget push companion to an in-app notification write. Called
 * client-side right after a dropdown notification doc is created (see
 * src/lib/notifications.ts) — the dropdown write itself is unaffected if this
 * fails, since push is a best-effort extra channel, not the source of truth.
 */
export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }
    try {
      await admin.auth().verifyIdToken(authorization.slice(7));
    } catch {
      return NextResponse.json({ success: false, message: 'Sesi tidak valid, silakan login ulang.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const { uid, title, message, url } = body || {};
    if (!uid || !title || !message) {
      return NextResponse.json({ success: false, message: 'uid, title, dan message wajib diisi.' }, { status: 400 });
    }

    const result = await dispatchPushToUser(uid, { title, body: message, url });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[push/dispatch] ERROR:', error);
    // Never surface this as a hard failure to the caller's underlying action.
    return NextResponse.json({ success: false, message: 'Gagal mengirim push notification.' }, { status: 200 });
  }
}
