import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, jsonError } from '@/lib/server/sync-helpers';
import { getStorageProviderConfig, resolveDriveClient, CATEGORY_LABEL, CATEGORY_USAGE, type StorageFileCategory } from '@/lib/server/storage-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BACKUP_STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export interface HealthIssue {
  id: string;
  title: string;
  explanation: string;
  impact: string;
  severity: 'warning' | 'critical';
}

/**
 * Pemeriksaan File Teknis — read-only, never deletes files.
 *
 * Two modes, both explicit/manual (never auto-run on page load):
 *  - ?scanId=xxx  -> "Lihat Detail" on a specific past scan. Reads the stored
 *    latestIssuesPreview embedded in that storage_scan_reports document, plus
 *    (only if requested) a simple single-where lookup of matching
 *    storage_file_index docs by scanId — no orderBy, no composite index.
 *  - no scanId    -> "Cek File Teknis" button: a few live, cheap checks
 *    (backup freshness from the latest scan report, Drive folder
 *    reachability). Still triggered only by explicit user action.
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) return jsonError(auth.error, auth.status);

  const db = admin.firestore();
  const scanId = req.nextUrl.searchParams.get('scanId');
  const category = req.nextUrl.searchParams.get('category');

  try {
    if (scanId) {
      const reportDoc = await db.collection('storage_scan_reports').doc(scanId).get();
      if (!reportDoc.exists) return jsonError('Hasil scan tidak ditemukan.', 404);
      const report = reportDoc.data()!;

      // Single/double equality where() on scanId (+ optional category) — no
      // orderBy, so no composite index is needed.
      let detailQuery: FirebaseFirestore.Query = db.collection('storage_file_index').where('scanId', '==', scanId);
      detailQuery = category && category !== 'orphan'
        ? detailQuery.where('category', '==', category)
        : detailQuery.where('referenced', '==', false);
      const detailSnap = await detailQuery.limit(200).get();

      const files = detailSnap.docs.map((d) => {
        const data = d.data();
        const fileCategory = (data.category as StorageFileCategory) ?? 'employee_documents';
        const name = String(data.path ?? '').split('/').pop()?.split(':').pop() ?? data.path;
        return {
          name,
          category: fileCategory,
          categoryLabel: CATEGORY_LABEL[fileCategory] ?? fileCategory,
          provider: data.provider,
          path: data.path,
          usedFor: CATEGORY_USAGE[fileCategory] ?? '-',
          linkedTo: data.linkedTo ?? null,
          size: data.size ?? 0,
          uploadedAt: data.uploadedAt ?? null,
          referenced: data.referenced,
          note: data.referenceNote,
        };
      });

      const issues: HealthIssue[] = [];
      const orphanFilesCount = report.orphanFilesCount ?? report.orphanCount ?? 0;
      if (orphanFilesCount > 0) {
        issues.push({
          id: 'orphan_files',
          title: `${orphanFilesCount} file tidak terhubung ditemukan`,
          explanation: 'File ada di storage, tetapi tidak ditemukan relasinya dengan data sistem.',
          impact: 'Tidak ada data HRD yang diubah. File ini hanya ditandai untuk ditinjau manual — belum dihapus otomatis.',
          severity: 'warning',
        });
      }

      return NextResponse.json({
        success: true,
        readOnly: true,
        scanId,
        finishedAt: report.finishedAt ?? null,
        totalIssues: issues.length,
        issues,
        files,
        checkedAt: new Date().toISOString(),
      });
    }

    // "Cek File Teknis" — a few cheap, explicit live checks, never composite queries.
    const issues: HealthIssue[] = [];

    const latestReportSnap = await db.collection('storage_scan_reports').orderBy('finishedAt', 'desc').limit(1).get();
    const latestReport = latestReportSnap.docs[0]?.data();
    const latestBackupCategory = latestReport?.categories?.find((c: any) => c.key === 'backup_export');
    if (latestReport?.finishedAt?.toMillis && Date.now() - latestReport.finishedAt.toMillis() > BACKUP_STALE_AFTER_MS) {
      issues.push({
        id: 'stale_scan',
        title: 'Hasil scan storage sudah lama',
        explanation: 'Scan storage terakhir sudah lebih dari 14 hari. Data yang ditampilkan mungkin sudah tidak sesuai kondisi terbaru.',
        impact: 'Tidak ada data HRD yang diubah. Disarankan klik Sinkronkan Storage untuk memperbarui data.',
        severity: 'warning',
      });
    }
    if (!latestBackupCategory || latestBackupCategory.count === 0) {
      issues.push({
        id: 'no_backup_found',
        title: 'Tidak ada file backup ditemukan dalam scan terakhir',
        explanation: 'Sistem tidak menemukan file kategori Backup & Export pada hasil scan terakhir.',
        impact: 'Tidak ada data HRD yang diubah. Disarankan menjalankan Backup & Export secara manual untuk memastikan data aman.',
        severity: 'warning',
      });
    }

    try {
      const providerConfig = await getStorageProviderConfig(db);
      if (providerConfig.googleDrive.folderId) {
        const { drive } = await resolveDriveClient(db);
        await drive.files.get({ fileId: providerConfig.googleDrive.folderId, fields: 'id, name', supportsAllDrives: true });
      }
    } catch (err: any) {
      issues.push({
        id: 'drive_folder_unreachable',
        title: 'Folder Google Drive tidak bisa diakses',
        explanation: `Sistem gagal membuka folder Google Drive yang dikonfigurasi. Detail: ${err?.message ?? 'tidak diketahui'}.`,
        impact: 'Tidak ada data HRD yang diubah. Ini memengaruhi backup/upload ke Google Drive sampai akses folder diperbaiki.',
        severity: 'critical',
      });
    }

    return NextResponse.json({
      success: true,
      readOnly: true,
      scanId: latestReportSnap.docs[0]?.id ?? null,
      totalIssues: issues.length,
      issues,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return jsonError(err?.message ?? 'Gagal menjalankan pemeriksaan file teknis.', 500);
  }
}
