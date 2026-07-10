/**
 * Resolves a single canonical identity key for an employee record so the same
 * physical person is never rendered as two different rows (e.g. one doc keyed
 * by uid and a legacy duplicate keyed by email/employeeId). Priority mirrors
 * how confident each field is at uniquely identifying a person: uid is the
 * Firebase Auth identity and can't collide; employeeId is assigned by HRD;
 * email/phone are user-editable and more likely to typo or duplicate.
 */
export function resolveEmployeeIdentityKey(record: {
  uid?: string | null;
  employeeId?: string | null;
  employeeCode?: string | null;
  email?: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
}): string | null {
  const uid = record.uid?.trim();
  if (uid) return `uid:${uid}`;

  const employeeId = (record.employeeId || record.employeeCode)?.trim();
  if (employeeId) return `employeeId:${employeeId.toLowerCase()}`;

  const email = record.email?.trim().toLowerCase();
  if (email) return `email:${email}`;

  const phone = (record.phone || record.phoneNumber)?.trim();
  if (phone) return `phone:${phone.replace(/\D/g, "")}`;

  return null;
}

/**
 * Collapses a list of employee-like records to one row per identity key,
 * keeping the first occurrence (callers should pass their canonical source —
 * e.g. employee_profiles — first so it wins ties).
 */
export function dedupeByIdentity<T extends Parameters<typeof resolveEmployeeIdentityKey>[0]>(
  records: T[],
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const record of records) {
    const key = resolveEmployeeIdentityKey(record);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    result.push(record);
  }
  return result;
}
