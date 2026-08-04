import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { resolveHrdRecipientUids } from '@/lib/server/hrd-recipients';

export const runtime = 'nodejs';

/**
 * Fans out a "notify HRD" event into one hrd_notifications doc per eligible
 * HRD recipient (resolved server-side via roles_hrd — never left to the
 * client to guess/enumerate, since a plain employee must not be able to list
 * HRD accounts). Every created doc carries recipientUid, which is what
 * Firestore rules and the Topbar/NotificationPanel queries key their
 * per-HRD isolation on.
 */
export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }
    const idToken = authorization.slice(7);

    let senderUid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      senderUid = decoded.uid;
    } catch {
      return NextResponse.json({ success: false, message: 'Sesi tidak valid, silakan login ulang.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, message: 'Data tidak valid.' }, { status: 400 });
    }

    const {
      type, module, title, message, targetType, targetId, actionUrl,
      brandId, brandName, notificationType, recruitmentEvent, priority, notifStatus, meta,
    } = body;

    if (!title || !message) {
      return NextResponse.json({ success: false, message: 'title dan message wajib diisi.' }, { status: 400 });
    }

    const db = admin.firestore();
    const recipientUids = await resolveHrdRecipientUids(db, brandId ?? null);

    if (recipientUids.length === 0) {
      // Not an error — e.g. no HRD is scoped to this brand yet. Don't fail the
      // caller's underlying action (bank change request, etc.) over this.
      return NextResponse.json({ success: true, message: 'Tidak ada HRD yang cocok untuk menerima notifikasi ini.', notifiedCount: 0 });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    // Admin SDK rejects `undefined` field values — only include optional
    // fields that were actually provided instead of writing them as undefined.
    const optionalFields: Record<string, any> = {};
    if (notificationType !== undefined) optionalFields.notificationType = notificationType;
    if (recruitmentEvent !== undefined) optionalFields.recruitmentEvent = recruitmentEvent;
    if (priority !== undefined) optionalFields.priority = priority;
    if (notifStatus !== undefined) optionalFields.notifStatus = notifStatus;
    if (meta !== undefined) optionalFields.meta = meta;

    const batch = db.batch();
    for (const recipientUid of recipientUids) {
      const ref = db.collection('hrd_notifications').doc();
      batch.set(ref, {
        type: type ?? 'status_update',
        module: module ?? 'employee',
        title,
        message,
        targetType: targetType ?? 'user',
        targetId: targetId ?? '',
        actionUrl: actionUrl ?? '',
        brandId: brandId ?? null,
        brandName: brandName ?? null,
        ...optionalFields,
        recipientUid,
        isRead: false,
        createdAt: now,
        createdBy: senderUid,
      });
    }
    await batch.commit();

    return NextResponse.json({ success: true, message: 'Notifikasi HRD berhasil dikirim.', notifiedCount: recipientUids.length });
  } catch (error) {
    console.error('[hrd-notify] API ERROR:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Gagal mengirim notifikasi HRD.',
    }, { status: 500 });
  }
}
