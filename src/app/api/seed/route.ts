import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { UserRole } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

const seedUsers: { email: string; password: string; fullName: string; role: UserRole }[] = [
  { email: 'super_admin@gmail.com', password: '12345678', fullName: 'Super Admin', role: 'super_admin' },
  { email: 'hrd@gmail.com', password: '12345678', fullName: 'HRD', role: 'hrd' },
  { email: 'manager@gmail.com', password: '12345678', fullName: 'Manager', role: 'manager' },
  { email: 'kandidat@gmail.com', password: '12345678', fullName: 'Kandidat', role: 'kandidat' },
  { email: 'karyawan@gmail.com', password: '12345678', fullName: 'Karyawan', role: 'karyawan' },
];

export async function POST(req: NextRequest) {
  if (process.env.ENABLE_SEED !== 'true') {
    return NextResponse.json({ error: 'Seeder is disabled.' }, { status: 403 });
  }

  const secret = req.headers.get('x-seed-secret');
  if (secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: 'Invalid secret.' }, { status: 401 });
  }

  const results = [];

  for (const userData of seedUsers) {
    try {
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(userData.email);
        results.push({ email: userData.email, status: 'already_exists', uid: userRecord.uid });
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          userRecord = await admin.auth().createUser({
            email: userData.email,
            password: userData.password,
            emailVerified: true,
          });
          results.push({ email: userData.email, status: 'created', uid: userRecord.uid });
        } else {
          throw error;
        }
      }

      const userProfile = {
        uid: userRecord.uid,
        email: userData.email,
        fullName: userData.fullName,
        role: userData.role,
        isActive: true,
        createdAt: Timestamp.now(),
      };

      await admin.firestore().collection('users').doc(userRecord.uid).set(userProfile, { merge: true });
      
    } catch (error: any) {
      console.error(`Failed to seed user ${userData.email}:`, error);
      results.push({ email: userData.email, status: 'error', message: error.message });
    }
  }

  return NextResponse.json({ message: 'Seeding complete.', results });
}
