export const ROLES = [
  "super-admin",
  "hrd",
  "manager",
  "kandidat",
  "karyawan",
] as const;

export const ROLES_INTERNAL = [
  "super-admin",
  "hrd",
  "manager",
  "karyawan",
] as const;

export const EMPLOYMENT_TYPES = ["karyawan", "magang", "training"] as const;

export const EMPLOYMENT_STAGES = [
  "intern_education",
  "intern_pre_probation",
  "probation",
  "active",
] as const;

export const EMPLOYMENT_STATUSES = [
  "active",
  "probation",
  "resigned",
  "terminated",
] as const;
