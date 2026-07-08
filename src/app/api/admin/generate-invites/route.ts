import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { generateUniqueCode } from '@/lib/utils';
import type { InviteBatch, InviteContractType } from '@/lib/types';

export const runtime = 'nodejs';

// Hardcoded, never derived from the request body — a collection/doc path
// must always be a non-empty literal string, never user input.
const FEATURE_SETTINGS_COLLECTION = 'system_settings';
const FEATURE_SETTINGS_DOC = 'features';
const FEATURE_LABEL_FALLBACK = 'Employee Invite';
// Kept as "invite_batches" (not "employee_invite_batches") on purpose: this is
// the same collection the batch list, registration, and batch-code lookup
// routes already read/write — renaming it here would make new batches save
// successfully but never show up anywhere else in the app.
const INVITE_BATCH_COLLECTION = 'invite_batches';
const BRANDS_COLLECTION = 'brands';

const CONTRACT_TYPES: InviteContractType[] = ['Magang', 'Probation', 'Kontrak', 'Tetap'];

// Accepts both the current UI's field names (contractType) and the
// lowercase/alternate ones ("kontrak", "employmentType", ...) so a mismatch
// between what the client sends and what this route expects never turns into
// an undefined read.
const EMPLOYMENT_TYPE_LABELS: Record<string, InviteContractType> = {
  tetap: 'Tetap', Tetap: 'Tetap',
  kontrak: 'Kontrak', Kontrak: 'Kontrak',
  probation: 'Probation', Probation: 'Probation',
  magang: 'Magang', Magang: 'Magang',
  internship: 'Magang',
};

function normalizeContractType(value: unknown): InviteContractType | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  if ((CONTRACT_TYPES as string[]).includes(value)) return value as InviteContractType;
  return EMPLOYMENT_TYPE_LABELS[value] ?? null;
}

