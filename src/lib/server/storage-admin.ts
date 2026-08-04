import 'server-only';
import { google, drive_v3 } from 'googleapis';
import admin from '@/lib/firebase/admin';

export const STORAGE_SCAN_LIMIT = 400;

export type StorageFileCategory =
  | 'backup_export'
  | 'candidate_documents'
  | 'offering_letter'
  | 'submission_attachments'
  | 'employee_documents'
  | 'profile_photos';

export const CATEGORY_LABEL: Record<StorageFileCategory, string> = {
  backup_export: 'Backup & Export',
  candidate_documents: 'Dokumen Kandidat',
  offering_letter: 'Offering Letter',
  submission_attachments: 'Lampiran Pengajuan',
  employee_documents: 'Dokumen Karyawan',
  profile_photos: 'Foto Profil',
};

/** "Dipakai Untuk" — human-readable description of what each category is used for. */
export const CATEGORY_USAGE: Record<StorageFileCategory, string> = {
  backup_export: 'Backup Sistem / Export Data',
  candidate_documents: 'Dokumen Lamaran Kandidat',
  offering_letter: 'Offering Letter Kandidat',
  submission_attachments: 'Pengajuan Cuti/Izin/Lembur/Dinas',
  employee_documents: 'Dokumen Kepegawaian',
  profile_photos: 'Foto Profil Karyawan',
};

/**
 * Classifies a Storage/Drive file path into one of the 7 Storage Category
 * buckets by folder-name heuristics. This is a best-effort classifier, not an
 * exact schema match — upload paths across the app aren't fully standardized,
 * so a file that doesn't match any known prefix falls back to
 * 'employee_documents' rather than being silently dropped.
 */
export function categorizeStoragePath(path: string): StorageFileCategory {
  const p = path.toLowerCase();
  if (p.includes('backup') || p.includes('export')) return 'backup_export';
  if (p.includes('offering')) return 'offering_letter';
  if (p.includes('profile_photo') || p.includes('foto_profil') || p.includes('/photo')) return 'profile_photos';
  if (p.includes('candidate') || p.includes('cv/') || p.includes('/cv')) return 'candidate_documents';
  if (
    p.includes('leave') || p.includes('cuti') ||
    p.includes('permission') || p.includes('izin') ||
    p.includes('overtime') || p.includes('lembur') ||
    p.includes('business_trip') || p.includes('dinas') ||
    p.includes('attachment') || p.includes('lampiran')
  ) return 'submission_attachments';
  return 'employee_documents';
}

/**
 * Best-effort "is this file still owned by an existing record" check.
 * Storage paths in this app commonly follow a {category}/{ownerUid}/{filename}
 * convention. Rather than trying to exact-match every possible Firestore field
 * name that might reference a file (they're inconsistent across collections —
 * documentUrl, storagePath, driveFileId, attachmentUrl, lampiranUrl, ...), this
 * extracts the owner UID segment from the path and checks whether that owner's
 * record still exists. This is NOT a byte-for-byte reference check; it's a
 * pragmatic signal of "does the person/record this file belongs to still
 * exist", which is what actually matters for orphan cleanup decisions.
 */
export async function checkFileStillOwned(
  db: FirebaseFirestore.Firestore,
  category: StorageFileCategory,
  path: string,
): Promise<{ referenced: boolean; note: string; linkedTo: string | null }> {
  const segments = path.split('/').filter(Boolean);
  const looksLikeUid = (s: string) => /^[A-Za-z0-9_-]{20,36}$/.test(s);
  const ownerUid = segments.find(looksLikeUid);

  if (!ownerUid) {
    return { referenced: true, note: 'Tidak bisa dipastikan otomatis (format path tidak mengandung ID pemilik) — dianggap aman.', linkedTo: null };
  }

  try {
    if (category === 'candidate_documents' || category === 'offering_letter') {
      const appsSnap = await db.collection('applications').where('candidateUid', '==', ownerUid).limit(1).get();
      if (!appsSnap.empty) return { referenced: true, note: 'Kandidat pemilik file masih terdaftar.', linkedTo: `applications/${appsSnap.docs[0].id}` };
      const userSnap = await db.collection('users').doc(ownerUid).get();
      return {
        referenced: userSnap.exists,
        note: userSnap.exists ? 'Akun pemilik file masih ada.' : 'Akun/aplikasi pemilik file sudah tidak ditemukan.',
        linkedTo: userSnap.exists ? `users/${ownerUid}` : null,
      };
    }

    // employee_documents, profile_photos, submission_attachments, backup_export (rare to have owner uid)
    const [userSnap, profileSnap] = await Promise.all([
      db.collection('users').doc(ownerUid).get(),
      db.collection('employee_profiles').doc(ownerUid).get(),
    ]);
    const referenced = userSnap.exists || profileSnap.exists;
    const linkedTo = profileSnap.exists ? `employee_profiles/${ownerUid}` : userSnap.exists ? `users/${ownerUid}` : null;
    return { referenced, note: referenced ? 'Karyawan pemilik file masih terdaftar.' : 'Karyawan pemilik file sudah tidak ditemukan di users/employee_profiles.', linkedTo };
  } catch {
    return { referenced: true, note: 'Gagal memverifikasi — dianggap aman untuk menghindari false-positive.', linkedTo: null };
  }
}

