import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';

/** Hard cap per run — protects Firestore quota, matches the "300–500 docs per run" requirement. */
export const SYNC_BATCH_LIMIT = 400;

export type SyncType =
  // Legacy HRD-domain sync types — no longer surfaced in Super Admin's Technical
  // Sync Center (Super Admin is a technical system owner, not an HRD/SDM data owner).
  // Kept here only so old sync_logs entries still type-check; routes remain on disk
  // in case an HRD-facing tool wants to reuse them later.
  | 'roles'
  | 'employee-profiles'
  | 'employee-names'
  | 'candidate-status'
  | 'approval-flow'
  // Technical Sync Center (current, Super Admin scope)
  | 'role-access'
  | 'menu-settings'
  | 'feature-flags'
  | 'maintenance-config'
  | 'system-settings'
  | 'analytics-config'
  | 'clear-stale-sessions'
  | 'repair-technical-config';

/**
 * Every field here is meant to be shown to Super Admin as-is — no technical
 * jargon ("mismatch", "diff", "source vs target"). Write these in plain
 * Indonesian from the route itself; the UI just displays them.
 */
export interface SyncIssue {
  id: string;
  /** e.g. "Daniel" — who/what this issue is about (kept for internal/legacy routes). */
  entityName: string;
  /** e.g. "Nama tidak sama", "Email kosong" — plain-language problem label (kept for internal/legacy routes). */
  issueType: string;
  /** What's currently stored in the collection being fixed. Use "-" (kosong) for empty. */
  currentValue: string;
  /** The correct value, taken from the master/source collection. */
  masterValue: string;
  /** Where the correct value comes from, e.g. "users". */
  sourceCollection: string;
  /** Which collection will be written to, e.g. "employee_profiles". */
  targetCollection: string;
  /** Full sentence describing what will happen on run, e.g. "Nama di employee_profiles akan diperbarui menjadi Daniel". */
  action: string;
  /** Filled in by the route after a real (non-dryRun) fix — what actually happened. */
  resultMessage?: string;
  /** "Judul Masalah" — short plain-language headline, e.g. "Config Maintenance HRD belum lengkap". */
  title?: string;
  /** "Penjelasan" — 1-2 sentences on what was found and why it matters. */
  explanation?: string;
  /** "Dampak" — what happens to users/data if this is (or isn't) fixed. Must always make clear no HRD data is touched. */
  impact?: string;
}

export interface SyncRunResult {
  syncType: SyncType;
  dryRun: boolean;
  status: 'completed' | 'failed';
  totalChecked: number;
  totalIssues: number;
  totalFixed: number;
  sourceCollection: string;
  targetCollection: string;
  issues: SyncIssue[];
  errors: string[];
  truncated: boolean;
}

export async function verifySuperAdmin(req: NextRequest): Promise<{ uid: string; email: string; name: string } | { error: string; status: number }> {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return { error: 'Unauthorized', status: 401 };
  const idToken = authorization.slice(7);
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userSnap = await admin.firestore().collection('users').doc(decoded.uid).get();
    const userData = userSnap.data() ?? {};
    const role = String(userData.role ?? '').trim();
    const isRoleAdminDoc = (await admin.firestore().collection('roles_admin').doc(decoded.uid).get()).exists;
    if (!isRoleAdminDoc && !['super-admin', 'super_admin', 'superadmin'].includes(role)) {
      return { error: 'Forbidden: Super Admin only.', status: 403 };
    }
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

export async function writeSyncLog(result: SyncRunResult, actorUid: string, actorName: string, startedAt: Date, finishedAt: Date) {
  await admin.firestore().collection('sync_logs').add({
    syncType: result.syncType,
    dryRun: result.dryRun,
    status: result.status,
    totalChecked: result.totalChecked,
    totalIssues: result.totalIssues,
    totalFixed: result.totalFixed,
    sourceCollection: result.sourceCollection,
    targetCollection: result.targetCollection,
    errors: result.errors,
    truncated: result.truncated,
    startedAt: admin.firestore.Timestamp.fromDate(startedAt),
    finishedAt: admin.firestore.Timestamp.fromDate(finishedAt),
    executedByUid: actorUid,
    executedByName: actorName,
  });
}

/** Commits merge-set writes in Firestore batches of <=400 (Firestore's own hard limit is 500 per batch). */
export async function commitInBatches(db: FirebaseFirestore.Firestore, ops: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }>) {
  for (let i = 0; i < ops.length; i += SYNC_BATCH_LIMIT) {
    const chunk = ops.slice(i, i + SYNC_BATCH_LIMIT);
    const batch = db.batch();
    for (const op of chunk) batch.set(op.ref, op.data, { merge: true });
    await batch.commit();
  }
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}
