import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { uid: string } }
) {
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
    const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();

    // Only allow super-admins to delete users
    if (!userDoc.exists() || userDoc.data()?.role !== 'super-admin') {
        return NextResponse.json({ error: 'Forbidden: Only super-admins can delete users.' }, { status: 403 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Invalid token.' }, { status: 401 });
  }


  const { uid } = params;
  if (!uid) {
    return NextResponse.json({ error: 'User UID is required.' }, { status: 400 });
  }

  try {
    const db = admin.firestore();
    
    // First, delete the user from Firebase Authentication
    await admin.auth().deleteUser(uid);

    // Using a batch to delete from multiple collections atomically in Firestore.
    const batch = db.batch();
    const userDocRef = db.collection('users').doc(uid);
    const adminRoleDocRef = db.collection('roles_admin').doc(uid);
    const hrdRoleDocRef = db.collection('roles_hrd').doc(uid);

    batch.delete(userDocRef);
    batch.delete(adminRoleDocRef);
    batch.delete(hrdRoleDocRef);
    
    await batch.commit();

    return NextResponse.json({ message: 'User deleted successfully.' }, { status: 200 });

  } catch (error: any) {
    console.error(`Failed to delete user ${uid}:`, error);

    // If Auth user is already deleted, we might still want to clean up Firestore.
    // The current logic tries Auth delete first, so this case handles partial failures.
    if (error.code === 'auth/user-not-found') {
        const db = admin.firestore();
        const batch = db.batch();
        const userDocRef = db.collection('users').doc(uid);
        const adminRoleDocRef = db.collection('roles_admin').doc(uid);
        const hrdRoleDocRef = db.collection('roles_hrd').doc(uid);

        batch.delete(userDocRef);
        batch.delete(adminRoleDocRef);
        batch.delete(hrdRoleDocRef);
        
        await batch.commit().catch(e => console.error("Firestore cleanup failed after auth user not found:", e));

        return NextResponse.json({ message: 'User already deleted from Authentication, Firestore records cleaned up.' }, { status: 200 });
    }

    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
