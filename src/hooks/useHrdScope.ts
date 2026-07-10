"use client";

import { useMemo } from "react";
import { doc } from "firebase/firestore";
import { useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { useAuth } from "@/providers/auth-provider";
import {
  DEFAULT_HRD_SCOPE,
  type HrdRoleDocument,
  type HrdScope,
  getHrdScopeBadgeLabel,
  isHrdScopeConfigured,
  normalizeHrdScope,
} from "@/lib/hrd-scope";

const EMPTY_ARRAY: string[] = [];

export function useHrdScope() {
  const firestore = useFirestore();
  const { userProfile, loading: authLoading } = useAuth();

  const isSuperAdmin = userProfile?.role === "super-admin";
  const isHrd = userProfile?.role === "hrd";

  const roleDocRef = useMemoFirebase(
    () => (isHrd && userProfile?.uid ? doc(firestore, "roles_hrd", userProfile.uid) : null),
    [firestore, isHrd, userProfile?.uid],
  );

  const {
    data: roleDoc,
    isLoading: roleLoading,
    error,
    mutate,
  } = useDoc<HrdRoleDocument>(roleDocRef);

  const scope: HrdScope | null = useMemo(() => {
    if (isSuperAdmin) {
      return {
        scopeType: "all_companies",
        allowedBrandIds: [],
        allowedBrandNames: [],
        allowedPayrollGroupIds: [],
        active: true,
      };
    }

    if (!isHrd) return null;

    if (!roleDoc) {
      return DEFAULT_HRD_SCOPE;
    }

    return normalizeHrdScope(roleDoc);
  }, [isSuperAdmin, isHrd, roleDoc]);

  const isLoading = authLoading || (isHrd && roleLoading);
  const isConfigured = isSuperAdmin || isHrdScopeConfigured(scope);
  const isAllCompanies = scope?.scopeType === "all_companies" && scope.active !== false;
  // Stable empty-array singletons — `scope?.allowedBrandIds ?? []` would
  // otherwise create a brand-new [] reference on every render whenever scope
  // is null, and consumers that put allowedBrandIds directly in a useMemo/
  // useEffect dependency array (instead of a joined string) would then
  // recompute/resubscribe every render, which is one of the flicker causes.
  const allowedBrandIds = useMemo(() => scope?.allowedBrandIds ?? EMPTY_ARRAY, [scope]);
  const allowedBrandNames = useMemo(() => scope?.allowedBrandNames ?? EMPTY_ARRAY, [scope]);

  return {
    scope,
    roleDoc,
    isLoading,
    error,
    mutate,
    isSuperAdmin,
    isHrd,
    isConfigured,
    isAllCompanies,
    allowedBrandIds,
    allowedBrandNames,
    badgeLabel: getHrdScopeBadgeLabel(scope),
    emptyStateMessage: "Akses perusahaan belum diatur. Hubungi Super Admin.",
  };
}
