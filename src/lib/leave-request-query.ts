/**
 * getLeaveRequestOwnerUid() — the same field-fallback resolution already
 * implemented (and battle-tested) as getLeaveRequestEmployeeUid() in
 * leave-balance.ts. Re-exported under this name here so every page that
 * needs "which uid owns this leave_requests doc" imports from one obvious
 * place, without a second copy of the fallback chain drifting out of sync
 * with the one the balance calculator itself relies on.
 */
export { getLeaveRequestEmployeeUid as getLeaveRequestOwnerUid } from './leave-balance';
