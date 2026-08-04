import { NextRequest } from 'next/server';
import admin from '@/lib/firebase/admin';

export type AdminActor = { uid: string; email: string; name: string };
export type AdminAuthError = { error: string; status: number };

export async function verifySuperAdmin(req: NextRequest): Promise<AdminActor | AdminAuthError> {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return { error: 'Unauthorized', status: 401 };
  const idToken = authorization.split('Bearer ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const snap = await admin.firestore().collection('roles_admin').doc(decoded.uid).get();
    if (!snap.exists) return { error: 'Forbidden: Super Admin only.', status: 403 };
    return { uid: decoded.uid, email: decoded.email ?? '', name: decoded.name ?? decoded.email ?? decoded.uid };
  } catch (err: any) {
    if (err.code === 'auth/id-token-expired') return { error: 'Sesi berakhir, silakan muat ulang.', status: 401 };
    return { error: `Verifikasi token gagal: ${err.message}`, status: 401 };
  }
}

export function isAuthError(result: AdminActor | AdminAuthError): result is AdminAuthError {
  return 'error' in result;
}
