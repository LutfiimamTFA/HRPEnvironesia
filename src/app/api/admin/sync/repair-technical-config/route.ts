import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, writeSyncLog, jsonError, type SyncIssue } from '@/lib/server/sync-helpers';
import { FEATURE_DEFAULTS, FEATURE_KEYS } from '@/lib/feature-flags';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Repair Technical Config — a single "fix everything missing" pass over the
 * core technical documents Super Admin depends on:
 *   - system_settings/features (Feature Control)
 *   - system_settings/session_security (idle timeout)
 *   - system_settings/backup_export (backup/export config)
 *   - system_maintenance/global (Maintenance Control global lock)
 * Every fix is additive-only (merge, never overwrites existing values) and
 * never enables anything that was off — it only creates missing skeletons.
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
    // 1. system_settings/features
    totalChecked++;
    const featuresRef = db.collection('system_settings').doc('features');
    const featuresSnap = await featuresRef.get();
    const featuresData = featuresSnap.exists ? featuresSnap.data() ?? {} : {};
    const missingFeatureKeys = FEATURE_KEYS.filter((k) => !featuresData[k]);
    if (!featuresSnap.exists || missingFeatureKeys.length > 0) {
      issues.push({
        id: 'system_settings/features',
        entityName: 'Feature Control Config',
        issueType: featuresSnap.exists ? 'Sebagian feature flag hilang' : 'Dokumen belum ada',
        currentValue: featuresSnap.exists ? `Hilang: ${missingFeatureKeys.join(', ')}` : 'Kosong',
        masterValue: 'Semua feature flag lengkap',
        sourceCollection: 'Feature Control defaults',
        targetCollection: 'system_settings/features',
        title: 'Config Feature Control belum lengkap',
        explanation: 'Sistem menemukan sebagian saklar fitur di Feature Control belum tersedia di database.',
        action: 'Sistem akan melengkapi saklar fitur yang hilang dengan status default (tidak mengubah yang sudah ada).',
        impact: 'Tidak ada data HRD yang diubah. Status fitur yang sudah diatur sebelumnya tidak akan disentuh.',
      });
      if (!dryRun) {
        const patch: Record<string, unknown> = {};
        for (const key of missingFeatureKeys) {
          patch[key] = { ...FEATURE_DEFAULTS[key], updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedByUid: auth.uid, updatedByName: auth.name };
        }
        fixes.push({ ref: featuresRef, data: patch });
      }
    }

    // 2. system_settings/session_security
    totalChecked++;
    const sessionRef = db.collection('system_settings').doc('session_security');
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      issues.push({
        id: 'system_settings/session_security',
        entityName: 'Session Teknis',
        issueType: 'Dokumen belum ada',
        currentValue: 'Kosong',
        masterValue: 'idleTimeoutMinutes: 15, warningBeforeLogoutMinutes: 2',
        sourceCollection: 'Konfigurasi default sistem',
        targetCollection: 'system_settings/session_security',
        title: 'Config Session Teknis belum ada',
        explanation: 'Sistem menemukan pengaturan sesi (session security) belum tersedia di database.',
        action: 'Sistem akan membuat pengaturan sesi dengan nilai default (idle timeout 15 menit).',
        impact: 'Tidak ada data HRD yang diubah. Ini hanya melengkapi pengaturan teknis waktu sesi login.',
      });
      if (!dryRun) {
        fixes.push({
          ref: sessionRef,
          data: { idleTimeoutMinutes: 15, warningBeforeLogoutMinutes: 2, autoLogoutEnabled: true, crossTabLogoutEnabled: true, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        });
      }
    }

    // 3. system_settings/backup_export
    totalChecked++;
    const backupRef = db.collection('system_settings').doc('backup_export');
    const backupSnap = await backupRef.get();
    if (!backupSnap.exists) {
      issues.push({
        id: 'system_settings/backup_export',
        entityName: 'Backup & Export Config',
        issueType: 'Dokumen belum ada',
        currentValue: 'Kosong',
        masterValue: 'Dokumen kosong (siap dipakai)',
        sourceCollection: 'Konfigurasi default sistem',
        targetCollection: 'system_settings/backup_export',
        title: 'Config Backup & Export belum ada',
        explanation: 'Sistem menemukan pengaturan Backup & Export belum tersedia di database.',
        action: 'Sistem akan membuat pengaturan ini dalam keadaan kosong agar Backup & Export tidak error.',
        impact: 'Tidak ada data HRD yang diubah. Ini hanya menyiapkan config agar fitur Backup & Export siap dipakai.',
      });
      if (!dryRun) {
        fixes.push({ ref: backupRef, data: { createdAt: admin.firestore.FieldValue.serverTimestamp() } });
      }
    }

    // 4. system_maintenance/global
    totalChecked++;
    const maintenanceRef = db.collection('system_maintenance').doc('global');
    const maintenanceSnap = await maintenanceRef.get();
    if (!maintenanceSnap.exists) {
      issues.push({
        id: 'system_maintenance/global',
        entityName: 'Maintenance Global',
        issueType: 'Dokumen belum ada',
        currentValue: 'Kosong',
        masterValue: 'Nonaktif (struktur lengkap)',
        sourceCollection: 'Maintenance Control skeleton',
        targetCollection: 'system_maintenance/global',
        title: 'Config Maintenance Global belum ada',
        explanation: 'Sistem menemukan pengaturan Maintenance Control tingkat global belum tersedia di database.',
        action: 'Sistem akan membuat config ini dalam keadaan NONAKTIF (tidak mengunci siapa pun).',
        impact: 'Tidak ada user yang akan dikunci otomatis. Config hanya disiapkan agar Maintenance Control siap digunakan.',
      });
      if (!dryRun) {
        fixes.push({
          ref: maintenanceRef,
          data: {
            targetType: 'global', targetKey: 'global', enabled: false, status: 'completed',
            title: '', message: '', allowSuperAdminBypass: true, allowedUserIds: [], autoUnlock: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedByUid: auth.uid, updatedByName: auth.name,
          },
        });
      }
    }

    if (!dryRun && fixes.length > 0) {
      const batch = db.batch();
      for (const fix of fixes) batch.set(fix.ref, fix.data, { merge: true });
      await batch.commit();
      const fixedPaths = new Set(fixes.map((f) => f.ref.path));
      for (const issue of issues) {
        if (fixedPaths.has(issue.id)) issue.resultMessage = `${issue.entityName} berhasil diperbaiki.`;
      }
    }
  } catch (err: any) {
    errors.push(err?.message ?? 'Unknown error');
  }

  const finishedAt = new Date();
  const result = {
    syncType: 'repair-technical-config' as const,
    dryRun,
    status: (errors.length > 0 ? 'failed' : 'completed') as 'completed' | 'failed',
    totalChecked,
    totalIssues: issues.length,
    totalFixed: dryRun ? 0 : fixes.length,
    sourceCollection: 'Konfigurasi default sistem',
    targetCollection: 'system_settings, system_maintenance',
    issues,
    errors,
    truncated: false,
  };

  await writeSyncLog(result, auth.uid, auth.name, startedAt, finishedAt).catch(() => {});

  return NextResponse.json({ success: true, ...result });
}
