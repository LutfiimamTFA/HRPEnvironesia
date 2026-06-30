import * as admin from 'firebase-admin';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { Timestamp } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';
import { buildCsv, buildSheet, serializeValue, sheetName } from './helpers';

// ── Types ─────────────────────────────────────────────────────────────────────
export type BackupType = 'scheduled_daily' | 'scheduled_weekly' | 'scheduled_monthly';
export type BackupFormat = 'json' | 'csv' | 'xlsx';

export interface BackupSettings {
  autoBackupEnabled: boolean;
  dailyBackupEnabled: boolean;
  weeklyBackupEnabled: boolean;
  monthlyBackupEnabled: boolean;
  backupFormats: BackupFormat[];
  retentionDays: number;
  googleDriveBackupFolderId: string;
}

// ── Category map ──────────────────────────────────────────────────────────────
const BACKUP_CATEGORIES: Array<{ folder: string; collections: string[] }> = [
  { folder: 'karyawan_user',    collections: ['users', 'employee_profiles', 'employee_invites'] },
  { folder: 'organisasi_master', collections: ['brands', 'divisions', 'departments', 'positions', 'organization_structure', 'direct_managers', 'master_data'] },
  { folder: 'absensi_payroll',  collections: ['attendance_records', 'attendance_sessions', 'attendance_settings', 'attendance_corrections', 'payroll_periods', 'payroll_reports', 'payroll_snapshots'] },
  { folder: 'izin_cuti',        collections: ['permission_requests', 'leave_requests', 'leave_balances', 'company_holidays'] },
  { folder: 'lembur',           collections: ['overtime_submissions', 'overtime_payroll_recaps', 'approval_requests'] },
  { folder: 'perjalanan_dinas', collections: ['business_trips', 'business_trip_reports', 'travel_orders', 'travel_tracking'] },
  { folder: 'rekrutmen',        collections: ['job_postings', 'applications', 'candidates', 'assessments', 'interviews', 'offerings', 'candidate_documents'] },
  { folder: 'sistem_keamanan',  collections: ['system_settings', 'menu_visibility', 'access_roles', 'audit_logs', 'session_logs', 'export_logs', 'backup_logs'] },
  { folder: 'file_metadata',    collections: ['drive_files', 'uploaded_documents', 'attachments'] },
];
const TOTAL_COLLECTIONS = BACKUP_CATEGORIES.reduce((s, c) => s + c.collections.length, 0);

// ── Drive helpers ─────────────────────────────────────────────────────────────
function buildDriveClient(clientEmail: string, privateKey: string): drive_v3.Drive {
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

async function getOrCreateFolder(drive: drive_v3.Drive, parentId: string, name: string): Promise<string> {
  const q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parentId}' in parents and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive', supportsAllDrives: true, includeItemsFromAllDrives: true });
  if (res.data.files?.length) return res.data.files[0].id!;
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id!;
}

type UploadResult = { fileId: string; webViewLink: string; size: number };

async function uploadBuffer(drive: drive_v3.Drive, folderId: string, fileName: string, buffer: Buffer, mimeType: string): Promise<UploadResult> {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  const res = await drive.files.create({
    requestBody: { name: fileName, mimeType, parents: [folderId] },
    media: { mimeType, body: stream },
    fields: 'id, webViewLink, size',
    supportsAllDrives: true,
  });
  return { fileId: res.data.id!, webViewLink: res.data.webViewLink ?? '', size: Number(res.data.size ?? 0) };
}

async function getFolderLink(drive: drive_v3.Drive, folderId: string): Promise<string> {
  try {
    const res = await drive.files.get({ fileId: folderId, fields: 'webViewLink', supportsAllDrives: true });
    return res.data.webViewLink ?? '';
  } catch { return `https://drive.google.com/drive/folders/${folderId}`; }
}

// ── Firestore read ────────────────────────────────────────────────────────────
type ColData = { docs: Record<string, unknown>[]; status: 'ok' | 'empty' | 'not_found' | 'error'; error?: string };

