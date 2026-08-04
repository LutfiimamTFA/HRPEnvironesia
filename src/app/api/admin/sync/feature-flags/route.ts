import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, writeSyncLog, jsonError, type SyncIssue } from '@/lib/server/sync-helpers';
import { FEATURE_DEFAULTS, FEATURE_KEYS, FEATURE_SETTINGS_COLLECTION, FEATURE_SETTINGS_DOC } from '@/lib/feature-flags';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Sync Feature Flags — makes sure system_settings/features has every documented
 * feature key present with a complete shape (enabled/label/description/riskLevel).
 * This is exactly what "Inisialisasi Feature Config" does on the Feature Control
 * page — this sync just lets Super Admin verify it from Technical Sync Center too.
 * A missing key is created with its documented DEFAULT enabled state, never forced on/off.
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
  const fixData: Record<string, unknown> = {};
  let totalChecked = 0;

  try {
    const ref = db.collection(FEATURE_SETTINGS_COLLECTION).doc(FEATURE_SETTINGS_DOC);
    const snap = await ref.get();
    const existing = (snap.exists ? snap.data() : {}) ?? {};

    for (const key of FEATURE_KEYS) {
      totalChecked++;
      if (!existing[key]) {
        const def = FEATURE_DEFAULTS[key];
        issues.push({
          id: key,
          entityName: def.label,
          issueType: 'Feature flag belum dikonfigurasi',
          currentValue: 'Kosong',
          masterValue: def.enabled ? 'Aktif (default)' : 'Nonaktif (default)',
          sourceCollection: 'Feature Control defaults',
          targetCollection: 'system_settings/features',
          title: `Saklar fitur "${def.label}" belum ada`,
          explanation: `Sistem menemukan saklar fitur "${def.label}" di Feature Control belum tersedia di database.`,
          action: `Sistem akan melengkapi saklar fitur ini dengan status default (${def.enabled ? 'Aktif' : 'Nonaktif'}).`,
          impact: 'Tidak ada data HRD yang diubah. Status fitur hanya diisi dengan nilai default, tidak dipaksa aktif.',
        });
        if (!dryRun) {
          fixData[key] = {
            ...def,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedByUid: auth.uid,
            updatedByName: auth.name,
          };
        }
      }
    }

    if (!dryRun && Object.keys(fixData).length > 0) {
      await ref.set(fixData, { merge: true });
      for (const issue of issues) {
        if (fixData[issue.id]) issue.resultMessage = `Feature flag "${issue.entityName}" berhasil dibuat dengan status default.`;
      }
    }
  } catch (err: any) {
    errors.push(err?.message ?? 'Unknown error');
  }

  const finishedAt = new Date();
  const result = {
    syncType: 'feature-flags' as const,
    dryRun,
    status: (errors.length > 0 ? 'failed' : 'completed') as 'completed' | 'failed',
    totalChecked,
    totalIssues: issues.length,
    totalFixed: dryRun ? 0 : Object.keys(fixData).length,
    sourceCollection: 'Feature Control defaults',
    targetCollection: 'system_settings/features',
    issues,
    errors,
    truncated: false,
  };

  await writeSyncLog(result, auth.uid, auth.name, startedAt, finishedAt).catch(() => {});

  return NextResponse.json({ success: true, ...result });
}
