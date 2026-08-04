import type { Firestore } from 'firebase/firestore';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import type { UserRole } from '@/lib/types';

export const MAINTENANCE_COLLECTION = 'system_maintenance';
export const MAINTENANCE_HISTORY_COLLECTION = 'system_maintenance_logs';

export type MaintenanceTargetType = 'global' | 'role' | 'module' | 'route';
/**
 * scheduled = enabled but startedAt is still in the future
 * active    = enabled, running, estimatedEndAt not reached yet (or none set)
 * overdue   = enabled, estimatedEndAt has passed, but still locked — NEVER auto-unlocked
 *             unless autoUnlock is explicitly turned on for the rule
 * completed = manually finished by Super Admin (or auto-unlocked)
 */
export type MaintenanceStatus = 'scheduled' | 'active' | 'overdue' | 'completed';

export const MAINTAINABLE_ROLES: UserRole[] = ['karyawan', 'hrd', 'kandidat', 'manager'];

export interface MaintenanceRule {
  id: string;
  targetType: MaintenanceTargetType;
  targetKey: string;
  enabled: boolean;
  status: MaintenanceStatus;
  title: string;
  message: string;
  startedAt?: any | null;
  estimatedEndAt?: any | null;
  /** Default false. If true, the guard stops blocking once estimatedEndAt passes — opt-in only. */
  autoUnlock: boolean;
  allowSuperAdminBypass: boolean;
  allowedUserIds: string[];
  createdAt?: any;
  updatedAt?: any;
  updatedByUid?: string | null;
  updatedByName?: string | null;
  completedAt?: any | null;
  completedByUid?: string | null;
  completedByName?: string | null;
  extendedAt?: any | null;
  extendedByUid?: string | null;
}

/** "global" | "role_hrd" | "role_karyawan" | ... — always derivable from the rule that blocked the user. */
export function getMaintenanceSource(rule: Pick<MaintenanceRule, 'targetType' | 'targetKey'>): string {
  return rule.targetType === 'global' ? 'global' : `${rule.targetType}_${rule.targetKey}`;
}

