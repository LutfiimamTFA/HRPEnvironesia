import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function verifySuperAdmin(req: NextRequest) {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return { error: 'Unauthorized', status: 401 };
  try {
    const decoded = await admin.auth().verifyIdToken(auth.slice(7));
    const snap = await admin.firestore().collection('users').doc(decoded.uid).get();
    const role = String(snap.data()?.role ?? '').trim();
    if (!['super-admin', 'super_admin', 'superadmin'].includes(role))
      return { error: 'Forbidden', status: 403 };
    return { uid: decoded.uid };
  } catch (e: any) {
    return { error: e.message, status: 401 };
  }
}

async function deleteBatch(db: FirebaseFirestore.Firestore, snap: FirebaseFirestore.QuerySnapshot) {
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.slice(0, 100).forEach(d => batch.delete(d.ref));
  await batch.commit();
  return Math.min(snap.size, 100);
}

export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  let simulationId: string | undefined;
  try { ({ simulationId } = await req.json()); } catch { /* no body */ }

  const db = admin.firestore();
  let deleted = 0;

  // Delete from system_analytics_events
  const analyticsQ = simulationId
    ? db.collection('system_analytics_events').where('isTest', '==', true).where('simulationId', '==', simulationId).limit(100)
    : db.collection('system_analytics_events').where('isTest', '==', true).limit(100);

  let snap = await analyticsQ.get();
  while (!snap.empty) {
    deleted += await deleteBatch(db, snap);
    snap = await analyticsQ.get();
  }

  const collections = [
    { name: 'synthetic_load_test_ticks', limit: 100 },
    { name: 'synthetic_test_ticks', limit: 100 },
    { name: 'export_logs', limit: 100 },
    { name: 'backup_logs', limit: 100 },
    { name: 'online_sessions', limit: 100 },
    { name: 'synthetic_test_files', limit: 100 },
    { name: 'synthetic_test_users', limit: 100 },
    { name: 'load_test_reports', limit: 100 },
  ];

  for (const item of collections) {
    const q = simulationId
      ? db.collection(item.name).where('isTest', '==', true).where('simulationId', '==', simulationId).limit(item.limit)
      : db.collection(item.name).where('isTest', '==', true).limit(item.limit);

    let qsnap = await q.get();
    while (!qsnap.empty) {
      deleted += await deleteBatch(db, qsnap);
      qsnap = await q.get();
    }
  }

  return NextResponse.json({ success: true, deleted, simulationId: simulationId ?? 'all' });
}
