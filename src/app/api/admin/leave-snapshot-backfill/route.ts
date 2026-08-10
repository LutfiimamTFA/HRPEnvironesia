import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';

// "Sinkronkan Snapshot Cuti" — leave_requests docs snapshot the employee's
// name/brand/division at submission time. That snapshot goes stale the
// moment HRD moves the employee to a new division/brand (the "CBDMS still
// showing after the employee moved to DTIC" bug) — live pages now resolve
// division from the current employee_profiles doc instead (see
// resolveCurrentEmployeeDivision in employee-division.ts), but OLD docs'
// own snapshot fields are still wrong wherever something reads them
// directly (audit exports, the legacy "Divisi saat pengajuan" label, etc).
// This route finds those mismatches and, on explicit per-row Super Admin
// confirmation, refreshes ONLY the snapshot fields — never status,
// duration, dates, approval decisions, or balance.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function verifySuperAdmin(req: NextRequest) {
  if (!admin.apps.length) {
    return { error: 'Firebase Admin SDK not initialized.', status: 500 } as const;
  }
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return { error: 'Unauthorized: missing token.', status: 401 } as const;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(auth.split('Bearer ')[1]);
    const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'super-admin') {
      return { error: 'Forbidden: Super Admin only.', status: 403 } as const;
    }
    return { uid: decoded.uid } as const;
  } catch (e: any) {
    return { error: `Auth failed: ${e.message}`, status: 401 } as const;
  }
}

function getOwnerUid(request: any): string {
  return (
    request?.employeeUid ||
    request?.requesterUid ||
    request?.uid ||
    request?.userId ||
    request?.createdByUid ||
    request?.employeeId ||
    ''
  );
}

function resolveProfileName(profile: any): string {
  return (
    profile?.fullName ||
    profile?.dataDiriIdentitas?.fullName ||
    profile?.dataDiriIdentitas?.namaLengkap ||
    ''
  );
}

function resolveProfileDivision(profile: any): { divisionId: string; divisionName: string } {
  const hrd = profile?.hrdEmploymentInfo || {};
  return {
    divisionId: profile?.divisionId || hrd.divisionId || '',
    divisionName: profile?.divisionName || hrd.divisionName || hrd.divisi || '',
  };
}

function resolveProfileBrand(profile: any): { brandId: string; brandName: string } {
  const hrd = profile?.hrdEmploymentInfo || {};
  const rawBrandId = profile?.brandId || hrd.brandId || '';
  return {
    brandId: Array.isArray(rawBrandId) ? rawBrandId[0] || '' : rawBrandId,
    brandName: profile?.brandName || hrd.brandName || hrd.brand || '',
  };
}

/** GET ?brandId=xxx — preview only, never writes. Without brandId, returns the brand picker list. */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = admin.firestore();
  const brandId = req.nextUrl.searchParams.get('brandId') || '';

  if (!brandId) {
    const brandsSnap = await db.collection('brands').get();
    const brands = brandsSnap.docs.map((d) => ({ id: d.id, name: d.data()?.name || d.id }));
    return NextResponse.json({ brands }, { status: 200 });
  }

  const requestsSnap = await db.collection('leave_requests').where('brandId', '==', brandId).get();

  const mismatches: any[] = [];
  for (const docSnap of requestsSnap.docs) {
    const request = { id: docSnap.id, ...docSnap.data() } as any;
    const ownerUid = getOwnerUid(request);
    if (!ownerUid) continue;

    const profileDoc = await db.collection('employee_profiles').doc(ownerUid).get();
    if (!profileDoc.exists) continue;
    const profile = profileDoc.data();

    const currentName = resolveProfileName(profile);
    const currentDivision = resolveProfileDivision(profile);
    const currentBrand = resolveProfileBrand(profile);

    const nameChanged = currentName && request.employeeName && currentName !== request.employeeName;
    const divisionChanged =
      currentDivision.divisionName && request.divisionName && currentDivision.divisionName !== request.divisionName;
    const brandChanged = currentBrand.brandName && request.brandName && currentBrand.brandName !== request.brandName;

    if (!nameChanged && !divisionChanged && !brandChanged) continue;

    mismatches.push({
      requestId: request.id,
      employeeUid: ownerUid,
      oldName: request.employeeName || '-',
      newName: currentName || request.employeeName || '-',
      oldDivisionName: request.divisionName || '-',
      newDivisionName: currentDivision.divisionName || request.divisionName || '-',
      oldBrandName: request.brandName || '-',
      newBrandName: currentBrand.brandName || request.brandName || '-',
      status: request.status || '',
      startDate: request.startDate?.toDate?.()?.toISOString?.() || null,
    });
  }

  return NextResponse.json(
    { mismatches, meta: { scannedCount: requestsSnap.docs.length, mismatchCount: mismatches.length } },
    { status: 200 },
  );
}

/** POST { requestId } — applies ONE Super-Admin-confirmed snapshot refresh. Never touches status/duration/dates/approval/balance. */
export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const requestId = body?.requestId;
  if (!requestId) {
    return NextResponse.json({ error: 'requestId is required.' }, { status: 400 });
  }

  const db = admin.firestore();
  const requestDoc = await db.collection('leave_requests').doc(requestId).get();
  if (!requestDoc.exists) {
    return NextResponse.json({ error: 'Leave request not found.' }, { status: 404 });
  }
  const request = requestDoc.data() as any;
  const ownerUid = getOwnerUid({ id: requestId, ...request });
  if (!ownerUid) {
    return NextResponse.json({ error: 'Tidak dapat menentukan pemilik pengajuan ini.' }, { status: 400 });
  }

  const profileDoc = await db.collection('employee_profiles').doc(ownerUid).get();
  if (!profileDoc.exists) {
    return NextResponse.json({ error: 'Profil karyawan tidak ditemukan.' }, { status: 404 });
  }
  const profile = profileDoc.data();

  const currentDivision = resolveProfileDivision(profile);
  const currentBrand = resolveProfileBrand(profile);
  const currentName = resolveProfileName(profile);

  // Field names match what LeaveSubmissionClient.tsx's create payload
  // already writes (employeeCurrentDivisionId/Name) — same "current profile
  // division" snapshot pair, kept consistent between new submissions and
  // this retroactive fix for old ones. divisionId/divisionName themselves
  // are also refreshed since every existing display fallback chain reads
  // those as the general/legacy field. Never touches status, durationDays,
  // startDate/endDate, saldo, or any approval-decision field.
  await db.collection('leave_requests').doc(requestId).update({
    employeeName: currentName || request.employeeName || '',
    brandId: currentBrand.brandId || request.brandId || '',
    brandName: currentBrand.brandName || request.brandName || '',
    divisionId: currentDivision.divisionId || request.divisionId || '',
    divisionName: currentDivision.divisionName || request.divisionName || '',
    employeeCurrentDivisionId: currentDivision.divisionId || '',
    employeeCurrentDivisionName: currentDivision.divisionName || '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true, requestId }, { status: 200 });
}
