import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, writeSyncLog, jsonError, SYNC_BATCH_LIMIT, type SyncIssue } from '@/lib/server/sync-helpers';

export const runtime = 'nodejs';
export const maxDuration = 120;

const APPROVER_COLLECTIONS: { collection: string; label: string; fields: string[] }[] = [
  { collection: 'leave_requests', label: 'Cuti', fields: ['managerUid', 'directSupervisorUid', 'hrdUid', 'approverUid'] },
  { collection: 'permission_requests', label: 'Izin', fields: ['managerUid', 'directSupervisorUid', 'hrdUid', 'approverUid'] },
  { collection: 'overtime_submissions', label: 'Lembur', fields: ['managerUid', 'directSupervisorUid', 'hrdUid', 'approverUid'] },
  { collection: 'business_trip_missions', label: 'Perjalanan Dinas', fields: ['managerUid', 'directSupervisorUid', 'hrdUid', 'approverUid'] },
];

const FIELD_LABEL: Record<string, string> = {
  managerUid: 'Manager',
  directSupervisorUid: 'Atasan Langsung',
  hrdUid: 'HRD',
  approverUid: 'Approver',
};

/**
 * Sync Approval Flow — reports approvers referenced by uid that no longer exist
 * in users/employee_profiles (e.g. account deleted). This is intentionally
 * REPORT-ONLY: automatically reassigning an approval chain is a business
 * decision (who takes over?) that Super Admin must make manually, so
 * dryRun:false still performs zero writes — totalFixed is always 0.
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
  const existingUidCache = new Map<string, boolean>();
  let totalChecked = 0;

  const uidExists = async (uid: string): Promise<boolean> => {
    if (existingUidCache.has(uid)) return existingUidCache.get(uid)!;
    const [userDoc, profileDoc] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('employee_profiles').doc(uid).get(),
    ]);
    const exists = userDoc.exists || profileDoc.exists;
    existingUidCache.set(uid, exists);
    return exists;
  };

  try {
    for (const source of APPROVER_COLLECTIONS) {
      const snap = await db.collection(source.collection).limit(SYNC_BATCH_LIMIT).get();

      for (const doc of snap.docs) {
        totalChecked++;
        const data = doc.data();

        for (const field of source.fields) {
          const uid = data[field];
          if (!uid || typeof uid !== 'string') continue;
          const exists = await uidExists(uid);
          if (!exists) {
            const fieldLabel = FIELD_LABEL[field] ?? field;
            issues.push({
              id: `${source.collection}/${doc.id}/${field}`,
              entityName: `${source.label} #${doc.id}`,
              issueType: `${fieldLabel} tidak ditemukan`,
              currentValue: uid,
              masterValue: 'Tidak diketahui — akun mungkin sudah dihapus',
              sourceCollection: 'users / employee_profiles',
              targetCollection: source.collection,
              action: `Perlu ditugaskan ${fieldLabel} baru secara manual oleh Super Admin — sistem tidak mengganti approver secara otomatis.`,
            });
          }
        }
      }
    }
  } catch (err: any) {
    errors.push(err?.message ?? 'Unknown error');
  }

  const finishedAt = new Date();
  const result = {
    syncType: 'approval-flow' as const,
    dryRun,
    status: (errors.length > 0 ? 'failed' : 'completed') as 'completed' | 'failed',
    totalChecked,
    totalIssues: issues.length,
    totalFixed: 0,
    sourceCollection: 'users / employee_profiles',
    targetCollection: 'leave_requests, permission_requests, overtime_submissions, business_trip_missions',
    issues,
    errors,
    truncated: totalChecked >= SYNC_BATCH_LIMIT * APPROVER_COLLECTIONS.length,
  };

  await writeSyncLog(result, auth.uid, auth.name, startedAt, finishedAt).catch(() => {});

  return NextResponse.json({ success: true, ...result, note: 'Approval flow tidak diperbaiki otomatis — perlu penugasan approver manual oleh Super Admin.' });
}
