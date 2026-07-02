import { existsSync } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

type Severity = 'critical' | 'warning' | 'safe';
type CheckStatus = 'ok' | 'warning' | 'error';

interface CheckItem {
  id: string;
  label: string;
  email?: string;
  uid?: string;
  documentId: string;
  collection: string;
  issue: string;
  impact: string;
  recommendation: string;
  severity: Exclude<Severity, 'safe'>;
  detail?: string;
}

interface CheckResult {
  key: string;
  title: string;
  category: string;
  status: CheckStatus;
  severity: Severity;
  count: number;
  description: string;
  moduleImpact: string;
  recommendation: string;
  items: CheckItem[];
}

const MAX_ITEMS = 50;

async function verifySuperAdmin(req: NextRequest) {
  if (!admin.apps.length) {
    return { error: 'Firebase Admin SDK not initialised.', status: 500 } as const;
  }

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return { error: 'Unauthorized: missing token.', status: 401 } as const;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(auth.split('Bearer ')[1]);
    const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'super-admin') {
      return { error: 'Forbidden: Super Admin only.', status: 403 } as const;
    }
    return { uid: decoded.uid, email: decoded.email ?? userDoc.data()?.email ?? '', userData: userDoc.data() as Record<string, any> };
  } catch (e: any) {
    return { error: `Auth failed: ${e.message}`, status: 401 } as const;
  }
}

function issue(params: Omit<CheckItem, 'id' | 'detail'> & { detail?: string }) {
  return {
    ...params,
    id: `${params.collection}:${params.documentId}:${params.issue}`,
    detail: params.detail ?? params.issue,
  };
}

function buildCheck(params: Omit<CheckResult, 'status' | 'severity' | 'count' | 'items'> & { items: CheckItem[] }): CheckResult {
  const criticalCount = params.items.filter(item => item.severity === 'critical').length;
  const severity: Severity = criticalCount > 0 ? 'critical' : params.items.length > 0 ? 'warning' : 'safe';

  return {
    ...params,
    status: severity === 'critical' ? 'error' : severity === 'warning' ? 'warning' : 'ok',
    severity,
    count: params.items.length,
    items: params.items.slice(0, MAX_ITEMS),
  };
}

async function getCollectionIds(db: admin.firestore.Firestore, collectionName: string, limit = 500) {
  const snap = await db.collection(collectionName).limit(limit).get().catch(() => null);
  return new Set((snap?.docs ?? []).map(doc => doc.id));
}

function getStringId(value: any) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

