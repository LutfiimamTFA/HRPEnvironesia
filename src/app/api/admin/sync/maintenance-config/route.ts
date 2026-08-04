import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, writeSyncLog, jsonError, type SyncIssue } from '@/lib/server/sync-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAINTAINABLE_ROLES = ['karyawan', 'hrd', 'kandidat', 'manager'];
const ROLE_LABEL: Record<string, string> = { karyawan: 'Karyawan', hrd: 'HRD', kandidat: 'Kandidat', manager: 'Manager' };

const REQUIRED_FIELDS = ['targetType', 'targetKey', 'enabled', 'status', 'allowSuperAdminBypass', 'allowedUserIds'];

/**
 * Sync Maintenance Config — checks that system_maintenance/global and every
 * system_maintenance/role_{role} doc has the required technical fields
 * (targetType, targetKey, enabled, status, allowSuperAdminBypass,
 * allowedUserIds). A missing document is created DISABLED (enabled:false,
 * status:'completed') — it never turns maintenance ON, it only makes sure the
 * document skeleton exists so Maintenance Control doesn't error out.
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

  const targets = [
    { docId: 'global', targetType: 'global', targetKey: 'global', label: 'Global' },
    ...MAINTAINABLE_ROLES.map((role) => ({ docId: `role_${role}`, targetType: 'role', targetKey: role, label: ROLE_LABEL[role] })),
  ];

  try {
    for (const target of targets) {
      totalChecked++;
      const ref = db.collection('system_maintenance').doc(target.docId);
      const snap = await ref.get();
      const data = snap.exists ? snap.data() ?? {} : {};
      const missingFields = REQUIRED_FIELDS.filter((f) => data[f] === undefined);

      if (!snap.exists || missingFields.length > 0) {
        issues.push({
          id: target.docId,
          entityName: `Maintenance ${target.label}`,
          issueType: snap.exists ? 'Struktur field tidak lengkap' : 'Dokumen belum ada',
          currentValue: snap.exists ? `Kurang: ${missingFields.join(', ')}` : 'Kosong',
          masterValue: 'Struktur field lengkap (nonaktif)',
          sourceCollection: 'Maintenance Control skeleton',
          targetCollection: 'system_maintenance',
          title: `Config Maintenance ${target.label} belum lengkap`,
          explanation: `Sistem menemukan pengaturan Maintenance ${target.label} belum lengkap. Jika dibiarkan, Maintenance Control bisa tidak berjalan konsisten.`,
          action: `Sistem akan melengkapi struktur config Maintenance ${target.label} dengan nilai default aman.`,
          impact: 'Tidak ada user yang akan dikunci otomatis. Config hanya disiapkan agar fitur Maintenance Control siap digunakan.',
        });
        if (!dryRun) {
          fixes.push({
            ref,
            data: {
              targetType: data.targetType ?? target.targetType,
              targetKey: data.targetKey ?? target.targetKey,
              enabled: data.enabled ?? false,
              status: data.status ?? 'completed',
              title: data.title ?? '',
              message: data.message ?? '',
              allowSuperAdminBypass: data.allowSuperAdminBypass ?? true,
              allowedUserIds: data.allowedUserIds ?? [],
              autoUnlock: data.autoUnlock ?? false,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedByUid: auth.uid,
              updatedByName: auth.name,
            },
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
          issue.resultMessage = `Struktur dokumen system_maintenance/${issue.id} berhasil dilengkapi (tetap nonaktif).`;
        }
      }
    }
  } catch (err: any) {
    errors.push(err?.message ?? 'Unknown error');
  }

  const finishedAt = new Date();
  const result = {
    syncType: 'maintenance-config' as const,
    dryRun,
    status: (errors.length > 0 ? 'failed' : 'completed') as 'completed' | 'failed',
    totalChecked,
    totalIssues: issues.length,
    totalFixed: dryRun ? 0 : fixes.length,
    sourceCollection: 'Maintenance Control skeleton',
    targetCollection: 'system_maintenance',
    issues,
    errors,
    truncated: false,
  };

  await writeSyncLog(result, auth.uid, auth.name, startedAt, finishedAt).catch(() => {});

  return NextResponse.json({ success: true, ...result });
}
