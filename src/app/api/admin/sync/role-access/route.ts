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
 * Sync Role Access (technical) — ensures users/{uid}.role has a matching
 * fast-lookup role doc (roles_admin/{uid}, roles_hrd/{uid}) used by Firestore
 * security rules for cheap role checks. Purely a technical access-wiring
 * check — it never reads or touches HRD-owned fields (contract, payroll,
 * probation, employment decisions, etc).
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
          issueType: 'Dokumen role access belum ada',
          currentValue: 'Kosong',
          masterValue: role,
          sourceCollection: 'users',
          targetCollection: roleCollection,
          title: `Akses role teknis "${entityName}" belum lengkap`,
          explanation: `Sistem menemukan akun ini berperan sebagai ${role}, tapi dokumen akses teknis pendukungnya belum tersedia.`,
          action: `Sistem akan melengkapi dokumen akses agar menu dan izin role terbaca benar.`,
          impact: 'Tidak ada data HRD yang diubah. Perbaikan ini hanya melengkapi dokumen akses teknis role.',
        });
        if (!dryRun) {
          const isHrd = role === 'hrd';
          fixes.push({
            ref: db.collection(roleCollection).doc(uid),
            data: isHrd
              ? {
                  uid,
                  role: 'hrd',
                  email: userDoc.data().email ?? null,
                  scopeType: userDoc.data().hrdScope?.scopeType === 'all_companies' ? 'all_companies' : 'selected_companies',
                  allowedBrandIds: userDoc.data().hrdScope?.scopeType === 'all_companies' ? [] : (Array.isArray(userDoc.data().hrdScope?.allowedBrandIds) ? userDoc.data().hrdScope.allowedBrandIds : []),
                  allowedBrandNames: userDoc.data().hrdScope?.scopeType === 'all_companies' ? [] : (Array.isArray(userDoc.data().hrdScope?.allowedBrandNames) ? userDoc.data().hrdScope.allowedBrandNames : []),
                  active: userDoc.data().isActive !== false,
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  syncedBy: 'technical-sync-center',
                }
              : {
                  uid,
                  role: 'super-admin',
                  email: userDoc.data().email ?? null,
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  syncedBy: 'technical-sync-center',
                },
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
    syncType: 'role-access' as const,
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
