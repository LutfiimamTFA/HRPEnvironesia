import express, { Request, Response } from 'express';
import admin from 'firebase-admin';
import { loadBackupSettings, runScheduledBackup, BackupType, BackupFormat } from './backup';

// ── Firebase Admin init ───────────────────────────────────────────────────────
if (!admin.apps.length) {
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey      = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawKey) {
    console.error('Missing Firebase credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: rawKey.replace(/\\n/g, '\n'),
    }),
  });
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// ── Auth middleware ───────────────────────────────────────────────────────────
function verifyBackupSecret(req: Request, res: Response, next: () => void) {
  const secret = process.env.BACKUP_SECRET;
  if (!secret) {
    console.error('BACKUP_SECRET env var not set');
    res.status(500).json({ error: 'Server misconfigured: BACKUP_SECRET not set' });
    return;
  }
  const auth = req.headers.authorization ?? '';
  if (auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// ── GET /health ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hrp-cloud-backup', timestamp: new Date().toISOString() });
});

// ── GET /status ───────────────────────────────────────────────────────────────
app.get('/status', verifyBackupSecret, async (_req, res) => {
  try {
    const settings = await loadBackupSettings();
    const logsSnap = await admin.firestore()
      .collection('backup_logs')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    const recentLogs = logsSnap.docs.map(d => d.data());
    res.json({ settings, recentLogs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /backup ──────────────────────────────────────────────────────────────
// Called by Cloud Scheduler (daily, weekly, monthly) or ad-hoc trigger.
// Body: { backupType: 'scheduled_daily' | 'scheduled_weekly' | 'scheduled_monthly', reason?: string }
app.post('/backup', verifyBackupSecret, async (req: Request, res: Response) => {
  const startTs = Date.now();
  console.log('[backup] Request received:', req.body);

  const requestedType: BackupType = req.body?.backupType ?? 'scheduled_daily';
  const reason: string = req.body?.reason ?? `Scheduled backup — ${requestedType}`;

  // Load settings from Firestore
  let settings;
  try {
    settings = await loadBackupSettings();
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load settings: ${err.message}` });
    return;
  }

  // Check if auto backup is enabled
  if (!settings.autoBackupEnabled) {
    console.log('[backup] Auto backup disabled — skipping');
    res.json({ skipped: true, reason: 'autoBackupEnabled is false in system_settings' });
    return;
  }

  // Check if this specific type is enabled
  const typeEnabled =
    (requestedType === 'scheduled_daily'   && settings.dailyBackupEnabled) ||
    (requestedType === 'scheduled_weekly'  && settings.weeklyBackupEnabled) ||
    (requestedType === 'scheduled_monthly' && settings.monthlyBackupEnabled) ||
    requestedType === 'manual';

  if (!typeEnabled) {
    console.log(`[backup] ${requestedType} disabled — skipping`);
    res.json({ skipped: true, reason: `${requestedType} is disabled in system_settings` });
    return;
  }

  const backupRootId = settings.googleDriveBackupFolderId || process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;
  if (!backupRootId) {
    res.status(500).json({ error: 'Google Drive backup folder ID not configured' });
    return;
  }

  const formats: BackupFormat[] = settings.backupFormats?.length ? settings.backupFormats : ['json', 'csv', 'xlsx'];

  try {
    console.log(`[backup] Starting ${requestedType} — formats: ${formats.join(', ')}`);
    const result = await runScheduledBackup({ backupType: requestedType, reason, formats, backupRootId });
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
    console.log(`[backup] Done in ${elapsed}s — status: ${result.status} — docs: ${result.totalDocuments} — files: ${result.totalFiles}`);
    res.json({ ...result, elapsedSeconds: Number(elapsed) });
  } catch (err: any) {
    console.error('[backup] Fatal error:', err);
    res.status(500).json({ error: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined });
  }
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 8080);
app.listen(PORT, () => {
  console.log(`[hrp-cloud-backup] Listening on port ${PORT}`);
  console.log(`  Project: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(`  Drive folder: ${process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID}`);
});
