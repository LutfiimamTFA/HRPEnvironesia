import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, writeSyncLog, commitInBatches, jsonError, SYNC_BATCH_LIMIT, type SyncIssue } from '@/lib/server/sync-helpers';

export const runtime = 'nodejs';
export const maxDuration = 120;

const ROLE_COLLECTION: Record<string, string> = {
  'super-admin': 'roles_admin',
  hrd: 'roles_hrd',
};

/**
 * Sync Role User — ensures users/{uid}.role has a matching fast-lookup role doc
 * (roles_admin/{uid} for super-admin, roles_hrd/{uid} for hrd), used by Firestore
 * security rules for cheap list-query role checks. Only ADDS missing docs — never
 * deletes, per the "pastikan X ada" wording (removing extra role docs is a
 * separate, more destructive decision left to manual review).
 */
export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) return jsonError(auth.error, auth.status);

  let body: { dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* default dryRun true */ }
  const dryRun = body.dryRun !== false;

  const startedAt = new Date();
  const db = admin.firestore();
  const issues: SyncIssue[] = [];
  const errors: string[] = [];
  const fixes: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [];
  let totalChecked = 0;

  try {
    const usersSnap = await db.collection('users')
      .where('role', 'in', ['super-admin', 'hrd'])
      .limit(SYNC_BATCH_LIMIT)
      .get();

    for (const userDoc of usersSnap.docs) {
      totalChecked++;
      const uid = userDoc.id;
      const role = String(userDoc.data().role ?? '');
      const roleCollection = ROLE_COLLECTION[role];
      if (!roleCollection) continue;

      const roleDoc = await db.collection(roleCollection).doc(uid).get();
      if (!roleDoc.exists) {
        const entityName = userDoc.data().fullName || userDoc.data().email || uid;
        issues.push({
          id: uid,
          entityName,
          issueType: 'Dokumen role belum ada',
          currentValue: 'Kosong',
          masterValue: role,
          sourceCollection: 'users',
          targetCollection: roleCollection,
          action: `Dokumen ${roleCollection} akan dibuat untuk "${entityName}" (role: ${role}).`,
        });
        if (!dryRun) {
          fixes.push({
            ref: db.collection(roleCollection).doc(uid),
            data: { uid, email: userDoc.data().email ?? null, createdAt: admin.firestore.FieldValue.serverTimestamp(), syncedBy: 'sync-center' },
          });
        }
      }
    }

    if (!dryRun && fixes.length > 0) {
      await commitInBatches(db, fixes);
      for (const issue of issues) {
        const wasFixed = fixes.some((f) => f.ref.id === issue.id && f.ref.parent.id === issue.targetCollection);
        if (wasFixed) issue.resultMessage = `Dokumen ${issue.targetCollection} berhasil dibuat untuk "${issue.entityName}".`;
      }
    }
  } catch (err: any) {
    errors.push(err?.message ?? 'Unknown error');
  }

  const finishedAt = new Date();
  const result = {
    syncType: 'roles' as const,
    dryRun,
    status: (errors.length > 0 ? 'failed' : 'completed') as 'completed' | 'failed',
    totalChecked,
    totalIssues: issues.length,
    totalFixed: dryRun ? 0 : fixes.length,
    sourceCollection: 'users',
    targetCollection: 'roles_admin / roles_hrd',
    issues,
    errors,
    truncated: totalChecked >= SYNC_BATCH_LIMIT,
  };

  await writeSyncLog(result, auth.uid, auth.name, startedAt, finishedAt).catch(() => {});

  return NextResponse.json({ success: true, ...result });
}
