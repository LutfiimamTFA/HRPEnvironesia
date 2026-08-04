import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { verifySuperAdmin, jsonError } from '@/lib/server/sync-helpers';
import {
  getFirebaseBucket, resolveDriveClient, getStorageProviderConfig,
  categorizeStoragePath, checkFileStillOwned, STORAGE_SCAN_LIMIT,
  CATEGORY_LABEL, type StorageFileCategory,
} from '@/lib/server/storage-admin';

export const runtime = 'nodejs';
export const maxDuration = 180;

function safeDocId(path: string) {
  return Buffer.from(path).toString('base64url').slice(0, 400);
}

interface IndexedFile {
  path: string;
  provider: 'firebase_storage' | 'google_drive';
  size: number;
  contentType: string | null;
  category: StorageFileCategory;
  uploadedAtMs: number | null;
  referenced: boolean;
  referenceNote: string;
  linkedTo: string | null;
}

/**
 * Scan Storage — read-only inventory of the ACTIVE provider only (only one
 * provider may be active at a time; the inactive one is never scanned so it
 * never looks like "both are in use"). Capped at STORAGE_SCAN_LIMIT (400)
 * files per run to protect Firestore/API quota. Writes results to
 * storage_file_index (upsert) and a summary to storage_scan_reports. This
 * NEVER deletes anything — File Health Check is read-only for this first
 * release.
 */