export function maintenanceDocId(targetType: MaintenanceTargetType, targetKey: string) {
  if (targetType === 'global') return 'global';
  const safeKey = targetKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${targetType}_${safeKey}`;
}

/** Inverse of maintenanceDocId — used so history/complete/extend can enrich entries without an extra read. */
export function parseMaintenanceDocId(ruleId: string): { targetType: MaintenanceTargetType; targetKey: string } {
  if (ruleId === 'global') return { targetType: 'global', targetKey: 'global' };
  const [targetType, ...rest] = ruleId.split('_');
  return { targetType: targetType as MaintenanceTargetType, targetKey: rest.join('_') };
}

export function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return null;
}

/**
 * Derives the *display* status from stored data + wall-clock time. This never
 * mutates Firestore — "overdue" is purely a UI/guard signal that the estimate
 * has passed while the rule is still `enabled`. Only a manual action
 * (finish/extend) or an explicit `autoUnlock` changes what actually happens.
 */
export function computeMaintenanceStatus(rule: Pick<MaintenanceRule, 'enabled' | 'startedAt' | 'estimatedEndAt'>, now = Date.now()): MaintenanceStatus {
  if (!rule.enabled) return 'completed';
  const startedAtMs = toMillis(rule.startedAt);
  if (startedAtMs && startedAtMs > now) return 'scheduled';
  const estimatedEndMs = toMillis(rule.estimatedEndAt);
  if (estimatedEndMs && estimatedEndMs < now) return 'overdue';
  return 'active';
}

export async function upsertMaintenanceRule(
  firestore: Firestore,
  rule: {
    targetType: MaintenanceTargetType;
    targetKey: string;
    enabled: boolean;
    title: string;
    message: string;
    startedAt?: Date | null;
    estimatedEndAt?: Date | null;
    autoUnlock?: boolean;
    allowedUserIds?: string[];
    allowSuperAdminBypass?: boolean;
  },
  actorUid: string,
  actorName: string,
) {
  const id = maintenanceDocId(rule.targetType, rule.targetKey);
  const ref = doc(firestore, MAINTENANCE_COLLECTION, id);
  const status = computeMaintenanceStatus(
    { enabled: rule.enabled, startedAt: rule.startedAt ?? null, estimatedEndAt: rule.estimatedEndAt ?? null },
  );
  await setDoc(
    ref,
    {
      targetType: rule.targetType,
      targetKey: rule.targetKey,
      enabled: rule.enabled,
      status,
      title: rule.title ?? '',
      message: rule.message ?? '',
      startedAt: rule.startedAt ?? (rule.enabled ? serverTimestamp() : null),
      estimatedEndAt: rule.estimatedEndAt ?? null,
      autoUnlock: rule.autoUnlock ?? false,
      allowedUserIds: rule.allowedUserIds ?? [],
      allowSuperAdminBypass: rule.allowSuperAdminBypass ?? true,
      updatedAt: serverTimestamp(),
      updatedByUid: actorUid,
      updatedByName: actorName,
      createdAt: serverTimestamp(),
      ...(rule.enabled ? { completedAt: null, completedByUid: null } : {}),
    },
    { merge: true },
  );

  await addDoc(collection(firestore, MAINTENANCE_HISTORY_COLLECTION), {
    ruleId: id,
    targetType: rule.targetType,
    targetKey: rule.targetKey,
    action: rule.enabled ? 'enable' : 'update',
    enabled: rule.enabled,
    status,
    title: rule.title ?? '',
    message: rule.message ?? '',
    startedAt: rule.startedAt ?? (rule.enabled ? serverTimestamp() : null),
    estimatedEndAt: rule.estimatedEndAt ?? null,
    actorUid,
    actorName,
    createdAt: serverTimestamp(),
  });
}

/** "Selesaikan Maintenance" — the only way a rule stops blocking by default (switch OFF must call this too). */
export async function completeMaintenance(
  firestore: Firestore,
  ruleId: string,
  actorUid: string,
  actorName: string,
  title?: string,
) {
  const ref = doc(firestore, MAINTENANCE_COLLECTION, ruleId);
  await setDoc(
    ref,
    {
      enabled: false,
      status: 'completed' satisfies MaintenanceStatus,
      completedAt: serverTimestamp(),
      completedByUid: actorUid,
      completedByName: actorName,
      updatedAt: serverTimestamp(),
      updatedByUid: actorUid,
      updatedByName: actorName,
    },
    { merge: true },
  );
  await addDoc(collection(firestore, MAINTENANCE_HISTORY_COLLECTION), {
    ruleId,
    ...parseMaintenanceDocId(ruleId),
    title: title ?? '',
    action: 'complete',
    enabled: false,
    status: 'completed',
    completedAt: serverTimestamp(),
    actorUid,
    actorName,
    createdAt: serverTimestamp(),
  });
}

/** Backward-compatible alias. */
export const finishMaintenance = completeMaintenance;

/** "Perpanjang Waktu" — pushes estimatedEndAt out and brings status back to active. */
export async function extendMaintenance(
  firestore: Firestore,
  ruleId: string,
  newEstimatedEndAt: Date,
  actorUid: string,
  actorName: string,
  title?: string,
) {
  const ref = doc(firestore, MAINTENANCE_COLLECTION, ruleId);
  await setDoc(
    ref,
    {
      status: 'active' satisfies MaintenanceStatus,
      estimatedEndAt: newEstimatedEndAt,
      extendedAt: serverTimestamp(),
      extendedByUid: actorUid,
      updatedAt: serverTimestamp(),
      updatedByUid: actorUid,
      updatedByName: actorName,
    },
    { merge: true },
  );
  await addDoc(collection(firestore, MAINTENANCE_HISTORY_COLLECTION), {
    ruleId,
    ...parseMaintenanceDocId(ruleId),
    title: title ?? '',
    enabled: true,
    status: 'active',
    action: 'extend',
    estimatedEndAt: newEstimatedEndAt,
    actorUid,
    actorName,
    createdAt: serverTimestamp(),
  });
}

/**
 * Pure evaluation of the maintenance rule set for a given user/route.
 * Guard order: rule not enabled -> allow; super-admin -> allow;
 * uid in allowedUserIds -> allow; role matches an enabled rule -> block; else allow.
 * Time NEVER auto-unlocks a rule unless that specific rule has autoUnlock=true.
 */
export function evaluateMaintenance(
  rules: MaintenanceRule[],
  ctx: { uid: string; role: UserRole | string; pathname: string; moduleKeys?: string[]; now?: number },
): { blocked: boolean; rule?: MaintenanceRule; status?: MaintenanceStatus } {
  const isSuperAdmin = ctx.role === 'super-admin' || ctx.role === 'super_admin';
  const now = ctx.now ?? Date.now();

  const activeRules = rules.filter((r) => r.enabled === true);

  for (const rule of activeRules) {
    const targetKeyLower = rule.targetKey.toLowerCase();
    const matchesTarget =
      rule.targetType === 'global' ||
      (rule.targetType === 'role' && rule.targetKey === ctx.role) ||
      (rule.targetType === 'module' &&
        ((ctx.moduleKeys ?? []).includes(rule.targetKey) ||
          ctx.pathname.toLowerCase().includes(targetKeyLower))) ||
      (rule.targetType === 'route' && ctx.pathname.startsWith(rule.targetKey));

    if (!matchesTarget) continue;

    // Not started yet ("scheduled") — do not block. Blocking begins once the
    // rule's own startedAt is reached (computeMaintenanceStatus then reports 'active').
    const status = computeMaintenanceStatus(rule, now);
    if (status === 'scheduled' || status === 'completed') continue;

    // Super Admin always bypasses — never locked out by its own maintenance rules.
    if (isSuperAdmin && rule.allowSuperAdminBypass !== false) continue;

    if (rule.allowedUserIds?.includes(ctx.uid)) continue;

    // Opt-in only: estimatedEndAt reached AND this specific rule has autoUnlock=true.
    if (rule.autoUnlock === true && status === 'overdue') continue; // past the estimate and allowed to auto-unlock

    return { blocked: true, rule, status };
  }

  return { blocked: false };
}
