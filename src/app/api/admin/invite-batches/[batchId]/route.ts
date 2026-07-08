import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

export const runtime = 'nodejs';

const patchSchema = z.object({
  additionalQuantity: z.coerce.number().int().min(1).max(500).optional(),
  isActive: z.boolean().optional(),
});

// Helper to verify user role
async function verifyAdmin(req: NextRequest) {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return { error: 'Unauthorized: Missing token.', status: 401 };
    }
    const idToken = authorization.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists || !['super-admin', 'hrd'].includes(userDoc.data()?.role)) {
            return { error: 'Forbidden.', status: 403 };
        }
        return { uid: decodedToken.uid };
    } catch (error: any) {
        if (error.code === 'auth/id-token-expired') {
            return { error: 'Sesi Anda telah berakhir, silakan muat ulang halaman dan coba lagi.', status: 401 };
        }
        return { error: 'Invalid token.', status: 401 };
    }
}


export async function PATCH(
  req: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const authResult = await verifyAdmin(req);
  if (authResult.error) {
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
  }

  const { batchId } = params;
  if (!batchId) {
    return NextResponse.json({ success: false, message: 'Batch ID is required.' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const parseResult = patchSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ success: false, message: 'Invalid request body.', details: parseResult.error.flatten() }, { status: 400 });
    }

    const { additionalQuantity, isActive } = parseResult.data;
    const db = admin.firestore();
    const batchRef = db.collection('invite_batches').doc(batchId);

    await db.runTransaction(async (transaction) => {
      const batchDoc = await transaction.get(batchRef);
      if (!batchDoc.exists) throw new Error('Batch not found.');
      const updates: Record<string, any> = { updatedAt: Timestamp.now() };
      if (additionalQuantity !== undefined) updates.totalSlots = FieldValue.increment(additionalQuantity);
      if (isActive !== undefined) updates.isActive = isActive;
      transaction.update(batchRef, updates);
    });

    return NextResponse.json({ success: true, message: 'Batch updated successfully.' });

  } catch (error: any) {
    console.error('[invite-batches] Error adding quota / updating batch:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'An unexpected server error occurred.',
    }, { status: 500 });
  }
}


export async function DELETE(
  req: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const authResult = await verifyAdmin(req);
  if (authResult.error) {
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
  }

  const { batchId } = params;
  if (!batchId) {
    return NextResponse.json({ success: false, message: 'Batch ID is required.' }, { status: 400 });
  }

  try {
    const db = admin.firestore();
    const batchRef = db.collection('invite_batches').doc(batchId);

    const batchDoc = await batchRef.get();
    if (!batchDoc.exists) {
        throw new Error('Batch not found.');
    }

    await batchRef.delete();

    // Always return a JSON body (never an empty 204) — an empty body makes
    // any caller doing response.json() throw "Unexpected end of JSON input".
    return NextResponse.json({ success: true, message: 'Batch undangan berhasil dihapus.' });

  } catch (error: any) {
    console.error('[invite-batches] Error deleting invite batch:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'An unexpected server error occurred.',
    }, { status: 500 });
  }
}
