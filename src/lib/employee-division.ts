/**
 * Shared division-resolution logic — used by both the replacement-candidates
 * route and the Super Admin division-backfill tool, so "what counts as a
 * valid division" can never drift between the two. An employee_profiles
 * doc's own divisionName/divisi/hrdEmploymentInfo.divisi fields are a
 * snapshot from whenever the employee's structure was last saved, and can
 * hold a division that's since been renamed or removed from master data
 * (brands/{brandId}/divisions) — e.g. "CBDMS", which may not exist in a
 * brand's current division list at all. Master data is always the source of
 * truth; a raw field that doesn't resolve to a real master division is
 * flagged invalid rather than trusted.
 */

export function normalizeText(value: any): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export type MasterDivision = { id: string; name: string; isActive?: boolean };

export type ResolvedDivision = {
  divisionId: string;
  divisionName: string;
  isValid: boolean;
  source: 'master_by_id' | 'master_by_name' | 'legacy_invalid';
};

export function getRawDivisionFields(employee: any) {
  const hrd = employee?.hrdEmploymentInfo || {};
  return {
    divisionId:
      employee?.divisionId ||
      hrd.divisionId ||
      employee?.strukturKepegawaian?.divisionId ||
      employee?.employmentData?.divisionId ||
      '',
    divisionName:
      employee?.divisionName ||
      hrd.divisionName ||
      employee?.strukturKepegawaian?.divisionName ||
      employee?.employmentData?.divisionName ||
      hrd.divisi ||
      employee?.divisi ||
      '',
  };
}

export function resolveEmployeeDivision(
  employee: any,
  masterDivisions: MasterDivision[],
): ResolvedDivision {
  const { divisionId: rawDivisionId, divisionName: rawDivisionName } = getRawDivisionFields(employee);

  const byId = rawDivisionId ? masterDivisions.find((d) => d.id === rawDivisionId) : undefined;
  if (byId) {
    return { divisionId: byId.id, divisionName: byId.name, isValid: true, source: 'master_by_id' };
  }

  const normalizedRawName = normalizeText(rawDivisionName);
  const byName = normalizedRawName
    ? masterDivisions.find((d) => normalizeText(d.name) === normalizedRawName)
    : undefined;
  if (byName) {
    return { divisionId: byName.id, divisionName: byName.name, isValid: true, source: 'master_by_name' };
  }

  return { divisionId: rawDivisionId, divisionName: rawDivisionName, isValid: false, source: 'legacy_invalid' };
}
