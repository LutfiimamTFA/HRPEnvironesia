import { NextRequest, NextResponse } from 'next/server';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const maxDuration = 300;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Auth
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function verifySuperAdmin(
  req: NextRequest,
): Promise<{ uid: string; email: string; name: string; role: string } | { error: string; status: number }> {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return { error: 'Unauthorized', status: 401 };
  const idToken = authorization.split('Bearer ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userSnap = await admin.firestore().collection('users').doc(decoded.uid).get();
    const userData = userSnap.data() ?? {};
    const role = String(userData.role ?? '').trim();
    if (!userSnap.exists || !['super-admin', 'super_admin', 'superadmin'].includes(role)) return { error: 'Forbidden: Super Admin only.', status: 403 };
    return {
      uid: decoded.uid,
      email: decoded.email ?? userData.email ?? '',
      name: userData.fullName ?? userData.name ?? decoded.name ?? decoded.email ?? decoded.uid,
      role,
    };
  } catch (err: any) {
    if (err.code === 'auth/id-token-expired') return { error: 'Sesi berakhir, silakan muat ulang.', status: 401 };
    return { error: `Verifikasi token gagal: ${err.message}`, status: 401 };
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Google Drive helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildDriveAuth() {
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error('Missing FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY');
  return new google.auth.JWT({ email, key: rawKey.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/drive'] });
}

async function buildOAuthDriveClient(): Promise<drive_v3.Drive> {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI belum dikonfigurasi. Tambahkan ke environment variables server.');
  }
  const oauthDoc = await admin.firestore().collection('system_settings').doc('google_drive_oauth').get();
  const refreshToken = oauthDoc.data()?.refreshToken as string | undefined;
  if (!refreshToken) {
    throw new Error('Google Drive belum terhubung. Hubungkan akun Google Drive terlebih dahulu di halaman Backup & Export > Koneksi Google Drive.');
  }
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2Client });
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
  } catch { return `https://drive.google.com/drive/folders/${folderId}`; }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Serialization
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function serializeValue(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(serializeValue);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, serializeValue(x)]));
  }
  return v;
}