async function checkAuthAndRole(db: admin.firestore.Firestore): Promise<CheckResult> {
  const [authUsers, usersSnap, profilesSnap, rolesAdminSnap] = await Promise.all([
    admin.auth().listUsers(500).catch(() => ({ users: [] as admin.auth.UserRecord[] })),
    db.collection('users').limit(500).get(),
    db.collection('employee_profiles').limit(500).get(),
    db.collection('roles_admin').limit(500).get(),
  ]);

  const usersById = new Map(usersSnap.docs.map(doc => [doc.id, doc.data()]));
  const profilesById = new Map(profilesSnap.docs.map(doc => [doc.id, doc.data()]));
  const roleAdminIds = new Set(rolesAdminSnap.docs.map(doc => doc.id));
  const items: CheckItem[] = [];

  for (const authUser of authUsers.users) {
    if (!usersById.has(authUser.uid)) {
      items.push(issue({
        documentId: authUser.uid,
        uid: authUser.uid,
        email: authUser.email,
        label: authUser.displayName ?? authUser.email ?? authUser.uid,
        collection: 'firebase_auth/users',
        issue: 'Akun Firebase Auth tidak memiliki dokumen users.',
        impact: 'Login berhasil tetapi dashboard, sidebar, dan role guard dapat gagal membaca profil.',
        recommendation: 'Kirim ke Sync Center untuk membuat atau memetakan ulang dokumen users.',
        severity: 'critical',
      }));
    }
  }

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const role = String(data.role ?? '').toLowerCase();
    const needsProfile = ['karyawan', 'hrd', 'manager'].some(r => role.startsWith(r));
    if (needsProfile && !profilesById.has(doc.id)) {
      items.push(issue({
        documentId: doc.id,
        uid: doc.id,
        email: data.email,
        label: data.fullName ?? data.email ?? doc.id,
        collection: 'users',
        issue: 'Dokumen users tidak memiliki employee_profiles.',
        impact: 'Dashboard karyawan, absensi, payroll, dan approval tidak punya data master karyawan.',
        recommendation: 'Kirim ke Sync Center untuk membuat employee profile dari data user yang valid.',
        severity: 'critical',
        detail: `role: ${role || '-'}`,
      }));
    }

    if (role === 'super-admin' && !roleAdminIds.has(doc.id)) {
      items.push(issue({
        documentId: doc.id,
        uid: doc.id,
        email: data.email,
        label: data.fullName ?? data.email ?? doc.id,
        collection: 'users',
        issue: 'Role super-admin tidak sinkron dengan roles_admin.',
        impact: 'Security rules dapat menolak akses Super Admin walaupun field role terlihat benar.',
        recommendation: 'Kirim ke Sync Center untuk sinkronisasi roles_admin dan custom claims.',
        severity: 'critical',
      }));
    }
  }

  for (const doc of rolesAdminSnap.docs) {
    if (!usersById.has(doc.id)) {
      items.push(issue({
        documentId: doc.id,
        uid: doc.id,
        label: doc.id,
        collection: 'roles_admin',
        issue: 'Dokumen roles_admin tidak memiliki pasangan users.',
        impact: 'Akses admin bisa tersisa pada UID yang sudah tidak tercatat di master users.',
        recommendation: 'Review UID di User Management lalu kirim ke Sync Center untuk rekonsiliasi role.',
        severity: 'warning',
      }));
    }
  }

  return buildCheck({
    key: 'auth_role',
    title: 'Auth & Role',
    category: 'Auth & Role',
    description: items.length ? `${items.length} masalah auth dan role ditemukan.` : 'Auth, users, employee profile, dan roles_admin terlihat sinkron.',
    moduleImpact: 'Login, role guard, sidebar, security rules, dashboard admin.',
    recommendation: 'Sinkronkan users, employee_profiles, roles_admin, dan custom claims melalui Sync Center.',
    items,
  });
}

async function checkSidebarAndAccess(db: admin.firestore.Firestore): Promise<CheckResult> {
  const knownRoutes = [
    '/admin/super-admin/user-management',
    '/admin/super-admin/struktur-organisasi',
    '/admin/super-admin/departments-brands',
    '/admin/super-admin/ecosystem',
    '/admin/super-admin/menu-settings',
    '/admin/super-admin/session-security',
    '/admin/super-admin/audit-log',
    '/admin/super-admin/backup-export',
    '/admin/super-admin/announcements',
    '/admin/super-admin/data-integrity',
    '/admin/super-admin/sync-center',
    '/admin/super-admin/feature-control',
    '/admin/super-admin/storage-management',
    '/admin/super-admin/environment-info',
    '/admin/hrd/dashboard-rekrutmen',
    '/admin/jobs',
    '/admin/recruitment',
    '/admin/recruitment/templates',
    '/admin/hrd/assessments',
    '/admin/hrd/employee-data/karyawan',
    '/admin/hrd/dashboard-karyawan',
    '/admin/hrd/invites',
    '/admin/hrd/employee-data/intern',
    '/admin/hrd/monitoring/absen',
    '/admin/hrd/persetujuan-lembur',
    '/admin/overtime-payroll-recap',
    '/admin/hrd/attendance-payroll-recap',
    '/admin/hrd/persetujuan-izin',
    '/admin/hrd/monitoring/dinas',
    '/admin/hrd/surat-tugas',
    '/admin/hrd/persetujuan-cuti',
    '/admin/hrd/monitoring/cuti',
    '/admin/hrd/monitoring/pelatihan',
    '/admin/hrd/monitoring/settings',
    '/admin/review/laporan-magang',
    '/admin/manager/persetujuan-lembur',
    '/admin/manager/persetujuan-izin',
    '/admin/manager/persetujuan-cuti',
    '/admin/review/persetujuan-dinas',
    '/admin/management/perjalanan-dinas',
    '/admin/manager',
    '/admin/interviews',
    '/admin/recruitment/my-tasks',
    '/admin/karyawan/dashboard',
    '/admin/karyawan/profile',
    '/admin/karyawan/pengajuan-lembur',
    '/admin/karyawan/pengajuan-izin',
    '/admin/karyawan/pengajuan-cuti',
    '/admin/karyawan/konfirmasi-dinas',
    '/admin/karyawan/dashboard-training',
    '/admin/karyawan/dashboard-magang',
  ];

  const appRoot = path.join(process.cwd(), 'src', 'app');
  const routeExists = (href: string) => {
    const routePath = href.replace(/^\/+/, '').split('/').map(part => part.startsWith(':') ? `[${part.slice(1)}]` : part);
    const folder = path.join(appRoot, ...routePath);
    return existsSync(path.join(folder, 'page.tsx')) || existsSync(path.join(folder, 'page.ts'));
  };

  const items: CheckItem[] = [];
  knownRoutes.forEach(href => {
    if (!routeExists(href)) {
      items.push(issue({
        documentId: href,
        label: href,
        collection: 'menu_config/routes',
        issue: 'Route menu tidak ditemukan di src/app.',
        impact: 'Sidebar dapat mengarah ke halaman 404 atau fitur kosong.',
        recommendation: 'Periksa MENU_CONFIG atau buat route yang hilang sebelum menu diaktifkan.',
        severity: 'critical',
      }));
    }
  });

  const menuVisibilitySnap = await db.collection('menu_visibility').limit(50).get().catch(() => null);
  for (const doc of menuVisibilitySnap?.docs ?? []) {
    const visible = doc.data()?.visibleMenuItems;
    if (!Array.isArray(visible)) {
      items.push(issue({
        documentId: doc.id,
        label: doc.id,
        collection: 'menu_visibility',
        issue: 'Konfigurasi visibleMenuItems bukan array.',
        impact: 'Sidebar role terkait dapat kosong atau tidak konsisten.',
        recommendation: 'Simpan ulang konfigurasi menu dari halaman Access & Roles.',
        severity: 'warning',
      }));
    }
  }

  return buildCheck({
    key: 'sidebar_access',
    title: 'Sidebar & Access',
    category: 'Sidebar & Access',
    description: items.length ? `${items.length} masalah sidebar/access ditemukan.` : 'Route sidebar utama dan konfigurasi akses terlihat valid.',
    moduleImpact: 'Sidebar, navigasi admin, menu role, Access & Roles.',
    recommendation: 'Perbaiki route/menu visibility yang tidak valid lalu validasi ulang dari Super Admin.',
    items,
  });
}

