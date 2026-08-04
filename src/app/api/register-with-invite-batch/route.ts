import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { InviteBatch } from '@/lib/types';

export const runtime = 'nodejs';

const registerSchema = z.object({
  batchCode: z.string().min(1, 'Batch code wajib diisi.'),
  fullName: z.string().min(2, { message: 'Nama lengkap wajib diisi.' }),
  email: z.string().email({ message: 'Email tidak valid.' }),
  password: z.string().min(8, { message: 'Password minimal 8 karakter.' }),
});

export async function POST(req: NextRequest) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const parseResult = registerSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Data tidak valid.', details: parseResult.error.flatten() }, { status: 400 });
    }

    const { batchCode, fullName, email, password } = parseResult.data;
    const db = admin.firestore();

    // Check email not already registered
    try {
      await admin.auth().getUserByEmail(email);
      return NextResponse.json({ error: 'Email ini sudah terdaftar.' }, { status: 409 });
    } catch (error: any) {
      if (error.code !== 'auth/user-not-found') throw error;
    }

    const batchRef = db.collection('invite_batches').doc(batchCode);

    // Validate and claim slot in transaction
    const batchData = await db.runTransaction(async (transaction) => {
      const batchDoc = await transaction.get(batchRef);
      if (!batchDoc.exists) {
        throw new Error('Kode undangan tidak ditemukan atau tidak valid.');
      }

      const data = batchDoc.data() as InviteBatch;

      if (data.isActive === false) {
        throw new Error('Link undangan ini sudah tidak aktif.');
      }

      if (data.expiresAt && (data.expiresAt as any).toMillis() < Date.now()) {
        throw new Error('Link undangan ini sudah kedaluwarsa.');
      }

      if (data.claimedSlots >= data.totalSlots) {
        throw new Error('Kuota undangan ini sudah penuh. Silakan hubungi Human Capital.');
      }

      transaction.update(batchRef, {
        claimedSlots: FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });

      return data;
    });

    // Resolve contractType (support legacy employmentType field)
    const contractType = batchData.contractType || (batchData as any).employmentType || 'Kontrak';

    // Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: fullName,
      emailVerified: true,
    });

    const now = Timestamp.now();
    const uid = userRecord.uid;

    // Create users/{uid}
    await db.collection('users').doc(uid).set({
      uid,
      fullName,
      email,
      role: 'karyawan',
      contractType,
      employmentType: contractType,
      employmentStatus: contractType,
      brandId: batchData.brandId,
      brandName: batchData.brandName,
      isActive: true,
      isProfileComplete: false,
      source: 'employee_invite',
      inviteBatchId: batchCode,
      inviteCode: batchCode,
      registeredAt: now,
      createdAt: now,
      createdBy: batchData.createdBy,
    });

    // Create employee_profiles/{uid}
    await db.collection('employee_profiles').doc(uid).set({
      uid,
      fullName,
      email,
      contractType,
      employmentStatus: contractType,
      brandId: batchData.brandId,
      brandName: batchData.brandName,
      isActive: true,
      source: 'employee_invite',
      inviteBatchId: batchCode,
      inviteCode: batchCode,
      registeredAt: now,
      createdAt: now,
    });

    return NextResponse.json({ message: 'Registrasi berhasil.', uid }, { status: 201 });
  } catch (error: any) {
    console.error('[register-with-invite-batch] Error:', error);
    const knownErrors = ['Kuota', 'tidak ditemukan', 'tidak aktif', 'kedaluwarsa', 'sudah penuh'];
    if (knownErrors.some(k => error.message?.includes(k))) {
      return NextResponse.json({ error: error.message }, { status: 410 });
    }
    return NextResponse.json({ error: 'Terjadi kesalahan server. Silakan coba lagi.' }, { status: 500 });
  }
}
