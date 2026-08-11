import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { normalizeEmployeeTypeValue } from '@/lib/employee-type';

// "Sinkronkan Status Kepegawaian" — an employee whose hrdEmploymentInfo.
// tipeKaryawan (or a legacy employeeType mirror) already reads "Kontrak"
// can still carry a stale employmentStatus/statusKerja = "probation" from
// before HRD ever updated the type — Dashboard Staff, checkLeaveEligibility,
// and any other reader of the old combined status resolver kept showing
// "Probation" (or blocking cuti eligibility) for that employee forever,
// since nothing ever re-wrote those legacy fields. This route finds exactly
// that mismatch and, on explicit per-row Super Admin confirmation, corrects
// ONLY the status-like fields — never touches tipeKaryawan/employeeType
// itself, and never touches an employee who is genuinely still Probation.
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

function resolveName(profile: any): string {
  return (
    profile?.fullName ||
    profile?.namaLengkap ||
    profile?.dataDiriIdentitas?.fullName ||
    profile?.dataDiriIdentitas?.namaLengkap ||
    'Tanpa Nama'
  );
}

function resolveEmployeeTypeForBackfill(profile: any): string {
  const hrdInfo = profile?.hrdEmploymentInfo || {};
  const candidates = [hrdInfo.tipeKaryawan, hrdInfo.employeeType, profile?.tipeKaryawan, profile?.employeeType, profile?.employmentType];
  for (const candidate of candidates) {
    const normalized = normalizeEmployeeTypeValue(candidate);
    if (normalized !== 'unknown') return normalized;
  }
  return 'unknown';
}

/** GET — preview only, never writes. Scans employee_profiles for tipeKaryawan=Kontrak but stale probation-like status fields. */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = admin.firestore();
  const profilesSnap = await db.collection('employee_profiles').get();

  const mismatches: any[] = [];
  let kontrakCount = 0;

  for (const docSnap of profilesSnap.docs) {
    const profile = { id: docSnap.id, ...docSnap.data() } as any;
    const employeeType = resolveEmployeeTypeForBackfill(profile);
    if (employeeType !== 'kontrak') continue;
    kontrakCount += 1;

    const hrdInfo = profile.hrdEmploymentInfo || {};
    const userDoc = await db.collection('users').doc(docSnap.id).get();
    const userData = userDoc.exists ? userDoc.data() : null;

    const statusCandidates = {
      employmentStatus: profile.employmentStatus,
      statusKerja: profile.statusKerja,
      hrdEmploymentStatus: hrdInfo.employmentStatus,
      hrdStatusKerja: hrdInfo.statusKerja,
      userEmploymentStage: userData?.employmentStage,
    };

    const isProbationLike = Object.values(statusCandidates).some(
      (v) => normalizeEmployeeTypeValue(v) === 'probation',
    );
    if (!isProbationLike) continue;

    mismatches.push({
      employeeUid: docSnap.id,
      name: resolveName(profile),
      tipeKaryawan: 'Kontrak',
      oldEmploymentStatus: profile.employmentStatus || '-',
      oldStatusKerja: profile.statusKerja || '-',
      oldHrdEmploymentStatus: hrdInfo.employmentStatus || '-',
      oldHrdStatusKerja: hrdInfo.statusKerja || '-',
      oldUserEmploymentStage: userData?.employmentStage || '-',
      newStatusLabel: 'active / Aktif / contract',
    });
  }

  return NextResponse.json(
    {
      mismatches,
      meta: { scannedCount: profilesSnap.docs.length, kontrakCount, mismatchCount: mismatches.length },
    },
    { status: 200 },
  );
}

/** POST { employeeUid } — applies ONE Super-Admin-confirmed status fix. Never touches tipeKaryawan/employeeType, never touches a genuinely-still-Probation employee. */
export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const employeeUid = body?.employeeUid;
  if (!employeeUid) {
    return NextResponse.json({ error: 'employeeUid is required.' }, { status: 400 });
  }

  const db = admin.firestore();
  const profileRef = db.collection('employee_profiles').doc(employeeUid);
  const profileDoc = await profileRef.get();
  if (!profileDoc.exists) {
    return NextResponse.json({ error: 'Profil karyawan tidak ditemukan.' }, { status: 404 });
  }
  const profile = profileDoc.data() as any;

  // Defensive re-check server-side — never apply this fix to an employee
  // whose type isn't actually Kontrak, even if the client sent a stale row.
  const employeeType = resolveEmployeeTypeForBackfill(profile);
  if (employeeType !== 'kontrak') {
    return NextResponse.json({ error: 'Tipe karyawan bukan Kontrak — dibatalkan.' }, { status: 400 });
  }

  await profileRef.set(
    {
      employmentStatus: 'active',
      statusKerja: 'Aktif',
      hrdEmploymentInfo: {
        ...(profile.hrdEmploymentInfo || {}),
        employmentStatus: 'active',
        statusKerja: 'Aktif',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const userRef = db.collection('users').doc(employeeUid);
  const userDoc = await userRef.get();
  if (userDoc.exists) {
    await userRef.set(
      {
        employmentStage: 'contract',
        employmentType: 'Kontrak',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  return NextResponse.json({ success: true, employeeUid }, { status: 200 });
}