// Flatten one level for CSV/XLSX: nested objects/arrays â†’ JSON string
function flattenDoc(doc: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (v === null || v === undefined) { out[k] = null; continue; }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') { out[k] = v; continue; }
    // arrays & objects â†’ JSON string
    out[k] = JSON.stringify(v);
  }
  return out;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CSV builder (RFC-4180)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// XLSX sheet builder
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildSheet(rows: Record<string, unknown>[]): XLSX.WorkSheet {
  if (!rows.length) {
    // Empty collection â€” minimal header + one status row
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

function buildSummaryXlsx(params: {
  backupId: string;
  startedAt: Date;
  finishedAt: Date;
  status: string;
  totalCollections: number;
  totalDocuments: number;
  totalFiles: number;
  formats: BackupFormats;
  categories: Record<string, any>;
  errors: string[];
}): Buffer {
  const wb = XLSX.utils.book_new();
  const durationSeconds = Math.round((params.finishedAt.getTime() - params.startedAt.getTime()) / 1000);

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['Field', 'Value'],
    ['Backup ID', params.backupId],
    ['Tipe Backup', 'manual'],
    ['Tanggal Mulai', params.startedAt.toISOString()],
    ['Tanggal Selesai', params.finishedAt.toISOString()],
    ['Durasi (detik)', durationSeconds],
    ['Status', params.status],
    ['Total Collection', params.totalCollections],
    ['Total Dokumen', params.totalDocuments],
    ['Total File', params.totalFiles],
    ['Format', params.formats.join(', ')],
    ['Total Error', params.errors.length],
  ]);
  summarySheet['!cols'] = [{ wch: 24 }, { wch: 56 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Ringkasan');

  const categoryRows: any[][] = [['Kategori', 'Folder Drive', 'Total Collection', 'Total Dokumen']];
  for (const [categoryName, category] of Object.entries(params.categories)) {
    const collections = Object.entries(category.collections ?? {}) as [string, any][];
    const docCount = collections.reduce((sum, [, collection]) => sum + (collection.docCount ?? 0), 0);
    categoryRows.push([categoryName, category.folderLink ?? '', collections.length, docCount]);
  }
  const categorySheet = XLSX.utils.aoa_to_sheet(categoryRows);
  categorySheet['!cols'] = [{ wch: 24 }, { wch: 64 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, categorySheet, 'Kategori');

  const collectionRows: any[][] = [['Kategori', 'Collection', 'Status', 'Dokumen', 'Format', 'Error']];
  for (const [categoryName, category] of Object.entries(params.categories)) {
    for (const [collectionName, collection] of Object.entries(category.collections ?? {}) as [string, any][]) {
      collectionRows.push([
        categoryName,
        collectionName,
        collection.status ?? '',
        collection.docCount ?? 0,
        (collection.formatsGenerated ?? []).join(', '),
        collection.error ?? '',
      ]);
    }
  }
  const collectionSheet = XLSX.utils.aoa_to_sheet(collectionRows);
  collectionSheet['!cols'] = [{ wch: 24 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 56 }];
  XLSX.utils.book_append_sheet(wb, collectionSheet, 'Detail Collection');

  if (params.errors.length) {
    const errorSheet = XLSX.utils.aoa_to_sheet([['#', 'Error'], ...params.errors.map((error, index) => [index + 1, error])]);
    errorSheet['!cols'] = [{ wch: 6 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, errorSheet, 'Errors');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Firestore read
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Collection map
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BACKUP_CATEGORIES: Array<{ folder: string; label: string; collections: string[] }> = [
  { folder: 'karyawan_user',    label: 'Data Karyawan', collections: ['users', 'employee_profiles', 'employee_invites'] },
  { folder: 'organisasi_master', label: 'Organisasi & Master', collections: ['brands', 'divisions', 'departments', 'positions', 'organization_structure', 'direct_managers', 'master_data'] },
  { folder: 'absensi_payroll',  label: 'Absensi & Payroll', collections: ['attendance_records', 'attendance_sessions', 'attendance_settings', 'attendance_corrections', 'payroll_periods', 'payroll_reports', 'payroll_snapshots'] },
  { folder: 'izin_cuti',        label: 'Izin & Cuti', collections: ['permission_requests', 'leave_requests', 'leave_balances', 'company_holidays'] },
  { folder: 'lembur',           label: 'Lembur', collections: ['overtime_submissions', 'overtime_payroll_recaps', 'approval_requests'] },
  { folder: 'perjalanan_dinas', label: 'Perjalanan Dinas', collections: ['business_trips', 'business_trip_reports', 'travel_orders', 'travel_tracking'] },
  { folder: 'rekrutmen',        label: 'Rekrutmen', collections: ['job_postings', 'applications', 'candidates', 'assessments', 'interviews', 'offerings', 'candidate_documents'] },
  { folder: 'sistem_keamanan',  label: 'Sistem & Keamanan', collections: ['system_settings', 'menu_visibility', 'access_roles', 'audit_logs', 'session_logs', 'export_logs', 'backup_logs'] },
  { folder: 'file_metadata',    label: 'File Metadata', collections: ['drive_files', 'uploaded_documents', 'attachments'] },
];

const TOTAL_COLLECTIONS = BACKUP_CATEGORIES.reduce((s, c) => s + c.collections.length, 0);

type BackupFormats = ('json' | 'csv' | 'xlsx')[];
const VALID_FORMATS: BackupFormats = ['json', 'csv', 'xlsx'];

type BackupProgressStatus = 'running' | 'success' | 'failed' | 'partial_success';
type BackupProgressStep = 'prepare' | 'read' | 'generate' | 'upload' | 'log' | 'done' | 'failed';

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function makeBackupId(uid: string, requestedId?: string) {
  const cleaned = requestedId?.trim();
  if (cleaned && /^[a-zA-Z0-9_-]{12,120}$/.test(cleaned)) return cleaned;
  return `backup_${Date.now()}_${uid.slice(0, 8)}`;
}

function errorResponse(message: string, status: number, error?: string) {
  return NextResponse.json({ success: false, message, error: error ?? message }, { status });
}

async function writeFailedBackupLog(params: {
  backupId: string;
  actor: { uid: string; email: string; name: string };
  reason: string;
  formats: BackupFormats;
  backupRootId?: string;
  startedAt: Date;
  error: string;
}) {
  const finishedAt = new Date();
  try {
    await admin.firestore().collection('backup_logs').doc(params.backupId).set({
      backupId: params.backupId,
      backupType: 'manual',
      status: 'failed',
      startedAt: Timestamp.fromDate(params.startedAt),
      finishedAt: Timestamp.fromDate(finishedAt),
      durationSeconds: Math.round((finishedAt.getTime() - params.startedAt.getTime()) / 1000),
      requestedByUid: params.actor.uid,
      requestedByName: params.actor.name,
      requestedByEmail: params.actor.email,
      reason: params.reason,
      formats: params.formats,
      googleDriveRootFolderId: params.backupRootId ?? null,
      totalCollections: TOTAL_COLLECTIONS,
      totalDocuments: 0,
      totalFiles: 0,
      totalJsonFiles: 0,
      totalCsvFiles: 0,
      totalExcelFiles: 0,
      totalXlsxFiles: 0,
      errors: [params.error],
      createdAt: Timestamp.fromDate(finishedAt),
    });
  } catch (err: any) {
    console.error('[backup_logs] Gagal menulis log backup gagal:', err?.message ?? err);
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST handler
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function POST(req: NextRequest) {
  const authResult = await verifySuperAdmin(req);
  if ('error' in authResult) return errorResponse(authResult.error, authResult.status);
  const actor = authResult;

  let body: {
    backupId?: string;
    mode?: string;
    type?: string;
    scope?: 'all' | 'category';
    categoryKey?: string;
    reason?: string;
    formats?: BackupFormats;
  } = {};
  try { body = await req.json(); } catch { /* ok */ }

  const reason = (body.reason ?? '').trim();
  const mode = body.mode ?? 'backup_to_drive';
  const scope = body.scope ?? 'all';
  const categoryKey = body.categoryKey?.trim();
  const requestedFormats: BackupFormats = (body.formats && body.formats.length > 0)
    ? body.formats.filter((format): format is BackupFormats[number] => VALID_FORMATS.includes(format as any))
    : ['json', 'csv', 'xlsx'];

  if (mode !== 'backup_to_drive') return errorResponse('Mode backup tidak didukung.', 400);
  if (body.type && body.type !== 'manual') return errorResponse('Tipe backup tidak didukung.', 400);
  if (!reason) return errorResponse('Alasan backup wajib diisi.', 400);
  if (!requestedFormats.length) return errorResponse('Minimal satu format backup harus dipilih.', 400);

  const selectedCategories = scope === 'category'
    ? BACKUP_CATEGORIES.filter(category => category.folder === categoryKey)
    : BACKUP_CATEGORIES;
  if (scope === 'category' && selectedCategories.length === 0) {
    return errorResponse('Kategori backup tidak valid.', 400, `Kategori "${categoryKey ?? ''}" tidak ditemukan.`);
  }
  const totalCollections = selectedCategories.reduce((sum, category) => sum + category.collections.length, 0);

  const doJson = requestedFormats.includes('json');
  const doCsv  = requestedFormats.includes('csv');
  const doXlsx = requestedFormats.includes('xlsx');

  const backupId  = makeBackupId(actor.uid, body.backupId);
  const startedAt = new Date();
  const progressRef = admin.firestore().collection('backup_progress').doc(backupId);
  const activityLog: string[] = [];
  let completedCategories = 0;
  let totalDocuments = 0;
  let totalJsonFiles = 0;
  let totalCsvFiles  = 0;
  let totalXlsxFiles = 0;

  const pushActivity = (message?: string) => {
    if (!message) return;
    activityLog.push(`${new Date().toISOString()}|${message}`);
    if (activityLog.length > 20) activityLog.splice(0, activityLog.length - 20);
  };
  const updateProgress = async (patch: {
    status?: BackupProgressStatus;
    step?: BackupProgressStep;
    stepLabel?: string;
    progressPercent?: number;
    currentCategoryKey?: string | null;
    currentCategoryLabel?: string | null;
    completedCategories?: number;
    totalCategories?: number;
    totalDocumentsProcessed?: number;
    totalFilesUploaded?: number;
    totalCollections?: number;
    failedCategories?: string[];
    error?: string | null;
    googleDriveBackupFolderLink?: string;
    finishedAt?: string;
  }, activity?: string) => {
    pushActivity(activity);
    await progressRef.set({
      backupId,
      actorUid: actor.uid,
      status: 'running',
      startedAt: Timestamp.fromDate(startedAt),
      updatedAt: Timestamp.now(),
      totalCategories: selectedCategories.length,
      completedCategories,
      totalCollections,
      totalDocumentsProcessed: totalDocuments,
      totalFilesUploaded: totalJsonFiles + totalCsvFiles + totalXlsxFiles,
      activityLog: [...activityLog],
      ...patch,
      progressPercent: clampProgress(patch.progressPercent ?? 0),
    }, { merge: true });
  };

  await updateProgress({
    status: 'running',
    step: 'prepare',
    stepLabel: 'Menyiapkan data',
    progressPercent: 2,
    currentCategoryKey: null,
    currentCategoryLabel: null,
  }, 'Menyiapkan proses backup');

  const year  = String(startedAt.getFullYear());
  const month = String(startedAt.getMonth() + 1).padStart(2, '0');
  const day   = String(startedAt.getDate()).padStart(2, '0');

  // Folder ID: Firestore settings lebih prioritas dari env
  let backupRootId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID ?? '';
  try {
    const settingsSnap = await admin.firestore().collection('system_settings').doc('backup_export').get();
    const firestoreFolderId = settingsSnap.data()?.googleDriveBackupFolderId as string | undefined;
    if (firestoreFolderId) backupRootId = firestoreFolderId;
  } catch { /* gunakan env fallback */ }
  if (!backupRootId) {
    const error = 'GOOGLE_DRIVE_BACKUP_FOLDER_ID belum dikonfigurasi. Set di halaman Backup & Export atau di environment variables server.';
    await updateProgress({ status: 'failed', step: 'failed', stepLabel: 'Backup gagal', progressPercent: 0, error }, error);
    await writeFailedBackupLog({ backupId, actor, reason, formats: requestedFormats, startedAt, error });
    return errorResponse('Backup gagal', 500, error);
  }

  // Tentukan mode Drive: oauth_user atau service_account
  let driveAuthMode = 'service_account';
  try {
    const settingsSnap = await admin.firestore().collection('system_settings').doc('backup_export').get();
    driveAuthMode = (settingsSnap.data()?.driveAuthMode as string) ?? 'service_account';
  } catch { /* default ke service_account */ }

  let drive: drive_v3.Drive;
  try {
    await updateProgress({ step: 'prepare', stepLabel: 'Menyiapkan koneksi Google Drive', progressPercent: 4 }, 'Menyiapkan koneksi Google Drive');
    if (driveAuthMode === 'oauth_user') {
      drive = await buildOAuthDriveClient();
    } else {
      drive = google.drive({ version: 'v3', auth: buildDriveAuth() });
    }
  }
  catch (err: any) {
    const rawMsg = String(err.message ?? '');
    const isQuota = rawMsg.toLowerCase().includes('quota');
    const isDriveNotConnected = rawMsg.includes('belum terhubung') || rawMsg.includes('refresh_token');
    const friendlyError = isQuota
      ? 'Folder backup berada di My Drive biasa. Gunakan koneksi OAuth Google Drive atau pindahkan folder ke Shared Drive.'
      : isDriveNotConnected
      ? 'Google Drive belum terhubung. Hubungkan akun Google Drive terlebih dahulu di halaman Backup & Export.'
      : `Drive auth gagal: ${rawMsg}`;
    await updateProgress({ status: 'failed', step: 'failed', stepLabel: 'Backup gagal', progressPercent: 4, error: friendlyError }, friendlyError);
    await writeFailedBackupLog({ backupId, actor, reason, formats: requestedFormats, backupRootId, startedAt, error: friendlyError });
    return errorResponse('Backup gagal', 500, friendlyError);
  }

  // Folder: Root / YYYY / MM / DD / manual
  let targetFolderId: string;
  let targetFolderLink = '';
  try {
    await updateProgress({ step: 'prepare', stepLabel: 'Menyiapkan folder Google Drive', progressPercent: 6 }, 'Menyiapkan folder backup di Google Drive');
    const yearId  = await getOrCreateFolder(drive, backupRootId, year);
    const monthId = await getOrCreateFolder(drive, yearId, month);
    const dayId   = await getOrCreateFolder(drive, monthId, day);
    targetFolderId  = await getOrCreateFolder(drive, dayId, 'manual');
    targetFolderLink = await getFolderLink(drive, targetFolderId);
    await updateProgress({ step: 'prepare', stepLabel: 'Folder Google Drive siap', progressPercent: 8, googleDriveBackupFolderLink: targetFolderLink }, 'Folder backup Google Drive siap');
  } catch (err: any) {
    const error = `Gagal buat folder tanggal: ${err.message}`;
    await updateProgress({ status: 'failed', step: 'failed', stepLabel: 'Backup gagal', progressPercent: 6, error }, error);
    await writeFailedBackupLog({ backupId, actor, reason, formats: requestedFormats, backupRootId, startedAt, error });
    return errorResponse('Backup gagal', 500, error);
  }

  // â”€â”€ Counters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const errors: string[] = [];
  const failedCategories = new Set<string>();

  // â”€â”€ Manifest types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Process each category â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let categoryIndex = 0;
  for (const category of selectedCategories) {
    categoryIndex++;
    const categoryBasePercent = 10 + ((categoryIndex - 1) / selectedCategories.length) * 70;
    const categoryDonePercent = 10 + (categoryIndex / selectedCategories.length) * 70;
    await updateProgress({
      step: 'read',
      stepLabel: 'Membaca collection',
      progressPercent: categoryBasePercent,
      currentCategoryKey: category.folder,
      currentCategoryLabel: category.label,
      completedCategories,
    }, `Mulai memproses ${category.label}`);

    let catFolderId: string;
    let catFolderLink = '';
    try {
      catFolderId  = await getOrCreateFolder(drive, targetFolderId, category.folder);
      catFolderLink = await getFolderLink(drive, catFolderId);
    } catch (err: any) {
      errors.push(`Folder ${category.folder}: ${err.message}`);
      failedCategories.add(category.label);
      await updateProgress({
        step: 'upload',
        stepLabel: 'Upload ke Google Drive',
        progressPercent: categoryBasePercent,
        failedCategories: Array.from(failedCategories),
        error: `Gagal membuat folder ${category.label}: ${err.message}`,
      }, `${category.label} gagal: folder Drive tidak bisa dibuat`);
      continue;
    }

    const catCols: Record<string, ColManifest> = {};
    const xlsxSheets: { name: string; docs: Record<string, unknown>[] }[] = [];
    let collectionIndex = 0;

    for (const colName of category.collections) {
      collectionIndex++;
      const collectionPercent = categoryBasePercent + (collectionIndex / Math.max(category.collections.length, 1)) * (categoryDonePercent - categoryBasePercent) * 0.55;
      await updateProgress({
        step: 'read',
        stepLabel: 'Membaca collection',
        progressPercent: collectionPercent,
        currentCategoryKey: category.folder,
        currentCategoryLabel: category.label,
      }, `Membaca ${colName}`);

      const { docs, status, error } = await readCollection(colName);
      const colManifest: ColManifest = { status, docCount: docs.length, formatsGenerated: [], files: [] };
      if (error) colManifest.error = error;

      xlsxSheets.push({ name: sheetName(colName), docs });

      if (status === 'error') {
        catCols[colName] = colManifest;
        errors.push(`Read ${colName}: ${error}`);
        failedCategories.add(category.label);
        await updateProgress({
          step: 'read',
          stepLabel: 'Membaca collection',
          progressPercent: collectionPercent,
          failedCategories: Array.from(failedCategories),
          error: `Gagal membaca ${colName}: ${error}`,
        }, `${colName} gagal dibaca`);
        continue;
      }

      totalDocuments += docs.length;
      await updateProgress({
        step: 'generate',
        stepLabel: 'Membuat file export',
        progressPercent: collectionPercent,
        totalDocumentsProcessed: totalDocuments,
      }, `${colName} selesai dibaca (${docs.length.toLocaleString('id-ID')} dokumen)`);

      if (doJson) {
        try {
          const jsonBuf = Buffer.from(JSON.stringify(docs, null, 2), 'utf-8');
          const up = await uploadBuffer(drive, catFolderId, `${colName}.json`, jsonBuf, 'application/json');
          colManifest.formatsGenerated.push('json');
          colManifest.files.push({ format: 'json', fileName: `${colName}.json`, mimeType: 'application/json', ...up });
          totalJsonFiles++;
          await updateProgress({
            step: 'upload',
            stepLabel: 'Upload ke Google Drive',
            progressPercent: collectionPercent,
            totalFilesUploaded: totalJsonFiles + totalCsvFiles + totalXlsxFiles,
          }, `Upload ${colName}.json selesai`);
        } catch (err: any) {
          errors.push(`JSON ${colName}: ${err.message}`);
          failedCategories.add(category.label);
          await updateProgress({ step: 'upload', stepLabel: 'Upload ke Google Drive', progressPercent: collectionPercent, failedCategories: Array.from(failedCategories), error: `JSON ${colName}: ${err.message}` }, `Upload JSON ${colName} gagal`);
        }
      }

      if (doCsv) {
        try {
          const csvBuf = buildCsv(docs);
          const up = await uploadBuffer(drive, catFolderId, `${colName}.csv`, csvBuf, 'text/csv');
          colManifest.formatsGenerated.push('csv');
          colManifest.files.push({ format: 'csv', fileName: `${colName}.csv`, mimeType: 'text/csv', ...up });
          totalCsvFiles++;
          await updateProgress({
            step: 'upload',
            stepLabel: 'Upload ke Google Drive',
            progressPercent: collectionPercent,
            totalFilesUploaded: totalJsonFiles + totalCsvFiles + totalXlsxFiles,
          }, `Upload ${colName}.csv selesai`);
        } catch (err: any) {
          errors.push(`CSV ${colName}: ${err.message}`);
          failedCategories.add(category.label);
          await updateProgress({ step: 'upload', stepLabel: 'Upload ke Google Drive', progressPercent: collectionPercent, failedCategories: Array.from(failedCategories), error: `CSV ${colName}: ${err.message}` }, `Upload CSV ${colName} gagal`);
        }
      }

      catCols[colName] = colManifest;
    }

    let excelEntry: (FileEntry & { fileName: string }) | undefined;
    if (doXlsx) {
      try {
        await updateProgress({
          step: 'generate',
          stepLabel: 'Membuat file export',
          progressPercent: categoryDonePercent - 2,
          currentCategoryKey: category.folder,
          currentCategoryLabel: category.label,
        }, `Membuat workbook ${category.label}`);
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
        await updateProgress({
          step: 'upload',
          stepLabel: 'Upload ke Google Drive',
          progressPercent: categoryDonePercent - 1,
          totalFilesUploaded: totalJsonFiles + totalCsvFiles + totalXlsxFiles,
        }, `Upload workbook ${category.label} selesai`);
        for (const col of Object.values(catCols)) col.formatsGenerated.push('xlsx');
      } catch (err: any) {
        errors.push(`XLSX ${category.folder}: ${err.message}`);
        failedCategories.add(category.label);
        await updateProgress({ step: 'upload', stepLabel: 'Upload ke Google Drive', progressPercent: categoryDonePercent - 1, failedCategories: Array.from(failedCategories), error: `XLSX ${category.label}: ${err.message}` }, `Upload workbook ${category.label} gagal`);
      }
    }

    manifestCategories[category.folder] = {
      folderId: catFolderId,
      folderLink: catFolderLink,
      ...(excelEntry ? { excelFile: excelEntry } : {}),
      collections: catCols,
    };
    completedCategories++;
    await updateProgress({
      step: 'upload',
      stepLabel: 'Upload ke Google Drive',
      progressPercent: categoryDonePercent,
      completedCategories,
      currentCategoryKey: category.folder,
      currentCategoryLabel: category.label,
      totalDocumentsProcessed: totalDocuments,
      totalFilesUploaded: totalJsonFiles + totalCsvFiles + totalXlsxFiles,
      failedCategories: Array.from(failedCategories),
    }, `${category.label} selesai`);
  }
  const finishedAt = new Date();
  const totalFiles = totalJsonFiles + totalCsvFiles + totalXlsxFiles;
  if (totalFiles === 0) {
    errors.push('Tidak ada file backup yang berhasil diupload ke Google Drive.');
  }
  const hasErrors  = errors.length > 0;
  const overallStatus = hasErrors && totalFiles === 0 ? 'failed' : hasErrors ? 'partial_success' : 'success';
  await updateProgress({
    step: 'generate',
    stepLabel: 'Membuat file export',
    progressPercent: 84,
    completedCategories,
    totalDocumentsProcessed: totalDocuments,
    totalFilesUploaded: totalFiles,
    failedCategories: Array.from(failedCategories),
  }, 'Membuat manifest dan ringkasan backup');

  // â”€â”€ Manifest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const manifest = {
    backupId,
    backupType: 'manual',
    mode,
    scope,
    categoryKey: scope === 'category' ? categoryKey : null,
    status: overallStatus,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSeconds: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
    requestedByUid: actor.uid,
    requestedByName: actor.name,
    requestedByEmail: actor.email,
    reason,
    formats: requestedFormats,
    totalCollections,
    totalDocuments,
    totalFiles,
    totalJsonFiles,
    totalCsvFiles,
    totalXlsxFiles,
    googleDriveRootFolderId: backupRootId,
    googleDriveBackupFolderId: targetFolderId,
    googleDriveBackupFolderLink: targetFolderLink,
    categories: manifestCategories,
    errors: errors.length ? errors : [],
  };

  let manifestFileId = '';
  let manifestWebViewLink = '';
  let summaryFileId = '';
  let summaryWebViewLink = '';
  try {
    const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
    const up = await uploadBuffer(drive, targetFolderId, '00_manifest.json', manifestBuf, 'application/json');
    manifestFileId = up.fileId;
    manifestWebViewLink = up.webViewLink;
    await updateProgress({
      step: 'upload',
      stepLabel: 'Upload ke Google Drive',
      progressPercent: 88,
      totalFilesUploaded: totalFiles + 1,
    }, 'Upload 00_manifest.json selesai');
  } catch (err: any) {
    errors.push(`manifest: ${err.message}`);
    await updateProgress({ step: 'upload', stepLabel: 'Upload ke Google Drive', progressPercent: 88, error: `manifest: ${err.message}` }, 'Upload manifest gagal');
  }

  try {
    const summaryBuf = buildSummaryXlsx({
      backupId,
      startedAt,
      finishedAt,
      status: overallStatus,
      totalCollections,
      totalDocuments,
      totalFiles,
      formats: requestedFormats,
      categories: manifestCategories,
      errors,
    });
    const up = await uploadBuffer(
      drive,
      targetFolderId,
      '00_ringkasan_backup.xlsx',
      summaryBuf,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    summaryFileId = up.fileId;
    summaryWebViewLink = up.webViewLink;
    await updateProgress({
      step: 'upload',
      stepLabel: 'Upload ke Google Drive',
      progressPercent: 92,
      totalFilesUploaded: totalFiles + 2,
    }, 'Upload ringkasan backup selesai');
  } catch (err: any) {
    errors.push(`summary xlsx: ${err.message}`);
    await updateProgress({ step: 'upload', stepLabel: 'Upload ke Google Drive', progressPercent: 92, error: `summary xlsx: ${err.message}` }, 'Upload ringkasan backup gagal');
  }

  const finalStatus = errors.length > 0 && totalFiles === 0 ? 'failed' : errors.length > 0 ? 'partial_success' : 'success';
  const totalUploadedFiles = totalFiles + (manifestFileId ? 1 : 0) + (summaryFileId ? 1 : 0);
  await updateProgress({
    status: finalStatus === 'success' ? 'running' : finalStatus,
    step: 'log',
    stepLabel: 'Menyimpan log backup',
    progressPercent: 96,
    completedCategories,
    totalDocumentsProcessed: totalDocuments,
    totalFilesUploaded: totalUploadedFiles,
    failedCategories: Array.from(failedCategories),
    error: errors[0] ?? null,
  }, 'Menyimpan backup_logs dan audit_logs');

  // ── backup_logs ────────────────────────────────────────────────────────────
  try {
  await admin.firestore().collection('backup_logs').doc(backupId).set({
    backupId,
    backupType: 'manual',
    mode,
    scope,
    categoryKey: scope === 'category' ? categoryKey : null,
    status: finalStatus,
    startedAt: Timestamp.fromDate(startedAt),
    finishedAt: Timestamp.fromDate(finishedAt),
    durationSeconds: manifest.durationSeconds,
    requestedByUid: actor.uid,
    requestedByName: actor.name,
    requestedByEmail: actor.email,
    reason,
    formats: requestedFormats,
    googleDriveRootFolderId: backupRootId,
    googleDriveBackupFolderId: targetFolderId,
    googleDriveBackupFolderLink: targetFolderLink,
    manifestFileId,
    manifestWebViewLink,
    summaryFileId,
    summaryWebViewLink,
    totalCollections,
    totalDocuments,
    totalFiles,
    totalJsonFiles,
    totalCsvFiles,
    totalExcelFiles: totalXlsxFiles,
    totalXlsxFiles,
    errors: errors.length ? errors : [],
    createdAt: Timestamp.fromDate(finishedAt),
  });
  } catch (err: any) {
    console.error('[backup_logs] Gagal menulis log backup berhasil:', err?.message ?? err);
  }

  // ── audit_logs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  try {
    await admin.firestore().collection('audit_logs').add({
      actorUid: actor.uid,
      actorName: actor.name,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'backup_data',
      category: 'backup_export',
      targetType: 'system',
      targetName: 'HRP Manual Backup',
      reason,
      after: { backupId, status: finalStatus, scope, categoryKey: scope === 'category' ? categoryKey : null, totalCollections, totalDocuments, totalFiles, googleDriveBackupFolderLink: targetFolderLink },
      createdAt: Timestamp.fromDate(finishedAt),
    });
  } catch { /* non-blocking */ }

  await updateProgress({
    status: finalStatus,
    step: finalStatus === 'failed' ? 'failed' : 'done',
    stepLabel: finalStatus === 'success' ? 'Selesai' : finalStatus === 'partial_success' ? 'Selesai dengan sebagian error' : 'Backup gagal',
    progressPercent: finalStatus === 'failed' ? 96 : 100,
    currentCategoryKey: null,
    currentCategoryLabel: null,
    completedCategories,
    totalDocumentsProcessed: totalDocuments,
    totalFilesUploaded: totalUploadedFiles,
    failedCategories: Array.from(failedCategories),
    error: errors[0] ?? null,
    googleDriveBackupFolderLink: targetFolderLink,
    finishedAt: finishedAt.toISOString(),
  }, finalStatus === 'success' ? 'Backup selesai' : 'Backup selesai dengan catatan error');

  return NextResponse.json({
    success: finalStatus === 'success',
    backupId,
    status: finalStatus,
    message: finalStatus === 'success' ? 'Backup berhasil' : finalStatus === 'partial_success' ? 'Backup selesai dengan sebagian error' : 'Backup gagal',
    finishedAt: finishedAt.toISOString(),
    formats: requestedFormats,
    googleDriveBackupFolderId: targetFolderId,
    googleDriveBackupFolderLink: targetFolderLink,
    manifestFileId,
    manifestWebViewLink,
    summaryFileId,
    summaryWebViewLink,
    totalCollections,
    totalDocuments,
    totalFiles,
    totalUploadedFiles,
    totalJsonFiles,
    totalCsvFiles,
    totalExcelFiles: totalXlsxFiles,
    totalXlsxFiles,
    durationSeconds: manifest.durationSeconds,
    errors: errors.length ? errors : undefined,
  });
}