async function checkOrganizationApproval(db: admin.firestore.Firestore): Promise<CheckResult> {
  const [profilesSnap, brandSnap, usersIds] = await Promise.all([
    db.collection('employee_profiles').limit(500).get(),
    db.collection('brands').limit(500).get().catch(() => null),
    getCollectionIds(db, 'users'),
  ]);

  const brandIds = new Set((brandSnap?.docs ?? []).map(doc => doc.id));
  const divisionKeys = new Set<string>();
  await Promise.all((brandSnap?.docs ?? []).map(async brand => {
    const divSnap = await db.collection('brands').doc(brand.id).collection('divisions').limit(500).get().catch(() => null);
    (divSnap?.docs ?? []).forEach(div => divisionKeys.add(`${brand.id}/${div.id}`));
  }));

  const items: CheckItem[] = [];
  for (const doc of profilesSnap.docs) {
    const data = doc.data();
    const brandId = getStringId(data.brandId);
    const divisionId = getStringId(data.divisionId ?? data.departmentId);
    const role = String(data.role ?? data.employmentType ?? '').toLowerCase();
    const exempt = ['super-admin', 'direksi', 'direktur'].some(value => role.includes(value));

    if (!exempt && brandId && brandIds.size > 0 && !brandIds.has(brandId)) {
      items.push(issue({
        documentId: doc.id,
        uid: doc.id,
        email: data.email,
        label: data.fullName ?? data.name ?? doc.id,
        collection: 'employee_profiles',
        issue: `brandId mengarah ke dokumen yang tidak ada: ${brandId}.`,
        impact: 'Filter brand, dashboard karyawan, dan approval berbasis struktur organisasi bisa tidak sinkron.',
        recommendation: 'Kirim ke Sync Center atau perbaiki brandId dari Master Data/Struktur Organisasi.',
        severity: 'critical',
      }));
    }

    if (!exempt && brandId && divisionId && divisionKeys.size > 0 && !divisionKeys.has(`${brandId}/${divisionId}`)) {
      items.push(issue({
        documentId: doc.id,
        uid: doc.id,
        email: data.email,
        label: data.fullName ?? data.name ?? doc.id,
        collection: 'employee_profiles',
        issue: `divisionId tidak ditemukan pada brand ${brandId}: ${divisionId}.`,
        impact: 'Approval cuti/izin/lembur/dinas dapat putus karena divisi tidak memiliki manager valid.',
        recommendation: 'Periksa Struktur Organisasi lalu kirim profil ini ke Sync Center.',
        severity: 'critical',
      }));
    }

    const managerUid = getStringId(data.managerUid ?? data.directSupervisorUid);
    if (managerUid && !usersIds.has(managerUid)) {
      items.push(issue({
        documentId: doc.id,
        uid: doc.id,
        email: data.email,
        label: data.fullName ?? data.name ?? doc.id,
        collection: 'employee_profiles',
        issue: `managerUid tidak ditemukan di users: ${managerUid}.`,
        impact: 'Approval flow dapat berhenti karena approver tidak bisa login atau tidak ada.',
        recommendation: 'Kirim ke Sync Center untuk rekonsiliasi approver atau ubah manager di struktur organisasi.',
        severity: 'critical',
      }));
    }
  }

  for (const collection of ['leave_requests', 'permission_requests', 'overtime_requests', 'business_trip_missions']) {
    const snap = await db.collection(collection).limit(200).get().catch(() => null);
    for (const doc of snap?.docs ?? []) {
      const data = doc.data();
      const status = String(data.status ?? data.approvalStatus ?? '').toLowerCase();
      if (!['pending', 'waiting', 'submitted', 'in_review'].some(value => status.includes(value))) continue;
      const approverUid = getStringId(data.approvalTargetUid ?? data.managerUid ?? data.approverUid ?? data.currentApproverUid);
      if (!approverUid) {
        items.push(issue({
          documentId: doc.id,
          uid: getStringId(data.uid ?? data.employeeUid ?? data.employeeId),
          label: data.employeeName ?? data.requesterName ?? doc.id,
          collection,
          issue: 'Pengajuan aktif tidak memiliki approver/current approver.',
          impact: 'Approval flow bisa macet dan tidak muncul di inbox approver.',
          recommendation: 'Kirim ke Sync Center untuk rebuild routing approval dari struktur organisasi.',
          severity: 'critical',
        }));
      } else if (!usersIds.has(approverUid)) {
        items.push(issue({
          documentId: doc.id,
          uid: approverUid,
          label: data.employeeName ?? data.requesterName ?? doc.id,
          collection,
          issue: `Approver tidak ditemukan di users: ${approverUid}.`,
          impact: 'Pengajuan aktif tidak dapat diproses oleh approver yang valid.',
          recommendation: 'Kirim ke Sync Center untuk mengganti approver berdasarkan struktur terbaru.',
          severity: 'critical',
        }));
      }
    }
  }

  return buildCheck({
    key: 'organization_approval',
    title: 'Organisasi & Approval Flow',
    category: 'Organisasi & Approval Flow',
    description: items.length ? `${items.length} masalah struktur/approval ditemukan.` : 'Brand, divisi, manager, dan approval aktif terlihat konsisten.',
    moduleImpact: 'Struktur organisasi, approval cuti/izin/lembur/dinas, dashboard approval.',
    recommendation: 'Pastikan brand/divisi/manager valid sebelum menjalankan perbaikan via Sync Center.',
    items,
  });
}

