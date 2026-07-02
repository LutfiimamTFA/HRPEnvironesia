import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Scenario = 'login_storm' | 'page_access' | 'upload_storm' | 'export_storm' | 'mixed';

const SCENARIO_STEPS: Record<Scenario, string[]> = {
  login_storm: ['Request Login', 'Auth Verification', 'Role Check', 'Session Created', 'Dashboard Loaded'],
  page_access: ['Route Requested', 'Permission Check', 'Data Fetch', 'Page Rendered'],
  upload_storm: ['Validasi File', 'Upload Berjalan', 'File Tersimpan', 'Metadata Tersimpan', 'Selesai'],
  export_storm: ['Request', 'Generate File', 'Upload Drive', 'Simpan Log', 'Selesai'],
  mixed: ['Login', 'Page View', 'Upload', 'Export / Backup', 'Error Handling'],
};

const ROLES = ['karyawan', 'karyawan', 'karyawan', 'hrd', 'manager', 'kandidat'];
const ROUTES = [
  '/admin/karyawan/dashboard',
  '/admin/hrd/monitoring/absen',
  '/admin/recruitment',
  '/admin/karyawan/pengajuan-cuti',
  '/admin/super-admin/analytics-system',
];
const DOC_TYPES = ['dummy-attendance.jpg', 'dummy-candidate.pdf', 'dummy-leave.pdf', 'dummy-export.xlsx'];
const MAX_PERSISTED_EVENTS_PER_TICK = 8;
const MAX_SAMPLE_EVENTS_PER_SIMULATION = 240;

async function verifySuperAdmin(req: NextRequest) {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return { error: 'Unauthorized', status: 401 };
  try {
    const decoded = await admin.auth().verifyIdToken(auth.slice(7));
    const snap = await admin.firestore().collection('users').doc(decoded.uid).get();
    const role = String(snap.data()?.role ?? '').trim();
    if (!['super-admin', 'super_admin', 'superadmin'].includes(role)) return { error: 'Forbidden', status: 403 };
    return { uid: decoded.uid, email: decoded.email ?? snap.data()?.email ?? '' };
  } catch (e: any) {
    return { error: e.message ?? 'Unauthorized', status: 401 };
  }
}

function pick<T>(items: T[], i: number) {
  return items[Math.abs(i) % items.length];
}

function eventKind(scenario: Scenario, i: number) {
  if (scenario === 'login_storm') return 'login';
  if (scenario === 'page_access') return 'page_view';
  if (scenario === 'upload_storm') return 'file_uploaded';
  if (scenario === 'export_storm') return i % 2 === 0 ? 'export_data' : 'backup_data';
  return ['login', 'page_view', 'file_uploaded', 'export_data', 'backup_data'][i % 5];
}

function moduleFor(kind: string) {
  if (kind === 'login') return 'Auth';
  if (kind === 'page_view') return 'Page Access';
  if (kind === 'file_uploaded') return 'Storage & File';
  if (kind === 'backup_data') return 'Backup & Export';
  return 'Backup & Export';
}

function durationFor(kind: string, step: string) {
  const base = kind === 'file_uploaded' ? 520 : kind === 'export_data' || kind === 'backup_data' ? 900 : kind === 'login' ? 220 : 140;
  const stepCost = step.includes('Dashboard') || step.includes('Generate') || step.includes('Upload') ? 280 : 60;
  return Math.round(base + stepCost + Math.random() * (kind === 'file_uploaded' ? 1600 : 420));
}

