import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * Resolves which HRD accounts (uids) should receive a brand-scoped
 * notification, based on roles_hrd — the same source of truth Firestore
 * rules use for HRD access control. An HRD with scopeType "all_companies"
 * always qualifies; one scoped to "selected_companies" only qualifies if
 * brandId is one of their allowedBrandIds. Never resolves inactive HRD
 * accounts (roles_hrd/{uid}.active === false).
 *
 * If brandId is not provided, only "all_companies" HRDs are notified — we
 * never guess which brand-scoped HRD should see an un-scoped notification.
 */
export async function resolveHrdRecipientUids(
  db: Firestore,
  brandId?: string | null,
): Promise<string[]> {
  const snap = await db.collection('roles_hrd').where('active', '==', true).get();
  const uids: string[] = [];

  snap.forEach((doc) => {
    const data = doc.data();
    const scopeType = data.scopeType === 'all_companies' ? 'all_companies' : 'selected_companies';
    if (scopeType === 'all_companies') {
      uids.push(doc.id);
      return;
    }
    const allowedBrandIds: string[] = Array.isArray(data.allowedBrandIds) ? data.allowedBrandIds : [];
    if (brandId && allowedBrandIds.includes(brandId)) {
      uids.push(doc.id);
    }
  });

  return uids;
}