async function checkRecruitment(db: admin.firestore.Firestore): Promise<CheckResult> {
  const [appsSnap, candidatesSnap, profilesSnap, jobsSnap] = await Promise.all([
    db.collection('applications').limit(500).get().catch(() => null),
    db.collection('candidates').limit(500).get().catch(() => null),
    db.collection('profiles').limit(500).get().catch(() => null),
    db.collection('jobs').limit(500).get().catch(() => null),
  ]);

  const appIds = new Set((appsSnap?.docs ?? []).map(doc => doc.id));
  const candidateIds = new Set((candidatesSnap?.docs ?? []).map(doc => doc.id));
  const profileIds = new Set((profilesSnap?.docs ?? []).map(doc => doc.id));
  const jobIds = new Set((jobsSnap?.docs ?? []).map(doc => doc.id));
  const items: CheckItem[] = [];

  for (const doc of appsSnap?.docs ?? []) {
    const data = doc.data();
    const candidateUid = getStringId(data.candidateUid ?? data.userId ?? data.uid);
    const candidateId = getStringId(data.candidateId);
    const jobId = getStringId(data.jobId);

    if (candidateUid && profileIds.size > 0 && !profileIds.has(candidateUid)) {
      items.push(issue({
        documentId: doc.id,
        uid: candidateUid,
        email: data.candidateEmail ?? data.email,
        label: data.candidateName ?? data.fullName ?? doc.id,
        collection: 'applications',
        issue: 'Application menunjuk candidateUid tanpa profile kandidat.',
        impact: 'Portal kandidat, dokumen, dan timeline lamaran dapat gagal menampilkan data.',
        recommendation: 'Kirim ke Sync Center untuk memetakan ulang profile kandidat.',
        severity: 'critical',
      }));
    }

    if (candidateId && candidateIds.size > 0 && !candidateIds.has(candidateId)) {
      items.push(issue({
        documentId: doc.id,
        uid: candidateUid,
        email: data.candidateEmail ?? data.email,
        label: data.candidateName ?? data.fullName ?? doc.id,
        collection: 'applications',
        issue: `candidateId tidak ditemukan: ${candidateId}.`,
        impact: 'Kanban rekrutmen dan detail kandidat dapat kehilangan referensi.',
        recommendation: 'Review application dan candidate terkait di modul Rekrutmen.',
        severity: 'warning',
      }));
    }

    if (jobId && jobIds.size > 0 && !jobIds.has(jobId)) {
      items.push(issue({
        documentId: doc.id,
        uid: candidateUid,
        email: data.candidateEmail ?? data.email,
        label: data.candidateName ?? data.fullName ?? doc.id,
        collection: 'applications',
        issue: `jobId tidak ditemukan: ${jobId}.`,
        impact: 'Dashboard rekrutmen dan job detail tidak bisa mengelompokkan lamaran.',
        recommendation: 'Pulihkan job posting atau pindahkan lamaran ke job yang valid.',
        severity: 'critical',
      }));
    }
  }

  for (const doc of candidatesSnap?.docs ?? []) {
    const data = doc.data();
    const applicationId = getStringId(data.applicationId);
    const linkedUid = getStringId(data.userId ?? data.linkedUserId ?? data.userUid);
    if (applicationId && appIds.size > 0 && !appIds.has(applicationId)) {
      items.push(issue({
        documentId: doc.id,
        uid: linkedUid,
        email: data.email,
        label: data.fullName ?? data.name ?? doc.id,
        collection: 'candidates',
        issue: `applicationId tidak ditemukan: ${applicationId}.`,
        impact: 'Timeline kandidat dan status aplikasi dapat tidak sinkron.',
        recommendation: 'Kirim ke Sync Center untuk rekonsiliasi kandidat dan application.',
        severity: 'warning',
      }));
    }

    if (linkedUid && String(data.status ?? '').toLowerCase() === 'active') {
      items.push(issue({
        documentId: doc.id,
        uid: linkedUid,
        email: data.email,
        label: data.fullName ?? data.name ?? doc.id,
        collection: 'candidates',
        issue: 'Kandidat sudah punya linked user tetapi status masih active.',
        impact: 'Dashboard rekrutmen dapat menghitung kandidat aktif yang sudah menjadi user.',
        recommendation: 'Kirim ke Sync Center untuk update status kandidat pasca-hiring.',
        severity: 'warning',
      }));
    }
  }

  return buildCheck({
    key: 'recruitment',
    title: 'Rekrutmen',
    category: 'Rekrutmen',
    description: items.length ? `${items.length} masalah rekrutmen ditemukan.` : 'Kandidat, application, profile, dan job terlihat sinkron.',
    moduleImpact: 'Dashboard rekrutmen, kanban aplikasi, portal kandidat, timeline seleksi.',
    recommendation: 'Sinkronkan kandidat, applications, jobs, dan profiles sebelum keputusan rekrutmen berikutnya.',
    items,
  });
}