function loadProfile(userCount: number) {
  if (userCount >= 300) return { activeMin: .72, activeMax: .96, eventFactor: .95, errorMin: .20, errorMax: .45, rtMin: 3000, rtMax: 8000 };
  if (userCount >= 100) return { activeMin: .58, activeMax: .88, eventFactor: .82, errorMin: .08, errorMax: .20, rtMin: 1000, rtMax: 2500 };
  if (userCount >= 50) return { activeMin: .45, activeMax: .75, eventFactor: .72, errorMin: .03, errorMax: .10, rtMin: 600, rtMax: 1200 };
  return { activeMin: .28, activeMax: .55, eventFactor: .62, errorMin: 0, errorMax: .05, rtMin: 300, rtMax: 700 };
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function durationForLoad(kind: string, step: string, profile: ReturnType<typeof loadProfile>) {
  const kindMultiplier = kind === 'file_uploaded' ? 1.25 : kind === 'export_data' || kind === 'backup_data' ? 1.55 : kind === 'page_view' ? .85 : 1;
  const stepMultiplier = step.includes('Dashboard') || step.includes('Generate') || step.includes('Upload') ? 1.25 : 1;
  return Math.round(randomBetween(profile.rtMin, profile.rtMax) * kindMultiplier * stepMultiplier);
}

export async function POST(req: NextRequest) {
  const auth = await verifySuperAdmin(req);
  if ('error' in auth) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Body tidak valid.' }, { status: 400 }); }

  const scenario = String(body.scenario ?? 'mixed') as Scenario;
  const steps = SCENARIO_STEPS[scenario] ?? SCENARIO_STEPS.mixed;
  const simulationId = String(body.simulationId ?? '').trim();
  const userCount = Math.max(1, Math.round(Number(body.userCount ?? 25)));
  const tick = Math.max(0, Number(body.tick ?? 0));
  const persistTestData = body.persistTestData !== false;
  if (!simulationId.startsWith('sim_')) return NextResponse.json({ success: false, message: 'simulationId tidak valid.' }, { status: 400 });

  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (body.aggregateOnly === true) {
    const summary = body.tickSummary ?? {};
    if (persistTestData) {
      try {
        await db.collection('synthetic_load_test_ticks').doc(`${simulationId}_${tick}`).set({
          simulationId,
          second: tick,
          activeUsers: Math.max(0, Math.round(Number(summary.activeUsers ?? 0))),
          totalEvents: Math.max(0, Math.round(Number(summary.totalEvents ?? 0))),
          successCount: Math.max(0, Math.round(Number(summary.successCount ?? 0))),
          failedCount: Math.max(0, Math.round(Number(summary.failedCount ?? 0))),
          avgResponseMs: Math.max(0, Math.round(Number(summary.avgResponseMs ?? 0))),
          p95ResponseMs: Math.max(0, Math.round(Number(summary.p95ResponseMs ?? 0))),
          requestPerMinute: Math.max(0, Math.round(Number(summary.requestPerMinute ?? 0))),
          currentStep: String(summary.currentStep ?? '-'),
          createdAt: now,
          isSimulation: true,
          isTest: true,
        }, { merge: true });
      } catch (error: any) {
        const code = error?.code ?? '';
        const persistenceWarning = code === 8 || code === 'resource-exhausted'
          ? 'Firestore quota limit terdeteksi. Simulasi tetap berjalan lokal, tetapi penyimpanan realtime dibatasi.'
          : 'Ringkasan realtime synthetic tidak berhasil disimpan. Simulasi tetap berjalan lokal.';
        console.warn('[synthetic-test:aggregate]', code || error?.message || error);
        return NextResponse.json({ success: true, simulationId, persisted: false, persistenceWarning });
      }
    }

    return NextResponse.json({ success: true, simulationId, persisted: persistTestData, aggregateOnly: true });
  }

  const profile = loadProfile(userCount);
  const activeUsers = Math.max(1, Math.ceil(userCount * randomBetween(profile.activeMin, profile.activeMax)));
  const scenarioFactor = scenario === 'export_storm' ? .42 : scenario === 'upload_storm' ? .62 : scenario === 'page_access' ? .78 : .9;
  const eventCount = Math.max(1, Math.min(120, Math.ceil(activeUsers * profile.eventFactor * scenarioFactor)));
  const scenarioRisk = scenario === 'export_storm' ? .04 : scenario === 'upload_storm' ? .03 : scenario === 'page_access' ? .015 : .02;
  const errorRate = Math.min(.55, randomBetween(profile.errorMin, profile.errorMax) + scenarioRisk);

  const batch = db.batch();
  const durations: number[] = [];
  const stepCounts = new Map<string, number>();
  const roleCounts = new Map<string, number>();
  const uploadDetails = new Map<string, { count: number; failCount: number; totalBytes: number }>();
  let successCount = 0;
  let failedCount = 0;
  let loginCount = 0;
  let pageViewCount = 0;
  let uploadCount = 0;
  let exportCount = 0;
  let errorCount = 0;
  let storageGrowthBytes = 0;

  // Legacy detailed synthetic path. The Simulation Lab now uses aggregateOnly during live runs
  // to avoid Firestore quota pressure; this path remains intentionally sampled.
  if (body.includeRealReads === true) {
    await Promise.all([
      db.collection('navigation_settings').limit(3).get().catch(() => null),
      db.collection('roles_admin').limit(3).get().catch(() => null),
      db.collection('users').limit(3).get().catch(() => null),
    ]);
  }

  for (let i = 0; i < eventCount; i++) {
    const estimatedPersistedSamples = Math.floor(tick / 5) * MAX_PERSISTED_EVENTS_PER_TICK + i;
    const shouldPersist = persistTestData && tick % 5 === 0 && i < MAX_PERSISTED_EVENTS_PER_TICK && estimatedPersistedSamples < MAX_SAMPLE_EVENTS_PER_SIMULATION;
    const uid = `synthetic_${simulationId}_${(tick + i) % userCount}`;
    const email = `${uid}@example.test`;
    const role = pick(ROLES, tick + i);
    const kind = eventKind(scenario, tick + i);
    const step = pick(steps, tick + i);
    const failed = Math.random() < errorRate;
    const durationMs = durationForLoad(kind, step, profile);
    const route = pick(ROUTES, tick + i);
    const fileName = pick(DOC_TYPES, tick + i);
    const fileSize = kind === 'file_uploaded' ? Math.round(8_000 + Math.random() * 44_000) : 0;
    const status = failed ? 'failed' : 'success';

    durations.push(durationMs);
    stepCounts.set(step, (stepCounts.get(step) ?? 0) + 1);
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    if (failed) { failedCount++; errorCount++; } else successCount++;
    if (kind === 'login') loginCount++;
    if (kind === 'page_view') pageViewCount++;
    if (kind === 'file_uploaded') {
      uploadCount++;
      storageGrowthBytes += fileSize;
      const cur = uploadDetails.get(fileName) ?? { count: 0, failCount: 0, totalBytes: 0 };
      uploadDetails.set(fileName, { count: cur.count + 1, failCount: cur.failCount + (failed ? 1 : 0), totalBytes: cur.totalBytes + fileSize });
      if (shouldPersist) batch.set(db.collection('synthetic_test_files').doc(`${simulationId}_${tick}_${i}`), {
        isTest: true, isSimulation: true, simulationId, uid, email, fileName, fileSize,
        storagePath: `synthetic-load-test/${simulationId}/${fileName}`,
        status, createdAt: now,
      });
    }
    if (kind === 'export_data' || kind === 'backup_data') {
      exportCount++;
      if (shouldPersist) {
        const logCollection = kind === 'backup_data' ? 'backup_logs' : 'export_logs';
        const logData: Record<string, unknown> = {
          isTest: true, isSimulation: true, simulationId, status,
          exportedByUid: auth.uid, exportedByEmail: auth.email,
          totalDocuments: 1,
          fileName: `synthetic_${simulationId}_${tick}_${i}.json`,
          driveFolder: `synthetic-load-test/${simulationId}`,
          durationMs,
          createdAt: now,
        };
        if (kind === 'backup_data') logData.backupType = 'synthetic';
        if (kind === 'export_data') logData.exportType = 'synthetic';
        batch.set(db.collection(logCollection).doc(`${simulationId}_${tick}_${i}`), logData);
      }
    }

    if (shouldPersist) batch.set(db.collection('synthetic_test_users').doc(uid), {
      isTest: true, isSimulation: true, simulationId, uid, email, role,
      displayName: `Synthetic User ${(tick + i) % userCount}`,
      updatedAt: now,
    }, { merge: true });

    if (shouldPersist) batch.set(db.collection('online_sessions').doc(uid), {
      isTest: true, isSimulation: true, simulationId, uid, email, role,
      displayName: `Synthetic User ${(tick + i) % userCount}`,
      currentModule: moduleFor(kind),
      currentPath: route,
      lastSeen: now,
      device: 'Synthetic Runner',
      browser: 'Server Tick',
    }, { merge: true });

    if (shouldPersist) batch.set(db.collection('system_analytics_events').doc(), {
      eventType: kind,
      simulationId,
      isSimulation: true,
      isTest: true,
      uid,
      email,
      role,
      module: moduleFor(kind),
      path: route,
      action: kind,
      step,
      status,
      durationMs,
      errorMessage: failed ? `Synthetic ${step} gagal` : null,
      metadata: {
        scenario,
        tick,
        fileName: kind === 'file_uploaded' ? fileName : null,
        fileSize: kind === 'file_uploaded' ? fileSize : null,
        mode: 'synthetic_load_test',
      },
      createdAt: now,
    });
  }

  if (persistTestData) batch.set(db.collection('synthetic_load_test_ticks').doc(`${simulationId}_${tick}`), {
    isTest: true,
    isSimulation: true,
    simulationId,
    second: tick,
    scenario,
    tick,
    userCount,
    activeUsers,
    totalEvents: eventCount,
    persistedSampleEvents: Math.min(eventCount, MAX_PERSISTED_EVENTS_PER_TICK),
    successCount,
    failedCount,
    errorCount,
    avgResponseMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    p95ResponseMs: durations.length ? [...durations].sort((a, b) => a - b)[Math.floor(durations.length * .95)] ?? 0 : 0,
    requestPerMinute: eventCount * 60,
    currentStep: steps[Math.min(steps.length - 1, Math.floor((tick % Math.max(1, steps.length))))] ?? '-',
    storageGrowthBytes,
    createdAt: now,
  }, { merge: true });

  let persisted = persistTestData;
  let persistenceWarning: string | null = null;
  if (persistTestData) {
    try {
      await batch.commit();
    } catch (error: any) {
      persisted = false;
      const code = error?.code ?? '';
      persistenceWarning = code === 8 || code === 'resource-exhausted'
        ? 'Firestore quota limit terdeteksi. Simulasi tetap berjalan lokal, tetapi penyimpanan realtime dibatasi.'
        : 'Sebagian data synthetic tidak berhasil disimpan.';
      console.warn('[synthetic-test]', code || error?.message || error);
    }
  }

  return NextResponse.json({
    success: true,
    simulationId,
    persisted,
    persistenceWarning,
    activeUsers,
    totalEvents: eventCount,
    successCount,
    failedCount,
    loginCount,
    pageViewCount,
    uploadCount,
    exportCount,
    errorCount,
    storageGrowthBytes,
    responseTimes: durations,
    stepBreakdown: [...stepCounts.entries()].map(([module, count]) => ({ module, count })),
    roleBreakdown: [...roleCounts.entries()].map(([role, count]) => ({ role, count })),
    uploadDetails: [...uploadDetails.entries()].map(([type, v]) => ({ type, ...v })),
  });
}
