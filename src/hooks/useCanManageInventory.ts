'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { doc } from 'firebase/firestore';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';

/**
 * Gate for the Inventory CRUD pages (Dashboard/Master Barang/Tambah Barang/
 * Data Peminjaman). Inventory Admin is a separate access grant
 * (inventory_access/{uid}.status == "active"), not an HRP role — so this
 * checks BOTH the user's HRP role (super-admin always allowed) and that
 * Firestore doc, and redirects away if neither applies.
 */
export function useCanManageInventory() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const isSuperAdmin = userProfile?.role === 'super-admin';

  const accessDocRef = useMemoFirebase(
    () => (userProfile?.uid && !isSuperAdmin ? doc(firestore, 'inventory_access', userProfile.uid) : null),
    [userProfile?.uid, isSuperAdmin, firestore],
  );
  const { data: accessDoc, isLoading: accessLoading } = useDoc<{ status?: string }>(accessDocRef);

  const loading = authLoading || (!isSuperAdmin && !!userProfile && accessLoading);
  const allowed = useMemo(
    () => isSuperAdmin || accessDoc?.status === 'active',
    [isSuperAdmin, accessDoc],
  );

  useEffect(() => {
    if (loading) return;
    if (!userProfile) {
      router.replace('/admin/login');
      return;
    }
    if (!allowed) {
      router.replace('/admin');
    }
  }, [loading, userProfile, allowed, router]);

  return { allowed: !loading && allowed, loading, isSuperAdmin };
}
