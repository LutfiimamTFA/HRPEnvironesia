import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { uid: string } }
) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  const secret = req.headers.get('x-seed-secret');
  if (secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: 'Invalid secret for this operation.' }, { status: 401 });
  }

  const { uid } = params;
  if (!uid) {
    return NextResponse.json({ error: 'User UID is required.' }, { status: 400 });
  }

  try {
    const db = admin.firestore();
    
    // Using a batch to delete from multiple collections atomically in Firestore.
    const batch = db.batch();
    const userDocRef = db.collection('users').doc(uid);
    const adminRoleDocRef = db.collection('roles_admin').doc(uid);
    const hrdRoleDocRef = db.collection('roles_hrd').doc(uid);

    batch.delete(userDocRef);
    batch.delete(adminRoleDocRef);
    batch.delete(hrdRoleDocRef);
    
    await batch.commit();

    // Now, delete the user from Firebase Authentication
    await admin.auth().deleteUser(uid);

    return NextResponse.json({ message: 'User deleted successfully.' }, { status: 200 });

  } catch (error: any) {
    console.error(`Failed to delete user ${uid}:`, error);

    if (error.code === 'auth/user-not-found') {
        // This can happen if the user was already deleted from Auth but not Firestore.
        // We can consider this a success for the client's purpose.
        return NextResponse.json({ message: 'User already deleted from Authentication.' }, { status: 200 });
    }

    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
