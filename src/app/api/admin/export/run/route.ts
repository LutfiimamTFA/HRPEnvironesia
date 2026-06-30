import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';

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

function flattenDoc(doc: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(doc)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined) {
      out[path] = '';
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenDoc(value as Record<string, unknown>, path));
    } else if (Array.isArray(value)) {
      out[path] = JSON.stringify(value);
    } else {
      out[path] = String(value);
    }
  }
  return out;
}

function buildCsv(rows: Record<string, unknown>[]): Buffer {
  const flat = rows.map(row => flattenDoc(row));
  const headers = Array.from(new Set(flat.flatMap(row => Object.keys(row))));
  const escape = (value: string) => `"${(value ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escape).join(','),
    ...flat.map(row => headers.map(header => escape(row[header] ?? '')).join(',')),
  ];
  return Buffer.from(lines.join('\n'), 'utf-8');
}

function buildXlsx(rows: Record<string, unknown>[], sheetName: string): Buffer {
  const flat = rows.map(row => flattenDoc(row));
  const headers = Array.from(new Set(flat.flatMap(row => Object.keys(row))));
  const worksheet = XLSX.utils.aoa_to_sheet([
    headers,
    ...flat.map(row => headers.map(header => row[header] ?? '')),
  ]);
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  worksheet['!cols'] = headers.map(header => ({ wch: Math.min(Math.max(header.length, 10), 50) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.replace(/[\\/*?:[\]]/g, '_').slice(0, 31));
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
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

async function writeExportLog(params: {
  actor: { uid: string; email: string; name: string; role: string };
  exportKey: string;
  collectionName: string;
  format: ExportFormat;
  filters: Record<string, unknown>;
  status: 'success' | 'failed';
  totalDocuments: number;
  error?: string;
}) {
  const db = admin.firestore();
  const createdAt = Timestamp.now();

  try {
    await db.collection('export_logs').add({
      exportedByUid: params.actor.uid,
      exportedByName: params.actor.name,
      exportedByEmail: params.actor.email,
      exportKey: params.exportKey,
      exportType: params.exportKey,
      collectionName: params.collectionName,
      format: params.format,
      filters: params.filters,
      status: params.status,
      totalDocuments: params.totalDocuments,
      rowCount: params.totalDocuments,
      createdAt,
      error: params.error ?? null,
    });
  } catch {
    // Logging is best effort so export failures stay visible to the caller.
  }

  try {
    await db.collection('audit_logs').add({
      actorUid: params.actor.uid,
      actorName: params.actor.name,
      actorEmail: params.actor.email,
      actorRole: params.actor.role,
      action: 'export_data',
      category: 'backup_export',
      targetType: 'collection',
      targetName: params.collectionName,
      reason: `Export ${params.collectionName} (${params.format.toUpperCase()})`,
      after: {
        format: params.format,
        collectionName: params.collectionName,
        totalDocuments: params.totalDocuments,
        status: params.status,
      },
      createdAt,
    });
  } catch {
    // Best effort.
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

  if (mode !== 'download') {
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

  let fileBuffer: Buffer;
  if (format === 'json') {
    fileBuffer = Buffer.from(JSON.stringify(rows, null, 2), 'utf-8');
  } else if (format === 'csv') {
    fileBuffer = buildCsv(rows);
  } else {
    fileBuffer = buildXlsx(rows, collectionName);
  }

  await writeExportLog({ actor, exportKey, collectionName, format, filters, status: 'success', totalDocuments });

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
