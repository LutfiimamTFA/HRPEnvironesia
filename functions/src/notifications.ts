import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

const REGION = 'asia-southeast2';

type ConditionReportType = 'check_in' | 'check_out';

function resolveConditionReportType(report: any): ConditionReportType | null {
  const raw = report?.reportType || report?.conditionType;
  return raw === 'check_in' || raw === 'check_out' ? raw : null;
}

const CONDITION_NOTIFICATION_COPY: Record<ConditionReportType, { title: string; message: (name: string) => string }> = {
  check_in: {
    title: 'Laporan Kondisi Masuk',
    message: (name) => `${name} melaporkan kendala sebelum absen masuk.`,
  },
  check_out: {
    title: 'Laporan Kondisi Pulang',
    message: (name) => `${name} melaporkan kondisi sebelum absen pulang.`,
  },
};

const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** Best-effort push companion — never allowed to affect whether the in-app hrd_notifications doc was written (that already happened by the time this runs). */
async function dispatchPushBestEffort(db: admin.firestore.Firestore, uid: string, title: string, body: string, url: string) {
  try {
    const devicesSnap = await db.collection('push_subscriptions').doc(uid).collection('devices').where('isActive', '==', true).get();
    if (devicesSnap.empty) return { sent: 0, failed: 0 };

    const tokens = devicesSnap.docs.map((d) => (d.data().token || d.data().fcmToken) as string).filter(Boolean);
    if (tokens.length === 0) return { sent: 0, failed: 0 };

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { url },
      webpush: { fcmOptions: { link: url } },
    });

    const batch = db.batch();
    let deactivated = 0;
    response.responses.forEach((r, i) => {
      if (!r.success && r.error && INVALID_TOKEN_ERROR_CODES.has(r.error.code)) {
        batch.update(devicesSnap.docs[i].ref, { isActive: false, enabled: false, disabledAt: admin.firestore.FieldValue.serverTimestamp(), disabledReason: r.error.code });
        deactivated++;
      }
    });
    if (deactivated > 0) await batch.commit();

    return { sent: response.successCount, failed: response.failureCount };
  } catch (error) {
    console.error('[onConditionReportCreated] push dispatch error:', error);
    return { sent: 0, failed: 0 };
  }
}

/**
 * Server-side trigger: fires whenever the external Web Absen app (or anything
 * else) creates a doc in attendance_condition_reports — this is the ONLY
 * place hrd_notifications gets written for condition reports, so it works
 * regardless of which client/system created the source document. Uses a
 * deterministic doc ID (`${type}_${reportId}_${recipientUid}`) so retries,
 * duplicate triggers, or re-running this function never create duplicate
 * notifications — see requirement 5 (anti-duplication).
 */
export const onConditionReportCreated = onDocumentCreated(
  { document: 'attendance_condition_reports/{reportId}', region: REGION },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const reportId = event.params.reportId;
    const report = snapshot.data();
    const db = admin.firestore();

    const type = resolveConditionReportType(report);
    if (!type) {
      console.log('[onConditionReportCreated] skipped — unrecognized reportType/conditionType', { reportId, reportType: report?.reportType, conditionType: report?.conditionType });
      return;
    }

    const employeeUid: string | null = report?.employeeUid || report?.uid || report?.userId || null;
    const employeeName: string = report?.employeeName || 'Karyawan';
    const dateKey: string | null = report?.dateKey || report?.reportDate || null;

    let brandId: string | null = report?.brandId || null;
    let brandName: string | null = report?.brandName || null;

    // Root brandId should already be on the doc (see the frontend fix that
    // required it) — this is only a best-effort rescue for older docs that
    // predate that requirement. Never notify unscoped if resolution fails.
    if (!brandId && employeeUid) {
      try {
        const profileSnap = await db.collection('employee_profiles').doc(employeeUid).get();
        const profile = profileSnap.data();
        brandId = profile?.brandId || profile?.hrdEmploymentInfo?.brandId || null;
        brandName = brandName || profile?.brandName || profile?.hrdEmploymentInfo?.brandName || null;
      } catch (error) {
        console.error('[onConditionReportCreated] employee_profiles lookup failed:', error);
      }
    }

    if (!brandId) {
      console.log('[onConditionReportCreated] skipped — brandId could not be resolved, refusing to notify unscoped', { reportId, employeeUid });
      return;
    }

    // ── Resolve recipient HRDs from roles_hrd — active + scoped to this brand ──
    const rolesHrdSnap = await db.collection('roles_hrd').where('active', '==', true).get();
    const recipientUids = rolesHrdSnap.docs
      .filter((d) => {
        const role = d.data();
        if (role.scopeType === 'all_companies') return true;
        const allowed: string[] = role.allowedBrandIds || [];
        return allowed.includes(brandId);
      })
      .map((d) => d.id);

    if (recipientUids.length === 0) {
      console.log('[onConditionReportCreated] no active HRD scoped to this brand', { reportId, brandId });
      return;
    }

    const copy = CONDITION_NOTIFICATION_COPY[type];
    const targetUrl = `/admin/hrd/monitoring/absen${dateKey ? `?date=${dateKey}` : ''}${employeeUid ? `${dateKey ? '&' : '?'}employeeUid=${employeeUid}` : ''}`;

    let notificationsCreated = 0;
    let pushSent = 0;
    let pushFailed = 0;
    const batch = db.batch();

    for (const recipientUid of recipientUids) {
      const eventKey = `${type}_${reportId}_${recipientUid}`;
      const ref = db.collection('hrd_notifications').doc(eventKey);
      batch.set(ref, {
        recipientUid,
        recipientRole: 'hrd',
        brandId,
        companyId: brandId,
        category: 'attendance',
        type: `condition_${type}`,
        title: copy.title,
        message: copy.message(employeeName),
        employeeUid,
        employeeName,
        sourceCollection: 'attendance_condition_reports',
        sourceId: reportId,
        eventKey,
        targetType: 'employee',
        targetId: employeeUid || reportId,
        actionUrl: targetUrl,
        targetUrl,
        priority: 'high',
        isRead: false,
        readAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      notificationsCreated++;
    }
    await batch.commit();

    for (const recipientUid of recipientUids) {
      const result = await dispatchPushBestEffort(db, recipientUid, copy.title, copy.message(employeeName), targetUrl);
      pushSent += result.sent;
      pushFailed += result.failed;
    }

    console.log('[onConditionReportCreated]', {
      eventType: `condition_${type}`,
      sourceId: reportId,
      brandId,
      recipientsFound: recipientUids.length,
      notificationsCreated,
      pushSent,
      pushFailed,
    });
  },
);
