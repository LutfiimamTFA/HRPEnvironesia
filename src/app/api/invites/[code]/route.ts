
import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import type { Invite } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  const { code } = params;
  if (!code) {
    return NextResponse.json({ error: 'Invite code is required.' }, { status: 400 });
  }

  try {
    const db = admin.firestore();
    const inviteRef = db.collection('invites').doc(code);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      return NextResponse.json({ error: 'Kode undangan tidak ditemukan.' }, { status: 404 });
    }
    
    const invite = inviteDoc.data() as Invite;

    if (!invite.isActive || invite.usedAt) {
      return NextResponse.json({ error: 'Kode undangan ini sudah tidak aktif atau telah digunakan.' }, { status: 410 });
    }

    if (invite.expiresAt.toDate() < new Date()) {
      return NextResponse.json({ error: 'Kode undangan telah kedaluwarsa.' }, { status: 410 });
    }
    
    // Get brand name
    const brandDoc = await db.collection('brands').doc(invite.brandId).get();
    const brandName = brandDoc.exists ? brandDoc.data()?.name : 'Unknown Brand';

    const { createdAt, expiresAt, ...rest } = invite;

    return NextResponse.json({
        ...rest,
        brandName,
        createdAt: createdAt.toMillis(),
        expiresAt: expiresAt.toMillis(),
    });

  } catch (error: any) {
    console.error('Error validating invite code:', error);
    return NextResponse.json({ error: 'Server error during code validation.' }, { status: 500 });
  }
}


export async function DELETE(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  if (!admin.apps.length) {
    return NextResponse.json({ error: 'Firebase Admin SDK not initialized.' }, { status: 500 });
  }

  const { code } = params;
  if (!code) {
    return NextResponse.json({ error: 'Invite code is required.' }, { status: 400 });
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

    const inviteRef = db.collection('invites').doc(code);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      return NextResponse.json({ error: 'Invite code not found.' }, { status: 404 });
    }

    await inviteRef.delete();

    return NextResponse.json({ message: 'Invite deleted successfully.' }, { status: 200 });

  } catch (error: any) {
    console.error('Error deleting invite:', error);
    if (error.code && error.code.startsWith('auth/')) {
        return NextResponse.json({ error: 'Invalid authentication token.' }, { status: 401 });
    }
    return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}

