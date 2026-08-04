import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, jsonError } from '@/lib/server/sync-helpers';
import { getStorageProviderConfig } from '@/lib/server/storage-admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Storage Overview — NOT realtime. Reads the single latest document from
 * storage_scan_reports (orderBy("finishedAt","desc").limit(1), single-field
 * orderBy only, so no composite index is needed) instead of aggregating over
 * the full storage_file_index collection. Data only changes when Super Admin
 * clicks "Sinkronkan Storage" (POST /api/admin/storage/scan).
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) return jsonError(auth.error, auth.status);

  const db = admin.firestore();

  try {
    const [providerConfig, reportSnap] = await Promise.all([
      getStorageProviderConfig(db),
      db.collection('storage_scan_reports').orderBy('finishedAt', 'desc').limit(1).get(),
    ]);

    const activeProviderConfig = providerConfig.activeProvider === 'google_drive' ? providerConfig.googleDrive : providerConfig.firebaseStorage;
    const connectionStatus = activeProviderConfig.status;
    const lastConnectionTestAt = activeProviderConfig.lastTestedAt ?? null;
    const activeProviderLabel = providerConfig.activeProvider === 'google_drive' ? 'Google Drive' : 'Firebase Storage';

    // Specific, unambiguous status text — never a generic "Terhubung" that
    // doesn't say which provider it refers to.
    const connectionStatusText = connectionStatus === 'connected'
      ? `${activeProviderLabel} Terhubung`
      : connectionStatus === 'error'
        ? 'Provider Aktif Error'
        : providerConfig.activeProvider === 'google_drive' && connectionStatus === 'not_connected'
          ? 'Google Drive Belum Dihubungkan'
          : 'Provider Aktif Belum Dites';

    const reportDoc = reportSnap.docs[0];
    if (!reportDoc) {
      return NextResponse.json({
        success: true,
        scanned: false,
        activeProvider: providerConfig.activeProvider,
        activeProviderLabel,
        connectionStatus,
        connectionStatusText,
        lastConnectionTestAt,
      });
    }

    const report = reportDoc.data();
    const orphanFilesCount = report.orphanFilesCount ?? report.orphanCount ?? 0;
    const storageStatus = orphanFilesCount > 0 ? 'perlu_perhatian' : 'sehat';

    return NextResponse.json({
      success: true,
      scanned: true,
      scanId: reportDoc.id,
      activeProvider: providerConfig.activeProvider,
      activeProviderLabel,
      connectionStatus,
      connectionStatusText,
      lastConnectionTestAt,
      totalFiles: report.totalFiles ?? report.totalScanned ?? 0,
      totalSizeBytes: report.totalSizeBytes ?? 0,
      orphanFilesCount,
      issuesCount: report.issuesCount ?? 0,
      categories: report.categories ?? [],
      latestIssuesPreview: report.latestIssuesPreview ?? [],
      storageStatus,
      lastSyncedAt: report.finishedAt ?? null,
      syncedByName: report.executedByName ?? null,
      providersScanned: report.providersScanned ?? [],
      lastScanStatus: report.status ?? null,
      truncated: report.truncated ?? false,
      errors: report.errors ?? [],
    });
  } catch (err: any) {
    return jsonError(err?.message ?? 'Gagal memuat ringkasan storage.', 500);
  }
}
