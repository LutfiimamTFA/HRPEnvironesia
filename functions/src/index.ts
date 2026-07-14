import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { runBackup, loadBackupSettings, BackupType, BackupFormat } from './backup';

export { onConditionReportCreated } from './notifications';

// ── Firebase Admin init ───────────────────────────────────────────────────────
// Runs inside Firebase — auto-uses project's default service account for Firestore.
// Google Drive API credentials are loaded from Firebase Secrets below.
if (!admin.apps.length) {
  admin.initializeApp();
}

// ── Firebase Secrets ──────────────────────────────────────────────────────────
// Set these once via:
//   firebase functions:secrets:set BACKUP_CRON_SECRET
//   firebase functions:secrets:set FIREBASE_CLIENT_EMAIL
//   firebase functions:secrets:set FIREBASE_PRIVATE_KEY
//   firebase functions:secrets:set GOOGLE_DRIVE_BACKUP_FOLDER_ID
const SECRET_BACKUP_CRON   = defineSecret('BACKUP_CRON_SECRET');
const SECRET_CLIENT_EMAIL  = defineSecret('FIREBASE_CLIENT_EMAIL');
const SECRET_PRIVATE_KEY   = defineSecret('FIREBASE_PRIVATE_KEY');
const SECRET_DRIVE_FOLDER  = defineSecret('GOOGLE_DRIVE_BACKUP_FOLDER_ID');

// ── runBackup HTTP Function ───────────────────────────────────────────────────
export const runBackupFn = onRequest(
  {
    secrets: [SECRET_BACKUP_CRON, SECRET_CLIENT_EMAIL, SECRET_PRIVATE_KEY, SECRET_DRIVE_FOLDER],
    timeoutSeconds: 540,
    memory: '1GiB',
    region: 'asia-southeast2',  // Jakarta — dekat dengan data Firestore
    cors: false,
  },
  async (req, res) => {
    const startTs = Date.now();

    // ── Only POST ─────────────────────────────────────────────────────────────
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
      return;
    }

    // ── Verify secret ─────────────────────────────────────────────────────────
    const expectedSecret = SECRET_BACKUP_CRON.value();
    const authHeader = (req.headers.authorization ?? '') as string;
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      console.warn('[runBackup] Unauthorized request from', req.ip);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const typeInput: string = req.body?.type ?? 'daily';
    const validTypes = ['daily', 'weekly', 'monthly'];
    if (!validTypes.includes(typeInput)) {
      res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
      return;
    }
    const backupType: BackupType = `scheduled_${typeInput}` as BackupType;
    const reason: string = req.body?.reason ?? `Backup ${typeInput} otomatis — ${new Date().toISOString()}`;

    // ── Load settings from Firestore ─────────────────────────────────────────
    const settings = await loadBackupSettings();

    // ── Check if this type is enabled ─────────────────────────────────────────
    if (!settings.autoBackupEnabled) {
      console.log('[runBackup] Skipped — autoBackupEnabled is false');
      res.json({ skipped: true, reason: 'autoBackupEnabled is false in system_settings/backup_export' });
      return;
    }

    const typeEnabledMap: Record<string, boolean> = {
      scheduled_daily:   settings.dailyBackupEnabled,
      scheduled_weekly:  settings.weeklyBackupEnabled,
      scheduled_monthly: settings.monthlyBackupEnabled,
    };
    if (!typeEnabledMap[backupType]) {
      console.log(`[runBackup] Skipped — ${backupType} is disabled`);
      res.json({ skipped: true, reason: `${backupType} is disabled in system_settings/backup_export` });
      return;
    }

    // ── Resolve credentials from secrets ──────────────────────────────────────
    const clientEmail  = SECRET_CLIENT_EMAIL.value();
    const privateKey   = SECRET_PRIVATE_KEY.value();
    const backupRootId = SECRET_DRIVE_FOLDER.value() || settings.googleDriveBackupFolderId;

    if (!clientEmail || !privateKey) {
      res.status(500).json({ error: 'Google Drive credentials not configured. Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY secrets.' });
      return;
    }
    if (!backupRootId) {
      res.status(500).json({ error: 'GOOGLE_DRIVE_BACKUP_FOLDER_ID not configured.' });
      return;
    }

    const formats: BackupFormat[] = settings.backupFormats?.length ? settings.backupFormats : ['json', 'csv', 'xlsx'];

    // ── Run backup ────────────────────────────────────────────────────────────
    console.log(`[runBackup] Starting ${backupType} — formats: ${formats.join(', ')}`);
    try {
      const result = await runBackup({ backupType, reason, formats, backupRootId, clientEmail, privateKey });
      const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
      console.log(`[runBackup] Done in ${elapsed}s — status: ${result.status} — docs: ${result.totalDocuments} — files: ${result.totalFiles}`);
      res.json({ ...result, elapsedSeconds: Number(elapsed) });
    } catch (err: any) {
      console.error('[runBackup] Fatal error:', err.message);
      res.status(500).json({ error: err.message });
    }
  },
);
