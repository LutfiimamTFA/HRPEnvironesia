import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

function sameStringArray(a: unknown, b: unknown): boolean {
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  if (arrA.length !== arrB.length) return false;
  const sortedA = [...arrA].sort();
  const sortedB = [...arrB].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

export async function POST(req: NextRequest) {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: No token provided.' }, { status: 401 });
  }
  const idToken = authorization.split('Bearer ')[1];

  // Pastikan admin SDK sudah init
  if (!admin.apps.length) {
    console.error('[sync-my-role] Firebase Admin SDK belum terinisialisasi. Periksa FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY di environment variables.');
    return NextResponse.json({
      error: 'Firebase Admin SDK belum terinisialisasi. Periksa environment variables server.',
    }, { status: 500 });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const db = admin.firestore();
    const userDocRef = db.collection('users').doc(uid);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ message: 'User profile not found in Firestore.', uid }, { status: 200 });
    }

    const userProfile = userDoc.data() as {
      role?: string;
      fullName?: string;
      email?: string;
      isActive?: boolean;
      hrdScope?: {
        scopeType?: string;
        allowedBrandIds?: string[];
        allowedBrandNames?: string[];
      };
    };
    const role = userProfile.role ?? '';
    const adminRoleRef = db.collection('roles_admin').doc(uid);
    const hrdRoleRef   = db.collection('roles_hrd').doc(uid);

    const [existingAdminRole, existingHrdRole] = await Promise.all([
      adminRoleRef.get(),
      hrdRoleRef.get(),
    ]);

    const batch = db.batch();
    let actionTaken = 'unchanged';

    if (role === 'super-admin') {
      const email = userProfile.email ?? decodedToken.email ?? '';
      const existing = existingAdminRole.exists ? existingAdminRole.data() : null;
      const needsAdminWrite = !existingAdminRole.exists || existing?.email !== email;
      const needsHrdDelete = existingHrdRole.exists;

      if (needsAdminWrite) {
        batch.set(adminRoleRef, { role: 'super-admin', uid, email, updatedAt: FieldValue.serverTimestamp() });
      }
      if (needsHrdDelete) {
        batch.delete(hrdRoleRef);
      }
      if (needsAdminWrite || needsHrdDelete) actionTaken = 'synced super-admin';

    } else if (role === 'hrd') {
      const existingScope = existingHrdRole.exists ? existingHrdRole.data() : null;
      const sourceScope = existingScope?.scopeType ? existingScope : userProfile.hrdScope;
      const scopeType = sourceScope?.scopeType === 'all_companies' ? 'all_companies' : 'selected_companies';
      const allowedBrandIds = scopeType === 'all_companies' ? [] : (Array.isArray(sourceScope?.allowedBrandIds) ? sourceScope.allowedBrandIds : []);
      const allowedBrandNames = scopeType === 'all_companies' ? [] : (Array.isArray(sourceScope?.allowedBrandNames) ? sourceScope.allowedBrandNames : []);
      const email = userProfile.email ?? decodedToken.email ?? '';
      const active = userProfile.isActive !== false;

      // Only write roles_hrd if something actually differs — a no-op
      // `updatedAt`-only rewrite here is exactly what caused the sync loop:
      // it re-triggers the client's users/{uid} listener (via the hrdScope
      // mirror below), which re-ran this same sync effect forever.
      const hrdUnchanged = !!existingHrdRole.exists &&
        existingScope?.role === 'hrd' &&
        existingScope?.email === email &&
        existingScope?.scopeType === scopeType &&
        sameStringArray(existingScope?.allowedBrandIds, allowedBrandIds) &&
        sameStringArray(existingScope?.allowedBrandNames, allowedBrandNames) &&
        existingScope?.active === active;

      const existingMirror = userProfile.hrdScope;
      const mirrorUnchanged = !!existingMirror &&
        existingMirror.scopeType === scopeType &&
        sameStringArray(existingMirror.allowedBrandIds, allowedBrandIds) &&
        sameStringArray(existingMirror.allowedBrandNames, allowedBrandNames);

      const needsAdminDelete = existingAdminRole.exists;

      if (!hrdUnchanged) {
        batch.set(hrdRoleRef, {
          role: 'hrd',
          uid,
          email,
          scopeType,
          allowedBrandIds,
          allowedBrandNames,
          active,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      if (!mirrorUnchanged) {
        batch.set(userDocRef, {
          hrdScope: {
            scopeType,
            allowedBrandIds,
            allowedBrandNames,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: 'sync-my-role',
          },
        }, { merge: true });
      }
      if (needsAdminDelete) {
        batch.delete(adminRoleRef);
      }
      if (!hrdUnchanged || !mirrorUnchanged || needsAdminDelete) actionTaken = 'synced hrd';

    } else {
      const needsAdminDelete = existingAdminRole.exists;
      const needsHrdDelete = existingHrdRole.exists;
      if (needsAdminDelete) batch.delete(adminRoleRef);
      if (needsHrdDelete) batch.delete(hrdRoleRef);
      if (needsAdminDelete || needsHrdDelete) actionTaken = `cleared roles (current role: ${role || 'none'})`;
    }

    if (actionTaken !== 'unchanged') {
      await batch.commit();
    }

    console.log(`[sync-my-role] uid=${uid} role=${role} action=${actionTaken}`);
    return NextResponse.json({
      ok: true,
      message: actionTaken === 'unchanged' ? 'Role documents already in sync.' : 'Role documents synced successfully.',
      uid,
      role,
      action: actionTaken,
    }, { status: 200 });

  } catch (error: any) {
    const msg = error.message ?? String(error);
    const isTokenError = msg.includes('token') || msg.includes('auth') || error.code?.includes('auth/');
    console.error('[sync-my-role] Error:', msg);
    return NextResponse.json({
      error: isTokenError
        ? `Token tidak valid: ${msg}`
        : `Server error: ${msg}`,
    }, { status: isTokenError ? 401 : 500 });
  }
}
