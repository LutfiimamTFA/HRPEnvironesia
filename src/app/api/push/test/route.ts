import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { sendTestPushToDevice } from '@/lib/server/push-dispatch';

export const runtime = 'nodejs';

/** "Kirim Sekarang" — sends to exactly the caller's own device doc, immediately, and returns real FCM proof (messageId), never a bare HTTP-200 "trust me". */
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
    if (!deviceId) {
      return NextResponse.json({ success: false, message: 'deviceId wajib diisi.' }, { status: 400 });
    }

    const result = await sendTestPushToDevice(uid, deviceId);
    if (!result.success) {
      const status = result.message.includes('tidak ditemukan') ? 404 : result.code ? 410 : 500;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[push/test] ERROR:', error);
    return NextResponse.json({ success: false, message: 'Gagal mengirim notifikasi tes.' }, { status: 500 });
  }
}
