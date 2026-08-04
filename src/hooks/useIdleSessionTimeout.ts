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
// Minimum 30 minutes by default — never hardcode 5 minutes or less. Session &
// Security can override this per-deployment (see AdminGuard's Firestore read).
export const IDLE_TIMEOUT_MS    = 30 * 60 * 1000; // 30 minutes
export const WARNING_BEFORE_MS  =  60 * 1000;     //  1 minute warning
const FORCE_LOGOUT_KEY = 'hrp:forceLogout';
const LAST_ACTIVITY_KEY = 'hrp:lastActivityAt';
// Throttle localStorage writes — activity events (mousemove especially) can
// fire dozens of times per second; we only need a coarse "was the user here
// recently" timestamp, not a write on every pixel of mouse movement.
const ACTIVITY_PERSIST_INTERVAL_MS = 30 * 1000;

const ACTIVITY_EVENTS = [
  'mousemove', 'pointermove', 'mousedown', 'click', 'keydown', 'scroll', 'touchstart',
] as const;

// ── Types ───────────────────────────────────────────────────────────────────
export interface IdleSessionTimeoutOptions {
  idleTimeoutMs?:   number;
  warningBeforeMs?: number;
  /** Set to false to disable (e.g. on public pages or when logged out). */
  enabled?: boolean;
  /** Which activity types count as "still here" — all default to true. */
  trackMouseMove?: boolean;
  trackKeyboard?: boolean;
  trackScroll?: boolean;
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

function readLastActivityAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const ms = Number(raw);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────
export function useIdleSessionTimeout({
  idleTimeoutMs   = IDLE_TIMEOUT_MS,
  warningBeforeMs = WARNING_BEFORE_MS,
  enabled         = true,
  trackMouseMove  = true,
  trackKeyboard   = true,
  trackScroll     = true,
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
  const lastPersistRef   = useRef(0);

  // ── Helpers ─────────────────────────────────────────────────────────────
  const clearAll = useCallback(() => {
    if (warningTimer.current)   { clearTimeout(warningTimer.current);    warningTimer.current   = null; }
    if (logoutTimer.current)    { clearTimeout(logoutTimer.current);     logoutTimer.current    = null; }
    if (countdownTimer.current) { clearInterval(countdownTimer.current); countdownTimer.current = null; }
  }, []);

  const persistLastActivity = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastPersistRef.current < ACTIVITY_PERSIST_INTERVAL_MS) return;
    lastPersistRef.current = now;
    try { localStorage.setItem(LAST_ACTIVITY_KEY, now.toString()); } catch { /* ignore */ }
  }, []);

  const executeLogout = useCallback(async (reason: string) => {
    clearAll();
    warningActiveRef.current = false;
    setShowWarning(false);

    console.log('[session-debug]', {
      lastActivityAt: readLastActivityAt(),
      idleForSeconds: null,
      timeoutMinutes: Math.round(idleTimeoutMsRef.current / 60000),
      reason,
    });

    // Notify other open tabs
    try { localStorage.setItem(FORCE_LOGOUT_KEY, Date.now().toString()); } catch { /* ignore */ }

    try { await onTimeoutRef.current(); } catch { /* still force logout */ }
  }, [clearAll]);

  /**
   * (Re)starts the idle clock. `elapsedMs` accounts for time already spent
   * idle before this call (e.g. a backgrounded tab being refocused) — instead
   * of naively granting a fresh full idleTimeoutMs, we schedule only the time
   * actually remaining, and jump straight to the warning/logout state if
   * that time has already passed while the tab was hidden.
   */
  const startIdle = useCallback((elapsedMs = 0) => {
    clearAll();
    warningActiveRef.current = false;
    setShowWarning(false);
    persistLastActivity(true);

    const idleTimeout   = idleTimeoutMsRef.current;
    const warningBefore = warningBeforeMsRef.current;
    const warnAfter      = idleTimeout - warningBefore;
    const remainingUntilWarn   = warnAfter - elapsedMs;
    const remainingUntilLogout = idleTimeout - elapsedMs;

    if (remainingUntilLogout <= 0) {
      // Already idle past the full timeout while backgrounded/reloaded.
      executeLogout('idle_timeout');
      return;
    }

    const showWarningNow = (ms: number) => {
      warningActiveRef.current = true;
      setShowWarning(true);
      try { onWarningRef.current?.(); } catch { /* ignore status write failures */ }

      let secs = Math.max(0, Math.floor(ms / 1000));
      setSecondsRemaining(secs);
      console.log('[session-debug]', {
        lastActivityAt: readLastActivityAt(),
        idleForSeconds: Math.round(elapsedMs / 1000),
        timeoutMinutes: Math.round(idleTimeout / 60000),
        reason: 'idle_warning',
      });

      countdownTimer.current = setInterval(() => {
        secs -= 1;
        setSecondsRemaining(secs > 0 ? secs : 0);
        if (secs <= 0 && countdownTimer.current) {
          clearInterval(countdownTimer.current);
          countdownTimer.current = null;
        }
      }, 1000);

      logoutTimer.current = setTimeout(() => {
        executeLogout('idle_timeout');
      }, ms);
    };

    if (remainingUntilWarn <= 0) {
      // Already within the warning window (e.g. tab was hidden for a while).
      showWarningNow(remainingUntilLogout);
      return;
    }

    warningTimer.current = setTimeout(() => {
      showWarningNow(warningBefore);
    }, remainingUntilWarn);
  }, [clearAll, executeLogout, persistLastActivity]);

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

    // Any genuine activity proves the user is present — including while the
    // warning modal is showing. Requiring a specific button click only (the
    // previous behavior) meant a user who kept moving the mouse/scrolling but
    // didn't notice/click the modal in time still got logged out despite
    // clearly being active. Real activity always resets the clock now.
    const onActivity = () => {
      persistLastActivity();
      startIdle();
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const lastActivityAt = readLastActivityAt();
      const elapsed = lastActivityAt ? Date.now() - lastActivityAt : 0;
      startIdle(Math.max(0, elapsed));
    };

    // Cross-tab: another tab emitted the force-logout signal
    const onStorage = (e: StorageEvent) => {
      if (e.key === FORCE_LOGOUT_KEY && e.newValue) executeLogout('idle_timeout');
    };

    const activeEvents = ACTIVITY_EVENTS.filter((evt) => {
      if (['mousemove', 'pointermove', 'mousedown', 'click'].includes(evt)) return trackMouseMove;
      if (evt === 'keydown') return trackKeyboard;
      if (evt === 'scroll') return trackScroll;
      return true; // touchstart always tracked
    });

    activeEvents.forEach(evt =>
      document.addEventListener(evt, onActivity, { passive: true }),
    );
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);

    return () => {
      clearAll();
      activeEvents.forEach(evt =>
        document.removeEventListener(evt, onActivity),
      );
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
    };
  // `startIdle` and `executeLogout` are stable (useCallback with stable deps).
  // Only re-run if `enabled` or tracking flags change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, trackMouseMove, trackKeyboard, trackScroll]);

  return { showWarning, secondsRemaining, keepAlive };
}
