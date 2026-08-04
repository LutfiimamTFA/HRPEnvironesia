import 'server-only';
import admin from '@/lib/firebase/admin';

const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export type PushSendProof =
  | { success: true; messageId: string; tokenCount: 1; deviceId: string; sentAt: string }
  | { success: false; message: string; deviceId: string; code?: string };

/**
 * Sends exactly one push to one device doc and writes real, verifiable proof
 * back onto that doc (lastTestAt/lastMessageId/lastDeliveryStatus) — a toast
 * alone is not proof of delivery, this is what the UI's diagnostic panel and
 * "Kirim dalam 10 Detik" scheduled path both read to confirm what actually
 * happened, since admin.messaging().send() either throws or returns a real
 * FCM messageId (never a fake "success" from a bare HTTP 200).
 */
export async function sendTestPushToDevice(uid: string, deviceId: string): Promise<PushSendProof> {
  const db = admin.firestore();
  const deviceRef = db.collection('push_subscriptions').doc(uid).collection('devices').doc(deviceId);
  const deviceSnap = await deviceRef.get();
  if (!deviceSnap.exists) {
    return { success: false, message: 'Perangkat tidak ditemukan.', deviceId };
  }
  const token = deviceSnap.data()?.token || deviceSnap.data()?.fcmToken;
  if (!token) {
    return { success: false, message: 'Token perangkat tidak valid.', deviceId };
  }

  try {
    const messageId = await admin.messaging().send({
      token,
      notification: {
        title: 'HRP Environesia',
        body: 'Notifikasi tes berhasil diterima di perangkat ini.',
      },
      data: { url: '/admin' },
      webpush: { fcmOptions: { link: '/admin' } },
    });

    const sentAt = new Date().toISOString();
    await deviceRef.update({
      lastTestAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageId: messageId,
      lastDeliveryStatus: 'sent',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, messageId, tokenCount: 1, deviceId, sentAt };
  } catch (error: any) {
    console.error('[push] FCM send error:', { deviceId, code: error?.code, message: error?.message, error });

    if (INVALID_TOKEN_ERROR_CODES.has(error?.code)) {
      await deviceRef.update({
        isActive: false,
        enabled: false,
        disabledAt: admin.firestore.FieldValue.serverTimestamp(),
        disabledReason: error.code,
        lastDeliveryStatus: 'failed',
        lastTestAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { success: false, message: 'Perangkat tidak aktif (token kedaluwarsa/tidak valid) — aktifkan ulang.', deviceId, code: error.code };
    }

    await deviceRef.update({
      lastDeliveryStatus: 'failed',
      lastTestAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});

    return { success: false, message: error?.message || 'Gagal mengirim notifikasi tes.', deviceId, code: error?.code };
  }
}

/**
 * Sends a Web Push (via FCM) to every active device registered for `uid`.
 * Content is deliberately generic — these can render on a lock screen (see
 * caller), so no sensitive HR data belongs in title/body.
 * Any token FCM reports as unregistered/invalid gets marked isActive:false so
 * it stops being retried on the next dispatch.
 */
export async function dispatchPushToUser(uid: string, notification: { title: string; body: string; url?: string }) {
  if (!uid) return { sent: 0, failed: 0 };

  const db = admin.firestore();
  const devicesSnap = await db.collection('push_subscriptions').doc(uid).collection('devices').where('isActive', '==', true).get();
  if (devicesSnap.empty) return { sent: 0, failed: 0 };

  const tokens = devicesSnap.docs.map((d) => (d.data().token || d.data().fcmToken) as string).filter(Boolean);
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: notification.title,
      body: notification.body,
    },
    data: {
      url: notification.url || '/admin',
    },
    webpush: {
      fcmOptions: {
        link: notification.url || '/admin',
      },
    },
  });

  const invalidTokenErrorCodes = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
    'messaging/invalid-argument',
  ]);

  const batch = db.batch();
  let deactivated = 0;
  response.responses.forEach((r, i) => {
    if (!r.success && r.error && invalidTokenErrorCodes.has(r.error.code)) {
      batch.update(devicesSnap.docs[i].ref, { isActive: false, disabledAt: admin.firestore.FieldValue.serverTimestamp(), disabledReason: r.error.code });
      deactivated++;
    }
  });
  if (deactivated > 0) await batch.commit();

  return { sent: response.successCount, failed: response.failureCount };
}
