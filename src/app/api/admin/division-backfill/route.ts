import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { resolveEmployeeDivision, getRawDivisionFields, type MasterDivision } from '@/lib/employee-division';

// Super Admin backfill tool for stale division data on employee_profiles —
// e.g. a division like "CBDMS" that was renamed/removed from a brand's
// master divisions (brands/{brandId}/divisions) but is still sitting on old
// employee records. This never auto-applies a "recommended" division: it
// only reports what's broken, and a Super Admin must pick the correct
// division per employee and confirm before anything is written.
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

function resolveBrandId(data: any): string {
  const hrd = data.hrdEmploymentInfo || {};
  const raw = data.brandId ?? hrd.brandId;
  return Array.isArray(raw) ? raw[0] || '' : raw || '';
}
function resolveJobTitle(data: any): string {
  const hrd = data.hrdEmploymentInfo || {};
  return (
    data.jobTitle ||
    data.position ||
    data.jabatan ||
    data.structuralPosition ||
    hrd.jobTitle ||
    hrd.position ||
    hrd.jabatan ||
    hrd.workRole ||
    hrd.structuralPosition ||
    '-'
  );
}
function resolveDisplayName(data: any): string {
  const hrd = data.hrdEmploymentInfo || {};
  return (
    data.fullName ||
    data.employeeName ||
    data.displayName ||
    data.name ||
    data.dataDiriIdentitas?.namaLengkap ||
    hrd.fullName ||
    data.email ||
    '(tanpa nama)'
  );
}

/**
 * GET ?brandId=xxx  — lists employee_profiles in that brand whose division
 * doesn't resolve to any active master division. Without brandId, returns
 * just the list of brands (for the picker) so the UI can populate its brand
 * selector before requesting a report.
 */
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

  const [profilesSnap, divisionsSnap] = await Promise.all([
    db.collection('employee_profiles').where('brandId', '==', brandId).get(),
    db.collection('brands').doc(brandId).collection('divisions').get(),
  ]);

  const allDivisions: MasterDivision[] = divisionsSnap.docs.map((d) => ({
    id: d.id,
    name: d.data()?.name || '',
    isActive: d.data()?.isActive,
  }));
  const activeDivisions = allDivisions.filter((d) => d.isActive !== false);

  const mismatches = profilesSnap.docs
    .map((docSnap) => {
      const data: any = { ...docSnap.data(), uid: docSnap.id };
      const resolved = resolveEmployeeDivision(data, activeDivisions);
      const raw = getRawDivisionFields(data);
      return { data, resolved, raw };
    })
    .filter(({ resolved }) => !resolved.isValid)
    .map(({ data, raw }) => ({
      uid: data.uid,
      fullName: resolveDisplayName(data),
      brandId: resolveBrandId(data),
      jobTitle: resolveJobTitle(data),
      oldDivisionName: raw.divisionName || '(kosong)',
      oldDivisionId: raw.divisionId || '',
    }));

  return NextResponse.json(
    {
      mismatches,
      activeDivisions: activeDivisions.map((d) => ({ id: d.id, name: d.name })),
      meta: { scannedCount: profilesSnap.docs.length, mismatchCount: mismatches.length },
    },
    { status: 200 },
  );
}

/**
 * POST { uid, brandId, divisionId } — applies a Super-Admin-confirmed
 * division correction. Mirrors the same compatibility-field sync used by
 * "Ubah Struktur Kepegawaian" (employee-data/karyawan/[id]/page.tsx) so every
 * module reading any of the legacy/nested field names sees the fix too, not
 * just the top-level divisionId/divisionName.
 */
export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const uid = body?.uid;
  const brandId = body?.brandId;
  const divisionId = body?.divisionId;
  if (!uid || !brandId || !divisionId) {
    return NextResponse.json({ error: 'uid, brandId, and divisionId are required.' }, { status: 400 });
  }

  const db = admin.firestore();
  const divisionDoc = await db.collection('brands').doc(brandId).collection('divisions').doc(divisionId).get();
  if (!divisionDoc.exists) {
    return NextResponse.json({ error: 'Divisi tujuan tidak ditemukan di master data.' }, { status: 404 });
  }
  const divisionName = divisionDoc.data()?.name || '';

  const payload = {
    divisionId,
    divisionName,
    'hrdEmploymentInfo.divisionId': divisionId,
    'hrdEmploymentInfo.divisionName': divisionName,
    'hrdEmploymentInfo.divisi': divisionName,
    'strukturKepegawaian.divisionId': divisionId,
    'strukturKepegawaian.divisionName': divisionName,
    departmentId: divisionId,
    departmentName: divisionName,
    divisi: divisionName,
    structureUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    structureUpdatedBy: auth.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection('employee_profiles').doc(uid).set(payload, { merge: true });
  await db.collection('users').doc(uid).set(payload, { merge: true });

  return NextResponse.json({ success: true, uid, divisionId, divisionName }, { status: 200 });
}
