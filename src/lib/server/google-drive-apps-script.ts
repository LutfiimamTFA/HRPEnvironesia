import 'server-only';

/**
 * Shared bridge to the Google Drive Apps Script uploader (GOOGLE_APPS_SCRIPT_CODE.gs)
 * — the same system-level uploader already used for candidate documents, profile
 * photos, offering letters, etc. via /api/storage/google-drive-upload. Runs under
 * the Apps Script's own deployment identity (its "Execute As" account), never the
 * Backup & Export OAuth user connection.
 *
 * Extracted here as a plain function (not an HTTP round-trip) so any server-side
 * feature — Template Payroll included — can reuse the exact same upload path
 * without going through another Next.js API route.
 */

export class AppsScriptUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppsScriptUploadError';
  }
}

export interface AppsScriptUploadResult {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  driveFolderId?: string;
  driveFolderPath?: string;
  webViewLink?: string;
  driveDownloadUrl?: string;
}

export interface AppsScriptUploadParams {
  fileName: string;
  fileType: string;
  buffer: Buffer;
  /** Determines the destination subfolder — see buildFolderPath() in Code.gs. */
  category?: string;
  ownerUid?: string;
  applicationId?: string;
  offeringId?: string;
  brandId?: string;
  uploadedBy?: string;
  /** Defaults to GOOGLE_DRIVE_ROOT_FOLDER_ID. */
  rootFolderId?: string;
}

export async function uploadFileToAppsScript(
  params: AppsScriptUploadParams,
): Promise<AppsScriptUploadResult> {
  const appsScriptUrl = process.env.GOOGLE_DRIVE_APPS_SCRIPT_URL;
  const uploadSecret = process.env.GOOGLE_DRIVE_UPLOAD_SECRET;
  const rootFolderId = params.rootFolderId || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  if (!appsScriptUrl || !appsScriptUrl.startsWith('https://script.google.com/macros/s/') || !appsScriptUrl.endsWith('/exec')) {
    throw new AppsScriptUploadError('GOOGLE_DRIVE_APPS_SCRIPT_URL belum dikonfigurasi dengan benar (harus Web app URL Apps Script yang berakhir /exec).');
  }
  if (!uploadSecret) {
    throw new AppsScriptUploadError('GOOGLE_DRIVE_UPLOAD_SECRET belum dikonfigurasi.');
  }
  if (!rootFolderId) {
    throw new AppsScriptUploadError('GOOGLE_DRIVE_ROOT_FOLDER_ID belum dikonfigurasi.');
  }

  const base64File = params.buffer.toString('base64');

  const response = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: uploadSecret,
      fileName: params.fileName,
      fileType: params.fileType,
      base64: base64File,
      rootFolderId,
      category: params.category || '',
      ownerUid: params.ownerUid || '',
      applicationId: params.applicationId || '',
      offeringId: params.offeringId || '',
      brandId: params.brandId || '',
      uploadedBy: params.uploadedBy || 'system',
    }),
  });

  const rawText = await response.text();

  if (rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html')) {
    throw new AppsScriptUploadError('Apps Script mengembalikan HTML, bukan JSON. Periksa deployment Apps Script (URL harus /exec, akses harus Anyone).');
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new AppsScriptUploadError('Apps Script mengembalikan format tidak valid (bukan JSON).');
  }

  if (!response.ok || !data.success) {
    let message = data.message || 'Gagal upload ke Google Drive via Apps Script.';
    if (String(message).toLowerCase().includes('unauthorized')) {
      message = 'Secret upload tidak sesuai dengan Apps Script.';
    }
    throw new AppsScriptUploadError(message);
  }

  if (!data.fileId) {
    throw new AppsScriptUploadError('Upload berhasil tetapi Apps Script tidak mengembalikan fileId.');
  }

  return {
    fileId: data.fileId,
    fileName: data.fileName || params.fileName,
    fileSize: data.fileSize || params.buffer.length,
    fileType: data.fileType || params.fileType,
    driveFolderId: data.driveFolderId,
    driveFolderPath: data.driveFolderPath,
    webViewLink: data.webViewLink || data.driveViewUrl,
    driveDownloadUrl: data.driveDownloadUrl,
  };
}
