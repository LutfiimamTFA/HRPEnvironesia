import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';

async function verifyUserOwner(req: NextRequest, uid: string) {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return { error: 'Unauthorized: Missing token.', status: 401 };
  }

  const idToken = authorization.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    if (decodedToken.uid !== uid) {
      return {
        error: 'Forbidden: You can only update your own password status.',
        status: 403,
      };
    }
    return { uid: decodedToken.uid };
  } catch (error: any) {
    if (error.code === 'auth/id-token-expired') {
      return {
        error: 'Sesi Anda telah berakhir, silakan muat ulang halaman dan coba lagi.',
        status: 401,
      };
    }
    return { error: 'Invalid token.', status: 401 };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { uid: string } }
) {
  if (!admin.apps.length) {
    return NextResponse.json(
      { error: 'Firebase Admin SDK not initialized.' },
      { status: 500 }
    );
  }

  const { uid } = params;
  if (!uid) {
    return NextResponse.json({ error: 'User UID is required.' }, { status: 400 });
  }

  const authResult = await verifyUserOwner(req, uid);
  if (authResult.error) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const userSnapshot = await userRef.get();

    if (!userSnapshot.exists) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const userData = userSnapshot.data();
    const userName = userData?.fullName || 'Unknown';

    // Update user document to clear password change requirement flags
    await userRef.update({
      mustChangePassword: false,
      temporaryPasswordIssued: false,
      forcePasswordChange: false,
      requirePasswordChange: false,
      passwordResetRequired: false,
      passwordChangedAt: admin.firestore.FieldValue.serverTimestamp(),
      passwordResetCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create audit log for password change
    const auditRef = db.collection('audit_logs').doc();
    await auditRef.set({
      id: auditRef.id,
      actionType: 'password_changed_by_user',
      targetUid: uid,
      targetName: userName,
      changedByUid: uid,
      changedByName: userName,
      changedAt: admin.firestore.FieldValue.serverTimestamp(),
      note: 'User berhasil mengganti password setelah reset admin',
    });

    return NextResponse.json({
      success: true,
      message: 'Password status updated successfully.',
    });
  } catch (error: any) {
    console.error(`Failed to update password status for user ${uid}:`, error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
