import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { resolveEmployeeDivision, type MasterDivision } from '@/lib/employee-division';

// Never cache this route — the whole point is "always the latest active
// employee directory", not a snapshot from the last request.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function normalize(value: any): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function capitalizeWords(value: string): string {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function resolveBrandId(data: any, hrd: any): string {
  const raw = data.brandId ?? hrd.brandId;
  return Array.isArray(raw) ? raw[0] || '' : raw || '';
}
function resolveBrandName(data: any, hrd: any): string {
  return data.brandName || hrd.brandName || hrd.brand || '';
}
function resolveJobTitle(data: any, hrd: any): string {
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

/**
 * fullName -> employeeName -> displayName -> dataDiriIdentitas.fullName ->
 * hrdEmploymentInfo.fullName -> the joined users/{uid} doc's name/
 * displayName/fullName -> capitalized email username as an absolute last
 * resort. Returns "" (never a placeholder like "Tanpa Nama") when nothing
 * resolves — callers must exclude the candidate entirely rather than show a
 * fallback string that looks like a deliberately-set name.
 */
function getEmployeeDisplayName(employee: any, userMap: Map<string, any>): string {
  const uid = employee.uid || employee.userId || employee.employeeUid;
  const user = uid ? userMap.get(uid) : undefined;
  const hrd = employee.hrdEmploymentInfo || {};

  const direct = [
    employee.fullName,
    employee.employeeName,
    employee.displayName,
    employee.name,
    employee.dataDiriIdentitas?.namaLengkap,
    employee.dataDiriIdentitas?.fullName,
    employee.personalInfo?.fullName,
    employee.profile?.fullName,
    hrd.fullName,
    user?.fullName,
    user?.name,
    user?.displayName,
  ].find((v) => typeof v === 'string' && v.trim());
  if (direct) return direct.trim();

  const email = employee.email || user?.email;
  if (typeof email === 'string' && email.includes('@')) {
    const username = email.split('@')[0];
    if (username) return capitalizeWords(username);
  }

  return '';
}

/**
 * Returns active colleagues in the caller's own brand + division, for the
 * "Pengganti Sementara" dropdown on the leave submission form. A plain
 * "karyawan" account can `get` its own employee_profiles doc but cannot
 * `list`/query the collection (firestore.rules only grants `list` to HRD/
 * Super Admin) — so this can't be a client-side Firestore query at all, only
 * a server route using the Admin SDK, which isn't bound by those rules.
 */
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
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const db = admin.firestore();

    const callerDoc = await db.collection('employee_profiles').doc(uid).get();
    if (!callerDoc.exists) {
      return NextResponse.json({ candidates: [] }, { status: 200 });
    }
    const caller: any = { ...callerDoc.data(), uid };
    const callerHrd = caller.hrdEmploymentInfo || {};
    const callerBrandId = resolveBrandId(caller, callerHrd);

    if (!callerBrandId) {
      return NextResponse.json({ candidates: [] }, { status: 200 });
    }

    const [profilesSnap, usersSnap, divisionsSnap] = await Promise.all([
      db.collection('employee_profiles').where('brandId', '==', callerBrandId).get(),
      // Admin SDK isn't bound by firestore.rules, so joining the full users
      // collection here (to backfill a name employee_profiles is missing)
      // costs nothing extra in terms of access, only a bit of read volume.
      db.collection('users').get(),
      // Master data — this brand's real division list (Master Data > Brands
      // & Departments), the only source of truth for what a "valid"
      // division actually is right now.
      db.collection('brands').doc(callerBrandId).collection('divisions').get(),
    ]);

    const userMap = new Map<string, any>();
    usersSnap.docs.forEach((docSnap) => userMap.set(docSnap.id, docSnap.data() || {}));

    const masterDivisions: MasterDivision[] = divisionsSnap.docs
      .map((d) => ({ id: d.id, name: d.data()?.name || '', isActive: d.data()?.isActive }))
      .filter((d) => d.isActive !== false);

    const callerDivision = resolveEmployeeDivision(caller, masterDivisions);
    console.log('[LEAVE_REPLACEMENT_DIVISION_SOURCE_DEBUG]', {
      candidateUid: uid,
      candidateName: getEmployeeDisplayName(caller, userMap),
      rawDivisionFields: {
        divisionId: caller.divisionId,
        divisionName: caller.divisionName,
        divisi: caller.divisi,
        departmentName: caller.departmentName,
        hrdEmploymentInfo: callerHrd,
        strukturKepegawaian: caller.strukturKepegawaian,
        employmentData: caller.employmentData,
      },
      resolvedDivisionId: callerDivision.divisionId,
      resolvedDivisionName: callerDivision.divisionName,
      resolvedDivisionSource: callerDivision.source,
      note: 'this is the REQUESTER (caller), not a candidate',
    });

    const inactiveStatuses = new Set(['inactive', 'nonaktif', 'resigned', 'terminated', 'berhenti', 'arsip', 'archived']);
    const rawEmployeesCount = profilesSnap.docs.length;
    let excludedInvalidNameCount = 0;
    let excludedInvalidDivisionCount = 0;

    const candidates = profilesSnap.docs
      .map((docSnap) => {
        const data: any = { ...docSnap.data(), uid: docSnap.id };
        const hrd = data.hrdEmploymentInfo || {};
        const isActive = data.isActive;
        const statusText = normalize(hrd.employmentStatus || hrd.statusKerja || data.status || '');
        const fullName = getEmployeeDisplayName(data, userMap);
        const division = resolveEmployeeDivision(data, masterDivisions);

        console.log('[LEAVE_REPLACEMENT_DIVISION_SOURCE_DEBUG]', {
          candidateUid: data.uid,
          candidateName: fullName || '(excluded — no name)',
          rawDivisionFields: {
            divisionId: data.divisionId,
            divisionName: data.divisionName,
            divisi: data.divisi,
            departmentName: data.departmentName,
            hrdEmploymentInfo: hrd,
            strukturKepegawaian: data.strukturKepegawaian,
            employmentData: data.employmentData,
          },
          resolvedDivisionId: division.divisionId,
          resolvedDivisionName: division.divisionName,
          resolvedDivisionSource: division.source,
        });

        return {
          uid: docSnap.id,
          fullName,
          jobTitle: resolveJobTitle(data, hrd),
          brandId: resolveBrandId(data, hrd),
          brandName: resolveBrandName(data, hrd),
          divisionId: division.divisionId,
          divisionName: division.divisionName,
          divisionValid: division.isValid,
          isExplicitlyInactive: isActive === false || inactiveStatuses.has(statusText),
        };
      })
      .filter((employee) => {
        if (employee.uid === uid) return false;
        if (employee.isExplicitlyInactive) return false;
        if (!employee.fullName) {
          excludedInvalidNameCount += 1;
          console.warn('[LEAVE_REPLACEMENT_INVALID_EMPLOYEE]', { uid: employee.uid });
          return false;
        }
        if (!employee.divisionValid) {
          excludedInvalidDivisionCount += 1;
          console.warn('[INVALID_EMPLOYEE_DIVISION_EXCLUDED]', {
            uid: employee.uid,
            name: employee.fullName,
            rawDivisionName: employee.divisionName,
            rawDivisionId: employee.divisionId,
            brandId: employee.brandId,
            reason: 'Division not found in active master divisions',
          });
          return false;
        }
        // Only colleagues resolved to the SAME master division as the caller.
        return employee.divisionId === callerDivision.divisionId;
      })
      .map(({ isExplicitlyInactive, divisionValid, ...employee }) => employee)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));

    return NextResponse.json(
      { candidates, meta: { rawEmployeesCount, excludedInvalidNameCount, excludedInvalidDivisionCount } },
      { status: 200 },
    );
  } catch (error: any) {
    console.error('Failed to fetch replacement candidates:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
