import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { UserRole, ROLES } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

function isValidBody(body: any): body is { email: string; password: string; fullName: string; role: UserRole, managedBrandIds?: string[] } {
  return (
    body &&
    typeof body.email === 'string' &&
    typeof body.password === 'string' && body.password.length >= 8 &&
    typeof body.fullName === 'string' &&
    typeof body.role === 'string' &&
    ROLES.includes(body.role) &&
    (body.managedBrandIds === undefined || (Array.isArray(body.managedBrandIds) && body.managedBrandIds.every((i: any) => typeof i === 'string')))
  );
}

export async function POST(req: NextRequest) {
  if (!admin.apps.length) {
    console.error('Firebase Admin SDK has not been initialized. Please check your server-side environment variables.');
    return NextResponse.json(
      { error: 'Firebase Admin SDK not initialized. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set correctly in your .env.local file.' },
      { status: 500 }
    );
  }

  const secret = req.headers.get('x-seed-secret');
  if (secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: 'Invalid secret for this operation.' }, { status: 401 });
  }

  try {
    const body = await req.json();

    if (!isValidBody(body)) {
      return NextResponse.json({ error: 'Invalid request body. Ensure all fields are correct.' }, { status: 400 });
    }

    const { email, password, fullName, role, managedBrandIds } = body;
    const db = admin.firestore();

    try {
      await admin.auth().getUserByEmail(email);
      return NextResponse.json({ error: 'User with this email already exists.' }, { status: 409 });
    } catch (error: any) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    const userRecord = await admin.auth().createUser({
      email,
      password,
      emailVerified: true,
      displayName: fullName,
    });

    const userProfile: any = {
      uid: userRecord.uid,
      email,
      fullName,
      role,
      isActive: true,
      createdAt: Timestamp.now(),
    };

    if (role === 'hrd' && managedBrandIds) {
      userProfile.managedBrandIds = managedBrandIds;
    }

    await db.collection('users').doc(userRecord.uid).set(userProfile);

    if (role === 'super-admin') {
      await db.collection('roles_admin').doc(userRecord.uid).set({ role: 'super-admin' });
    }

    return NextResponse.json({ message: 'User created successfully.', uid: userRecord.uid }, { status: 201 });

  } catch (error: any) {
    console.error(`Failed to create user:`, error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