async function checkAttendancePayroll(db: admin.firestore.Firestore): Promise<CheckResult> {
  const profileIds = await getCollectionIds(db, 'employee_profiles');
  const collections = ['attendance_records', 'overtime_requests', 'payroll_records'];
  const items: CheckItem[] = [];

  for (const collection of collections) {
    const snap = await db.collection(collection).limit(500).get().catch(() => null);
    for (const doc of snap?.docs ?? []) {
      const data = doc.data();
      const uid = getStringId(data.uid ?? data.employeeUid ?? data.employeeId ?? data.userId);
      if (!uid) {
        items.push(issue({
          documentId: doc.id,
          label: data.employeeName ?? data.name ?? doc.id,
          collection,
          issue: 'Record tidak memiliki UID/employeeId.',
          impact: 'Dashboard absensi/payroll tidak bisa mengaitkan record ke karyawan.',
          recommendation: 'Kirim ke Sync Center untuk mapping record ke employee profile.',
          severity: 'critical',
        }));
        continue;
      }

      if (profileIds.size > 0 && !profileIds.has(uid)) {
        items.push(issue({
          documentId: doc.id,
          uid,
          label: data.employeeName ?? data.name ?? uid,
          collection,
          issue: `UID tidak cocok dengan employee_profiles: ${uid}.`,
          impact: 'Rekap absensi, lembur, dan payroll dapat tidak masuk ke karyawan yang benar.',
          recommendation: 'Kirim ke Sync Center untuk rekonsiliasi UID payroll/absensi.',
          severity: 'critical',
        }));
      }

      const clockIn = data.clockIn ?? data.checkIn ?? data.masuk;
      const clockOut = data.clockOut ?? data.checkOut ?? data.keluar;
      if (clockIn && clockOut) {
        const inMs = clockIn.toDate ? clockIn.toDate().getTime() : Number(clockIn);
        const outMs = clockOut.toDate ? clockOut.toDate().getTime() : Number(clockOut);
        if (Number.isFinite(inMs) && Number.isFinite(outMs) && inMs > outMs) {
          items.push(issue({
            documentId: doc.id,
            uid,
            label: data.employeeName ?? data.name ?? uid,
            collection,
            issue: 'Jam masuk lebih lambat dari jam keluar.',
            impact: 'Durasi kerja/payroll bisa negatif atau salah hitung.',
            recommendation: 'Review record absensi sebelum payroll dikunci.',
            severity: 'warning',
          }));
        }
      }
    }
  }

  return buildCheck({
    key: 'attendance_payroll',
    title: 'Absensi & Payroll',
    category: 'Absensi & Payroll',
    description: items.length ? `${items.length} masalah absensi/payroll ditemukan.` : 'Record absensi, lembur, dan payroll terlihat terhubung ke employee profile.',
    moduleImpact: 'Monitoring absen, rekap payroll, persetujuan lembur, dashboard karyawan.',
    recommendation: 'Validasi UID dan jam kerja sebelum export payroll atau penutupan periode.',
    items,
  });
}

