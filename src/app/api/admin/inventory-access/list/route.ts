import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, jsonError } from '@/lib/server/sync-helpers';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Manajemen Akses Inventory — list of active employees plus their current
 * inventory_access status. Search happens client-side over this list (name /
 * email / employee code), so this just needs to return active employees once
 * per page load — not realtime.
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) return jsonError(auth.error, auth.status);

  const db = admin.firestore();

  try {
    const [usersSnap, accessSnap] = await Promise.all([
      db.collection('users').where('isActive', '==', true).get(),
      db.collection('inventory_access').get(),
    ]);

    const accessByUid = new Map<string, FirebaseFirestore.DocumentData>();
    accessSnap.forEach((doc) => accessByUid.set(doc.id, doc.data()));

    const employees = usersSnap.docs.map((doc) => {
      const data = doc.data();
      const access = accessByUid.get(doc.id);
      return {
        uid: doc.id,
        fullName: data.fullName ?? data.name ?? data.email ?? doc.id,
        email: data.email ?? '',
        employeeNumber: data.employeeNumber ?? data.employeeCode ?? '-',
        role: data.role ?? '-',
        inventoryAccessStatus: access?.status ?? 'inactive',
        grantedAt: access?.grantedAt ?? null,
        grantedByName: access?.grantedByName ?? null,
      };
    });

    employees.sort((a, b) => a.fullName.localeCompare(b.fullName));

    return NextResponse.json({ success: true, employees });
  } catch (err: any) {
    return jsonError(err?.message ?? 'Gagal memuat daftar karyawan.', 500);
  }
}
