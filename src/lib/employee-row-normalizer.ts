import { Brand, EmployeeMasterData, EmployeeProfile, UserProfile } from "./types";
import { normalizeEmployeeOperationalStatus, OperationalStatus } from "./employee-status";

export interface NormalizedEmployeeRow {
  brandId: string;
  brandName: string;
  divisi: string;
  jabatan: string;
  tipeKaryawan: string;
  statusKerja: OperationalStatus;
  needsHrdAttention: boolean;
}

/**
 * Single Source of Truth for normalizing employee data for list rows and filtering.
 */
export function normalizeEmployeeRow(
  employee: any,
  profile: any,
  user: any,
  brands: Brand[] = []
): NormalizedEmployeeRow {
  // 1. Resolve Brand
  const rawBrandId = 
    employee?.brandId || 
    employee?.companyId || 
    employee?.hrdEmploymentInfo?.brandId || 
    profile?.hrdEmploymentInfo?.brandId || 
    (typeof user?.brandId === "string" ? user?.brandId : Array.isArray(user?.brandId) ? user?.brandId[0] : "");

  const rawBrandName = 
    employee?.brandName || 
    employee?.companyName || 
    employee?.hrdEmploymentInfo?.brand || 
    profile?.hrdEmploymentInfo?.brand || 
    user?.brandName || 
    "";

  let brandId = String(rawBrandId || "").trim();
  let brandName = String(rawBrandName || "").trim();

  // If we have ID but no name, or name is a placeholder, resolve from brands collection
  if (brandId && (!brandName || brandName === "Belum diatur")) {
    const foundBrand = brands.find(b => b.id === brandId);
    if (foundBrand) {
      brandName = foundBrand.name;
    }
  }

  // If we have name but no ID, resolve ID from brands collection
  if (!brandId && brandName) {
    const foundBrand = brands.find(b => b.name === brandName);
    if (foundBrand) {
      brandId = foundBrand.id!;
    }
  }

  // 2. Resolve Division
  const divisi = String(
    employee?.division || 
    employee?.hrdEmploymentInfo?.divisi || 
    profile?.hrdEmploymentInfo?.divisi || 
    user?.division || 
    ""
  ).trim();

  // 3. Resolve Jabatan
  const jabatan = String(
    employee?.positionTitle || 
    employee?.hrdEmploymentInfo?.jabatan || 
    profile?.hrdEmploymentInfo?.jabatan || 
    user?.positionTitle || 
    ""
  ).trim();

  // 4. Resolve Type & Status
  const tipeKaryawan = String(
    employee?.employmentType || 
    employee?.employeeType ||
    employee?.hrdEmploymentInfo?.tipeKaryawan || 
    profile?.hrdEmploymentInfo?.tipeKaryawan || 
    user?.employmentType || 
    ""
  ).trim();

  const statusKerja = normalizeEmployeeOperationalStatus(employee, profile, user);

  // 5. Determine if HRD attention is needed
  const needsHrdAttention = !brandId || !divisi || !jabatan || statusKerja === "unknown";

  return {
    brandId,
    brandName: brandName || "Brand belum diatur",
    divisi: divisi || "Divisi belum diatur",
    jabatan: jabatan || "Jabatan belum diatur",
    tipeKaryawan: tipeKaryawan || "Staf",
    statusKerja,
    needsHrdAttention
  };
}
