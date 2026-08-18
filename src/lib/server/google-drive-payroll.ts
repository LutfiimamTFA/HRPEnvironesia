import 'server-only';
import { google, drive_v3 } from 'googleapis';

/**
 * Dedicated, independent Google Drive access for Template Payroll / Rekap
 * Absensi — a system service account, never the Backup & Export OAuth user
 * connection (system_settings/google_drive_oauth). This is what keeps HRD's
 * payroll export working even while Backup & Export shows OAuth as expired,
 * disconnected, or invalid_grant — the two are unrelated failure domains.
 *
 * Upload goes through the Apps Script bridge (google-drive-apps-script.ts);
 * this module only needs to read files back, which the service account can
 * do on its own as long as the destination folder is shared with it.
 */

export class PayrollDriveAccessError extends Error {
  code: 'invalid_file' | 'not_found' | 'permission_denied' | 'not_configured' | 'unknown';
  constructor(code: PayrollDriveAccessError['code'], message: string) {
    super(message);
    this.name = 'PayrollDriveAccessError';
    this.code = code;
  }
}

function getPayrollDriveClient(): drive_v3.Drive {
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY;

  if (!clientEmail || !privateKeyRaw) {
    throw new PayrollDriveAccessError(
      'not_configured',
      'Kredensial akun sistem Google Drive untuk Template Payroll belum dikonfigurasi. Hubungi Super Admin.',
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKeyRaw.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  return google.drive({ version: 'v3', auth });
}

/**
 * Downloads a payroll template's raw bytes from Google Drive by fileId.
 * Never touches system_settings/google_drive_oauth, driveConnected, or any
 * Backup & Export state — a failure here must never be reported as an
 * "OAuth terputus" problem, since it isn't one.
 */
export async function downloadPayrollTemplateFromDrive(fileId: string): Promise<Buffer> {
  if (!fileId) {
    throw new PayrollDriveAccessError(
      'invalid_file',
      'Template payroll tidak memiliki fileId Google Drive. Upload ulang template dari menu Template Payroll.',
    );
  }

  const drive = getPayrollDriveClient();

  console.info('[Payroll Template] Download using service account', { driveFileId: fileId });

  try {
    const fileResponse = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    );
    return Buffer.from(fileResponse.data as ArrayBuffer);
  } catch (err: any) {
    const status = err?.code || err?.response?.status;
    if (status === 404) {
      throw new PayrollDriveAccessError(
        'not_found',
        `File template tidak ditemukan di Google Drive (fileId: ${fileId}). File mungkin sudah dihapus/dipindahkan. Upload ulang template.`,
      );
    }
    if (status === 403) {
      throw new PayrollDriveAccessError(
        'permission_denied',
        'Template ditemukan tetapi akun sistem belum memiliki akses ke file Google Drive. Hubungi Super Admin untuk memberikan akses folder Template Payroll kepada akun sistem.',
      );
    }
    throw new PayrollDriveAccessError(
      'unknown',
      `Gagal mengambil file template dari Google Drive (fileId: ${fileId}): ${err?.message || 'kesalahan tidak diketahui'}.`,
    );
  }
}
