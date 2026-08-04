import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, writeSyncLog, commitInBatches, jsonError, SYNC_BATCH_LIMIT, type SyncIssue } from '@/lib/server/sync-helpers';

export const runtime = 'nodejs';
export const maxDuration = 120;

const EMPTY_LABEL = 'Kosong';

/**
 * Sync Nama Karyawan — users/{uid} is treated as the master record (it's the
 * document tied to Firebase Auth). This only compares users vs employee_profiles
 * and only ever writes to employee_profiles — it never bulk-rewrites historical
 * collections like attendance_records or audit_logs, which are point-in-time
 * records, not "current state" mirrors (per the "jangan ubah semua collection
 * mentah tanpa preview" instruction, those are intentionally left untouched).
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
  const fixes: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown>; issueIds: string[] }> = [];
  let totalChecked = 0;

  try {
    const usersSnap = await db.collection('users').limit(SYNC_BATCH_LIMIT).get();

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const profileDoc = await db.collection('employee_profiles').doc(uid).get();
      if (!profileDoc.exists) continue; // handled by the employee-profiles sync, not this one
      totalChecked++;

      const userData = userDoc.data();
      const profileData = profileDoc.data() ?? {};
      const entityName = userData.fullName || userData.email || uid;

      const currentName = profileData.fullName ?? '';
      const masterName = userData.fullName ?? '';
      const currentEmail = profileData.email ?? '';
      const masterEmail = userData.email ?? '';

      const nameIssueId = `${uid}-name`;
      const emailIssueId = `${uid}-email`;
      const rowFixData: Record<string, unknown> = {};
      const rowIssueIds: string[] = [];

      if (masterName && currentName !== masterName) {
        const issueType = currentName ? 'Nama tidak sama' : 'Nama kosong';
        issues.push({
          id: nameIssueId,
          entityName,
          issueType,
          currentValue: currentName || EMPTY_LABEL,
          masterValue: masterName,
          sourceCollection: 'users',
          targetCollection: 'employee_profiles',
          action: `Nama di employee_profiles akan ${currentName ? 'diperbarui' : 'diisi'} menjadi "${masterName}".`,
        });
        if (!dryRun) {
          rowFixData.fullName = masterName;
          rowIssueIds.push(nameIssueId);
        }
      }

      if (masterEmail && currentEmail !== masterEmail) {
        const issueType = currentEmail ? 'Email tidak sama' : 'Email kosong';
        issues.push({
          id: emailIssueId,
          entityName,
          issueType,
          currentValue: currentEmail || EMPTY_LABEL,
          masterValue: masterEmail,
          sourceCollection: 'users',
          targetCollection: 'employee_profiles',
          action: `Email di employee_profiles akan ${currentEmail ? 'diperbarui' : 'diisi'} menjadi "${masterEmail}".`,
        });
        if (!dryRun) {
          rowFixData.email = masterEmail;
          rowIssueIds.push(emailIssueId);
        }
      }

      if (!dryRun && rowIssueIds.length > 0) {
        fixes.push({
          ref: db.collection('employee_profiles').doc(uid),
          data: { ...rowFixData, updatedAt: admin.firestore.FieldValue.serverTimestamp(), syncedBy: 'sync-center' },
          issueIds: rowIssueIds,
        });
      }
    }

    if (!dryRun && fixes.length > 0) {
      await commitInBatches(db, fixes);
      const fixedIssueIds = new Set(fixes.flatMap((f) => f.issueIds));
      for (const issue of issues) {
        if (fixedIssueIds.has(issue.id)) {
          issue.resultMessage = issue.issueType.includes('Nama')
            ? `Nama berhasil diperbarui menjadi "${issue.masterValue}".`
            : `Email berhasil diperbarui menjadi "${issue.masterValue}".`;
        }
      }
    }
  } catch (err: any) {
    errors.push(err?.message ?? 'Unknown error');
  }

  const totalFixed = dryRun ? 0 : new Set(fixes.flatMap((f) => f.issueIds)).size;

  const finishedAt = new Date();
  const result = {
    syncType: 'employee-names' as const,
    dryRun,
    status: (errors.length > 0 ? 'failed' : 'completed') as 'completed' | 'failed',
    totalChecked,
    totalIssues: issues.length,
    totalFixed,
    sourceCollection: 'users',
    targetCollection: 'employee_profiles',
    issues,
    errors,
    truncated: totalChecked >= SYNC_BATCH_LIMIT,
  };

  await writeSyncLog(result, auth.uid, auth.name, startedAt, finishedAt).catch(() => {});

  return NextResponse.json({ success: true, ...result });
}
