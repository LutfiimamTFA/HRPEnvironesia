import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { generateUniqueCode } from '@/lib/utils';
import type { InviteBatch, InviteContractType } from '@/lib/types';

export const runtime = 'nodejs';

const CONTRACT_TYPES: InviteContractType[] = ['Magang', 'Probation', 'Kontrak', 'Tetap'];

const generateSchema = z.object({
  brandId: z.string().min(1, 'Brand wajib dipilih.'),
  contractType: z.enum(['Magang', 'Probation', 'Kontrak', 'Tetap'] as const),
  quantity: z.coerce.number().int().min(1).max(500),
  expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

async function verifyAdmin(req: NextRequest) {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return { error: 'Unauthorized: Missing token.', status: 401 };
  }
  const idToken = authorization.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    // Check role collections (faster than user doc role field)
    const [hrdSnap, adminSnap, superSnap, userDoc] = await Promise.all([
      admin.firestore().collection('roles_hrd').doc(uid).get(),
      admin.firestore().collection('roles_admin').doc(uid).get(),
      admin.firestore().collection('roles_superadmin').doc(uid).get(),
      admin.firestore().collection('users').doc(uid).get(),
    ]);
    const role = userDoc.data()?.role || '';
    const isAuthorized = hrdSnap.exists || adminSnap.exists || superSnap.exists ||
      ['super-admin', 'hrd', 'admin'].includes(role);
    if (!isAuthorized) return { error: 'Forbidden.', status: 403 };
    return { uid };
  } catch (error: any) {
    if (error.code === 'auth/id-token-expired') {
      return { error: 'Sesi Anda telah berakhir, silakan muat ulang halaman dan coba lagi.', status: 401 };
    }
    return { error: `Verifikasi token gagal: ${error.message}`, status: 401 };
  }
}

export async function POST(req: NextRequest) {
  const authResult = await verifyAdmin(req);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const db = admin.firestore();
    const body = await req.json();
    const parseResult = generateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Data tidak valid.', details: parseResult.error.flatten() }, { status: 400 });
    }

    const { brandId, contractType, quantity, expiresAt, notes } = parseResult.data;

    const brandDoc = await db.collection('brands').doc(brandId).get();
    if (!brandDoc.exists) {
      return NextResponse.json({ error: `Brand tidak ditemukan.` }, { status: 404 });
    }
    const brandName = brandDoc.data()?.name || 'Unknown Brand';

    const now = Timestamp.now();
    const batchId = generateUniqueCode(10);

    const batchData: Omit<InviteBatch, 'id'> = {
      brandId,
      brandName,
      contractType,
      totalSlots: quantity,
      claimedSlots: 0,
      isActive: true,
      createdBy: authResult.uid,
      createdAt: now as any,
      updatedAt: now as any,
      expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) as any : null,
      notes: notes || null,
    };

    await db.collection('invite_batches').doc(batchId).set(batchData);

    return NextResponse.json(
      { message: 'Batch undangan berhasil dibuat.', id: batchId, ...batchData, createdAt: now.toDate().toISOString(), updatedAt: now.toDate().toISOString() },
      { status: 201 },
    );
  } catch (error: any) {
    console.error('[generate-invites] Error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan sistem saat membuat batch undangan.', message: error.message }, { status: 500 });
  }
}
