'use server';

import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

const patchSchema = z.object({
  additionalQuantity: z.coerce.number().int().min(1, 'Jumlah minimal 1.').max(100, 'Jumlah maksimal 100.'),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const { batchId } = params;
  if (!batchId) {
    return NextResponse.json({ error: 'Batch ID is required.' }, { status: 400 });
  }

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    const db = admin.firestore();
    const adminRoleDoc = await db.collection('roles_admin').doc(decodedToken.uid).get();
    const hrdRoleDoc = await db.collection('roles_hrd').doc(decodedToken.uid).get();

    if (!adminRoleDoc.exists && !hrdRoleDoc.exists) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const parseResult = patchSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request body.', details: parseResult.error.flatten() }, { status: 400 });
    }

    const { additionalQuantity } = parseResult.data;
    const batchRef = db.collection('invite_batches').doc(batchId);

    await db.runTransaction(async (transaction) => {
        const batchDoc = await transaction.get(batchRef);
        if (!batchDoc.exists) {
            throw new Error('Batch not found.');
        }

        transaction.update(batchRef, {
            totalSlots: FieldValue.increment(additionalQuantity),
            updatedAt: Timestamp.now(),
        });
    });

    return NextResponse.json({ message: 'Quota added successfully.' });

  } catch (error: any) {
    console.error('Error adding quota to batch:', error);
     if (error.code && error.code.startsWith('auth/')) {
      return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'An unexpected server error occurred.' }, { status: 500 });
  }
}


export async function DELETE(
  req: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const { batchId } = params;
  if (!batchId) {
    return NextResponse.json({ error: 'Batch ID is required.' }, { status: 400 });
  }

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized: Missing token.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    const db = admin.firestore();
    const adminRoleDoc = await db.collection('roles_admin').doc(decodedToken.uid).get();
    const hrdRoleDoc = await db.collection('roles_hrd').doc(decodedToken.uid).get();

    if (!adminRoleDoc.exists && !hrdRoleDoc.exists) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const batchRef = db.collection('invite_batches').doc(batchId);
    
    const batchDoc = await batchRef.get();
    if (!batchDoc.exists) {
        throw new Error('Batch not found.');
    }

    await batchRef.delete();

    // Mengembalikan respons tanpa body untuk DELETE request yang berhasil
    return new NextResponse(null, { status: 204 });

  } catch (error: any) {
    console.error('Error deleting invite batch:', error);
    if (error.code && error.code.startsWith('auth/')) {
      return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'An unexpected server error occurred.' }, { status: 500 });
  }
}
