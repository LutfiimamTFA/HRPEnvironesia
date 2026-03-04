'use server';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { InviteBatch, UserProfile } from '@/lib/types';

const registerSchema = z.object({
  batchCode: z.string().min(1, 'Batch code is required.'),
  fullName: z.string().min(2, { message: 'Full name is required.' }),
  email: z.string().email({ message: 'A valid email is required.' }),
  password: z.string().min(8, { message: "Password must be at least 8 characters." }),
});

export async function POST(req: NextRequest) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const parseResult = registerSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request body.', details: parseResult.error.flatten() }, { status: 400 });
    }

    const { batchCode, fullName, email, password } = parseResult.data;
    const db = admin.firestore();
    
    // Check if email is already in use before the transaction
    try {
      await admin.auth().getUserByEmail(email);
      return NextResponse.json({ error: 'Email ini sudah terdaftar.' }, { status: 409 });
    } catch (error: any) {
      if (error.code !== 'auth/user-not-found') throw error;
    }

    // --- Start Firestore Transaction ---
    const batchRef = db.collection('invite_batches').doc(batchCode);
    const batchData = await db.runTransaction(async (transaction) => {
        const batchDoc = await transaction.get(batchRef);
        if (!batchDoc.exists) {
            throw new Error('Kode undangan tidak ditemukan atau tidak valid.');
        }

        const data = batchDoc.data() as InviteBatch;
        if (data.claimedSlots >= data.totalSlots) {
            throw new Error('Kuota untuk undangan ini sudah habis.');
        }

        transaction.update(batchRef, {
            claimedSlots: FieldValue.increment(1),
            updatedAt: Timestamp.now(),
        });

        return data; // Return batch data for user creation
    });
    // --- End Firestore Transaction ---

    // 4. Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: fullName,
      emailVerified: true,
    });
    
    // 5. Create user profile in Firestore
    const userRef = db.collection('users').doc(userRecord.uid);
    const userProfile: Omit<UserProfile, 'id' | 'createdAt'> & { createdAt: Timestamp } = {
      uid: userRecord.uid,
      fullName,
      email,
      role: 'karyawan', // All invited users are 'karyawan' by default now
      employmentType: batchData.employmentType,
      brandId: batchData.brandId,
      isActive: true,
      createdAt: Timestamp.now(),
      createdBy: batchData.createdBy,
      inviteBatchId: batchCode,
    };
    await userRef.set(userProfile);
    
    return NextResponse.json({ message: 'User registered successfully!', uid: userRecord.uid }, { status: 201 });

  } catch (error: any) {
    console.error('Error during registration with batch code:', error);
    // Provide specific error messages from the transaction
    if (error.message.includes('Kuota') || error.message.includes('tidak ditemukan')) {
        return NextResponse.json({ error: error.message }, { status: 410 });
    }
    return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}
