'use client';

/**
 * useLiveLeaveBalance — THE single hook every leave-balance UI must call.
 *
 * Every previous drift bug (Staff vs HRD vs LeavePolicySummaryCard vs Detail
 * Pengajuan showing different numbers) traced back to the same root cause:
 * several components independently ran calculateLeaveBalance() against their
 * own realtime-listener snapshots of employee_profiles/leave_requests/
 * leave_policies. Those listeners don't all settle at the same instant —
 * and per the console errors that prompted this hook (Firestore "Listen"
 * channel 404/400, WebChannelConnection transport errored), they sometimes
 * don't settle at all — so two components computing "independently but with
 * the same formula" could still show different numbers for several seconds,
 * or indefinitely if one listener's channel was the one that broke.
 *
 * This hook does NOT use onSnapshot. It calls GET /api/leave/my-balance
 * (Admin SDK, `cache: "no-store"`) — the ONE server-side place that gathers
 * employee_profiles + leave_policies + leave_requests and runs
 * calculateLeaveBalance() (src/lib/leave-balance.ts) — and exposes an
 * explicit refetch() that callers invoke right after any action that could
 * change the numbers (submit/cancel/edit/replacement decision/manager or HRD
 * decision), instead of trusting a realtime listener to eventually catch up.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import type { LeaveBalanceResult } from '@/lib/leave-balance';

/** Same shape calculateLeaveBalance() returns, with periodStart/periodEnd rehydrated into Date (JSON transport turns them into ISO strings) — every existing `result.found`/`result.entitlementDays`/etc. call site keeps working unchanged. */
export type LiveLeaveBalance = LeaveBalanceResult;

export interface UseLiveLeaveBalanceResult {
  loading: boolean;
  error: string | null;
  balance: LiveLeaveBalance | null;
  refetch: () => Promise<void>;
}

function rehydrate(raw: any): LiveLeaveBalance {
  if (!raw?.found) return raw;
  return {
    ...raw,
    periodStart: new Date(raw.periodStart),
    periodEnd: new Date(raw.periodEnd),
  };
}

/**
 * @param employeeUid The employee whose balance to load — the caller's own
 * uid for staff pages, or another employee's uid for HRD-facing pages (the
 * API enforces HRD brand-scope / super-admin server-side; a disallowed uid
 * comes back as a 403, surfaced via `error`).
 */
export function useLiveLeaveBalance(employeeUid: string | null | undefined): UseLiveLeaveBalanceResult {
  const [loading, setLoading] = useState<boolean>(Boolean(employeeUid));
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<LiveLeaveBalance | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback(async () => {
    if (!employeeUid) {
      setBalance(null);
      setError(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Sesi login Anda tidak valid.');

      const res = await fetch(`/api/leave/my-balance?employeeUid=${encodeURIComponent(employeeUid)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memuat saldo cuti.');

      const normalized = rehydrate(data.balance);

      console.log('[LEAVE_BALANCE_SYNC_DEBUG]', JSON.stringify({
        employeeUid,
        source: 'useLiveLeaveBalance',
        found: normalized.found,
        reason: normalized.found ? undefined : normalized.reason,
        entitlementDays: normalized.found ? normalized.entitlementDays : null,
        usedDays: normalized.found ? normalized.usedDays : null,
        pendingDays: normalized.found ? normalized.pendingDays : null,
        remainingDays: normalized.found ? normalized.remainingDays : null,
        availableDays: normalized.found ? normalized.availableDays : null,
        approvedRequestIds: normalized.found ? normalized.approvedRequestIds : [],
        pendingRequestIds: normalized.found ? normalized.pendingRequestIds : [],
        calculatedAt: new Date().toISOString(),
      }, null, 2));

      setBalance(normalized);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('[LEAVE_BALANCE_SYNC_DEBUG] refetch failed:', e);
      setError(e.message || 'Gagal memuat saldo cuti.');
      setBalance(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeUid]);

  useEffect(() => {
    refetch();
    return () => abortRef.current?.abort();
  }, [refetch]);

  return { loading, error, balance, refetch };
}