async function checkStorageAndFile(db: admin.firestore.Firestore): Promise<CheckResult> {
  const items: CheckItem[] = [];
  const refs: Array<{ collection: string; documentId: string; label: string; uid?: string; email?: string; path: string }> = [];
  const sources = ['employee_profiles', 'profiles', 'applications', 'offerings', 'business_trip_missions'];

  const collectPaths = (value: any, output: string[] = []): string[] => {
    if (!value) return output;
    if (typeof value === 'string') return output;
    if (Array.isArray(value)) {
      value.forEach(item => collectPaths(item, output));
      return output;
    }
    if (typeof value === 'object') {
      const pathValue = getStringId(value.filePath ?? value.storagePath ?? value.documentPath ?? value.photoPath);
      if (pathValue && !pathValue.startsWith('http') && !pathValue.includes('/api/')) output.push(pathValue);
      Object.values(value).forEach(item => collectPaths(item, output));
    }
    return output;
  };

  for (const collection of sources) {
    const snap = await db.collection(collection).limit(150).get().catch(() => null);
    for (const doc of snap?.docs ?? []) {
      const data = doc.data();
      collectPaths(data).slice(0, 10).forEach(filePath => refs.push({
        collection,
        documentId: doc.id,
        uid: getStringId(data.uid ?? data.employeeUid ?? data.candidateUid),
        email: data.email ?? data.candidateEmail,
        label: data.fullName ?? data.name ?? data.employeeName ?? data.candidateName ?? doc.id,
        path: filePath,
      }));
    }
  }

  try {
    const bucket = admin.storage().bucket();
    await Promise.all(refs.slice(0, 80).map(async ref => {
      const exists = await bucket.file(ref.path).exists().then(([ok]) => ok).catch(() => true);
      if (!exists) {
        items.push(issue({
          documentId: ref.documentId,
          uid: ref.uid,
          email: ref.email,
          label: ref.label,
          collection: ref.collection,
          issue: `Metadata file ada tetapi file tidak ditemukan: ${ref.path}.`,
          impact: 'Preview/download dokumen dapat gagal dan halaman detail menampilkan file rusak.',
          recommendation: 'Kirim ke Sync Center atau upload ulang file dari modul asal.',
          severity: 'critical',
        }));
      }
    }));
  } catch (err: any) {
    items.push(issue({
      documentId: 'firebase_storage_bucket',
      label: 'Firebase Storage Bucket',
      collection: 'environment',
      issue: `Storage bucket tidak dapat divalidasi: ${err?.message ?? 'konfigurasi bucket tidak tersedia'}.`,
      impact: 'Pemeriksaan file hilang tidak bisa memastikan objek storage benar-benar tersedia.',
      recommendation: 'Periksa konfigurasi NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET dan Firebase Admin storageBucket.',
      severity: 'warning',
    }));
  }

  return buildCheck({
    key: 'storage_file',
    title: 'Storage & File',
    category: 'Storage & File',
    description: items.length ? `${items.length} masalah file/storage ditemukan.` : 'Metadata file sampel terlihat memiliki objek storage yang valid.',
    moduleImpact: 'Dokumen kandidat/karyawan, surat tugas, offering letter, preview file.',
    recommendation: 'Pulihkan file yang hilang atau bersihkan metadata melalui proses sync terkontrol.',
    items,
  });
}

