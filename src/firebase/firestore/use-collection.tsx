"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getAuth } from "firebase/auth";
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
  getDocs,
} from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";

/** Utility type to add an 'id' field to a given type T. */
export type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useCollection hook.
 * @template T Type of the document data.
 */
export interface UseCollectionResult<T> {
  data: WithId<T>[] | null; // Document data with ID, or null.
  isLoading: boolean; // True if loading.
  error: FirestoreError | Error | null; // Error object, or null.
  mutate: () => void;
  /** True while paused after a resource-exhausted error (see cooldownMs option). */
  isPaused: boolean;
}

export interface UseCollectionOptions {
  /**
   * When false, fetches once with getDocs instead of opening a persistent
   * onSnapshot listener. Use for list/report pages that don't need live
   * updates (Data Karyawan, Applications, Audit Log, Backup/Export Log,
   * etc.) — every onSnapshot is a standing read cost multiplied by every
   * concurrently-open tab. Defaults to true to preserve existing behavior.
   */
  realtime?: boolean;
  /**
   * Minimum time to back off after a `resource-exhausted` error before this
   * hook will try again. Prevents the classic retry storm where a listener
   * immediately re-subscribes into the same quota wall. Defaults to 60s.
   */
  cooldownMs?: number;
}

/* Internal implementation of Query:
  https://github.com/firebase/firebase-js-sdk/blob/c5f08a9bc5da0d2b0207802c972d53724ccef055/packages/firestore/src/lite-api/reference.ts#L143
*/
export interface InternalQuery extends Query<DocumentData> {
  _query: {
    path: {
      canonicalString(): string;
      toString(): string;
    };
  };
}

/**
 * Best-effort extraction of a query's actual where()-clause filters (field/
 * operator/value), reaching into the SDK's internal `_query.filters` the
 * same way `InternalQuery` above reaches into `_query.path` — there's no
 * public API for this. Used only for the permission-denied console log
 * below, so a future "list" rejection actually shows which field(s) the
 * query was scoped by (or that it wasn't scoped at all), instead of just
 * the bare collection path repeated with no way to tell which component or
 * filter was responsible.
 */
function describeQueryFilters(target: (CollectionReference<DocumentData> | Query<DocumentData>) & { __memo?: boolean }): string {
  if ((target as any).type === "collection") return "(no filters — bare collection reference)";
  try {
    const filters = (target as any)?._query?.filters;
    if (!Array.isArray(filters) || filters.length === 0) {
      return "(no filters — unscoped query)";
    }
    return filters
      .map((f: any) => {
        const field = f?.field?.segments?.join(".") ?? f?.field?.toString?.() ?? "?";
        const op = f?.op ?? "?";
        const value = f?.value?.value ?? f?.value ?? "?";
        return `${field} ${op} ${JSON.stringify(value)}`;
      })
      .join(" AND ");
  } catch {
    return "(unable to introspect filters)";
  }
}

function isInvalidFirestoreTarget(
  target:
    | ((CollectionReference<DocumentData> | Query<DocumentData>) & {
        __memo?: boolean;
      })
    | null
    | undefined,
) {
  if (!target) return true;

  if ((target as any).type === "collection") {
    return !(target as CollectionReference<DocumentData>).path;
  }

  const queryTarget = target as unknown as InternalQuery;
  const pathObject = queryTarget?._query?.path;
  const canonicalPath = pathObject?.canonicalString as
    | string
    | (() => string)
    | undefined;

  if (typeof canonicalPath === "function") {
    const path = canonicalPath.call(pathObject);
    return typeof path !== "string" || path.length === 0;
  }

  if (typeof canonicalPath === "string") {
    return canonicalPath.length === 0;
  }

  return true;
}

const DEFAULT_COOLDOWN_MS = 60_000;

/**
 * React hook to subscribe to (or one-shot fetch) a Firestore collection/query.
 * Handles nullable references.
 *
 *
 * IMPORTANT! YOU MUST MEMOIZE the inputted memoizedTargetRefOrQuery or BAD THINGS WILL HAPPEN
 * use useMemo to memoize it per React guidence.  Also make sure that it's dependencies are stable
 * references
 *
 * @template T Optional type for document data. Defaults to any.
 * @param {CollectionReference<DocumentData> | Query<DocumentData> | null | undefined} targetRefOrQuery -
 * The Firestore CollectionReference or Query. Waits if null/undefined.
 * @returns {UseCollectionResult<T>} Object with data, isLoading, error.
 */
