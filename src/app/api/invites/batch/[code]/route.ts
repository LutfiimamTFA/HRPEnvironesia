import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import type { InviteBatch } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const { code } = params;

  if (!code) {
    return NextResponse.json({ error: 'Kode undangan tidak ditemukan.' }, { status: 400 });
  }

  try {
    const db = admin.firestore();
    const batchRef = db.collection('invite_batches').doc(code);
    const batchDoc = await batchRef.get();

    if (!batchDoc.exists) {
      return NextResponse.json({ error: 'Kode undangan tidak ditemukan atau tidak valid.' }, { status: 404 });
    }
    
    const batch = batchDoc.data() as InviteBatch;

    if (batch.isActive === false) {
      return NextResponse.json({ error: 'Link undangan ini sudah tidak aktif.' }, { status: 410 });
    }

    if (batch.expiresAt && (batch.expiresAt as any).toMillis() < Date.now()) {
      return NextResponse.json({ error: 'Link undangan ini sudah kedaluwarsa.' }, { status: 410 });
    }

    if (batch.claimedSlots >= batch.totalSlots) {
      return NextResponse.json({ error: 'Kuota undangan ini sudah penuh. Silakan hubungi Human Capital.' }, { status: 410 });
    }

    const { createdAt, updatedAt, ...rest } = batch;

    return NextResponse.json({
        ...rest,
        id: batchDoc.id,
        createdAt: createdAt.toMillis(),
        updatedAt: updatedAt.toMillis(),
    });

  } catch (error: any) {
    console.error('Error validating invite batch:', error);
    
    // Check if the error is actually a configuration issue
    if (error.message?.includes('The default Firebase app does not exist') || error.message?.includes('projectId')) {
        return NextResponse.json({ 
            error: 'Kesalahan Konfigurasi Server: Firebase Admin SDK belum siap.',
            details: 'Periksa variabel FIREBASE_* di .env.local' 
        }, { status: 500 });
    }
    
    return NextResponse.json({ error: 'Terjadi kesalahan pada server saat validasi kode.' }, { status: 500 });
  }
}