async function checkBackupExport(db: admin.firestore.Firestore): Promise<CheckResult> {
  const [exportLogs, backupLogs, auditLogs] = await Promise.all([
    db.collection('export_logs').limit(20).get().catch(() => null),
    db.collection('backup_logs').limit(20).get().catch(() => null),
    db.collection('audit_logs').limit(100).get().catch(() => null),
  ]);

  const items: CheckItem[] = [];
  if (!exportLogs || exportLogs.empty) {
    items.push(issue({
      documentId: 'export_logs',
      label: 'Export Logs',
      collection: 'export_logs',
      issue: 'Belum ada export_logs.',
      impact: 'Export yang berhasil tidak dapat diaudit dari riwayat sistem.',
      recommendation: 'Jalankan test export dan pastikan API menulis export_logs.',
      severity: 'warning',
    }));
  }

  if (!backupLogs || backupLogs.empty) {
    items.push(issue({
      documentId: 'backup_logs',
      label: 'Backup Logs',
      collection: 'backup_logs',
      issue: 'Belum ada backup_logs.',
      impact: 'Backup berhasil/gagal tidak dapat diverifikasi dari riwayat sistem.',
      recommendation: 'Jalankan test backup manual dan pastikan backup_logs tercatat.',
      severity: 'warning',
    }));
  }

  const backupAuditExists = (auditLogs?.docs ?? []).some(doc => String(doc.data().action ?? '').includes('backup'));
  const exportAuditExists = (auditLogs?.docs ?? []).some(doc => String(doc.data().action ?? '').includes('export'));
  if ((backupLogs && !backupLogs.empty && !backupAuditExists) || (exportLogs && !exportLogs.empty && !exportAuditExists)) {
    items.push(issue({
      documentId: 'audit_logs',
      label: 'Audit Logs',
      collection: 'audit_logs',
      issue: 'Backup/export memiliki log operasional tetapi audit log terkait tidak ditemukan dalam sampel terakhir.',
      impact: 'Aktivitas sensitif sulit ditelusuri oleh Super Admin.',
      recommendation: 'Review route backup/export agar selalu menulis audit_logs.',
      severity: 'warning',
    }));
  }

  return buildCheck({
    key: 'backup_export',
    title: 'Backup & Export',
    category: 'Backup & Export',
    description: items.length ? `${items.length} masalah backup/export ditemukan.` : 'Backup/export logs dan audit trail terlihat tersedia.',
    moduleImpact: 'Backup Export, audit trail, compliance operasional.',
    recommendation: 'Pastikan setiap backup/export sukses maupun gagal meninggalkan jejak log.',
    items,
  });
}

