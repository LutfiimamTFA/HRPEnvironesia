import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { UserRole } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

const seedUsers: { email: string; password: string; fullName: string; role: UserRole }[] = [
  { email: 'super_admin@gmail.com', password: '12345678', fullName: 'Super Admin', role: 'admin' },
  { email: 'hrd@gmail.com', password: '12345678', fullName: 'HRD', role: 'hrd' },
  { email: 'manager@gmail.com', password: '12345678', fullName: 'Manager', role: 'manager' },
  { email: 'kandidat@gmail.com', password: '12345678', fullName: 'Kandidat', role: 'kandidat' },
  { email: 'karyawan@gmail.com', password: '12345678', fullName: 'Karyawan', role: 'karyawan' },
];

export async function POST(req: NextRequest) {
  // Gracefully handle cases where the Admin SDK is not initialized.
  if (!admin.apps.length) {
    console.error('Firebase Admin SDK has not been initialized. Please check your server-side environment variables.');
    return NextResponse.json(
      { error: 'Firebase Admin SDK not initialized. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set correctly in your .env.local file.' },
      { status: 500 }
    );
  }
  
  if (process.env.ENABLE_SEED !== 'true') {
    return NextResponse.json({ error: 'Seeder is disabled.' }, { status: 403 });
  }

  const secret = req.headers.get('x-seed-secret');
  if (secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: 'Invalid secret.' }, { status: 401 });
  }

  const results = [];
  const db = admin.firestore();

  for (const userData of seedUsers) {
    try {
      let userRecord;
      let status: 'created' | 'already_exists' = 'already_exists';

      try {
        userRecord = await admin.auth().getUserByEmail(userData.email);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          userRecord = await admin.auth().createUser({
            email: userData.email,
            password: userData.password,
            emailVerified: true,
            displayName: userData.fullName,
          });
          status = 'created';
        } else {
          throw error; // Re-throw other auth errors to be caught by the outer catch
        }
      }

      // At this point, userRecord is guaranteed to be defined.
      const userProfile: any = {
        uid: userRecord.uid,
        email: userData.email,
        fullName: userData.fullName,
        role: userData.role,
        isActive: true,
      };

      if (status === 'created') {
        userProfile.createdAt = Timestamp.now();
        // Use set without merge for new users
        await db.collection('users').doc(userRecord.uid).set(userProfile);
      } else {
        // Use set with merge for existing users to preserve createdAt
        await db.collection('users').doc(userRecord.uid).set(userProfile, { merge: true });
      }

      // Handle the roles_admin collection for admin
      if (userData.role === 'admin') {
        await db.collection('roles_admin').doc(userRecord.uid).set({ role: 'admin' });
      } else {
        // In case a user's role was demoted, ensure they are not in roles_admin
        await db.collection('roles_admin').doc(userRecord.uid).delete().catch(() => {}); // Ignore error if doc doesn't exist
      }
      
      results.push({ email: userData.email, status, uid: userRecord.uid });

    } catch (error: any) {
      console.error(`Failed to seed user ${userData.email}:`, error);
      results.push({ email: userData.email, status: 'error', message: error.message });
    }
  }

  return NextResponse.json({ message: 'Seeding complete.', results });
}
