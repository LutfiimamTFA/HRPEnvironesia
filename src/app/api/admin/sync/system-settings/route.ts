import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, writeSyncLog, jsonError, type SyncIssue } from '@/lib/server/sync-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const REQUIRED_DOCS: { id: string; label: string; defaults: Record<string, unknown> }[] = [
  { id: 'session_security', label: 'Session Teknis (idle timeout)', defaults: { idleTimeoutMinutes: 15, warningBeforeLogoutMinutes: 2, autoLogoutEnabled: true, crossTabLogoutEnabled: true } },
  { id: 'backup_export', label: 'Backup & Export Config', defaults: {} },
  { id: 'menu_visibility', label: 'Menu Visibility Config', defaults: {} },
];

/**
 * Sync System Settings — checks that the core technical config docs under
 * system_settings/* exist (session_security, backup_export, menu_visibility).
 * A missing doc is created with safe, non-destructive defaults that match
 * what the app already falls back to in code when the doc is absent — this
 * never overwrites an existing doc, only fills in what's missing.
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
    for (const doc of REQUIRED_DOCS) {
      totalChecked++;
      const ref = db.collection('system_settings').doc(doc.id);
      const snap = await ref.get();
      if (!snap.exists) {
        issues.push({
          id: doc.id,
          entityName: doc.label,
          issueType: 'Konfigurasi teknis belum ada',
          currentValue: 'Kosong',
          masterValue: 'Nilai default sistem',
          sourceCollection: 'Konfigurasi default sistem',
          targetCollection: `system_settings/${doc.id}`,
          title: `Pengaturan sistem "${doc.label}" belum ada`,
          explanation: `Sistem menemukan pengaturan teknis dasar "${doc.label}" belum tersedia di database.`,
          action: `Sistem akan membuat pengaturan ini dengan nilai default yang aman.`,
          impact: 'Tidak ada data HRD yang diubah. Ini hanya melengkapi pengaturan teknis dasar sistem.',
        });
        if (!dryRun) {
          fixes.push({
            ref,
            data: { ...doc.defaults, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedByUid: auth.uid, updatedByName: auth.name },
          });
        }
      }
    }

    if (!dryRun && fixes.length > 0) {
      const batch = db.batch();
      for (const fix of fixes) batch.set(fix.ref, fix.data, { merge: true });
      await batch.commit();
      for (const issue of issues) {
        if (fixes.some((f) => f.ref.id === issue.id)) {
          issue.resultMessage = `Dokumen ${issue.targetCollection} berhasil dibuat dengan nilai default.`;
        }
      }
    }
  } catch (err: any) {
    errors.push(err?.message ?? 'Unknown error');
  }

  const finishedAt = new Date();
  const result = {
    syncType: 'system-settings' as const,
    dryRun,
    status: (errors.length > 0 ? 'failed' : 'completed') as 'completed' | 'failed',
    totalChecked,
    totalIssues: issues.length,
    totalFixed: dryRun ? 0 : fixes.length,
    sourceCollection: 'Konfigurasi default sistem',
    targetCollection: 'system_settings',
    issues,
    errors,
    truncated: false,
  };

  await writeSyncLog(result, auth.uid, auth.name, startedAt, finishedAt).catch(() => {});

  return NextResponse.json({ success: true, ...result });
}
