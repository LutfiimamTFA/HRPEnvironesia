import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, writeSyncLog, jsonError, type SyncIssue } from '@/lib/server/sync-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SAMPLE_SIZE = 100;

/**
 * Sync Analytics Config — samples recent docs in the technical monitoring
 * collections (online_sessions, system_analytics_events, load_test_reports)
 * and flags any that are missing required technical fields (e.g. createdAt).
 * This checks system health of the ANALYTICS PIPELINE itself, not user
 * behavior or HRD performance — REPORT-ONLY, malformed docs are not deleted
 * or auto-fixed since a monitoring record isn't a "current state" mirror.
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

  const checks: { collection: string; label: string; requiredFields: string[] }[] = [
    { collection: 'online_sessions', label: 'Data User Online', requiredFields: ['uid', 'lastSeen'] },
    { collection: 'system_analytics_events', label: 'Event Aktivitas Sistem', requiredFields: ['eventType', 'createdAt'] },
    { collection: 'load_test_reports', label: 'Laporan Load Test', requiredFields: ['createdAt', 'mode'] },
  ];

  try {
    for (const check of checks) {
      const snap = await db.collection(check.collection).limit(SAMPLE_SIZE).get();
      let malformed = 0;
      totalChecked += snap.size;
      for (const doc of snap.docs) {
        const data = doc.data();
        const missing = check.requiredFields.filter((f) => data[f] === undefined);
        if (missing.length > 0) malformed++;
      }
      if (malformed > 0) {
        issues.push({
          id: check.collection,
          entityName: check.label,
          issueType: 'Data analytics tidak lengkap',
          currentValue: `${malformed} dari ${snap.size} data contoh bermasalah`,
          masterValue: 'Struktur data lengkap',
          sourceCollection: check.collection,
          targetCollection: check.collection,
          title: `Config Analytics "${check.label}" bermasalah`,
          explanation: `Sistem menemukan ${malformed} data di "${check.label}" yang tersimpan tidak lengkap.`,
          action: `Perlu ditelusuri manual — sync ini hanya memeriksa, tidak menghapus atau mengubah data analytics.`,
          impact: 'Tidak ada data HRD yang diubah. Ini hanya memengaruhi keakuratan tampilan Analytics Sistem.',
        });
      }
    }
  } catch (err: any) {
    errors.push(err?.message ?? 'Unknown error');
  }

  const finishedAt = new Date();
  const result = {
    syncType: 'analytics-config' as const,
    dryRun,
    status: (errors.length > 0 ? 'failed' : 'completed') as 'completed' | 'failed',
    totalChecked,
    totalIssues: issues.length,
    totalFixed: 0,
    sourceCollection: 'online_sessions, system_analytics_events, load_test_reports',
    targetCollection: '(pemeriksaan saja)',
    issues,
    errors,
    truncated: false,
  };

  await writeSyncLog(result, auth.uid, auth.name, startedAt, finishedAt).catch(() => {});

  return NextResponse.json({ success: true, ...result, note: 'Pemeriksaan saja — dokumen analytics tidak dihapus/diperbaiki otomatis.' });
}
