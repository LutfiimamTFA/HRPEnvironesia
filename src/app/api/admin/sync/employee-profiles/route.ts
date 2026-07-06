import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, writeSyncLog, commitInBatches, jsonError, SYNC_BATCH_LIMIT, type SyncIssue } from '@/lib/server/sync-helpers';

export const runtime = 'nodejs';
export const maxDuration = 120;

const EMPLOYEE_ROLES = ['karyawan', 'hrd', 'manager'];

/**
 * Sync Employee Profile — every user with an employee-facing role (karyawan,
 * hrd, manager) must have an employee_profiles/{uid} document. Missing ones are
 * only reported in preview; a run (dryRun:false) creates a MINIMAL profile
 * (uid, email, fullName, role, createdAt) — it never overwrites an existing doc.
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
      .where('role', 'in', EMPLOYEE_ROLES)
      .limit(SYNC_BATCH_LIMIT)
      .get();

    for (const userDoc of usersSnap.docs) {
      totalChecked++;
      const uid = userDoc.id;
      const data = userDoc.data();
      const profileDoc = await db.collection('employee_profiles').doc(uid).get();
      if (!profileDoc.exists) {
        const entityName = data.fullName || data.email || uid;
        const fullName = data.fullName || data.email || '';
        issues.push({
          id: uid,
          entityName,
          issueType: 'Profil karyawan belum ada',
          currentValue: 'Kosong',
          masterValue: fullName,
          sourceCollection: 'users',
          targetCollection: 'employee_profiles',
          action: `Dokumen employee_profiles baru akan dibuat untuk "${entityName}" (role: ${data.role}).`,
        });
        if (!dryRun) {
          fixes.push({
            ref: db.collection('employee_profiles').doc(uid),
            data: {
              uid,
              email: data.email ?? null,
              fullName,
              role: data.role ?? null,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              syncedBy: 'sync-center',
            },
          });
        }
      }
    }

    if (!dryRun && fixes.length > 0) {
      await commitInBatches(db, fixes);
      const fixedIds = new Set(fixes.map((f) => f.ref.id));
      for (const issue of issues) {
        if (fixedIds.has(issue.id)) {
          issue.resultMessage = `Profil karyawan berhasil dibuat untuk "${issue.entityName}".`;
        }
      }
    }
  } catch (err: any) {
    errors.push(err?.message ?? 'Unknown error');
  }

  const finishedAt = new Date();
  const result = {
    syncType: 'employee-profiles' as const,
    dryRun,
    status: (errors.length > 0 ? 'failed' : 'completed') as 'completed' | 'failed',
    totalChecked,
    totalIssues: issues.length,
    totalFixed: dryRun ? 0 : fixes.length,
    sourceCollection: 'users',
    targetCollection: 'employee_profiles',
    issues,
    errors,
    truncated: totalChecked >= SYNC_BATCH_LIMIT,
  };

  await writeSyncLog(result, auth.uid, auth.name, startedAt, finishedAt).catch(() => {});

  return NextResponse.json({ success: true, ...result });
}
