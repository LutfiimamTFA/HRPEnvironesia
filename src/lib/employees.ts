import type {
  EmployeeMasterData,
  EmployeeProfile,
  EmployeeProfileWithMaster,
} from "./types";

export function mergeEmployeeAndProfile(
  employee: EmployeeMasterData,
  profile?: EmployeeProfile | null,
): EmployeeProfileWithMaster {
  const merged: EmployeeProfileWithMaster = {
    ...profile,
    uid: employee.uid,
    fullName: employee.fullName,
    email: employee.email,
    brand: employee.brand,
    brandId: employee.brandId,
    brandName: employee.brandName,
    division: employee.division,
    positionTitle: employee.positionTitle,
    managerName: employee.managerName,
    managerUid: employee.managerUid,
    employmentType: employee.employmentType,
    employmentStatus: employee.employmentStatus,
    startDate: employee.startDate,
    joinDate: employee.joinDate ?? employee.startDate,
    employeeNumber: employee.employeeNumber,
    source: employee.source,
    employeeMasterData: employee,
    employeeProfile: profile ?? null,
    dataDiriIdentitas:
      profile?.dataDiriIdentitas ??
      ({} as EmployeeProfile["dataDiriIdentitas"]),
    alamat: profile?.alamat ?? ({} as EmployeeProfile["alamat"]),
    dokumenAdministratif:
      profile?.dokumenAdministratif ??
      ({} as EmployeeProfile["dokumenAdministratif"]),
    dataRekening:
      profile?.dataRekening ?? ({} as EmployeeProfile["dataRekening"]),
    dataKeluarga: profile?.dataKeluarga,
    pendidikanDanPengembangan: profile?.pendidikanDanPengembangan,
    kontakDarurat: profile?.kontakDarurat ?? [],
    completeness: profile?.completeness,
    updatedAt: profile?.updatedAt ?? employee.updatedAt,
  };

  return merged;
}
