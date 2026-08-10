import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';

// firestore.rules only lets HRD/Super Admin `create` a doc under
// users/{uid}/notifications (see the /users/{userId}/notifications match
// block: `allow create: if isSuperAdmin() || isHrd();`) — a plain karyawan
// can never write a notification there, not even to their own uid. That's
// why sending these directly from LeaveSubmissionClient always failed with
// permission-denied after a perfectly successful leave_requests write. This
// route uses the Admin SDK (which bypasses rules) to do it server-side
// instead, after independently re-deriving every recipient from the
// leave_requests doc itself — never from client-supplied uids — so a
// karyawan calling this route can't be used to spam notifications at
// arbitrary accounts.
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
    meta?: Record<string, any>;
  },
) {
  await db.collection('users').doc(notification.userId).collection('notifications').add({
    ...notification,
    // "leave" tab-filter category — see NotificationType in src/lib/types.ts
    // and resolveCategory() in NotificationPanel.tsx.
    notificationType: 'leave',
    isRead: false,
    createdAt: admin.firestore.Timestamp.now(),
  });
}

// The named replacement (accepting/declining a mandate) needs to notify the
// requester — a different uid than themselves, so this also can't be a
// client-side write. Caller must be the doc's own assigned replacement
// (mirrors isAssignedReplacement() in firestore.rules), never an arbitrary
// uid passed in the body.
async function handleReplacementDecision(
  db: FirebaseFirestore.Firestore,
  leaveRequestId: string,
  data: any,
  uid: string,
  body: any,
) {
  const isAssignedReplacement = data.replacementEmployeeUid === uid || data.handoverEmployeeId === uid;
  if (!isAssignedReplacement) {
    return NextResponse.json({ error: 'Forbidden: not the assigned replacement for this leave request.' }, { status: 403 });
  }

  const decision: 'accepted' | 'rejected' = body?.decision === 'rejected' ? 'rejected' : 'accepted';
  const employeeUid: string = data.employeeUid || data.requesterUid || data.uid || data.userId || '';
  if (!employeeUid) {
    return NextResponse.json({ error: 'Leave request has no resolvable requester.' }, { status: 400 });
  }

  const replacementName: string = body?.replacementName || '';

  try {
    if (decision === 'accepted') {
      await writeNotification(db, {
        userId: employeeUid,
        type: 'status_update',
        module: 'employee',
        title: 'Pengganti Sementara Bersedia',
        message: `${replacementName || 'Pengganti sementara Anda'} bersedia menjadi pengganti sementara untuk pengajuan cuti Anda.`,
        targetType: 'user',
        targetId: leaveRequestId,
        actionUrl: '/admin/karyawan/pengajuan-cuti?tab=saya',
        createdBy: uid,
      });
    } else {
      await writeNotification(db, {
        userId: employeeUid,
        type: 'status_update',
        module: 'employee',
        title: 'Pengganti Sementara Menolak',
        message: `${replacementName || 'Pengganti sementara Anda'} tidak bersedia menjadi pengganti sementara. Silakan pilih pengganti lain.`,
        targetType: 'user',
        targetId: leaveRequestId,
        actionUrl: '/admin/karyawan/pengajuan-cuti?tab=saya',
        createdBy: uid,
        priority: 'action_required',
      });
    }
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('[LEAVE_SEND_NOTIFICATIONS_REPLACEMENT_DECISION_FAILED]', { leaveRequestId, decision, error });
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}

// Requester swapped in a new replacement after the previous one declined —
// notify the newly-designated person. Caller must be the doc's own owner
// (same check as the submission path); the recipient is re-read from the
// doc itself (already updated client-side by the time this runs), never
// trusted from the request body.
async function handleReplacementReassigned(
  db: FirebaseFirestore.Firestore,
  leaveRequestId: string,
  data: any,
  uid: string,
) {
  const isOwner = [data.employeeUid, data.requesterUid, data.uid, data.userId, data.employeeId].includes(uid);
  if (!isOwner) {
    return NextResponse.json({ error: 'Forbidden: not the owner of this leave request.' }, { status: 403 });
  }

  const replacementUid: string = data.replacementEmployeeUid || '';
  if (!replacementUid) {
    return NextResponse.json({ error: 'Leave request has no replacement to notify.' }, { status: 400 });
  }

  const employeeName: string = data.employeeName || '';
  const startStr = formatDateLabel(data.startDate);
  const endStr = formatDateLabel(data.endDate);

  try {
    await writeNotification(db, {
      userId: replacementUid,
      type: 'leave_replacement_mandate',
      module: 'employee',
      title: 'Mandat Pengganti Sementara',
      message: `${employeeName} menunjuk Anda sebagai pengganti sementara selama cuti (${startStr} – ${endStr}).`,
      targetType: 'user',
      targetId: leaveRequestId,
      actionUrl: '/admin/karyawan/pengajuan-cuti?tab=mandat',
      createdBy: uid,
      priority: 'action_required',
      meta: { leaveRequestId, requesterUid: uid, requesterName: employeeName, leavePeriodStart: startStr, leavePeriodEnd: endStr },
    });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('[LEAVE_SEND_NOTIFICATIONS_REASSIGNED_FAILED]', { leaveRequestId, error });
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
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
  const leaveRequestId = body?.leaveRequestId;
  const action: 'submission' | 'replacement_decision' | 'replacement_reassigned' =
    body?.action === 'replacement_decision'
      ? 'replacement_decision'
      : body?.action === 'replacement_reassigned'
        ? 'replacement_reassigned'
        : 'submission';
  if (!leaveRequestId) {
    return NextResponse.json({ error: 'leaveRequestId is required.' }, { status: 400 });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const db = admin.firestore();

    const leaveDoc = await db.collection('leave_requests').doc(leaveRequestId).get();
    if (!leaveDoc.exists) {
      return NextResponse.json({ error: 'Leave request not found.' }, { status: 404 });
    }
    const data = leaveDoc.data() as any;

    if (action === 'replacement_decision') {
      return handleReplacementDecision(db, leaveRequestId, data, uid, body);
    }
    if (action === 'replacement_reassigned') {
      return handleReplacementReassigned(db, leaveRequestId, data, uid);
    }

    // Only the requester who owns this leave request may trigger its
    // submission notifications — mirrors isLeaveRequestOwner() in
    // firestore.rules so this route can't be used to fire notifications on
    // someone else's behalf.
    const isOwner = [data.employeeUid, data.requesterUid, data.uid, data.userId, data.employeeId].includes(uid);
    if (!isOwner) {
      return NextResponse.json({ error: 'Forbidden: not the owner of this leave request.' }, { status: 403 });
    }

    const employeeUid: string = data.employeeUid || uid;
    const employeeName: string = data.employeeName || '';
    const approverUid: string = data.approvalTargetUid || data.currentApproverUid || data.managerUid || data.managerId || '';
    const replacementUid: string = data.replacementEmployeeUid || '';
    const startStr = formatDateLabel(data.startDate);
    const endStr = formatDateLabel(data.endDate);

    const tasks: Promise<any>[] = [
      writeNotification(db, {
        userId: employeeUid,
        type: 'status_update',
        module: 'employee',
        title: 'Pengajuan Cuti Dikirim',
        message: 'Pengajuan cuti Anda berhasil dikirim dan menunggu review Manager.',
        targetType: 'user',
        targetId: leaveRequestId,
        actionUrl: '/admin/karyawan/pengajuan-cuti?tab=saya',
        createdBy: 'system',
      }),
    ];

    if (approverUid) {
      tasks.push(
        writeNotification(db, {
          userId: approverUid,
          type: 'leave_approval_request',
          module: 'employee',
          title: 'Pengajuan Cuti Baru',
          message: `${employeeName} mengajukan cuti dan menunggu persetujuan Anda (${startStr} – ${endStr}).`,
          targetType: 'user',
          targetId: leaveRequestId,
          actionUrl: '/admin/manager/persetujuan-cuti',
          createdBy: 'system',
          priority: 'action_required',
        }),
      );
    }

    if (replacementUid) {
      tasks.push(
        writeNotification(db, {
          userId: replacementUid,
          type: 'leave_replacement_mandate',
          module: 'employee',
          title: 'Mandat Pengganti Sementara',
          message: `${employeeName} menunjuk Anda sebagai pengganti sementara selama cuti (${startStr} – ${endStr}).`,
          targetType: 'user',
          targetId: leaveRequestId,
          actionUrl: '/admin/karyawan/pengajuan-cuti?tab=mandat',
          createdBy: employeeUid,
          priority: 'action_required',
          meta: {
            leaveRequestId,
            requesterUid: employeeUid,
            requesterName: employeeName,
            leavePeriodStart: startStr,
            leavePeriodEnd: endStr,
          },
        }),
      );
    }

    const results = await Promise.allSettled(tasks);
    const failedCount = results.filter((r) => r.status === 'rejected').length;
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.warn('[LEAVE_SEND_NOTIFICATIONS_TASK_FAILED]', { leaveRequestId, index: i, reason: r.reason });
      }
    });

    return NextResponse.json({ success: failedCount === 0, sent: results.length - failedCount, failed: failedCount }, { status: 200 });
  } catch (error: any) {
    console.error('[LEAVE_SEND_NOTIFICATIONS_FAILED]', { leaveRequestId, error });
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
