'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import type { UserRole } from '@/lib/types';

const PREVIEW_ROLE_STORAGE_KEY = 'hrp:previewRole';
// Legacy/alternate key names some earlier UI copy referenced — cleared defensively on exit.
const LEGACY_PREVIEW_KEYS = ['previewRole', 'effectiveRole', 'hrp:effectiveRole'];

/** Where Super Admin lands after leaving Preview Mode — never leaves them stranded on a role-owned page. */
export const PREVIEW_EXIT_ROUTE = '/admin/super-admin/maintenance-control';

export const PREVIEWABLE_ROLES: UserRole[] = ['karyawan', 'hrd', 'kandidat', 'manager'];

function clearAllPreviewStorage() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PREVIEW_ROLE_STORAGE_KEY);
    LEGACY_PREVIEW_KEYS.forEach((key) => {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    });
  } catch {
    // ignore storage failures
  }
}

type PreviewRoleContextType = {
  previewRole: UserRole | null;
  isPreviewMode: boolean;
  /** Real role from the authenticated account — never mutated by preview mode. */
  realRole: UserRole | null;
  /** previewRole if active (super-admin only), otherwise realRole. */
  effectiveRole: UserRole | null;
  setPreviewRole: (role: UserRole | null) => void;
  exitPreview: () => void;
};

const PreviewRoleContext = createContext<PreviewRoleContextType>({
  previewRole: null,
  isPreviewMode: false,
  realRole: null,
  effectiveRole: null,
  setPreviewRole: () => {},
  exitPreview: () => {},
});

export function PreviewRoleProvider({ children }: { children: ReactNode }) {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const realRole = (userProfile?.role as UserRole) ?? null;
  const isSuperAdmin = realRole === 'super-admin';

  const [previewRole, setPreviewRoleState] = useState<UserRole | null>(null);

  // Restore from sessionStorage (per-tab, so other tabs/sessions are unaffected).
  useEffect(() => {
    if (!isSuperAdmin || typeof window === 'undefined') return;
    try {
      const stored = sessionStorage.getItem(PREVIEW_ROLE_STORAGE_KEY) as UserRole | null;
      if (stored && PREVIEWABLE_ROLES.includes(stored)) {
        setPreviewRoleState(stored);
      }
    } catch {
      // ignore storage failures
    }
  }, [isSuperAdmin]);

  // Never allow preview mode to persist for a non-super-admin account — clear on
  // load/role-change so a stale previewRole never survives for a real HRD/Karyawan/etc user.
  useEffect(() => {
    if (loading) return;
    if (!isSuperAdmin) {
      if (previewRole !== null) setPreviewRoleState(null);
      clearAllPreviewStorage();
    }
  }, [isSuperAdmin, previewRole, loading]);

  const setPreviewRole = useCallback((role: UserRole | null) => {
    if (!isSuperAdmin) return; // hard guard: only a real super-admin account may enter preview mode
    setPreviewRoleState(role);
    try {
      if (role) sessionStorage.setItem(PREVIEW_ROLE_STORAGE_KEY, role);
      else clearAllPreviewStorage();
    } catch {
      // ignore storage failures
    }
  }, [isSuperAdmin]);

  // Clears preview state entirely (local/session only — never touches Firestore or the
  // real account role) and immediately navigates Super Admin back to a Super Admin route,
  // so they're never left stranded on a page that belonged to the previewed role.
  const exitPreview = useCallback(() => {
    setPreviewRoleState(null);
    clearAllPreviewStorage();
    router.push(PREVIEW_EXIT_ROUTE);
  }, [router]);

  const value = useMemo<PreviewRoleContextType>(() => {
    const active = isSuperAdmin ? previewRole : null;
    return {
      previewRole: active,
      isPreviewMode: !!active,
      realRole,
      effectiveRole: active ?? realRole,
      setPreviewRole,
      exitPreview,
    };
  }, [isSuperAdmin, previewRole, realRole, setPreviewRole, exitPreview]);

  return <PreviewRoleContext.Provider value={value}>{children}</PreviewRoleContext.Provider>;
}

export const usePreviewRole = () => useContext(PreviewRoleContext);
