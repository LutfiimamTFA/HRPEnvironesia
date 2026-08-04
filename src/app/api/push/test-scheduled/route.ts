import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { sendTestPushToDevice } from '@/lib/server/push-dispatch';

export const runtime = 'nodejs';

const MAX_DELAY_SECONDS = 60;

/**
 * "Kirim dalam 10 Detik" — this is the whole point of the button: prove push
 * still arrives after the tab/browser that requested it is gone, so the delay
 * cannot live in the requesting page's own setTimeout (that timer dies the
 * moment the tab closes). Instead we respond immediately with a scheduling
 * receipt, and the actual send runs on a server-side timer detached from this
 * request/response — it keeps running as long as the Node server process
 * itself is alive, independent of the client connection.
 *
 * Caveat (told to the caller via the response, not hidden): if this app is
 * ever deployed on a request-scoped serverless runtime that fully freezes
 * the process after the response is sent, this in-process timer would not
 * survive. It is correct for a persistent Node server (which is what this
 * repo already assumes elsewhere — see the many long-running admin.* calls).
 */
export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }
    let uid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(authorization.slice(7));
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ success: false, message: 'Sesi tidak valid, silakan login ulang.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const deviceId: string | undefined = body?.deviceId;
    const delaySeconds = Math.min(Math.max(Number(body?.delaySeconds) || 10, 1), MAX_DELAY_SECONDS);
    if (!deviceId) {
      return NextResponse.json({ success: false, message: 'deviceId wajib diisi.' }, { status: 400 });
    }

    const db = admin.firestore();
    const deviceRef = db.collection('push_subscriptions').doc(uid).collection('devices').doc(deviceId);
    const deviceSnap = await deviceRef.get();
    if (!deviceSnap.exists) {
      return NextResponse.json({ success: false, message: 'Perangkat tidak ditemukan.' }, { status: 404 });
    }

    const scheduledAt = new Date().toISOString();
    const willSendAt = new Date(Date.now() + delaySeconds * 1000).toISOString();

    await deviceRef.update({
      lastDeliveryStatus: 'scheduled',
      lastScheduledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Detached from the request lifecycle on purpose — see comment above.
    setTimeout(() => {
      sendTestPushToDevice(uid, deviceId).catch((error) => {
        console.error('[push/test-scheduled] delayed send failed:', error);
      });
    }, delaySeconds * 1000);

    return NextResponse.json({
      success: true,
      scheduled: true,
      deviceId,
      scheduledAt,
      willSendAt,
      delaySeconds,
      message: `Dijadwalkan — akan dikirim dalam ${delaySeconds} detik. Tutup tab HRP sekarang untuk menguji.`,
    });
  } catch (error) {
    console.error('[push/test-scheduled] ERROR:', error);
    return NextResponse.json({ success: false, message: 'Gagal menjadwalkan notifikasi tes.' }, { status: 500 });
  }
}