async function readCollection(colName: string): Promise<ColData> {
  try {
    const snap = await admin.firestore().collection(colName).get();
    if (snap.empty) return { docs: [], status: 'empty' };
    return {
      docs: snap.docs.map(d => ({ _id: d.id, _path: `${colName}/${d.id}`, ...(serializeValue(d.data()) as Record<string, unknown>) })),
      status: 'ok',
    };
  } catch (err: any) {
    if (err.code === 5 || String(err.message).includes('NOT_FOUND')) return { docs: [], status: 'not_found' };
    return { docs: [], status: 'error', error: err.message };
  }
}

// ── Load settings ─────────────────────────────────────────────────────────────
export async function loadBackupSettings(): Promise<BackupSettings> {
  try {
    const snap = await admin.firestore().collection('system_settings').doc('backup_export').get();
    const defaults: BackupSettings = {
      autoBackupEnabled: true, dailyBackupEnabled: true, weeklyBackupEnabled: true, monthlyBackupEnabled: true,
      backupFormats: ['json', 'csv', 'xlsx'], retentionDays: 90,
      googleDriveBackupFolderId: process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID ?? '',
    };
    return snap.exists ? { ...defaults, ...(snap.data() as Partial<BackupSettings>) } : defaults;
  } catch {
    return {
      autoBackupEnabled: true, dailyBackupEnabled: true, weeklyBackupEnabled: true, monthlyBackupEnabled: true,
      backupFormats: ['json', 'csv', 'xlsx'], retentionDays: 90,
      googleDriveBackupFolderId: process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID ?? '',
    };
  }
}

