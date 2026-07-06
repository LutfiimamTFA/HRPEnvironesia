import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, writeSyncLog, jsonError, type SyncIssue } from '@/lib/server/sync-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MENU_ROLES = ['super-admin', 'hrd', 'manager', 'karyawan', 'kandidat'];
const ROLE_LABEL: Record<string, string> = {
  'super-admin': 'Super Admin', hrd: 'HRD', manager: 'Manager', karyawan: 'Karyawan', kandidat: 'Kandidat',
};

/**
 * Sync Menu Settings — checks that navigation_settings/{role} (Access & Roles)
 * exists and has a well-formed visibleMenuItems array for every role, so the
 * sidebar reads correctly. REPORT-ONLY: which menu items should be visible is
 * an access-control decision for Super Admin to make via the Access & Roles
 * page itself, not something this sync should guess and auto-fill.
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

  try {
    for (const role of MENU_ROLES) {
      totalChecked++;
      const doc = await db.collection('navigation_settings').doc(role).get();
      const label = ROLE_LABEL[role] ?? role;

      if (!doc.exists) {
        issues.push({
          id: role,
          entityName: label,
          issueType: 'Konfigurasi menu belum ada',
          currentValue: 'Kosong',
          masterValue: 'Menu default sistem',
          sourceCollection: 'menu-config (default sistem)',
          targetCollection: 'navigation_settings',
          title: `Config menu sidebar "${label}" belum dikonfigurasi`,
          explanation: `Sidebar role "${label}" masih memakai menu default bawaan sistem karena belum diatur lewat Access & Roles. Ini bukan error, hanya belum dikustomisasi.`,
          action: `Perlu diatur manual lewat menu Access & Roles — sync ini tidak menebak menu mana yang seharusnya tampil.`,
          impact: 'Tidak ada data HRD yang diubah. Sidebar tetap berfungsi memakai menu default sampai diatur manual.',
        });
        continue;
      }

      const visibleMenuItems = doc.data()?.visibleMenuItems;
      if (!Array.isArray(visibleMenuItems)) {
        issues.push({
          id: role,
          entityName: label,
          issueType: 'Struktur menu tidak valid',
          currentValue: typeof visibleMenuItems,
          masterValue: 'Daftar menu (array)',
          sourceCollection: 'navigation_settings',
          targetCollection: 'navigation_settings',
          title: `Config menu sidebar "${label}" rusak`,
          explanation: `Pengaturan menu untuk role "${label}" tersimpan dengan format yang tidak sesuai, sehingga sidebar berisiko tidak tampil dengan benar.`,
          action: `Perlu diperbaiki manual lewat menu Access & Roles — sync ini tidak mengubah struktur menu secara otomatis.`,
          impact: 'Tidak ada data HRD yang diubah. Ini hanya mempengaruhi tampilan menu/sidebar.',
        });
      }
    }
  } catch (err: any) {
    errors.push(err?.message ?? 'Unknown error');
  }

  const finishedAt = new Date();
  const result = {
    syncType: 'menu-settings' as const,
    dryRun,
    status: (errors.length > 0 ? 'failed' : 'completed') as 'completed' | 'failed',
    totalChecked,
    totalIssues: issues.length,
    totalFixed: 0,
    sourceCollection: 'menu-config',
    targetCollection: 'navigation_settings',
    issues,
    errors,
    truncated: false,
  };

  await writeSyncLog(result, auth.uid, auth.name, startedAt, finishedAt).catch(() => {});

  return NextResponse.json({ success: true, ...result, note: 'Konfigurasi menu tidak diperbaiki otomatis — atur lewat menu Access & Roles.' });
}
