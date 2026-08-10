import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { calculateLeaveBalance } from '@/lib/leave-balance';
import { resolveEmployeeBrandId } from '@/lib/leave-policy';

// Firestore rules don't grant a plain karyawan `list` on leave_policies (it's
// HRD/brand-scoped only) or an unfiltered multi-field `list` on
// leave_requests — so calculateLeaveBalance()'s inputs can't all be gathered
// client-side for a staff member. This route gathers them server-side via
// the Admin SDK (bypassing rules) for the CALLER's own uid only, then runs
// the exact same calculateLeaveBalance() every other page uses, so the
// staff dashboard's numbers can never drift from HRD's.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: Missing token.' }, { status: 401 });
  }
  const idToken = authorization.split('Bearer ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const db = admin.firestore();

    const profileDoc = await db.collection('employee_profiles').doc(uid).get();
    if (!profileDoc.exists) {
      return NextResponse.json({ error: 'Profil kepegawaian belum tersedia.' }, { status: 404 });
    }
    const employee = { ...profileDoc.data(), uid };

    const brandId = resolveEmployeeBrandId(employee);

    const [policiesSnap, byEmployeeUid, byRequesterUid, byUid, byUserId, byEmployeeId, byCreatedByUid] = await Promise.all([
      brandId
        ? db.collection('leave_policies').where('brandIds', 'array-contains', brandId).get()
        : Promise.resolve(null),
      db.collection('leave_requests').where('employeeUid', '==', uid).get(),
      db.collection('leave_requests').where('requesterUid', '==', uid).get(),
      db.collection('leave_requests').where('uid', '==', uid).get(),
      db.collection('leave_requests').where('userId', '==', uid).get(),
      db.collection('leave_requests').where('employeeId', '==', uid).get(),
      db.collection('leave_requests').where('createdByUid', '==', uid).get(),
    ]);

    const leavePolicies = policiesSnap ? policiesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];

    const requestDocs = new Map<string, any>();
    [byEmployeeUid, byRequesterUid, byUid, byUserId, byEmployeeId, byCreatedByUid].forEach((snap) => {
      snap.docs.forEach((docSnap) => requestDocs.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }));
    });
    const leaveRequests = Array.from(requestDocs.values());

    const result = calculateLeaveBalance({ employee, leaveRequests, leavePolicies: leavePolicies as any });

    console.log('[LEAVE_BALANCE_SYNC_DEBUG]', {
      employeeUid: uid,
      employeeName: (employee as any).fullName || (employee as any).dataDiriIdentitas?.fullName,
      brandId,
      requestCount: leaveRequests.length,
      policyCount: leavePolicies.length,
      result,
    });

    return NextResponse.json({ balance: result }, { status: 200 });
  } catch (error: any) {
    console.error('[LEAVE_MY_BALANCE_FAILED]', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
