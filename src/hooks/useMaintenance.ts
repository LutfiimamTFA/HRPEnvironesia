'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useAuth } from '@/providers/auth-provider';
import {
  computeMaintenanceStatus,
  evaluateMaintenance,
  maintenanceDocId,
  toMillis,
  MAINTENANCE_COLLECTION,
  type MaintenanceRule,
} from '@/lib/maintenance';

/** How often the guard re-evaluates against the wall clock (catches scheduled→active,
 * active→overdue transitions even with no new Firestore writes/navigation). */
const RECHECK_INTERVAL_MS = 15_000;

/**
 * Realtime read of ALL maintenance rules. Only meant for Super Admin surfaces
 * (Maintenance Control page, the sidebar overdue badge) — regular users/guards
 * should use useMyMaintenanceStatus below, which only reads the 2 docs that can
 * actually affect them (system_maintenance/global + system_maintenance/role_{role}).
 */
export function useMaintenanceRules() {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const [rules, setRules] = useState<MaintenanceRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !userProfile?.uid || userProfile.role !== 'super-admin') {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      collection(firestore, MAINTENANCE_COLLECTION),
      (snap) => {
        setRules(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MaintenanceRule));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [firestore, userProfile?.uid, userProfile?.role]);

  return { rules, loading };
}

/**
 * Realtime read of ONLY the two docs that can lock out the current user:
 * system_maintenance/global and system_maintenance/role_{role}. This is what
 * AdminGuard, CandidatePortalLayout, and /maintenance should use — not the
 * whole collection — per the "MaintenanceGuard may only read global + own
 * role doc" rule.
 *
 * Also re-evaluates on a timer (not just when Firestore pushes a new snapshot),
 * so a scheduled maintenance actually locks the user out the moment its
 * startedAt is reached, and estimatedEndAt correctly flips to "overdue" —
 * without needing a page reload or unrelated write to trigger a re-render.
 */
export function useMyMaintenanceStatus(pathname: string, moduleKeys?: string[]) {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const role = userProfile?.role;

  const [globalRule, setGlobalRule] = useState<MaintenanceRule | null>(null);
  const [roleRule, setRoleRule] = useState<MaintenanceRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(() => Date.now());

  // Best-effort server clock calibration: whenever a rule doc arrives with a
  // fresh `updatedAt` serverTimestamp, we know exactly what the server's clock
  // read at that instant. The gap between that and our local Date.now() at
  // receipt time is a decent estimate of local clock drift — used so
  // scheduling decisions aren't purely dependent on a possibly-wrong browser
  // clock. Firestore has no direct "server now" RPC, so this is the closest
  // practical approximation without adding a Cloud Function.
  const serverOffsetMsRef = useRef(0);
  const calibrate = (data: any) => {
    const serverMs = toMillis(data?.updatedAt);
    if (serverMs) serverOffsetMsRef.current = Date.now() - serverMs;
  };

  useEffect(() => {
    if (!firestore || !userProfile?.uid) {
      setLoading(false);
      return;
    }
    setLoading(true);

    let globalLoaded = false;
    let roleLoaded = false;
    const markLoaded = () => {
      if (globalLoaded && roleLoaded) setLoading(false);
    };

    const globalRef = doc(firestore, MAINTENANCE_COLLECTION, maintenanceDocId('global', 'global'));
    const unsubGlobal = onSnapshot(
      globalRef,
      (snap) => {
        const data = snap.exists() ? ({ id: snap.id, ...snap.data() } as MaintenanceRule) : null;
        if (data) calibrate(data);
        setGlobalRule(data);
        globalLoaded = true;
        markLoaded();
      },
      () => { globalLoaded = true; markLoaded(); },
    );

    let unsubRole: (() => void) | undefined;
    if (role) {
      const roleRef = doc(firestore, MAINTENANCE_COLLECTION, maintenanceDocId('role', role));
      unsubRole = onSnapshot(
        roleRef,
        (snap) => {
          const data = snap.exists() ? ({ id: snap.id, ...snap.data() } as MaintenanceRule) : null;
          if (data) calibrate(data);
          setRoleRule(data);
          roleLoaded = true;
          markLoaded();
        },
        () => { roleLoaded = true; markLoaded(); },
      );
    } else {
      roleLoaded = true;
    }

    return () => {
      unsubGlobal();
      unsubRole?.();
    };
  }, [firestore, userProfile?.uid, role]);

  // Periodic re-check so scheduled→active / active→overdue transitions apply
  // automatically, even without a new snapshot or navigation.
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), RECHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const rules = useMemo(() => [globalRule, roleRule].filter((r): r is MaintenanceRule => !!r), [globalRule, roleRule]);

  const effectiveNow = tick - serverOffsetMsRef.current;

  const result = useMemo(() => {
    if (!userProfile?.uid) return { blocked: false as const };
    return evaluateMaintenance(rules, {
      uid: userProfile.uid,
      role: userProfile.role,
      pathname,
      moduleKeys,
      now: effectiveNow,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, userProfile?.uid, userProfile?.role, pathname, moduleKeys, effectiveNow]);

  return { ...result, loading, rules, now: effectiveNow };
}

/** Backward-compatible alias — same targeted (global + own role) evaluation. */
export const useMaintenanceGuard = useMyMaintenanceStatus;

/**
 * Number of enabled rules whose estimatedEndAt has passed while still locked —
 * used for the sidebar badge / dashboard reminder. Super Admin only.
 */
export function useOverdueMaintenanceCount() {
  const { rules } = useMaintenanceRules();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), RECHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
  return useMemo(
    () => rules.filter((r) => r.enabled && computeMaintenanceStatus(r, now) === 'overdue').length,
    [rules, now],
  );
}
