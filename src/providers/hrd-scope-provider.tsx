"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useHrdScope } from "@/hooks/useHrdScope";

type HrdScopeContextValue = ReturnType<typeof useHrdScope>;

const HrdScopeContext = createContext<HrdScopeContextValue | null>(null);

/**
 * Reads roles_hrd/{uid} exactly once per dashboard session and shares the
 * result via context. Before this provider existed, every component that
 * needed HRD scope (useHrdScopedCollection, employee detail page, ...) called
 * useHrdScope() itself, each opening its own onSnapshot listener on the same
 * document — redundant reads and, worse, independent loading/data state
 * transitions on the same doc that didn't stay in sync, which is part of
 * what caused the dashboard to flicker after HRD was split per-brand.
 */
export function HrdScopeProvider({ children }: { children: ReactNode }) {
  const value = useHrdScope();

  const lastLogRef = useRef<string>("");
  useEffect(() => {
    const key = JSON.stringify({
      loading: value.isLoading,
      scopeType: value.scope?.scopeType,
      allowedBrandIds: value.allowedBrandIds,
    });
    if (key === lastLogRef.current) return;
    lastLogRef.current = key;
    // Temporary debug log — remove once the flicker fix is confirmed stable.
    // eslint-disable-next-line no-console
    console.log("[HRD_SCOPE_RENDER]", {
      isHrd: value.isHrd,
      isSuperAdmin: value.isSuperAdmin,
      loading: value.isLoading,
      scopeType: value.scope?.scopeType,
      allowedBrandIds: value.allowedBrandIds,
    });
  }, [value.isLoading, value.isHrd, value.isSuperAdmin, value.scope?.scopeType, value.allowedBrandIds]);

  return <HrdScopeContext.Provider value={value}>{children}</HrdScopeContext.Provider>;
}

/** Consumes the single shared HRD scope read by HrdScopeProvider — never opens its own roles_hrd listener. */
export function useHrdScopeContext(): HrdScopeContextValue {
  const ctx = useContext(HrdScopeContext);
  if (!ctx) {
    throw new Error("useHrdScopeContext must be used within an HrdScopeProvider");
  }
  return ctx;
}
