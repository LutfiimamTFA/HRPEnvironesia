import { Brand } from "./types";
import { normalizeEmployeeRow } from "./employee-row-normalizer";
import { getOperationalStatusLabel } from "./employee-status";

export interface HrdStrukturKerja {
  brandId: string;
  brandName: string;
  divisi: string;
  jabatan: string;
  tipeKaryawan: string;
  statusKerja: string; // Human readable label
  sistemKerja: string;
  lokasiKerja: string;
}

/**
 * Single Source of Truth for Employee HRD Structure.
 * Reuses normalizeEmployeeRow logic to ensure consistency across the dashboard.
 */
export function getHrdEmployeeStruktur(
  employee: any,
  profile: any,
  user: any,
  brands: Brand[] = []
): HrdStrukturKerja {
  const normalized = normalizeEmployeeRow(employee, profile, user, brands);
  
  // Access HRD specific info from profile or employee doc
  const hrdInfo = profile?.hrdEmploymentInfo || employee?.hrdEmploymentInfo || {};
  
  // Normalize brandName, divisi, jabatan to empty if they are the default "Belum diatur" strings
  // This allows the UI to handle the "Belum diatur" state specifically for alerts
  const cleanBrandName = normalized.brandName === "Brand belum diatur" ? "" : normalized.brandName;
  const cleanDivisi = normalized.divisi === "Divisi belum diatur" ? "" : normalized.divisi;
  const cleanJabatan = normalized.jabatan === "Jabatan belum diatur" ? "" : normalized.jabatan;

  return {
    brandId: normalized.brandId,
    brandName: cleanBrandName,
    divisi: cleanDivisi,
    jabatan: cleanJabatan,
    tipeKaryawan: normalized.tipeKaryawan,
    statusKerja: getOperationalStatusLabel(normalized.statusKerja),
    sistemKerja: hrdInfo.sistemKerja || "WFO",
    lokasiKerja: hrdInfo.lokasiKerja || "Head Office"
  };
}
