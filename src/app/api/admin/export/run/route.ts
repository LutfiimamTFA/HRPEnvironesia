import { NextRequest, NextResponse } from 'next/server';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';
import { formatRows, COLLECTION_DISPLAY_NAMES } from '@/lib/server/export-formatter';

export const runtime = 'nodejs';
export const maxDuration = 300;

type ExportFormat = 'json' | 'csv' | 'xlsx';

const EXPORTABLE_COLLECTIONS = new Set([
  'users',
  'employee_profiles',
  'employee_invites',
  'brands',
  'divisions',
  'departments',
  'positions',
  'attendance_records',
  'attendance_sessions',
  'attendance_settings',
  'attendance_corrections',
  'payroll_periods',
  'payroll_reports',
  'payroll_snapshots',
  'permission_requests',
  'leave_requests',
  'leave_balances',
  'company_holidays',
  'overtime_submissions',
  'overtime_payroll_recaps',
  'approval_requests',
  'business_trips',
  'business_trip_reports',
  'travel_orders',
  'travel_tracking',
  'job_postings',
  'applications',
  'candidates',
  'assessments',
  'interviews',
  'offerings',
  'candidate_documents',
  'system_settings',
  'menu_visibility',
  'access_roles',
  'audit_logs',
  'session_logs',
  'export_logs',
  'backup_logs',
  'drive_files',
  'uploaded_documents',
  'attachments',
]);

const NO_DATE_FILTER_COLLECTIONS = new Set([
  'users',
  'brands',
  'divisions',
  'positions',
  'departments',
  'company_holidays',
  'system_settings',
  'menu_visibility',
  'access_roles',
]);

async function verifySuperAdmin(
  req: NextRequest,
): Promise<{ uid: string; email: string; name: string; role: string } | { error: string; status: number }> {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return { error: 'Unauthorized', status: 401 };

  try {
    const decoded = await admin.auth().verifyIdToken(authorization.slice('Bearer '.length));
    const userSnap = await admin.firestore().collection('users').doc(decoded.uid).get();
    const userData = userSnap.data() ?? {};
    const role = String(userData.role ?? '').trim();

    if (!userSnap.exists || !['super-admin', 'super_admin', 'superadmin'].includes(role)) {
      return { error: 'Forbidden: Super Admin only.', status: 403 };
    }

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

function errorResponse(message: string, status: number, error?: string) {
  return NextResponse.json({ success: false, message, error: error ?? message }, { status });
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, serializeValue(nested)]));
  }
  return value;
}

function buildCsv(formatted: Record<string, string>[]): Buffer {
  const headers = Array.from(new Set(formatted.flatMap(row => Object.keys(row))));
  const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escape).join(','),
    ...formatted.map(row => headers.map(h => escape(row[h] ?? '')).join(',')),
  ];
  return Buffer.from('﻿' + lines.join('\n'), 'utf-8'); // BOM for Excel UTF-8 detection
}

