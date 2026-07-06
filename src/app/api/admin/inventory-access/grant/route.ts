import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, jsonError } from '@/lib/server/sync-helpers';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * Grants inventory_admin access to an employee — a separate access flag, not
 * an HRP role change. Only Super Admin may call this (rules mirror this on
 * the client side too, but this is the only place writes should happen).
 */
export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) return jsonError(auth.error, auth.status);

  const body = await req.json().catch(() => ({}));
  const targetUid: string | undefined = body.uid;
  if (!targetUid) return jsonError('uid karyawan wajib diisi.', 400);

  const db = admin.firestore();

  try {
    const targetSnap = await db.collection('users').doc(targetUid).get();
    if (!targetSnap.exists) return jsonError('Karyawan tidak ditemukan.', 404);
    const targetData = targetSnap.data()!;
    const employeeName = targetData.fullName ?? targetData.name ?? targetData.email ?? targetUid;
    const employeeEmail = targetData.email ?? '';

    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('inventory_access').doc(targetUid).set({
      uid: targetUid,
      employeeName,
      employeeEmail,
      role: 'inventory_admin',
      status: 'active',
      grantedByUid: auth.uid,
      grantedByName: auth.name,
      grantedAt: now,
      revokedByUid: null,
      revokedByName: null,
      revokedAt: null,
      updatedAt: now,
    }, { merge: true });

    await db.collection('inventory_access_logs').add({
      targetUid,
      targetName: employeeName,
      targetEmail: employeeEmail,
      action: 'grant',
      performedByUid: auth.uid,
      performedByName: auth.name,
      timestamp: now,
      detail: `Akses Inventory Admin diberikan kepada ${employeeName}.`,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return jsonError(err?.message ?? 'Gagal memberikan akses inventory.', 500);
  }
}
