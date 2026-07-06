import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { jsonError } from '@/lib/server/sync-helpers';
import { verifyCanManageInventory } from '@/lib/server/inventory-access';

export const runtime = 'nodejs';
export const maxDuration = 15;

const VALID_CONDITIONS = ['Baru', 'Baik', 'Cukup', 'Rusak Ringan', 'Rusak Berat'];
const VALID_OWNERSHIP = ['Aset Perusahaan', 'Barang Sewa', 'Barang Titipan', 'Barang Pinjaman Vendor', 'Barang Pribadi Karyawan', 'Lainnya'];
const VALID_FUNDING = ['Kas Perusahaan', 'Reimbursement', 'Dana Proyek', 'Hibah', 'Sponsor', 'Pembelian Pribadi Dialihkan ke Kantor', 'Lainnya'];

function str(v: any, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

/**
 * Tambah Barang — creates one inventory_items doc with a sequential,
 * human-readable itemCode. Prefix is derived from the item's category code
 * (e.g. "ELEC-0001") when a category is given, otherwise falls back to
 * "INV-0001". A separate counter is kept per prefix so each category's
 * numbering doesn't collide with others'. qrCodeValue is set to the new
 * item's Firestore doc id, printed onto a QR sticker — the Scan Portal (a
 * separate app) looks the item up directly by that id from this same
 * collection.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyCanManageInventory(req);
  if ('error' in auth) return jsonError(auth.error, auth.status);

  const body = await req.json().catch(() => ({}));
  const itemName = str(body.itemName);
  if (!itemName) return jsonError('Nama Barang wajib diisi.', 400);

  const companyOwnerId = str(body.companyOwnerId);
  if (!companyOwnerId) return jsonError('Perusahaan/Brand Pemilik wajib diisi.', 400);

  const location = str(body.location);
  if (!location) return jsonError('Lokasi Penyimpanan wajib diisi.', 400);

  const db = admin.firestore();

  const categoryId: string | null = body.categoryId || null;
  let categoryName = '-';
  let prefix = 'INV';
  if (categoryId) {
    const categorySnap = await db.collection('inventory_categories').doc(categoryId).get();
    if (categorySnap.exists) {
      const categoryData = categorySnap.data()!;
      categoryName = categoryData.categoryName ?? '-';
      prefix = String(categoryData.categoryCode ?? 'INV').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'INV';
    }
  }

  const condition = VALID_CONDITIONS.includes(body.condition) ? body.condition : 'Baik';
  const ownershipStatus = VALID_OWNERSHIP.includes(body.ownershipStatus) ? body.ownershipStatus : 'Aset Perusahaan';
  const fundingSource = VALID_FUNDING.includes(body.fundingSource) ? body.fundingSource : null;

  try {
    const itemRef = db.collection('inventory_items').doc();
    const counterRef = db.collection('system_settings').doc('inventory_counters');

    const itemCode = await db.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const counts = counterSnap.exists ? (counterSnap.data()?.counts ?? {}) : {};
      const lastNumber = Number(counts[prefix] ?? 0);
      const nextNumber = lastNumber + 1;
      const code = `${prefix}-${String(nextNumber).padStart(4, '0')}`;

      tx.set(counterRef, { counts: { ...counts, [prefix]: nextNumber }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

      tx.set(itemRef, {
        // 1. Identitas Barang
        itemName,
        itemCode: code,
        categoryId,
        categoryName,
        itemBrand: str(body.itemBrand, '-'),
        model: str(body.model, '-'),
        serialNumber: str(body.serialNumber, '-'),
        imei: str(body.imei, ''),
        photoUrl: str(body.photoUrl, ''),
        description: str(body.description, ''),

        // 2. Kepemilikan & Lokasi — company/division are master data from
        // HRP's brands/{brandId}/divisions structure, never free text.
        companyOwnerId,
        companyOwnerName: str(body.companyOwnerName, '-'),
        divisionOwnerId: body.divisionOwnerId || null,
        divisionOwnerName: str(body.divisionOwnerName, '-'),
        location,
        responsiblePersonUid: body.responsiblePersonUid || null,
        responsiblePersonName: str(body.responsiblePersonName, ''),
        ownershipStatus,

        // 3. Finance / Bukti Aset
        purchaseDate: body.purchaseDate ? admin.firestore.Timestamp.fromDate(new Date(body.purchaseDate)) : null,
        purchasePrice: typeof body.purchasePrice === 'number' ? body.purchasePrice : null,
        fundingSource,
        vendorName: str(body.vendorName, ''),
        invoiceNumber: str(body.invoiceNumber, ''),
        invoiceFileUrl: str(body.invoiceFileUrl, ''),
        purchaseMethod: str(body.purchaseMethod, ''),
        estimatedUsefulLife: str(body.estimatedUsefulLife, ''),
        financeNotes: str(body.financeNotes, ''),

        // 4. Tracking & Operasional
        status: 'available',
        condition,
        isBorrowable: body.isBorrowable !== false,
        requiresApproval: body.requiresApproval === true,
        accessories: str(body.accessories, ''),
        operationalNotes: str(body.operationalNotes, ''),
        qrCodeValue: itemRef.id,

        currentBorrowingId: null,
        currentBorrowerUid: null,
        currentBorrowerName: null,

        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: auth.uid,
      });

      return code;
    });

    await db.collection('inventory_logs').add({
      itemId: itemRef.id,
      action: 'create',
      userUid: auth.uid,
      userName: auth.name,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      detail: `Barang "${itemName}" (${itemCode}) ditambahkan.`,
    });

    return NextResponse.json({ success: true, itemId: itemRef.id, itemCode, qrCodeValue: itemRef.id });
  } catch (err: any) {
    return jsonError(err?.message ?? 'Gagal menambahkan barang.', 500);
  }
}
