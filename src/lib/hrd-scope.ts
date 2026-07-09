import type { Timestamp } from "firebase/firestore";

export type HrdScopeType = "selected_companies" | "all_companies";

export type HrdScope = {
  scopeType: HrdScopeType;
  allowedBrandIds: string[];
  allowedBrandNames: string[];
  active?: boolean;
  updatedAt?: Timestamp | { seconds: number; nanoseconds: number } | null;
  updatedBy?: string | null;
};

export type HrdRoleDocument = HrdScope & {
  uid: string;
  role: "hrd";
};

export const DEFAULT_HRD_SCOPE: HrdScope = {
  scopeType: "selected_companies",
  allowedBrandIds: [],
  allowedBrandNames: [],
  active: true,
};

export function normalizeHrdScope(value: Partial<HrdScope> | null | undefined): HrdScope {
  const scopeType: HrdScopeType =
    value?.scopeType === "all_companies" ? "all_companies" : "selected_companies";

  return {
    scopeType,
    allowedBrandIds: Array.isArray(value?.allowedBrandIds)
      ? value.allowedBrandIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [],
    allowedBrandNames: Array.isArray(value?.allowedBrandNames)
      ? value.allowedBrandNames.filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      : [],
    active: value?.active !== false,
    updatedAt: value?.updatedAt ?? null,
    updatedBy: value?.updatedBy ?? null,
  };
}

export function isHrdScopeConfigured(scope: HrdScope | null | undefined) {
  if (!scope || scope.active === false) return false;
  if (scope.scopeType === "all_companies") return true;
  return scope.allowedBrandIds.length > 0;
}

export function canHrdAccessBrand(scope: HrdScope | null | undefined, brandId?: string | null) {
  if (!scope || scope.active === false || !brandId) return false;
  if (scope.scopeType === "all_companies") return true;
  return scope.allowedBrandIds.includes(brandId);
}

export function getHrdScopeBadgeLabel(scope: HrdScope | null | undefined) {
  if (!scope || scope.active === false) return "Belum Diatur";
  if (scope.scopeType === "all_companies") return "Semua Perusahaan";
  if (scope.allowedBrandIds.length === 0) return "Belum Diatur";
  return `${scope.allowedBrandIds.length} Perusahaan`;
}

export function chunkArray<T>(items: T[], size = 10): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