export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) return jsonError(auth.error, auth.status);

  const db = admin.firestore();
  const startedAt = new Date();
  const errors: string[] = [];
  const files: IndexedFile[] = [];
  const providerConfig = await getStorageProviderConfig(db);
  const activeProvider = providerConfig.activeProvider;

  try {
    if (activeProvider === 'firebase_storage') {
      try {
        const bucket = getFirebaseBucket();
        const [storageFiles] = await bucket.getFiles({ maxResults: STORAGE_SCAN_LIMIT });
        for (const file of storageFiles) {
          const category = categorizeStoragePath(file.name);
          const { referenced, note, linkedTo } = await checkFileStillOwned(db, category, file.name);
          files.push({
            path: file.name,
            provider: 'firebase_storage',
            size: Number(file.metadata.size ?? 0),
            contentType: file.metadata.contentType ?? null,
            category,
            uploadedAtMs: file.metadata.timeCreated ? new Date(file.metadata.timeCreated).getTime() : null,
            referenced,
            referenceNote: note,
            linkedTo,
          });
        }
      } catch (err: any) {
        errors.push(`Firebase Storage: ${err?.message ?? 'gagal memindai'}`);
      }
    } else {
      // Google Drive inventory (root folder only, non-recursive, best-effort)
      try {
        const folderId = providerConfig.googleDrive.folderId;
        if (folderId) {
          const { drive } = await resolveDriveClient(db);
          const res = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, size, mimeType, createdTime, parents)',
            pageSize: Math.min(STORAGE_SCAN_LIMIT, 1000),
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          });
          for (const file of res.data.files ?? []) {
            const path = `drive/${file.name ?? file.id}`;
            const category = categorizeStoragePath(path);
            const { referenced, note, linkedTo } = await checkFileStillOwned(db, category, path);
            files.push({
              path: `${file.id}:${file.name ?? ''}`,
              provider: 'google_drive',
              size: Number(file.size ?? 0),
              contentType: file.mimeType ?? null,
              category,
              uploadedAtMs: file.createdTime ? new Date(file.createdTime).getTime() : null,
              referenced,
              referenceNote: note,
              linkedTo,
            });
          }
        }
      } catch (err: any) {
        errors.push(`Google Drive: ${err?.message ?? 'gagal memindai'}`);
      }
    }

    // Duplicate detection (best-effort, within this scan batch only): same
    // provider + same size + same file name base flagged as possible duplicate.
    const seen = new Map<string, number>();
    for (const f of files) {
      const baseName = f.path.split('/').pop() ?? f.path;
      const key = `${f.provider}:${baseName}:${f.size}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    // Upsert into storage_file_index
    const CHUNK = 400;
    for (let i = 0; i < files.length; i += CHUNK) {
      const batch = db.batch();
      for (const f of files.slice(i, i + CHUNK)) {
        const baseName = f.path.split('/').pop() ?? f.path;
        const key = `${f.provider}:${baseName}:${f.size}`;
        const isDuplicate = (seen.get(key) ?? 0) > 1;
        const ref = db.collection('storage_file_index').doc(safeDocId(`${f.provider}:${f.path}`));
        batch.set(ref, {
          path: f.path,
          provider: f.provider,
          size: f.size,
          contentType: f.contentType,
          category: f.category,
          uploadedAt: f.uploadedAtMs ? admin.firestore.Timestamp.fromMillis(f.uploadedAtMs) : null,
          referenced: f.referenced,
          referenceNote: f.referenceNote,
          linkedTo: f.linkedTo,
          isDuplicate,
          scannedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await batch.commit();
    }

    const categoryBreakdown: Record<string, { count: number; size: number }> = {};
    for (const f of files) {
      categoryBreakdown[f.category] ??= { count: 0, size: 0 };
      categoryBreakdown[f.category].count++;
      categoryBreakdown[f.category].size += f.size;
    }

    const orphanFiles = files.filter((f) => !f.referenced);
    const orphanFilesCount = orphanFiles.length;
    const duplicateFiles = files.filter((f) => (seen.get(`${f.provider}:${f.path.split('/').pop()}:${f.size}`) ?? 0) > 1);
    const duplicateCount = duplicateFiles.length;
    const issuesCount = orphanFilesCount + duplicateCount + errors.length;
    const totalSizeBytes = files.reduce((sum, f) => sum + f.size, 0);

    // Concise, embedded preview so the page never needs to run a composite
    // query against storage_file_index for "what are the issues" detail.
    const latestIssuesPreview = [
      ...orphanFiles.slice(0, 10).map((f) => ({
        type: 'file_tidak_terhubung' as const,
        path: f.path,
        provider: f.provider,
        category: f.category,
        note: f.referenceNote,
      })),
      ...duplicateFiles.slice(0, 10).map((f) => ({
        type: 'kemungkinan_duplikat' as const,
        path: f.path,
        provider: f.provider,
        category: f.category,
        note: 'Nama dan ukuran file sama dengan file lain dalam hasil scan ini.',
      })),
    ].slice(0, 20);

    // Only the active provider is ever scanned — never both at once.
    const providersScanned: string[] = [activeProvider];

    const finishedAt = new Date();
    const status: 'berhasil' | 'sebagian_gagal' = errors.length > 0 ? 'sebagian_gagal' : 'berhasil';
    const report = {
      // New denormalized shape (required by Storage Management page — avoids
      // any further composite-index queries against storage_file_index).
      totalFiles: files.length,
      totalSizeBytes,
      orphanFilesCount,
      issuesCount,
      categories: Object.entries(categoryBreakdown).map(([key, v]) => ({ key, label: CATEGORY_LABEL[key as StorageFileCategory] ?? key, ...v })),
      latestIssuesPreview,
      // Supporting fields for the UI's "Terakhir Disinkronkan / Disinkronkan Oleh / Provider yang discan / Status scan terakhir".
      status,
      providersScanned,
      errors,
      truncated: files.length >= STORAGE_SCAN_LIMIT,
      startedAt: admin.firestore.Timestamp.fromDate(startedAt),
      finishedAt: admin.firestore.Timestamp.fromDate(finishedAt),
      executedByUid: auth.uid,
      executedByName: auth.name,
      // Kept for backward compatibility with any older readers.
      totalScanned: files.length,
      orphanCount: orphanFilesCount,
      duplicateCount,
    };

    const reportRef = await db.collection('storage_scan_reports').add(report);

    // Tag the file-index docs with the scanId so a later "Lihat Detail" call
    // can filter with a single simple where() — no orderBy, no composite index.
    for (let i = 0; i < files.length; i += 400) {
      const batch = db.batch();
      for (const f of files.slice(i, i + 400)) {
        const ref = db.collection('storage_file_index').doc(safeDocId(`${f.provider}:${f.path}`));
        batch.set(ref, { scanId: reportRef.id }, { merge: true });
      }
      await batch.commit();
    }

    return NextResponse.json({ success: true, reportId: reportRef.id, ...report });
  } catch (err: any) {
    return jsonError(err?.message ?? 'Scan storage gagal dijalankan.', 500);
  }
}