async function checkEnvironmentSystem(db: admin.firestore.Firestore): Promise<CheckResult> {
  const items: CheckItem[] = [];
  const requiredEnv = ['NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      items.push(issue({
        documentId: key,
        label: key,
        collection: 'environment',
        issue: `Environment variable belum terisi: ${key}.`,
        impact: 'Firebase client/status API dapat gagal atau menunjuk project yang salah.',
        recommendation: 'Lengkapi environment deployment lalu redeploy aplikasi.',
        severity: 'critical',
      }));
    }
  }

  const projectId = admin.app().options.projectId;
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && projectId && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== projectId) {
    items.push(issue({
      documentId: 'firebase_project_id',
      label: 'Firebase Project',
      collection: 'environment',
      issue: 'Project ID client berbeda dengan Admin SDK.',
      impact: 'Client dan server dapat membaca/menulis ke project Firebase yang berbeda.',
      recommendation: 'Samakan konfigurasi Firebase client dan service account.',
      severity: 'critical',
    }));
  }

  const settings = await db.collection('system_settings').doc('backup_export').get().catch(() => null);
  if (!settings?.exists) {
    items.push(issue({
      documentId: 'backup_export',
      label: 'System Settings',
      collection: 'system_settings',
      issue: 'Dokumen system_settings/backup_export belum tersedia.',
      impact: 'Status backup/export dan integrasi storage eksternal tidak punya konfigurasi pusat.',
      recommendation: 'Buka Backup & Export atau Environment Info untuk inisialisasi konfigurasi.',
      severity: 'warning',
    }));
  }

  return buildCheck({
    key: 'environment_system',
    title: 'Environment & System',
    category: 'Environment & System',
    description: items.length ? `${items.length} masalah environment/system ditemukan.` : 'Environment Firebase dan system settings dasar terlihat siap.',
    moduleImpact: 'Firebase Admin, API status, backup/export, storage provider.',
    recommendation: 'Perbaiki environment deployment dan konfigurasi system settings sebelum operasi sensitif.',
    items,
  });
}

export async function GET(req: NextRequest) {
  const authResult = await verifySuperAdmin(req);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const { uid, email, userData } = authResult;
  const db = admin.firestore();
  const checkedAt = new Date().toISOString();

  try {
    const checks = await Promise.all([
      checkAuthAndRole(db),
      checkSidebarAndAccess(db),
      checkOrganizationApproval(db),
      checkRecruitment(db),
      checkAttendancePayroll(db),
      checkStorageAndFile(db),
      checkBackupExport(db),
      checkEnvironmentSystem(db),
    ]);

    const totalIssues = checks.reduce((sum, check) => sum + check.count, 0);
    const criticalCount = checks.reduce((sum, check) => sum + check.items.filter(item => item.severity === 'critical').length, 0);
    const warningCount = checks.reduce((sum, check) => sum + check.items.filter(item => item.severity === 'warning').length, 0);
    const safeCount = checks.filter(check => check.severity === 'safe').length;
    const score = Math.max(0, Math.round(100 - (criticalCount * 12) - (warningCount * 4)));

    const report = {
      checkedAt,
      checkedByUid: uid,
      checkedByEmail: email || userData?.email || '',
      score,
      totalIssues,
      criticalCount,
      warningCount,
      safeCount,
      checks,
      status: 'completed',
    };

    const reportRef = await db.collection('data_integrity_reports').add({
      ...report,
      checkedAt: admin.firestore.Timestamp.fromDate(new Date(checkedAt)),
      createdAt: FieldValue.serverTimestamp(),
    });

    try {
      await db.collection('audit_logs').add({
        actorUid: uid,
        actorName: userData?.fullName ?? userData?.email ?? uid,
        actorEmail: userData?.email ?? email ?? '',
        actorRole: 'super-admin',
        action: 'run_data_integrity_check',
        category: 'system_control',
        targetType: 'system',
        targetId: reportRef.id,
        targetName: 'Data Integrity Check',
        before: null,
        after: { reportId: reportRef.id, score, totalIssues, criticalCount, warningCount, checksRun: checks.length, checkedAt },
        reason: 'Super Admin menjalankan Data Integrity Check.',
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch {
      // Non-fatal: report should still be returned to the Super Admin.
    }

    return NextResponse.json({
      success: true,
      reportId: reportRef.id,
      ...report,
      summary: { score, totalIssues, criticalCount, warningCount, safeCount, total: checks.length },
    });
  } catch (err: any) {
    console.error('[data-integrity/check]', err?.message ?? err);
    return NextResponse.json(
      { error: `Pemeriksaan gagal: ${err?.message ?? 'Unknown error'}` },
      { status: 500 },
    );
  }
}
