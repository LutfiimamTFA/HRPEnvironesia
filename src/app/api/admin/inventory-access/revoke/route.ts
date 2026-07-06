import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, jsonError } from '@/lib/server/sync-helpers';

export const runtime = 'nodejs';
export const maxDuration = 15;

/** Revokes inventory_admin access. Does not touch the employee's HRP role. */
export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) return jsonError(auth.error, auth.status);

  const body = await req.json().catch(() => ({}));
  const targetUid: string | undefined = body.uid;
  if (!targetUid) return jsonError('uid karyawan wajib diisi.', 400);

  const db = admin.firestore();

  try {
    const accessRef = db.collection('inventory_access').doc(targetUid);
    const accessSnap = await accessRef.get();
    if (!accessSnap.exists) return jsonError('Karyawan ini belum memiliki akses inventory.', 404);
    const employeeName = accessSnap.data()?.employeeName ?? targetUid;
    const employeeEmail = accessSnap.data()?.employeeEmail ?? '';

    const now = admin.firestore.FieldValue.serverTimestamp();
    await accessRef.set({
      status: 'inactive',
      revokedByUid: auth.uid,
      revokedByName: auth.name,
      revokedAt: now,
      updatedAt: now,
    }, { merge: true });

    await db.collection('inventory_access_logs').add({
      targetUid,
      targetName: employeeName,
      targetEmail: employeeEmail,
      action: 'revoke',
      performedByUid: auth.uid,
      performedByName: auth.name,
      timestamp: now,
      detail: `Akses Inventory Admin dicabut dari ${employeeName}.`,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return jsonError(err?.message ?? 'Gagal mencabut akses inventory.', 500);
  }
}