export function useCollection<T = any>(
  memoizedTargetRefOrQuery:
    | ((CollectionReference<DocumentData> | Query<DocumentData>) & {
        __memo?: boolean;
      })
    | null
    | undefined,
  options?: UseCollectionOptions,
): UseCollectionResult<T> {
  type ResultItemType = WithId<T>;
  type StateDataType = ResultItemType[] | null;

  const realtime = options?.realtime !== false;
  const cooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(
    !!memoizedTargetRefOrQuery &&
      !isInvalidFirestoreTarget(memoizedTargetRefOrQuery),
  );
  const [error, setError] = useState<FirestoreError | Error | null>(null);
  const [pausedUntil, setPausedUntil] = useState(0);
  const isPaused = pausedUntil > Date.now();

  const shouldFetch = !isInvalidFirestoreTarget(memoizedTargetRefOrQuery);

  // Anti-flicker ("keep previous data"): once a query has successfully
  // resolved at least once, later re-subscribes (e.g. because the query
  // object's identity changed — a new brandId filter, a dependent value
  // updating, etc.) no longer flip `isLoading` back to true or blank out
  // `data`. The UI keeps showing the last good rows until the new snapshot
  // arrives, then swaps in place. Resets whenever the target becomes
  // disabled/null (a genuinely new load cycle, e.g. after logout).
  const hasLoadedOnceRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!shouldFetch || !memoizedTargetRefOrQuery) return;
    if (!hasLoadedOnceRef.current) setIsLoading(true);
    try {
      const querySnapshot = await getDocs(memoizedTargetRefOrQuery);
      const results: ResultItemType[] = [];
      for (const doc of querySnapshot.docs) {
        results.push({ ...(doc.data() as T), id: doc.id });
      }
      setData(results);
      setError(null);
      hasLoadedOnceRef.current = true;
    } catch (e: any) {
      setError(e);
      if (e?.code === "resource-exhausted") {
        setPausedUntil(Date.now() + cooldownMs);
      }
    } finally {
      setIsLoading(false);
    }
  }, [memoizedTargetRefOrQuery, shouldFetch, cooldownMs]);

  useEffect(() => {
    if (!shouldFetch) {
      hasLoadedOnceRef.current = false;
      setData([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (!memoizedTargetRefOrQuery) return;

    const now = Date.now();
    if (pausedUntil > now) {
      // Cooling down after a resource-exhausted hit — don't hammer the
      // backend again until the pause elapses (see the retry effect below).
      setIsLoading(false);
      return;
    }

    if (!realtime) {
      let alive = true;
      if (!hasLoadedOnceRef.current) setIsLoading(true);
      setError(null);
      getDocs(memoizedTargetRefOrQuery)
        .then((snapshot: QuerySnapshot<DocumentData>) => {
          if (!alive) return;
          const results: ResultItemType[] = [];
          for (const doc of snapshot.docs) {
            results.push({ ...(doc.data() as T), id: doc.id });
          }
          setData(results);
          setError(null);
          setIsLoading(false);
          hasLoadedOnceRef.current = true;
        })
        .catch((err: FirestoreError) => {
          if (!alive) return;
          setError(err);
          setData(null);
          setIsLoading(false);
          if (err?.code === "resource-exhausted") {
            setPausedUntil(Date.now() + cooldownMs);
          }
        });
      return () => {
        alive = false;
      };
    }

    if (!hasLoadedOnceRef.current) setIsLoading(true);
    setError(null);

    let unsubscribe: (() => void) | undefined;

    unsubscribe = onSnapshot(
      memoizedTargetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results: ResultItemType[] = [];
        for (const doc of snapshot.docs) {
          results.push({ ...(doc.data() as T), id: doc.id });
        }
        setData(results);
        setError(null);
        setIsLoading(false);
        hasLoadedOnceRef.current = true;
      },
      (error: FirestoreError) => {
        try {
          const auth = getAuth();
          if (error.code === "permission-denied" && !auth.currentUser) {
            setIsLoading(false);
            return; // Suppress error during logout.
          }
        } catch (e) {
          // If getAuth fails, it means firebase is not initialized, we are unmounting, safe to ignore.
          return;
        }

        const path: string =
          memoizedTargetRefOrQuery.type === "collection"
            ? (memoizedTargetRefOrQuery as CollectionReference).path
            : (
                memoizedTargetRefOrQuery as unknown as InternalQuery
              )._query.path.canonicalString();

        if (error.code === "permission-denied") {
          // The filters, not just the path, are what actually determine
          // whether a `list` was legitimately scoped — this line is what
          // tells you WHICH query hit the rule, since the bare path alone
          // (e.g. "leave_requests") looks identical whether the query was
          // properly scoped by uid/brandId or not scoped at all.
          console.error(
            `Firestore onSnapshot permission-denied on path '${path}' — filters: ${describeQueryFilters(memoizedTargetRefOrQuery)}`,
          );
        } else {
          console.error(
            `Firestore onSnapshot error on path '${path}': ${error.message} (Code: ${error.code})`,
          );
        }

        if (error.code === "permission-denied") {
          const contextualError = new FirestorePermissionError({
            operation: "list",
            path,
          });
          setError(contextualError);

          if (contextualError.request.auth) {
            errorEmitter.emit("permission-error", contextualError);
          }
        } else {
          setError(error);
        }

        setData(null);
        setIsLoading(false);

        if (error.code === "resource-exhausted") {
          // Stop retrying immediately — unsubscribe and cool down instead of
          // letting the SDK's internal backoff hammer the same quota wall.
          unsubscribe?.();
          setPausedUntil(Date.now() + cooldownMs);
        }
      },
    );

    return () => unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoizedTargetRefOrQuery, shouldFetch, realtime, pausedUntil]);

  // Wake up once the cooldown elapses so the listener/read resumes automatically.
  useEffect(() => {
    if (pausedUntil <= Date.now()) return;
    const timeout = window.setTimeout(() => setPausedUntil(0), pausedUntil - Date.now());
    return () => window.clearTimeout(timeout);
  }, [pausedUntil]);

  if (
    memoizedTargetRefOrQuery &&
    (memoizedTargetRefOrQuery as any).__memo !== true
  ) {
    // This check helps prevent infinite loops by ensuring the query is memoized.
    // console.warn('useCollection detected a non-memoized query. This can lead to performance issues. Wrap the query() call in useMemoFirebase().', memoizedTargetRefOrQuery);
  }

  return { data, isLoading, error, mutate: fetchData, isPaused };
}
