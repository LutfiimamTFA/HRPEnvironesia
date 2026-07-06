import 'server-only';
import type { NextRequest } from 'next/server';
import admin from '@/lib/firebase/admin';

/**
 * Inventory Admin is a separate access grant, not an HRP role — it never
 * touches users/{uid}.role. This keeps existing HRP roles (super-admin, hrd,
 * manager, karyawan, ...) untouched while still letting Super Admin delegate
 * inventory data-entry access to specific employees.
 */
const SUPER_ADMIN_ROLES = ['super-admin', 'super_admin', 'superadmin'];

export async function isSuperAdminUid(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const [userSnap, roleAdminSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('roles_admin').doc(uid).get(),
  ]);
  const role = String(userSnap.data()?.role ?? '').trim();
  return roleAdminSnap.exists || SUPER_ADMIN_ROLES.includes(role);
}

export async function isInventoryAdminUid(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const accessSnap = await db.collection('inventory_access').doc(uid).get();
  return accessSnap.exists && accessSnap.data()?.status === 'active';
}

/** Super Admin always has full inventory access; inventory_admin is additive, never a replacement for HRP roles. */
export async function canManageInventory(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  if (await isSuperAdminUid(db, uid)) return true;
  return isInventoryAdminUid(db, uid);
}

/**
 * Auth guard for Inventory CRUD API routes (items/borrowings) — mirrors
 * verifySuperAdmin's shape/behavior in sync-helpers.ts, but allows either
 * Super Admin or an active inventory_access grant, matching canManageInventory().
 */
export async function verifyCanManageInventory(
  req: NextRequest,
): Promise<{ uid: string; email: string; name: string } | { error: string; status: number }> {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return { error: 'Unauthorized', status: 401 };
  const idToken = authorization.slice(7);
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const db = admin.firestore();
    const allowed = await canManageInventory(db, decoded.uid);
    if (!allowed) return { error: 'Forbidden: hanya Super Admin atau Inventory Admin.', status: 403 };

    const userSnap = await db.collection('users').doc(decoded.uid).get();
    const userData = userSnap.data() ?? {};
    return {
      uid: decoded.uid,
      email: decoded.email ?? userData.email ?? '',
      name: userData.fullName ?? userData.name ?? decoded.name ?? decoded.email ?? decoded.uid,
    };
  } catch (err: any) {
    if (err.code === 'auth/id-token-expired') return { error: 'Sesi berakhir, silakan muat ulang.', status: 401 };
    return { error: `Verifikasi token gagal: ${err.message}`, status: 401 };
  }
}
