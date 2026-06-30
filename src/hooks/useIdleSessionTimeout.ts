'use client';
/**
 * useIdleSessionTimeout
 *
 * Monitors user activity and fires `onTimeout` after the configured idle period.
 * Shows a warning `warningBeforeMs` milliseconds before the final logout.
 * Cross-tab logout is coordinated via a localStorage broadcast key.
 */
import { useEffect, useRef, useCallback, useState } from 'react';

// ── Defaults ────────────────────────────────────────────────────────────────
export const IDLE_TIMEOUT_MS    = 15 * 60 * 1000; // 15 minutes
export const WARNING_BEFORE_MS  =  2 * 60 * 1000; //  2 minutes warning
const FORCE_LOGOUT_KEY = 'hrp:forceLogout';
const ACTIVITY_EVENTS = [
  'mousemove', 'mousedown', 'click', 'keydown', 'scroll', 'touchstart',
] as const;

// ── Types ───────────────────────────────────────────────────────────────────
export interface IdleSessionTimeoutOptions {
  idleTimeoutMs?:   number;
  warningBeforeMs?: number;
  /** Set to false to disable (e.g. on public pages or when logged out). */
  enabled?: boolean;
  /** Called when the idle period has elapsed and the user must be signed out. */
  onTimeout: () => Promise<void> | void;
  /** Called when the user enters the warning/idle phase. */
  onWarning?: () => Promise<void> | void;
}

export interface IdleSessionTimeoutResult {
  showWarning:      boolean;
  secondsRemaining: number;
  /** Call this when the user clicks "Tetap Login" to reset the idle clock. */
  keepAlive: () => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────
export function useIdleSessionTimeout({
  idleTimeoutMs   = IDLE_TIMEOUT_MS,
  warningBeforeMs = WARNING_BEFORE_MS,
  enabled         = true,
  onTimeout,
  onWarning,
}: IdleSessionTimeoutOptions): IdleSessionTimeoutResult {
  const [showWarning,      setShowWarning]      = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(
    Math.floor(warningBeforeMs / 1000),
  );

  // ── Mutable refs (no stale-closure issues) ──────────────────────────────
  const onTimeoutRef       = useRef(onTimeout);
  const onWarningRef       = useRef(onWarning);
  const idleTimeoutMsRef   = useRef(idleTimeoutMs);
  const warningBeforeMsRef = useRef(warningBeforeMs);

  useEffect(() => { onTimeoutRef.current       = onTimeout;       }, [onTimeout]);
  useEffect(() => { onWarningRef.current       = onWarning;       }, [onWarning]);
  useEffect(() => { idleTimeoutMsRef.current   = idleTimeoutMs;   }, [idleTimeoutMs]);
  useEffect(() => { warningBeforeMsRef.current = warningBeforeMs; }, [warningBeforeMs]);

  const warningTimer     = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const logoutTimer      = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const countdownTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningActiveRef = useRef(false);

  // ── Helpers ─────────────────────────────────────────────────────────────
  const clearAll = useCallback(() => {
    if (warningTimer.current)   { clearTimeout(warningTimer.current);    warningTimer.current   = null; }
    if (logoutTimer.current)    { clearTimeout(logoutTimer.current);     logoutTimer.current    = null; }
    if (countdownTimer.current) { clearInterval(countdownTimer.current); countdownTimer.current = null; }
  }, []);

  const executeLogout = useCallback(async () => {
    clearAll();
    warningActiveRef.current = false;
    setShowWarning(false);

    // Notify other open tabs
    try { localStorage.setItem(FORCE_LOGOUT_KEY, Date.now().toString()); } catch { /* ignore */ }

    try { await onTimeoutRef.current(); } catch { /* still force logout */ }
  }, [clearAll]);

  const startIdle = useCallback(() => {
    clearAll();
    warningActiveRef.current = false;
    setShowWarning(false);

    const warnAfter = idleTimeoutMsRef.current - warningBeforeMsRef.current;

    warningTimer.current = setTimeout(() => {
      // ── Show warning modal ────────────────────────────────────────────
      warningActiveRef.current = true;
      setShowWarning(true);
      try { onWarningRef.current?.(); } catch { /* ignore status write failures */ }

      let secs = Math.floor(warningBeforeMsRef.current / 1000);
      setSecondsRemaining(secs);

      countdownTimer.current = setInterval(() => {
        secs -= 1;
        setSecondsRemaining(secs > 0 ? secs : 0);
        if (secs <= 0) {
          if (countdownTimer.current) {
            clearInterval(countdownTimer.current);
            countdownTimer.current = null;
          }
        }
      }, 1000);

      // ── Schedule final logout ─────────────────────────────────────────
      logoutTimer.current = setTimeout(() => {
        executeLogout();
      }, warningBeforeMsRef.current);
    }, warnAfter);
  }, [clearAll, executeLogout]);

  /** Reset the idle clock and close the warning modal. */
  const keepAlive = useCallback(() => {
    startIdle();
  }, [startIdle]);

  // ── Effect: attach listeners, start clock ───────────────────────────────
  useEffect(() => {
    if (!enabled) {
      clearAll();
      warningActiveRef.current = false;
      setShowWarning(false);
      return;
    }

    startIdle();

    const onActivity = () => {
      // Ignore activity while the warning is visible — user must click the button.
      if (!warningActiveRef.current) startIdle();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !warningActiveRef.current) {
        startIdle();
      }
    };

    // Cross-tab: another tab emitted the force-logout signal
    const onStorage = (e: StorageEvent) => {
      if (e.key === FORCE_LOGOUT_KEY && e.newValue) executeLogout();
    };

    ACTIVITY_EVENTS.forEach(evt =>
      document.addEventListener(evt, onActivity, { passive: true }),
    );
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);

    return () => {
      clearAll();
      ACTIVITY_EVENTS.forEach(evt =>
        document.removeEventListener(evt, onActivity),
      );
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
    };
  // `startIdle` and `executeLogout` are stable (useCallback with stable deps).
  // Only re-run if `enabled` changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { showWarning, secondsRemaining, keepAlive };
}
