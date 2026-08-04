import type { UserProfile } from './types';

/**
 * Returns true if a user is both an HRD admin AND an active employee.
 * HRD users who have not yet been set up as employees will return false
 * until their employee_profiles document is created.
 */
export function isHrdEmployee(userProfile: UserProfile | null | undefined): boolean {
  if (!userProfile) return false;
  return userProfile.role === 'hrd' && userProfile.isActive === true;
}

/**
 * HRD cannot request overtime — returns false always.
 */
export function canHrdRequestOvertime(_userProfile: UserProfile | null | undefined): boolean {
  return false;
}

/**
 * Returns true if the role is one that should be treated purely as an
 * admin (not a regular employee). Used to block overtime submissions.
 */
export function isAdminOnlyRole(role: string | null | undefined): boolean {
  return role === 'super-admin' || role === 'super_admin' || role === 'superadmin';
}

/**
 * Returns true if the user can request overtime.
 * HRD and pure admin roles cannot.
 */
export function canRequestOvertime(userProfile: UserProfile | null | undefined): boolean {
  if (!userProfile) return false;
  if (userProfile.role === 'hrd') return false;
  if (isAdminOnlyRole(userProfile.role)) return false;
  return true;
}
