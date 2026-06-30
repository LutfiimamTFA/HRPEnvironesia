import { NextRequest, NextResponse } from 'next/server';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────
async function verifySuperAdmin(
  req: NextRequest,
): Promise<{ uid: string; email: string; name: string } | { error: string; status: number }> {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return { error: 'Unauthorized', status: 401 };
  const idToken = authorization.split('Bearer ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const snap = await admin.firestore().collection('roles_admin').doc(decoded.uid).get();
    if (!snap.exists) return { error: 'Forbidden: Super Admin only.', status: 403 };
    return { uid: decoded.uid, email: decoded.email ?? '', name: decoded.name ?? decoded.email ?? decoded.uid };
  } catch (err: any) {
    if (err.code === 'auth/id-token-expired') return { error: 'Sesi berakhir, silakan muat ulang.', status: 401 };
    return { error: `Verifikasi token gagal: ${err.message}`, status: 401 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Drive helpers
// ─────────────────────────────────────────────────────────────────────────────
function buildDriveAuth() {
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error('Missing FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY');
  return new google.auth.JWT({ email, key: rawKey.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/drive'] });
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

async function uploadBuffer(
  drive: drive_v3.Drive,
  folderId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<UploadResult> {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  const res = await drive.files.create({
    requestBody: { name: fileName, mimeType, parents: [folderId] },
    media: { mimeType, body: stream },
    fields: 'id, webViewLink, size',
    supportsAllDrives: true,
  });
  return {
    fileId: res.data.id!,
    webViewLink: res.data.webViewLink ?? '',
    size: Number(res.data.size ?? 0),
  };
}

async function getFolderLink(drive: drive_v3.Drive, folderId: string): Promise<string> {
  try {
    const res = await drive.files.get({ fileId: folderId, fields: 'webViewLink', supportsAllDrives: true });
    return res.data.webViewLink ?? '';
  } catch { return ''; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization
// ─────────────────────────────────────────────────────────────────────────────
function serializeValue(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(serializeValue);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, serializeValue(x)]));
  }
  return v;
}

// Flatten one level for CSV/XLSX: nested objects/arrays → JSON string
function flattenDoc(doc: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (v === null || v === undefined) { out[k] = null; continue; }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') { out[k] = v; continue; }
    // arrays & objects → JSON string
    out[k] = JSON.stringify(v);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV builder (RFC-4180)
// ─────────────────────────────────────────────────────────────────────────────
function buildCsv(rows: Record<string, unknown>[]): Buffer {
  if (!rows.length) return Buffer.from('_id,_path,status\n,,"empty"\n', 'utf-8');
  const flat = rows.map(r => flattenDoc(r as Record<string, unknown>));
  const headers = Array.from(new Set(flat.flatMap(r => Object.keys(r))));
  const escape = (val: unknown) => {
    const s = val == null ? '' : String(val);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(','), ...flat.map(r => headers.map(h => escape(r[h])).join(','))];
  return Buffer.from(lines.join('\n'), 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// XLSX sheet builder
// ─────────────────────────────────────────────────────────────────────────────
function buildSheet(rows: Record<string, unknown>[]): XLSX.WorkSheet {
  if (!rows.length) {
    // Empty collection — minimal header + one status row
    const ws = XLSX.utils.aoa_to_sheet([['_id', '_path', 'status'], ['', '', 'empty']]);
    styleHeaderRow(ws, ['_id', '_path', 'status']);
    return ws;
  }
  const flat = rows.map(r => flattenDoc(r as Record<string, unknown>));
  const headers = Array.from(new Set(flat.flatMap(r => Object.keys(r))));
  const aoa = [
    headers,
    ...flat.map(r => headers.map(h => r[h] ?? '')),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  styleHeaderRow(ws, headers);
  setColumnWidths(ws, headers, flat);
  return ws;
}

function styleHeaderRow(ws: XLSX.WorkSheet, headers: string[]) {
  // Bold headers
  for (let c = 0; c < headers.length; c++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[cellAddr]) continue;
    ws[cellAddr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'E2E8F0' } } };
  }
  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
}

function setColumnWidths(
  ws: XLSX.WorkSheet,
  headers: string[],
  rows: Record<string, string | number | boolean | null>[],
) {
  const widths = headers.map(h => {
    const maxData = rows.reduce((max, r) => Math.max(max, String(r[h] ?? '').length), 0);
    return { wch: Math.min(Math.max(h.length, maxData, 8), 60) };
  });
  ws['!cols'] = widths;
}

function sheetName(name: string): string {
  // Excel sheet names: max 31 chars, no special chars
  return name.replace(/[\\/*?:[\]]/g, '_').slice(0, 31);
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore read
// ─────────────────────────────────────────────────────────────────────────────
type CollectionData = {
  docs: Record<string, unknown>[];
  status: 'ok' | 'empty' | 'not_found' | 'error';
  error?: string;
};

async function readCollection(collectionName: string): Promise<CollectionData> {
  try {
    const snap = await admin.firestore().collection(collectionName).get();
    if (snap.empty) return { docs: [], status: 'empty' };
    const docs = snap.docs.map(d => ({
      _id: d.id,
      _path: `${collectionName}/${d.id}`,
      ...(serializeValue(d.data()) as Record<string, unknown>),
    }));
    return { docs, status: 'ok' };
  } catch (err: any) {
    if (err.code === 5 || String(err.message).includes('NOT_FOUND')) return { docs: [], status: 'not_found' };
    return { docs: [], status: 'error', error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection map
// ─────────────────────────────────────────────────────────────────────────────
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

type BackupFormats = ('json' | 'csv' | 'xlsx')[];

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const authResult = await verifySuperAdmin(req);
  if ('error' in authResult) return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  const actor = authResult;

  let body: { type?: string; reason?: string; formats?: BackupFormats } = {};
  try { body = await req.json(); } catch { /* ok */ }

  const reason = (body.reason ?? '').trim() || 'Manual backup';
  const requestedFormats: BackupFormats = (body.formats && body.formats.length > 0)
    ? body.formats
    : ['json', 'csv', 'xlsx'];

  const doJson = requestedFormats.includes('json');
  const doCsv  = requestedFormats.includes('csv');
  const doXlsx = requestedFormats.includes('xlsx');

  const backupId  = `backup_${Date.now()}_${actor.uid.slice(0, 8)}`;
  const startedAt = new Date();
  const year  = String(startedAt.getFullYear());
  const month = String(startedAt.getMonth() + 1).padStart(2, '0');
  const day   = String(startedAt.getDate()).padStart(2, '0');

  const backupRootId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;
  if (!backupRootId) return NextResponse.json({ error: 'GOOGLE_DRIVE_BACKUP_FOLDER_ID is not configured.' }, { status: 500 });

  let drive: drive_v3.Drive;
  try { drive = google.drive({ version: 'v3', auth: buildDriveAuth() }); }
  catch (err: any) { return NextResponse.json({ error: `Drive auth gagal: ${err.message}` }, { status: 500 }); }

  // Folder: Root / YYYY / MM / DD / manual
  let targetFolderId: string;
  let targetFolderLink = '';
  try {
    const yearId  = await getOrCreateFolder(drive, backupRootId, year);
    const monthId = await getOrCreateFolder(drive, yearId, month);
    const dayId   = await getOrCreateFolder(drive, monthId, day);
    targetFolderId  = await getOrCreateFolder(drive, dayId, 'manual');
    targetFolderLink = await getFolderLink(drive, targetFolderId);
  } catch (err: any) {
    return NextResponse.json({ error: `Gagal buat folder tanggal: ${err.message}` }, { status: 500 });
  }

  // ── Counters ───────────────────────────────────────────────────────────────
  let totalDocuments = 0;
  let totalJsonFiles = 0;
  let totalCsvFiles  = 0;
  let totalXlsxFiles = 0;
  const errors: string[] = [];

  // ── Manifest types ─────────────────────────────────────────────────────────
  type FileEntry = { format: string; fileName: string; fileId: string; webViewLink: string; mimeType: string; size: number };
  type ColManifest = {
    status: string;
    docCount: number;
    formatsGenerated: string[];
    files: FileEntry[];
    error?: string;
  };
  type CatManifest = {
    folderId: string;
    folderLink: string;
    excelFile?: FileEntry & { fileName: string };
    collections: Record<string, ColManifest>;
  };
  const manifestCategories: Record<string, CatManifest> = {};

  // ── Process each category ──────────────────────────────────────────────────
  for (const category of BACKUP_CATEGORIES) {
    let catFolderId: string;
    let catFolderLink = '';
    try {
      catFolderId  = await getOrCreateFolder(drive, dateFolderId, category.folder);
      catFolderLink = await getFolderLink(drive, catFolderId);
    } catch (err: any) {
      errors.push(`Folder ${category.folder}: ${err.message}`);
      continue;
    }

    const catCols: Record<string, ColManifest> = {};
    // Collect all docs for XLSX workbook
    const xlsxSheets: { name: string; docs: Record<string, unknown>[] }[] = [];

    for (const colName of category.collections) {
      const { docs, status, error } = await readCollection(colName);
      const colManifest: ColManifest = { status, docCount: docs.length, formatsGenerated: [], files: [] };
      if (error) colManifest.error = error;

      // Accumulate for XLSX regardless of individual col status
      xlsxSheets.push({ name: sheetName(colName), docs });

      if (status === 'error') {
        catCols[colName] = colManifest;
        errors.push(`Read ${colName}: ${error}`);
        continue;
      }

      totalDocuments += docs.length;

      // JSON
      if (doJson) {
        try {
          const jsonBuf = Buffer.from(JSON.stringify(docs, null, 2), 'utf-8');
          const up = await uploadBuffer(drive, catFolderId, `${colName}.json`, jsonBuf, 'application/json');
          colManifest.formatsGenerated.push('json');
          colManifest.files.push({ format: 'json', fileName: `${colName}.json`, mimeType: 'application/json', ...up });
          totalJsonFiles++;
        } catch (err: any) {
          errors.push(`JSON ${colName}: ${err.message}`);
        }
      }

      // CSV
      if (doCsv) {
        try {
          const csvBuf = buildCsv(docs);
          const up = await uploadBuffer(drive, catFolderId, `${colName}.csv`, csvBuf, 'text/csv');
          colManifest.formatsGenerated.push('csv');
          colManifest.files.push({ format: 'csv', fileName: `${colName}.csv`, mimeType: 'text/csv', ...up });
          totalCsvFiles++;
        } catch (err: any) {
          errors.push(`CSV ${colName}: ${err.message}`);
        }
      }

      catCols[colName] = colManifest;
    }

    // XLSX — one workbook per category, uploaded after all sheets collected
    let excelEntry: (FileEntry & { fileName: string }) | undefined;
    if (doXlsx) {
      try {
        const wb = XLSX.utils.book_new();
        for (const { name, docs } of xlsxSheets) {
          XLSX.utils.book_append_sheet(wb, buildSheet(docs), name);
        }
        const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
        const xlsxName = `${category.folder}.xlsx`;
        const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const up = await uploadBuffer(drive, catFolderId, xlsxName, xlsxBuf, mimeType);
        excelEntry = { format: 'xlsx', fileName: xlsxName, mimeType, ...up };
        totalXlsxFiles++;
        // Mark xlsx in each collection's formatsGenerated
        for (const col of Object.values(catCols)) col.formatsGenerated.push('xlsx');
      } catch (err: any) {
        errors.push(`XLSX ${category.folder}: ${err.message}`);
      }
    }

    manifestCategories[category.folder] = {
      folderId: catFolderId,
      folderLink: catFolderLink,
      ...(excelEntry ? { excelFile: excelEntry } : {}),
      collections: catCols,
    };
  }

  const finishedAt = new Date();
  const totalFiles = totalJsonFiles + totalCsvFiles + totalXlsxFiles;
  const hasErrors  = errors.length > 0;
  const overallStatus = hasErrors && totalFiles === 0 ? 'failed' : hasErrors ? 'partial_success' : 'success';

  // ── Manifest ───────────────────────────────────────────────────────────────
  const manifest = {
    backupId,
    backupType: 'manual',
    status: overallStatus,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSeconds: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
    requestedByUid: actor.uid,
    requestedByName: actor.name,
    requestedByEmail: actor.email,
    reason,
    formats: requestedFormats,
    totalCollections: TOTAL_COLLECTIONS,
    totalDocuments,
    totalFiles,
    totalJsonFiles,
    totalCsvFiles,
    totalXlsxFiles,
    googleDriveBackupFolderLink: dateFolderLink,
    categories: manifestCategories,
    errors: errors.length ? errors : [],
  };

  let manifestFileId = '';
  let manifestWebViewLink = '';
  try {
    const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
    const up = await uploadBuffer(drive, dateFolderId, '00_manifest.json', manifestBuf, 'application/json');
    manifestFileId = up.fileId;
    manifestWebViewLink = up.webViewLink;
  } catch (err: any) {
    errors.push(`manifest: ${err.message}`);
  }

  // ── backup_logs ────────────────────────────────────────────────────────────
  await admin.firestore().collection('backup_logs').doc(backupId).set({
    backupId,
    backupType: 'manual',
    status: overallStatus,
    startedAt: Timestamp.fromDate(startedAt),
    finishedAt: Timestamp.fromDate(finishedAt),
    durationSeconds: manifest.durationSeconds,
    requestedByUid: actor.uid,
    requestedByName: actor.name,
    requestedByEmail: actor.email,
    reason,
    formats: requestedFormats,
    googleDriveRootFolderId: backupRootId,
    googleDriveBackupFolderId: dateFolderId,
    googleDriveBackupFolderLink: dateFolderLink,
    manifestFileId,
    manifestWebViewLink,
    totalCollections: TOTAL_COLLECTIONS,
    totalDocuments,
    totalFiles,
    totalJsonFiles,
    totalCsvFiles,
    totalXlsxFiles,
    errors: errors.length ? errors : [],
    createdAt: Timestamp.fromDate(finishedAt),
  });

  // ── audit_logs ─────────────────────────────────────────────────────────────
  try {
    await admin.firestore().collection('audit_logs').add({
      actorUid: actor.uid,
      actorName: actor.name,
      actorEmail: actor.email,
      actorRole: 'super-admin',
      action: 'backup_data',
      category: 'backup_export',
      targetType: 'system',
      targetName: 'HRP Backup Manual',
      reason,
      after: { backupId, status: overallStatus, formats: requestedFormats, totalCollections: TOTAL_COLLECTIONS, totalDocuments, totalFiles },
      createdAt: Timestamp.fromDate(finishedAt),
    });
  } catch { /* non-blocking */ }

  return NextResponse.json({
    success: overallStatus !== 'failed',
    backupId,
    status: overallStatus,
    formats: requestedFormats,
    totalCollections: TOTAL_COLLECTIONS,
    totalDocuments,
    totalFiles,
    totalJsonFiles,
    totalCsvFiles,
    totalXlsxFiles,
    durationSeconds: manifest.durationSeconds,
    googleDriveBackupFolderLink: dateFolderLink,
    manifestWebViewLink,
    errors: errors.length ? errors : undefined,
  });
}
