import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

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
    const batch = db.batch();
    const adminRoleRef = db.collection('roles_admin').doc(uid);
    const hrdRoleRef   = db.collection('roles_hrd').doc(uid);

    let actionTaken = 'none';

    if (role === 'super-admin') {
      batch.set(adminRoleRef, {
        role: 'super-admin',
        uid,
        email: userProfile.email ?? decodedToken.email ?? '',
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Hapus dari hrd jika ada
      batch.delete(hrdRoleRef);
      actionTaken = 'synced super-admin';
    } else if (role === 'hrd') {
      const existingHrdRole = await hrdRoleRef.get();
      const existingScope = existingHrdRole.exists ? existingHrdRole.data() : null;
      const sourceScope = existingScope?.scopeType ? existingScope : userProfile.hrdScope;
      const scopeType = sourceScope?.scopeType === 'all_companies' ? 'all_companies' : 'selected_companies';
      batch.set(hrdRoleRef, {
        role: 'hrd',
        uid,
        email: userProfile.email ?? decodedToken.email ?? '',
        scopeType,
        allowedBrandIds: scopeType === 'all_companies' ? [] : (Array.isArray(sourceScope?.allowedBrandIds) ? sourceScope.allowedBrandIds : []),
        allowedBrandNames: scopeType === 'all_companies' ? [] : (Array.isArray(sourceScope?.allowedBrandNames) ? sourceScope.allowedBrandNames : []),
        active: userProfile.isActive !== false,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      batch.set(userDocRef, {
        hrdScope: {
          scopeType,
          allowedBrandIds: scopeType === 'all_companies' ? [] : (Array.isArray(sourceScope?.allowedBrandIds) ? sourceScope.allowedBrandIds : []),
          allowedBrandNames: scopeType === 'all_companies' ? [] : (Array.isArray(sourceScope?.allowedBrandNames) ? sourceScope.allowedBrandNames : []),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'sync-my-role',
        },
      }, { merge: true });
      // Hapus dari admin jika ada
      batch.delete(adminRoleRef);
      actionTaken = 'synced hrd';
    } else {
      // Hapus kedua role jika bukan super-admin atau hrd
      batch.delete(adminRoleRef);
      batch.delete(hrdRoleRef);
      actionTaken = `cleared roles (current role: ${role || 'none'})`;
    }

    await batch.commit();

    console.log(`[sync-my-role] uid=${uid} role=${role} action=${actionTaken}`);
    return NextResponse.json({
      message: 'Role documents synced successfully.',
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