function buildXlsx(formatted: Record<string, string>[], displayName: string): Buffer {
  const headers = Array.from(new Set(formatted.flatMap(row => Object.keys(row))));
  const dataRows = formatted.map(row => headers.map(h => row[h] ?? ''));

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

  // Bold + background for header row
  for (let c = 0; c < headers.length; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    if (!worksheet[cellRef]) worksheet[cellRef] = { t: 's', v: headers[c] };
    worksheet[cellRef].s = {
      font: { bold: true, color: { rgb: '1E3A5F' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } },
      alignment: { wrapText: false, vertical: 'center', horizontal: 'center' },
    };
  }

  // Wrap text + top-align for data rows
  for (let r = 1; r <= dataRows.length; r++) {
    for (let c = 0; c < headers.length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      if (!worksheet[cellRef]) continue;
      worksheet[cellRef].s = {
        alignment: { wrapText: true, vertical: 'top' },
      };
    }
  }

  // Auto column width: scan header + data
  worksheet['!cols'] = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...dataRows.map(row => String(row[i] ?? '').length),
    );
    return { wch: Math.min(Math.max(maxLen + 2, 12), 60) };
  });

  // Freeze first row
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

  const sheetName = displayName.replace(/[\\/*?:[\]]/g, '_').slice(0, 31);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true, cellStyles: true }) as Buffer;
}

function makeMetadataRow(status: 'empty' | 'not_found', collectionName: string, exportedAt: string, filters: Record<string, unknown>) {
  return {
    _status: status,
    collectionName,
    exportedAt,
    appliedFilters: JSON.stringify(filters),
  };
}

function toTimestampStart(value: string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(date);
}

function toTimestampEnd(value: string) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return Timestamp.fromDate(date);
}

// ── Google Drive helpers (export) ─────────────────────────────────────────────
async function buildOAuthDriveClient(): Promise<drive_v3.Drive> {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI belum dikonfigurasi di server.');
  }
  const oauthDoc = await admin.firestore().collection('system_settings').doc('google_drive_oauth').get();
  const refreshToken = oauthDoc.data()?.refreshToken as string | undefined;
  if (!refreshToken) {
    throw new Error('Google Drive belum terhubung. Hubungkan akun Google Drive terlebih dahulu di halaman Backup & Export.');
  }
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

function buildServiceAccountDriveClient(): drive_v3.Drive {
  const email  = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error('FIREBASE_CLIENT_EMAIL atau FIREBASE_PRIVATE_KEY belum dikonfigurasi.');
  const auth = new google.auth.JWT({ email, key: rawKey.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/drive'] });
  return google.drive({ version: 'v3', auth });
}

async function getExportDriveClient(): Promise<drive_v3.Drive> {
  try {
    const snap = await admin.firestore().collection('system_settings').doc('backup_export').get();
    const mode = snap.data()?.driveAuthMode as string | undefined;
    if (mode === 'oauth_user') return buildOAuthDriveClient();
    return buildServiceAccountDriveClient();
  } catch {
    return buildServiceAccountDriveClient();
  }
}

async function getOrCreateExportFolder(drive: drive_v3.Drive, parentId: string, name: string): Promise<string> {
  const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive', supportsAllDrives: true, includeItemsFromAllDrives: true });
  if (res.data.files?.length) return res.data.files[0].id!;
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id!;
}

async function uploadExportBuffer(
  drive: drive_v3.Drive,
  folderId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  const res = await drive.files.create({
    requestBody: { name: fileName, mimeType, parents: [folderId] },
    media: { mimeType, body: stream },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  return { fileId: res.data.id!, webViewLink: res.data.webViewLink ?? '' };
}

async function getExportFolderLink(drive: drive_v3.Drive, folderId: string): Promise<string> {
  try {
    const res = await drive.files.get({ fileId: folderId, fields: 'webViewLink', supportsAllDrives: true });
    return res.data.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`;
  } catch { return `https://drive.google.com/drive/folders/${folderId}`; }
}

// ─────────────────────────────────────────────────────────────────────────────

async function writeExportLog(params: {
  actor: { uid: string; email: string; name: string; role: string };
  exportKey: string;
  collectionName: string;
  format: ExportFormat;
  filters: Record<string, unknown>;
  status: 'success' | 'failed';
  totalDocuments: number;
  delivery?: 'google_drive' | 'local_download';
  fileName?: string;
  driveFileId?: string;
  driveWebViewLink?: string;
  driveFolderLink?: string;
  error?: string;
}) {
  const db = admin.firestore();
  const createdAt = Timestamp.now();

  // Sanitize filters: strip undefined values so Firestore doesn't reject the write
  const safeFilters = JSON.parse(JSON.stringify(params.filters ?? {}));

  try {
    await db.collection('export_logs').add({
      exportedByUid:   params.actor.uid,
      exportedByName:  params.actor.name,
      exportedByEmail: params.actor.email,
      exportKey:       params.exportKey,
      exportType:      params.exportKey,
      collectionName:  params.collectionName,
      format:          params.format,
      filters:         safeFilters,
      status:          params.status,
      totalDocuments:  params.totalDocuments,
      rowCount:        params.totalDocuments,
      delivery:        params.delivery ?? 'local_download',
      fileName:        params.fileName ?? null,
      driveFileId:     params.driveFileId ?? null,
      driveWebViewLink:params.driveWebViewLink ?? null,
      driveFolderLink: params.driveFolderLink ?? null,
      createdAt,
      error:           params.error ?? null,
    });
  } catch (err: any) {
    console.error('[export_logs] Gagal menulis log export:', err?.message ?? err);
  }

  try {
    await db.collection('audit_logs').add({
      actorUid:   params.actor.uid,
      actorName:  params.actor.name,
      actorEmail: params.actor.email,
      actorRole:  params.actor.role,
      action:     'export_data',
      category:   'backup_export',
      targetType: 'collection',
      targetName: params.collectionName,
      reason:     `Export ${params.collectionName} (${params.format.toUpperCase()})`,
      after: {
        format:          params.format,
        collectionName:  params.collectionName,
        totalDocuments:  params.totalDocuments,
        status:          params.status,
        delivery:        params.delivery ?? 'local_download',
      },
      createdAt,
    });
  } catch (err: any) {
    console.error('[audit_logs] Gagal menulis audit log:', err?.message ?? err);
  }
}

export async function POST(req: NextRequest) {
  const authResult = await verifySuperAdmin(req);
  if ('error' in authResult) return errorResponse(authResult.error, authResult.status);
  const actor = authResult;

  let body: {
    mode?: string;
    exportKey?: string;
    collectionName?: string;
    format?: ExportFormat;
    filters?: Record<string, any>;
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse('Request body tidak valid.', 400);
  }

  const exportKey = String(body.exportKey ?? body.collectionName ?? '').trim();
  const collectionName = String(body.collectionName ?? '').trim();
  const format = body.format;
  const filters = body.filters ?? {};
  const mode = body.mode ?? 'download';

  if (!['download', 'drive'].includes(mode)) {
    return errorResponse('Mode export tidak didukung.', 400);
  }
  if (!collectionName || !EXPORTABLE_COLLECTIONS.has(collectionName)) {
    return errorResponse('Collection tidak dapat diexport.', 400, `Collection "${collectionName}" tidak diizinkan.`);
  }
  if (!format || !['json', 'csv', 'xlsx'].includes(format)) {
    return errorResponse('Format export tidak didukung.', 400);
  }

  const exportedAt = new Date().toISOString();
  let rows: Record<string, unknown>[] = [];
  let totalDocuments = 0;
  let exportDataStatus: 'success' | 'empty' | 'not_found' = 'success';

  try {
    let query: FirebaseFirestore.Query = admin.firestore().collection(collectionName);

    const startDate = filters.startDate ?? filters.dateFrom;
    const endDate = filters.endDate ?? filters.dateTo;
    if ((startDate || endDate) && !NO_DATE_FILTER_COLLECTIONS.has(collectionName)) {
      if (startDate) query = query.where('createdAt', '>=', toTimestampStart(startDate));
      if (endDate) query = query.where('createdAt', '<=', toTimestampEnd(endDate));
      query = query.orderBy('createdAt', 'desc');
    }

    for (const [key, value] of Object.entries(filters)) {
      if (value === null || value === undefined || value === '' || ['dateFrom', 'dateTo', 'startDate', 'endDate', 'brand', 'division'].includes(key)) continue;
      if (key.endsWith('__in') && Array.isArray(value) && value.length > 0) {
        query = query.where(key.replace('__in', ''), 'in', value.slice(0, 30));
      } else if (!key.endsWith('__in')) {
        query = query.where(key, '==', value);
      }
    }

    const snapshot = await query.get();
    totalDocuments = snapshot.size;
    rows = snapshot.docs.map(doc => ({
      _id: doc.id,
      _path: `${collectionName}/${doc.id}`,
      ...(serializeValue(doc.data()) as Record<string, unknown>),
    }));

    if (snapshot.empty) {
      exportDataStatus = 'empty';
      rows = [makeMetadataRow('empty', collectionName, exportedAt, filters)];
    }
  } catch (err: any) {
    if (err.code === 5 || String(err.message ?? '').includes('NOT_FOUND')) {
      exportDataStatus = 'not_found';
      rows = [makeMetadataRow('not_found', collectionName, exportedAt, filters)];
    } else {
      const error = err.message ?? 'Gagal membaca collection.';
      await writeExportLog({ actor, exportKey, collectionName, format, filters, status: 'failed', totalDocuments: 0, error });
      return errorResponse('Export gagal', 500, error);
    }
  }

  const dateTag = exportedAt.slice(0, 10);
  const fileName = `hrp_${collectionName}_${dateTag}.${format}`;
  const mimeType = format === 'json'
    ? 'application/json; charset=utf-8'
    : format === 'csv'
      ? 'text/csv; charset=utf-8'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const displayName = COLLECTION_DISPLAY_NAMES[collectionName] ?? collectionName;
  const formattedRows = formatRows(rows, collectionName);

  let fileBuffer: Buffer;
  if (format === 'json') {
    const jsonOut = {
      namaLaporan: displayName,
      waktuExport: exportedAt,
      totalData: totalDocuments,
      data: formattedRows,
    };
    fileBuffer = Buffer.from(JSON.stringify(jsonOut, null, 2), 'utf-8');
  } else if (format === 'csv') {
    fileBuffer = buildCsv(formattedRows);
  } else {
    fileBuffer = buildXlsx(formattedRows, displayName);
  }

  if (mode === 'drive') {
    // Upload to Google Drive
    let drive: drive_v3.Drive;
    try {
      drive = await getExportDriveClient();
    } catch (err: any) {
      await writeExportLog({ actor, exportKey, collectionName, format, filters, status: 'failed', totalDocuments, delivery: 'google_drive', error: err.message });
      return errorResponse(err.message, 503);
    }

    // Resolve root folder from Firestore then env
    let rootFolderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID ?? '';
    try {
      const settingsSnap = await admin.firestore().collection('system_settings').doc('backup_export').get();
      const fsFolder = settingsSnap.data()?.googleDriveBackupFolderId as string | undefined;
      if (fsFolder) rootFolderId = fsFolder;
    } catch { /* use env fallback */ }

    if (!rootFolderId) {
      await writeExportLog({ actor, exportKey, collectionName, format, filters, status: 'failed', totalDocuments, delivery: 'google_drive', error: 'Folder ID belum dikonfigurasi.' });
      return errorResponse('Folder backup Google Drive belum dikonfigurasi. Isi GOOGLE_DRIVE_BACKUP_FOLDER_ID atau simpan folder ID di Pengaturan Backup.', 503);
    }

    try {
      const now = new Date();
      const yyyy = String(now.getUTCFullYear());
      const mm   = String(now.getUTCMonth() + 1).padStart(2, '0');
      const dd   = String(now.getUTCDate()).padStart(2, '0');

      const exportRootId = await getOrCreateExportFolder(drive, rootFolderId, 'HRP Export');
      const yearId       = await getOrCreateExportFolder(drive, exportRootId, yyyy);
      const monthId      = await getOrCreateExportFolder(drive, yearId, mm);
      const dayId        = await getOrCreateExportFolder(drive, monthId, dd);

      const { fileId, webViewLink } = await uploadExportBuffer(drive, dayId, fileName, fileBuffer, mimeType);
      const folderLink = await getExportFolderLink(drive, dayId);

      await writeExportLog({
        actor, exportKey, collectionName, format, filters,
        status: 'success', totalDocuments,
        delivery: 'google_drive',
        fileName,
        driveFileId: fileId,
        driveWebViewLink: webViewLink,
        driveFolderLink: folderLink,
      });

      return NextResponse.json({
        success: true,
        fileName,
        totalDocuments,
        webViewLink,
        fileId,
        folderLink,
        exportDataStatus,
      });
    } catch (err: any) {
      const error = err.message ?? 'Upload ke Google Drive gagal.';
      await writeExportLog({ actor, exportKey, collectionName, format, filters, status: 'failed', totalDocuments, delivery: 'google_drive', error });
      return errorResponse(`Upload ke Google Drive gagal: ${error}`, 500);
    }
  }

  // mode === 'download'
  await writeExportLog({ actor, exportKey, collectionName, format, filters, status: 'success', totalDocuments, delivery: 'local_download', fileName });

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'X-Export-File-Name': fileName,
      'X-Total-Documents': String(totalDocuments),
      'X-Export-Data-Status': exportDataStatus,
    },
  });
}
