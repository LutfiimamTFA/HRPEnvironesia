import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { calculateLeaveBalance } from '@/lib/leave-balance';
import { resolveEmployeeBrandId } from '@/lib/leave-policy';

// Firestore rules don't grant a plain karyawan `list` on leave_policies (it's
// HRD/brand-scoped only) or an unfiltered multi-field `list` on
// leave_requests — so calculateLeaveBalance()'s inputs can't all be gathered
// client-side for a staff member. This route gathers them server-side via
// the Admin SDK (bypassing rules) then runs the exact same
// calculateLeaveBalance() every other page uses, so the staff dashboard's
// numbers can never drift from HRD's — every page-level consumer goes
// through src/hooks/use-live-leave-balance.ts, which calls this route.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Mirrors isSuperAdmin()/isHrdAllowedForBrand() in firestore.rules — this
// route bypasses security rules via the Admin SDK, so it must re-implement
// the same authorization decision itself rather than assuming the caller is
// always asking about their own balance.
async function callerCanViewEmployeeBalance(
  db: admin.firestore.Firestore,
  callerUid: string,
  callerEmail: string | null | undefined,
  targetEmployee: any,
): Promise<boolean> {
  if (callerEmail === 'super_admin@gmail.com') return true;

  const [adminRoleSnap, callerUserSnap] = await Promise.all([
    db.collection('roles_admin').doc(callerUid).get(),
    db.collection('users').doc(callerUid).get(),
  ]);
  if (adminRoleSnap.exists) return true;
  const callerRole = callerUserSnap.exists ? (callerUserSnap.data() as any)?.role : null;
  if (callerRole === 'super-admin' || callerRole === 'super_admin') return true;

  const hrdRoleSnap = await db.collection('roles_hrd').doc(callerUid).get();
  if (!hrdRoleSnap.exists) return false;
  const hrdData = hrdRoleSnap.data() as any;
  if (hrdData?.active === false) return false;
  if (hrdData?.scopeType === 'all_companies') return true;

  const targetBrandId = resolveEmployeeBrandId(targetEmployee);
  const allowedBrandIds: string[] = Array.isArray(hrdData?.allowedBrandIds) ? hrdData.allowedBrandIds : [];
  return targetBrandId !== null && allowedBrandIds.includes(targetBrandId);
}

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
    const callerUid = decoded.uid;
    const db = admin.firestore();

    // Staff pages call this with no employeeUid — their own uid, from the
    // verified token, is the only thing that can ever be looked up. HRD
    // pages (Detail Karyawan, Workspace Monitoring Cuti) pass a specific
    // employeeUid; that path requires the brand-scope check below.
    const requestedUid = req.nextUrl.searchParams.get('employeeUid') || callerUid;

    const profileDoc = await db.collection('employee_profiles').doc(requestedUid).get();
    if (!profileDoc.exists) {
      return NextResponse.json({ error: 'Profil kepegawaian belum tersedia.' }, { status: 404 });
    }
    const employee = { ...profileDoc.data(), uid: requestedUid };

    if (requestedUid !== callerUid) {
      const allowed = await callerCanViewEmployeeBalance(db, callerUid, decoded.email, employee);
      if (!allowed) {
        return NextResponse.json({ error: 'Anda tidak memiliki akses ke saldo cuti karyawan ini.' }, { status: 403 });
      }
    }

    const brandId = resolveEmployeeBrandId(employee);

    const [policiesSnap, byEmployeeUid, byRequesterUid, byUid, byUserId, byEmployeeId, byCreatedByUid] = await Promise.all([
      brandId
        ? db.collection('leave_policies').where('brandIds', 'array-contains', brandId).get()
        : Promise.resolve(null),
      db.collection('leave_requests').where('employeeUid', '==', requestedUid).get(),
      db.collection('leave_requests').where('requesterUid', '==', requestedUid).get(),
      db.collection('leave_requests').where('uid', '==', requestedUid).get(),
      db.collection('leave_requests').where('userId', '==', requestedUid).get(),
      db.collection('leave_requests').where('employeeId', '==', requestedUid).get(),
      db.collection('leave_requests').where('createdByUid', '==', requestedUid).get(),
    ]);

    const leavePolicies = policiesSnap ? policiesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];

    const requestDocs = new Map<string, any>();
    [byEmployeeUid, byRequesterUid, byUid, byUserId, byEmployeeId, byCreatedByUid].forEach((snap) => {
      snap.docs.forEach((docSnap) => requestDocs.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }));
    });
    const leaveRequests = Array.from(requestDocs.values());

    const result = calculateLeaveBalance({ employee, leaveRequests, leavePolicies: leavePolicies as any });

    console.log('[LEAVE_BALANCE_SYNC_DEBUG]', JSON.stringify({
      employeeUid: requestedUid,
      employeeName: (employee as any).fullName || (employee as any).dataDiriIdentitas?.fullName || null,
      requestedBy: callerUid === requestedUid ? 'self' : callerUid,
      source: 'api/leave/my-balance',
      brandId,
      requestCount: leaveRequests.length,
      policyCount: leavePolicies.length,
      found: result.found,
      reason: result.found ? undefined : result.reason,
      entitlementDays: result.found ? result.entitlementDays : null,
      usedDays: result.found ? result.usedDays : null,
      pendingDays: result.found ? result.pendingDays : null,
      remainingDays: result.found ? result.remainingDays : null,
      availableDays: result.found ? result.availableDays : null,
      approvedRequestIds: result.found ? result.approvedRequestIds : [],
      pendingRequestIds: result.found ? result.pendingRequestIds : [],
      calculatedAt: new Date().toISOString(),
    }, null, 2));

    return NextResponse.json({ balance: result }, { status: 200 });
  } catch (error: any) {
    console.error('[LEAVE_MY_BALANCE_FAILED]', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