// ── Summary XLSX ──────────────────────────────────────────────────────────────
function buildSummaryXlsx(params: { backupId: string; backupType: string; startedAt: Date; finishedAt: Date; status: string; totalCollections: number; totalDocuments: number; totalFiles: number; formats: string[]; categories: Record<string, any>; errors: string[] }): Buffer {
  const wb = XLSX.utils.book_new();
  const s1 = XLSX.utils.aoa_to_sheet([
    ['Field', 'Value'],
    ['Backup ID', params.backupId],
    ['Tipe', params.backupType],
    ['Mulai', params.startedAt.toISOString()],
    ['Selesai', params.finishedAt.toISOString()],
    ['Durasi (detik)', Math.round((params.finishedAt.getTime() - params.startedAt.getTime()) / 1000)],
    ['Status', params.status],
    ['Total Collection', params.totalCollections],
    ['Total Dokumen', params.totalDocuments],
    ['Total File', params.totalFiles],
    ['Format', params.formats.join(', ')],
    ['Error', params.errors.length],
  ]);
  s1['!cols'] = [{ wch: 20 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, s1, 'Ringkasan');

  const catRows: any[][] = [['Kategori', 'Folder Drive', 'Collection', 'Dokumen']];
  for (const [cat, data] of Object.entries(params.categories)) {
    const cols = Object.entries(data.collections ?? {}) as [string, any][];
    const docs = cols.reduce((s: number, [, c]) => s + (c.docCount ?? 0), 0);
    catRows.push([cat, data.folderLink ?? '', cols.length, docs]);
  }
  const s2 = XLSX.utils.aoa_to_sheet(catRows);
  s2['!cols'] = [{ wch: 24 }, { wch: 60 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, s2, 'Kategori');

  const colRows: any[][] = [['Kategori', 'Collection', 'Status', 'Dokumen', 'Format', 'Error']];
  for (const [cat, data] of Object.entries(params.categories)) {
    for (const [col, c] of Object.entries(data.collections ?? {}) as [string, any][]) {
      colRows.push([cat, col, (c as any).status ?? '', (c as any).docCount ?? 0, ((c as any).formatsGenerated ?? []).join(', '), (c as any).error ?? '']);
    }
  }
  const s3 = XLSX.utils.aoa_to_sheet(colRows);
  s3['!cols'] = [{ wch: 24 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, s3, 'Detail Collection');

  if (params.errors.length) {
    const s4 = XLSX.utils.aoa_to_sheet([['#', 'Error'], ...params.errors.map((e, i) => [i + 1, e])]);
    s4['!cols'] = [{ wch: 6 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, s4, 'Errors');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}

// ── Main backup function ──────────────────────────────────────────────────────
export async function runBackup(opts: {
  backupType: BackupType;
  reason: string;
  formats: BackupFormat[];
  backupRootId: string;
  clientEmail: string;
  privateKey: string;
}): Promise<{ success: boolean; backupId: string; status: string; totalDocuments: number; totalFiles: number; errors: string[]; folderLink: string; manifestLink: string; summaryLink: string }> {
  const { backupType, reason, formats, backupRootId, clientEmail, privateKey } = opts;
  const doJson = formats.includes('json');
  const doCsv  = formats.includes('csv');
  const doXlsx = formats.includes('xlsx');

  const startedAt = new Date();
  const backupId = `backup_${Date.now()}_sched`;
  const year  = String(startedAt.getFullYear());
  const month = String(startedAt.getMonth() + 1).padStart(2, '0');
  const day   = String(startedAt.getDate()).padStart(2, '0');

  const drive = buildDriveClient(clientEmail, privateKey);

  // Folder: Root/YYYY/MM/DD/{daily|weekly|monthly}
  const typeLabel = backupType.replace('scheduled_', '');
  const yearId  = await getOrCreateFolder(drive, backupRootId, year);
  const monthId = await getOrCreateFolder(drive, yearId, month);
  const dayId   = await getOrCreateFolder(drive, monthId, day);
  const targetId = await getOrCreateFolder(drive, dayId, typeLabel);
  const folderLink = await getFolderLink(drive, targetId);

  let totalDocuments = 0, totalJsonFiles = 0, totalCsvFiles = 0, totalXlsxFiles = 0;
  const errors: string[] = [];

  type FileEntry = { format: string; fileName: string; fileId: string; webViewLink: string; size: number };
  type ColManifest = { status: string; docCount: number; formatsGenerated: string[]; files: FileEntry[]; error?: string };
  type CatManifest = { folderId: string; folderLink: string; excelFile?: FileEntry; collections: Record<string, ColManifest> };
  const manifestCategories: Record<string, CatManifest> = {};

  for (const category of BACKUP_CATEGORIES) {
    let catFolderId: string;
    let catFolderLink = '';
    try {
      catFolderId  = await getOrCreateFolder(drive, targetId, category.folder);
      catFolderLink = await getFolderLink(drive, catFolderId);
    } catch (err: any) {
      errors.push(`Folder ${category.folder}: ${err.message}`);
      continue;
    }

    const catCols: Record<string, ColManifest> = {};
    const xlsxSheets: { name: string; docs: Record<string, unknown>[] }[] = [];

    for (const colName of category.collections) {
      const { docs, status, error } = await readCollection(colName);
      const col: ColManifest = { status, docCount: docs.length, formatsGenerated: [], files: [] };
      if (error) col.error = error;
      xlsxSheets.push({ name: sheetName(colName), docs });

      if (status === 'error') { catCols[colName] = col; errors.push(`Read ${colName}: ${error}`); continue; }
      totalDocuments += docs.length;

      if (doJson) {
        try {
          const up = await uploadBuffer(drive, catFolderId, `${colName}.json`, Buffer.from(JSON.stringify(docs, null, 2), 'utf-8'), 'application/json');
          col.formatsGenerated.push('json');
          col.files.push({ format: 'json', fileName: `${colName}.json`, ...up });
          totalJsonFiles++;
        } catch (err: any) { errors.push(`JSON ${colName}: ${err.message}`); }
      }

      if (doCsv) {
        try {
          const up = await uploadBuffer(drive, catFolderId, `${colName}.csv`, buildCsv(docs), 'text/csv');
          col.formatsGenerated.push('csv');
          col.files.push({ format: 'csv', fileName: `${colName}.csv`, ...up });
          totalCsvFiles++;
        } catch (err: any) { errors.push(`CSV ${colName}: ${err.message}`); }
      }

      catCols[colName] = col;
    }

    let excelFile: FileEntry | undefined;
    if (doXlsx) {
      try {
        const wb = XLSX.utils.book_new();
        for (const { name, docs } of xlsxSheets) XLSX.utils.book_append_sheet(wb, buildSheet(docs), name);
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
        const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const up = await uploadBuffer(drive, catFolderId, `${category.folder}.xlsx`, buf, mimeType);
        excelFile = { format: 'xlsx', fileName: `${category.folder}.xlsx`, ...up };
        totalXlsxFiles++;
        for (const col of Object.values(catCols)) col.formatsGenerated.push('xlsx');
      } catch (err: any) { errors.push(`XLSX ${category.folder}: ${err.message}`); }
    }

    manifestCategories[category.folder] = { folderId: catFolderId!, folderLink: catFolderLink, ...(excelFile ? { excelFile } : {}), collections: catCols };
  }

  const finishedAt = new Date();
  const totalFiles = totalJsonFiles + totalCsvFiles + totalXlsxFiles;
  const overallStatus = errors.length > 0 && totalFiles === 0 ? 'failed' : errors.length > 0 ? 'partial_success' : 'success';

  // Manifest JSON
  const manifest = {
    backupId, backupType, status: overallStatus,
    startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
    durationSeconds: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
    requestedByUid: 'system', requestedByName: 'Google Cloud Scheduler', reason, formats,
    googleDriveRootFolderId: backupRootId, googleDriveBackupFolderId: targetId,
    totalCollections: TOTAL_COLLECTIONS, totalDocuments, totalFiles, totalJsonFiles, totalCsvFiles, totalXlsxFiles,
    categories: manifestCategories, errors,
  };

  let manifestFileId = '', manifestLink = '', summaryFileId = '', summaryLink = '';

  try {
    const up = await uploadBuffer(drive, targetId, '00_manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'), 'application/json');
    manifestFileId = up.fileId; manifestLink = up.webViewLink;
  } catch (err: any) { errors.push(`manifest: ${err.message}`); }

  try {
    const summaryBuf = buildSummaryXlsx({ backupId, backupType, startedAt, finishedAt, status: overallStatus, totalCollections: TOTAL_COLLECTIONS, totalDocuments, totalFiles, formats, categories: manifestCategories, errors });
    const up = await uploadBuffer(drive, targetId, '00_ringkasan_backup.xlsx', summaryBuf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    summaryFileId = up.fileId; summaryLink = up.webViewLink;
  } catch (err: any) { errors.push(`summary: ${err.message}`); }

  // Write backup_logs
  await admin.firestore().collection('backup_logs').doc(backupId).set({
    backupId, backupType, status: overallStatus,
    startedAt: Timestamp.fromDate(startedAt), finishedAt: Timestamp.fromDate(finishedAt),
    durationSeconds: manifest.durationSeconds,
    requestedByUid: 'system', requestedByName: 'Google Cloud Scheduler', requestedByEmail: null,
    reason, frequency: typeLabel, formats,
    googleDriveRootFolderId: backupRootId, googleDriveBackupFolderId: targetId, googleDriveBackupFolderLink: folderLink,
    manifestFileId, manifestWebViewLink: manifestLink,
    summaryFileId, summaryWebViewLink: summaryLink,
    totalCollections: TOTAL_COLLECTIONS, totalDocuments, totalFiles, totalJsonFiles, totalCsvFiles, totalXlsxFiles,
    errors: errors.length ? errors : [],
    createdAt: Timestamp.fromDate(finishedAt),
  });

  // Write audit_logs
  try {
    await admin.firestore().collection('audit_logs').add({
      actorUid: 'system', actorName: 'Google Cloud Scheduler', actorEmail: null, actorRole: 'system',
      action: 'scheduled_backup', category: 'backup_export',
      targetType: 'system', targetName: 'HRP Scheduled Backup', reason,
      after: { backupId, backupType, status: overallStatus, totalCollections: TOTAL_COLLECTIONS, totalDocuments, totalFiles },
      createdAt: Timestamp.fromDate(finishedAt),
    });
  } catch { /* non-blocking */ }

  return { success: overallStatus !== 'failed', backupId, status: overallStatus, totalDocuments, totalFiles, errors, folderLink, manifestLink, summaryLink };
}
