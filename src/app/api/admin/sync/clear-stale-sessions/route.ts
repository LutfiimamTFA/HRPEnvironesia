import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, writeSyncLog, jsonError, SYNC_BATCH_LIMIT, type SyncIssue } from '@/lib/server/sync-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h — matches the online-status "presence" semantics, not user data.

/**
 * Clear Stale Sessions — deletes online_sessions/{uid} docs whose lastSeen is
 * older than 24h. This is purely a presence/realtime-status cleanup (who's
 * shown as "online" in Analytics Sistem) — it never touches users/{uid} or
 * any HRD-owned session/attendance data.
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
  let totalChecked = 0;
  let totalFixed = 0;

  try {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - STALE_AFTER_MS);
    const staleSnap = await db.collection('online_sessions')
      .where('lastSeen', '<', cutoff)
      .limit(SYNC_BATCH_LIMIT)
      .get();

    totalChecked = staleSnap.size;

    for (const doc of staleSnap.docs) {
      const data = doc.data();
      issues.push({
        id: doc.id,
        entityName: data.displayName || data.email || doc.id,
        issueType: 'Sesi online basi (stale)',
        currentValue: 'Masih tercatat online',
        masterValue: 'Dihapus (lebih dari 24 jam tidak aktif)',
        sourceCollection: '(aturan 24 jam)',
        targetCollection: 'online_sessions',
        title: 'Sesi online lama masih tersimpan',
        explanation: 'Sistem menemukan data user online yang sudah tidak aktif lebih dari 24 jam, tetapi masih tercatat online.',
        action: 'Sistem akan menghapus sesi online lama tersebut.',
        impact: 'Data User Online di Analytics menjadi lebih akurat. Tidak ada data HRD yang diubah.',
      });
    }

    if (!dryRun && staleSnap.docs.length > 0) {
      const batch = db.batch();
      for (const doc of staleSnap.docs) batch.delete(doc.ref);
      await batch.commit();
      totalFixed = staleSnap.docs.length;
      for (const issue of issues) {
        issue.resultMessage = `Sesi basi "${issue.entityName}" berhasil dibersihkan.`;
      }
    }
  } catch (err: any) {
    errors.push(err?.message ?? 'Unknown error');
  }

  const finishedAt = new Date();
  const result = {
    syncType: 'clear-stale-sessions' as const,
    dryRun,
    status: (errors.length > 0 ? 'failed' : 'completed') as 'completed' | 'failed',
    totalChecked,
    totalIssues: issues.length,
    totalFixed,
    sourceCollection: '(aturan 24 jam)',
    targetCollection: 'online_sessions',
    issues,
    errors,
    truncated: totalChecked >= SYNC_BATCH_LIMIT,
  };

  await writeSyncLog(result, auth.uid, auth.name, startedAt, finishedAt).catch(() => {});

  return NextResponse.json({ success: true, ...result });
}
