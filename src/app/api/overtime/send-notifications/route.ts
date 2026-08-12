import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';

// firestore.rules only lets HRD/Super Admin `create` a doc under
// users/{uid}/notifications (see the /users/{userId}/notifications match
// block: `allow create: if isSuperAdmin() || isHrd();`) — a plain karyawan
// can never write one there, not even to their own uid. That's why calling
// sendNotification() directly from OvertimeSubmissionForm's submit handler
// always failed with permission-denied right after a perfectly successful
// overtime_submissions write, and since both calls shared one try/catch the
// whole submission was reported to the user as failed. This route uses the
// Admin SDK (which bypasses rules) to send the notification server-side
// instead, after independently re-deriving the recipient from the
// overtime_submissions doc itself — never from a client-supplied uid — so a
// karyawan calling this route can't be used to spam notifications at
// arbitrary accounts. Mirrors /api/leave/send-notifications.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatDateLabel(value: any): string {
  try {
    const d = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

async function writeNotification(
  db: FirebaseFirestore.Firestore,
  notification: {
    userId: string;
    type: string;
    module: string;
    title: string;
    message: string;
    targetType: string;
    targetId: string;
    actionUrl: string;
    createdBy: string;
    priority?: string;
  },
) {
  await db.collection('users').doc(notification.userId).collection('notifications').add({
    ...notification,
    notificationType: 'overtime',
    isRead: false,
    createdAt: admin.firestore.Timestamp.now(),
  });
}

export async function POST(req: NextRequest) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: Missing token.' }, { status: 401 });
  }
  const idToken = authorization.split('Bearer ')[1];

  const body = await req.json().catch(() => null);
  const overtimeSubmissionId = body?.overtimeSubmissionId;
  if (!overtimeSubmissionId) {
    return NextResponse.json({ error: 'overtimeSubmissionId is required.' }, { status: 400 });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const db = admin.firestore();

    const submissionDoc = await db.collection('overtime_submissions').doc(overtimeSubmissionId).get();
    if (!submissionDoc.exists) {
      return NextResponse.json({ error: 'Overtime submission not found.' }, { status: 404 });
    }
    const data = submissionDoc.data() as any;

    // Only the requester who owns this submission may trigger its
    // submission notifications — mirrors isOvertimeOwnerRead() in
    // firestore.rules so this route can't be used to fire notifications on
    // someone else's behalf.
    const isOwner = [data.employeeUid, data.uid, data.userId].includes(uid);
    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden: not the owner of this overtime submission.' }, { status: 403 });
    }

    const employeeName: string = data.employeeName || '';
    // Same fallback chain as overtimeApproverUidOnCreate() in firestore.rules
    // — currentApproverUid is what OvertimeSubmissionForm.tsx actually
    // writes, the rest are legacy/compat fallbacks for older docs.
    const approverUid: string =
      data.currentApproverUid || data.approvalTargetUid || data.directSupervisorUid || data.managerUid || '';
    const jobsCount: number = Array.isArray(data.jobs) ? data.jobs.length : 0;
    const dateStr = formatDateLabel(data.overtimeDate);

    if (!approverUid) {
      return NextResponse.json({ success: true, sent: 0, skipped: 'no resolvable approver' }, { status: 200 });
    }

    await writeNotification(db, {
      userId: approverUid,
      type: 'status_update',
      module: 'overtime',
      title: 'Pengajuan Lembur Baru',
      message: `${employeeName} mengajukan lembur ${dateStr}${jobsCount ? ` (${jobsCount} pekerjaan)` : ''} menunggu validasi Anda.`,
      targetType: 'employee',
      targetId: overtimeSubmissionId,
      actionUrl: '/admin/manager/persetujuan-lembur',
      createdBy: uid,
      priority: 'action_required',
    });

    return NextResponse.json({ success: true, sent: 1 }, { status: 200 });
  } catch (error: any) {
    console.error('[OVERTIME_SEND_NOTIFICATIONS_FAILED]', { overtimeSubmissionId, error });
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