export function getFirebaseBucket() {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new Error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET belum dikonfigurasi.');
  return admin.storage().bucket(bucketName);
}

/** Read-only Drive client via the service-account JWT already used for backups. */
export function getDriveClient(): drive_v3.Drive {
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error('Missing FIREBASE_CLIENT_EMAIL atau FIREBASE_PRIVATE_KEY.');
  const auth = new google.auth.JWT({ email, key: rawKey.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  return google.drive({ version: 'v3', auth });
}

export class DriveTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveTokenError';
  }
}

/**
 * Resolves a Google Drive client for Storage Management's connection test/scan.
 * Prefers the user-connected OAuth token (system_settings/google_drive_oauth —
 * the same connection shared with Backup & Export) since that's what "Hubungkan
 * Ulang Google Drive" reconnects; falls back to the service-account JWT if no
 * OAuth token has been connected yet, so existing scans keep working.
 */
export async function resolveDriveClient(db: FirebaseFirestore.Firestore): Promise<{ drive: drive_v3.Drive; mode: 'oauth_user' | 'service_account' }> {
  const oauthDoc = await db.collection('system_settings').doc('google_drive_oauth').get();
  const refreshToken = oauthDoc.exists ? (oauthDoc.data()?.refreshToken as string | undefined) : undefined;

  if (refreshToken) {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new DriveTokenError('Token Google Drive belum tersedia');
    }
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    try {
      await oauth2Client.getAccessToken();
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      if (msg.toLowerCase().includes('invalid_grant')) {
        throw new DriveTokenError('Refresh token tidak valid, hubungkan ulang Google Drive');
      }
      throw new DriveTokenError('Token Google Drive belum tersedia');
    }
    return { drive: google.drive({ version: 'v3', auth: oauth2Client }), mode: 'oauth_user' };
  }

  try {
    return { drive: getDriveClient(), mode: 'service_account' };
  } catch {
    throw new DriveTokenError('Token Google Drive belum tersedia');
  }
}

/** Best-effort lookup of the connected Drive account's email via about.get. */
export async function getDriveConnectedEmail(drive: drive_v3.Drive): Promise<string | null> {
  try {
    const res = await drive.about.get({ fields: 'user(emailAddress,displayName)' });
    return res.data.user?.emailAddress ?? null;
  } catch {
    return null;
  }
}

export interface StorageProviderConfig {
  activeProvider: 'google_drive' | 'firebase_storage';
  fallbackProvider: 'firebase_storage';
  googleDrive: {
    enabled: boolean;
    folderId: string | null;
    folderName: string | null;
    connectedEmail: string | null;
    status: 'connected' | 'not_connected' | 'error';
    canRead?: boolean;
    canUpload?: boolean;
    lastTestedAt?: any;
    lastError?: string | null;
  };
  firebaseStorage: {
    enabled: boolean;
    bucketName: string | null;
    basePath: string;
    status: 'connected' | 'not_tested' | 'error';
    canRead?: boolean;
    canUpload?: boolean;
    lastTestedAt?: any;
    lastError?: string | null;
  };
  updatedAt?: any;
  updatedByUid?: string | null;
}

/**
 * Only one provider may be active at a time. `enabled` mirrors `activeProvider`
 * so the UI never has to guess — the inactive provider is always `enabled:
 * false` regardless of whether it was tested/connected before.
 */
export async function getStorageProviderConfig(db: FirebaseFirestore.Firestore): Promise<StorageProviderConfig> {
  const ref = db.collection('system_settings').doc('storage_provider');
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data() as StorageProviderConfig;
    return {
      ...data,
      googleDrive: { ...data.googleDrive, enabled: data.activeProvider === 'google_drive' },
      firebaseStorage: { ...data.firebaseStorage, enabled: data.activeProvider === 'firebase_storage' },
    };
  }

  // No config yet — derive a sensible default from the legacy env-based setup.
  const envProvider = process.env.NEXT_PUBLIC_STORAGE_PROVIDER ?? '';
  const activeProvider: StorageProviderConfig['activeProvider'] = envProvider.toLowerCase().includes('drive') ? 'google_drive' : 'firebase_storage';
  return {
    activeProvider,
    fallbackProvider: 'firebase_storage',
    googleDrive: {
      enabled: activeProvider === 'google_drive',
      folderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? null,
      folderName: null,
      connectedEmail: process.env.GOOGLE_DRIVE_CLIENT_EMAIL ?? process.env.FIREBASE_CLIENT_EMAIL ?? null,
      status: 'not_connected',
    },
    firebaseStorage: {
      enabled: activeProvider === 'firebase_storage',
      bucketName: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? null,
      basePath: '/',
      status: 'not_tested',
    },
  };
}