/** Guards every dynamic Firestore path segment (e.g. a doc id built from user input) — never call .collection()/.doc() with a value that might be empty/undefined. */
function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} kosong atau tidak valid.`);
  }
  return value.trim();
}

/**
 * Generate Batch Undangan — everything (auth, role check, feature flag,
 * input validation, brand lookup, Firestore write) happens inside ONE
 * try/catch so no code path can ever throw past this handler and leave
 * Next.js to return an empty/non-JSON body. All Firestore collection/doc
 * paths are hardcoded constants or values checked with assertNonEmptyString —
 * never a raw, unvalidated string — which is what previously caused
 * `Value for argument "collectionPath" is not a valid resource path.`
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Validasi user (token)
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: 'Sesi tidak ditemukan, silakan login ulang.' }, { status: 401 });
    }
    const idToken = authorization.slice(7);

    let uid: string;
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      uid = decodedToken.uid;
    } catch (err: any) {
      const message = err?.code === 'auth/id-token-expired'
        ? 'Sesi Anda telah berakhir, silakan muat ulang halaman dan coba lagi.'
        : 'Verifikasi sesi gagal, silakan login ulang.';
      return NextResponse.json({ success: false, message }, { status: 401 });
    }

    const db = admin.firestore();

    // 2. Validasi role — HRD / Super Admin only
    const [hrdSnap, adminSnap, superSnap, userDoc] = await Promise.all([
      db.collection('roles_hrd').doc(uid).get(),
      db.collection('roles_admin').doc(uid).get(),
      db.collection('roles_superadmin').doc(uid).get(),
      db.collection('users').doc(uid).get(),
    ]);
    const role = userDoc.data()?.role || '';
    const isAuthorized = hrdSnap.exists || adminSnap.exists || superSnap.exists ||
      ['super-admin', 'hrd', 'admin'].includes(role);
    if (!isAuthorized) {
      return NextResponse.json({ success: false, message: 'HRD tidak memiliki izin membuat batch undangan.' }, { status: 403 });
    }
    const createdByName = userDoc.data()?.fullName || userDoc.data()?.email || uid;

    // 3. Feature flag — single source of truth: system_settings/features, key
    // "employee_invite" (same doc/key the Feature Control UI reads and writes
    // via toggleFeature()/useFeatureFlags()). Both constants above are
    // hardcoded locally in this file (not imported from the client-side
    // '@/lib/feature-flags' module) so this read can never end up with an
    // undefined collection/doc path.
    const featureDoc = await db.collection(FEATURE_SETTINGS_COLLECTION).doc(FEATURE_SETTINGS_DOC).get();
    const features = featureDoc.data() || {};
    console.log('[generate-invites feature-check]', {
      docExists: featureDoc.exists,
      employee_invite: features.employee_invite,
      enabled: features.employee_invite?.enabled,
    });

    if (!features.employee_invite || typeof features.employee_invite.enabled !== 'boolean') {
      // Missing config is NOT the same as "disabled" — say so explicitly
      // instead of silently defaulting, so Super Admin knows exactly what to do.
      return NextResponse.json({
        success: false,
        message: 'Feature flag Employee Invite belum dikonfigurasi. Jalankan Inisialisasi Feature Config di halaman Feature Control.',
      }, { status: 403 });
    }

    const employeeInviteEnabled = features.employee_invite.enabled === true;
    if (!employeeInviteEnabled) {
      const featureLabel = features.employee_invite.label || FEATURE_LABEL_FALLBACK;
      return NextResponse.json({
        success: false,
        message: `Fitur "${featureLabel}" sedang dinonaktifkan oleh Super Admin.`,
      }, { status: 403 });
    }

    // 4. Normalisasi body — terima beberapa kemungkinan nama field dari client.
    const body = await req.json().catch(() => null);
    console.log('[generate-invites] request body:', body);
    console.log('[generate-invites] collection:', INVITE_BATCH_COLLECTION);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, message: 'Data yang dikirim tidak valid.' }, { status: 400 });
    }

    const brandId: string | null = typeof body.brandId === 'string' && body.brandId.trim() ? body.brandId.trim() : null;
    const brandNameFromBody: string | null = body.brandName || body.brandLabel || body.brand || null;

    const employmentTypeRaw = body.employmentType || body.contractType || null;
    const employmentType = normalizeContractType(employmentTypeRaw);
    const employmentTypeLabel: string =
      body.employmentTypeLabel ||
      body.contractTypeLabel ||
      (employmentType ? EMPLOYMENT_TYPE_LABELS[employmentType] ?? employmentType : null) ||
      employmentTypeRaw ||
      'Tipe tidak diketahui';

    const quotaRaw = body.quota ?? body.quantity;
    const quota = Number(quotaRaw);

    const expiresAtRaw: string | null = body.expiresAt || null;
    const notes: string | null = body.notes ?? body.note ?? null;

    // 5. Validasi wajib — pesan jelas per field, tidak pernah crash.
    if (!brandId && !brandNameFromBody) {
      return NextResponse.json({ success: false, message: 'Brand / Perusahaan belum valid. Silakan pilih ulang.' }, { status: 400 });
    }
    if (!employmentType) {
      return NextResponse.json({ success: false, message: 'Jenis kontrak / tipe belum valid. Silakan pilih ulang.' }, { status: 400 });
    }
    if (!quotaRaw || !Number.isFinite(quota) || quota <= 0) {
      return NextResponse.json({ success: false, message: 'Jumlah kuota harus lebih dari 0.' }, { status: 400 });
    }
    if (quota > 500) {
      return NextResponse.json({ success: false, message: 'Jumlah kuota maksimal 500.' }, { status: 400 });
    }
    if (expiresAtRaw && Number.isNaN(new Date(expiresAtRaw).getTime())) {
      return NextResponse.json({ success: false, message: 'Format Masa Berlaku tidak valid.' }, { status: 400 });
    }

    // 6. Cari brand dari Firestore berdasarkan brandId — kalau tidak ketemu,
    // jangan crash: pakai fallback nama dari body, atau kembalikan error jelas.
    // Brand hanya sebagai FIELD data — tidak pernah dipakai sebagai nama collection.
    let brandName = brandNameFromBody;
    if (brandId) {
      const safeBrandId = assertNonEmptyString(brandId, 'Brand ID');
      const brandDoc = await db.collection(BRANDS_COLLECTION).doc(safeBrandId).get();
      if (brandDoc.exists) {
        brandName = brandDoc.data()?.name || brandName;
      } else if (!brandName) {
        return NextResponse.json({ success: false, message: 'Brand tidak ditemukan. Silakan pilih ulang brand.' }, { status: 400 });
      }
    }
    if (!brandName) {
      return NextResponse.json({ success: false, message: 'Brand / Perusahaan belum valid. Silakan pilih ulang.' }, { status: 400 });
    }

    // 7. Buat & simpan batch undangan ke collection yang tetap (bukan dari body).
    const now = Timestamp.now();
    const batchId = assertNonEmptyString(generateUniqueCode(10), 'Batch ID');

    const batchData: Omit<InviteBatch, 'id'> = {
      brandId: brandId || '',
      brandName,
      contractType: employmentType,
      totalSlots: quota,
      claimedSlots: 0,
      isActive: true,
      createdBy: uid,
      createdAt: now as any,
      updatedAt: now as any,
      expiresAt: expiresAtRaw ? Timestamp.fromDate(new Date(expiresAtRaw)) as any : null,
      notes: notes || null,
    };

    await db.collection(INVITE_BATCH_COLLECTION).doc(batchId).set({
      ...batchData,
      employmentTypeLabel,
      createdByName,
    });

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || new URL(req.url).origin || 'http://localhost:3000';
    const inviteLink = `${baseUrl}/register?batch=${batchId}`;

    return NextResponse.json({
      success: true,
      message: 'Batch undangan berhasil dibuat.',
      data: {
        batchId,
        inviteLink,
        ...batchData,
        createdAt: now.toDate().toISOString(),
        updatedAt: now.toDate().toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[generate-invites] API ERROR:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Gagal membuat undangan.',
      stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
