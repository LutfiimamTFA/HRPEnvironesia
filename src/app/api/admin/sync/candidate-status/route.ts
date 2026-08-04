import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, writeSyncLog, commitInBatches, jsonError, SYNC_BATCH_LIMIT, type SyncIssue } from '@/lib/server/sync-helpers';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Sync Status Kandidat — catches applications stuck at "tes_kepribadian" whose
 * candidate_personality_tests/{candidateUid} is already "completed". This mirrors
 * the exact fix normally applied live in /api/assessment/submit — this sync only
 * repairs orphaned cases left behind by a race condition, a failed submit-time
 * batch, or manual/legacy data.
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
    const stuckAppsSnap = await db.collection('applications')
      .where('status', '==', 'tes_kepribadian')
      .limit(SYNC_BATCH_LIMIT)
      .get();

    for (const appDoc of stuckAppsSnap.docs) {
      totalChecked++;
      const app = appDoc.data();
      const candidateUid = app.candidateUid as string | undefined;
      if (!candidateUid) continue;

      const testDoc = await db.collection('candidate_personality_tests').doc(candidateUid).get();
      const testStatus = testDoc.data()?.status;

      if (testDoc.exists && testStatus === 'completed') {
        const entityName = app.candidateName || candidateUid;
        issues.push({
          id: appDoc.id,
          entityName,
          issueType: 'Status lamaran belum diperbarui',
          currentValue: 'Tes Kepribadian',
          masterValue: 'Screening',
          sourceCollection: 'candidate_personality_tests',
          targetCollection: 'applications',
          action: `Status lamaran "${entityName}" (${app.jobPosition ?? '-'}) akan diubah dari "Tes Kepribadian" menjadi "Screening" karena tesnya sudah selesai.`,
        });
        if (!dryRun) {
          fixes.push({
            ref: appDoc.ref,
            data: {
              status: 'screening',
              personalityTestCompleted: true,
              personalityTestResultId: testDoc.data()?.sessionId ?? null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
          issue.resultMessage = `Status lamaran "${issue.entityName}" berhasil diperbarui menjadi "Screening".`;
        }
      }
    }
  } catch (err: any) {
    errors.push(err?.message ?? 'Unknown error');
  }

  const finishedAt = new Date();
  const result = {
    syncType: 'candidate-status' as const,
    dryRun,
    status: (errors.length > 0 ? 'failed' : 'completed') as 'completed' | 'failed',
    totalChecked,
    totalIssues: issues.length,
    totalFixed: dryRun ? 0 : fixes.length,
    sourceCollection: 'candidate_personality_tests',
    targetCollection: 'applications',
    issues,
    errors,
    truncated: totalChecked >= SYNC_BATCH_LIMIT,
  };

  await writeSyncLog(result, auth.uid, auth.name, startedAt, finishedAt).catch(() => {});

  return NextResponse.json({ success: true, ...result });
}
