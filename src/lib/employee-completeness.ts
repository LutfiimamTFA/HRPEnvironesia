/**
 * SSOT (Single Source of Truth) helper for employee profile completeness.
 * Used by:
 * - POV karyawan (EmployeeProfileDisplay)
 * - HRD Data Karyawan table
 * - HRD Detail Karyawan dialog
 */

import type { EmployeeProfile } from "./types";

export type CompletenessStatus = "not_started" | "partial" | "complete";

export type CompletenessSection = {
  name: string;
  isComplete: boolean;
  mandatory: boolean;
};

export type CompletenessResult = {
  percentage: number;
  status: CompletenessStatus;
  label: string;
  sections: CompletenessSection[];
  missingFields: string[];
};

/**
 * Read a value from nested (dataDiriIdentitas.X) OR flat legacy (profile.X).
 */
function readField(
  nested: Record<string, any>,
  flat: Record<string, any>,
  nestedKey: string,
  ...flatAliases: string[]
): string | undefined {
  const fromNested = nested?.[nestedKey];
  if (fromNested && String(fromNested).trim()) return String(fromNested).trim();
  for (const alias of flatAliases) {
    const val = flat?.[alias];
    if (val && String(val).trim()) return String(val).trim();
  }
  return undefined;
}

/**
 * Calculate profile completeness from a single source.
 * Handles both nested format (dataDiriIdentitas.X) and legacy flat format.
 */
export function calculateProfileCompleteness(
  profile: Partial<EmployeeProfile> | null | undefined,
): CompletenessResult {
  if (!profile) {
    return {
      percentage: 0,
      status: "not_started",
      label: "Belum Mengisi",
      sections: [],
      missingFields: ["Seluruh profil belum diisi"],
    };
  }

  const dd = (profile as any)?.dataDiriIdentitas ?? {};
  const al = (profile as any)?.alamat ?? {};
  const docAdmin = (profile as any)?.dokumenAdministratif ?? {};
  const rek = (profile as any)?.dataRekening ?? {};
  const contacts: any[] = (profile as any)?.kontakDarurat ?? [];
  const pp = (profile as any)?.pendidikanDanPengembangan ?? {};
  const flat = profile as Record<string, any>;

  const sections: CompletenessSection[] = [];
  const missingFields: string[] = [];

  // --- Section 1: Data Diri & Identitas ---
  const idenFields = {
    "Nama Lengkap": readField(dd, flat, "fullName", "fullName"),
    Telepon: readField(dd, flat, "phone", "phone"),
    "Jenis Kelamin": readField(dd, flat, "gender", "gender"),
    "Tempat Lahir": readField(dd, flat, "birthPlace", "birthPlace"),
    "Tanggal Lahir": readField(dd, flat, "birthDate", "birthDate"),
    "Status Pernikahan": readField(
      dd,
      flat,
      "maritalStatus",
      "maritalStatus",
    ),
    Agama: readField(dd, flat, "religion", "religion"),
    Kewarganegaraan: readField(dd, flat, "nationality", "nationality"),
    // Legacy/nested aliases for dropdown fields
    "Golongan Darah": readField(
      dd,
      flat,
      "golonganDarah",
      "bloodType",
      "additionalFields.golonganDarah",
    ),
    "Tinggi Badan": readField(
      dd,
      flat,
      "tinggiBadan",
      "heightCm",
      "additionalFields.tinggiBadan",
    ),
    "Berat Badan": readField(
      dd,
      flat,
      "beratBadan",
      "weightKg",
      "additionalFields.beratBadan",
    ),
    "Kondisi Fisik": readField(
      dd,
      flat,
      "hasPhysicalCondition",
      "hasPhysicalCondition",
      "additionalFields.hasPhysicalCondition",
    ),
  };
  const idenMissing = Object.entries(idenFields)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  const isIdenComplete = idenMissing.length === 0;
  sections.push({
    name: "Data Diri & Identitas",
    isComplete: isIdenComplete,
    mandatory: true,
  });
  if (!isIdenComplete) missingFields.push(...idenMissing.slice(0, 3));

  // --- Section 2: Alamat ---
  const isAddrComplete = Boolean(
    al.ktp?.provinsi?.id || al.addressCurrent,
  );
  sections.push({ name: "Alamat", isComplete: isAddrComplete, mandatory: true });
  if (!isAddrComplete) missingFields.push("Alamat KTP");

  // --- Section 3: Dokumen Administratif ---
  const isNpwpComplete =
    docAdmin.noNpwp ||
    docAdmin.npwpFilePending ||
    (docAdmin.npwp && docAdmin.npwpPhotoUrl);
  const isBpjsKesComplete =
    docAdmin.noBpjsKesehatan ||
    docAdmin.bpjsKesehatanFilePending ||
    (docAdmin.bpjsKesehatan && docAdmin.bpjsKesehatanPhotoUrl);
  const isBpjsTkComplete =
    docAdmin.noBpjsKetenagakerjaan ||
    docAdmin.bpjsKetenagakerjaanFilePending ||
    (docAdmin.bpjsKetenagakerjaan && docAdmin.bpjsKetenagakerjaanPhotoUrl);
  const isDocAdminComplete = Boolean(
    isNpwpComplete && isBpjsKesComplete && isBpjsTkComplete,
  );
  sections.push({
    name: "Dokumen Administratif",
    isComplete: isDocAdminComplete,
    mandatory: true,
  });
  if (!isDocAdminComplete) missingFields.push("Dokumen/BPJS");

  // --- Section 4: Rekening ---
  const isRekComplete = Boolean(rek.bankName || flat.bankName);
  sections.push({
    name: "Data Rekening",
    isComplete: isRekComplete,
    mandatory: true,
  });
  if (!isRekComplete) missingFields.push("Rekening Bank");

  // --- Section 5: Data Keluarga & Kontak Darurat ---
  const hasEmergency = contacts.some((c: any) => c.priority === "Utama");
  sections.push({
    name: "Data Keluarga & Kontak Darurat",
    isComplete: hasEmergency,
    mandatory: true,
  });
  if (!hasEmergency) missingFields.push("Kontak Darurat");

  // --- Section 6: Pendidikan ---
  const pendTerakhir = pp?.pendidikanTerakhir ?? {};
  const isPendComplete = Boolean(
    pendTerakhir.jenjang &&
      pendTerakhir.namaInstitusi &&
      pendTerakhir.jurusan &&
      pendTerakhir.tahunLulus,
  );
  sections.push({
    name: "Pendidikan Terakhir",
    isComplete: isPendComplete,
    mandatory: true,
  });
  if (!isPendComplete) missingFields.push("Pendidikan Terakhir");

  // --- Calculate result ---
  const mandatory = sections.filter((s) => s.mandatory);
  const completedCount = mandatory.filter((s) => s.isComplete).length;
  const totalCount = mandatory.length;
  const percentage = Math.round((completedCount / totalCount) * 100);

  let status: CompletenessStatus;
  let label: string;

  if (percentage === 0) {
    status = "not_started";
    label = "Belum Mengisi";
  } else if (percentage >= 100) {
    status = "complete";
    label = "Lengkap";
  } else {
    status = "partial";
    label = "Sebagian";
  }

  return { percentage, status, label, sections, missingFields };
}
