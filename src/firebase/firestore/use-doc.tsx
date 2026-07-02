"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuth } from "firebase/auth";
import {
  DocumentReference,
  onSnapshot,
  DocumentData,
  FirestoreError,
  DocumentSnapshot,
  getDoc,
} from "firebase/firestore";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";

/** Utility type to add an 'id' field to a given type T. */
type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useDoc hook.
 * @template T Type of the document data.
 */
export interface UseDocResult<T> {
  data: WithId<T> | null; // Document data with ID, or null.
  isLoading: boolean; // True if loading.
  error: FirestoreError | Error | null; // Error object, or null.
  mutate: () => void; // Function to manually refetch data.
  /** True while paused after a resource-exhausted error. */
  isPaused: boolean;
}

const DEFAULT_COOLDOWN_MS = 60_000;

/**
 * React hook to subscribe to a single Firestore document in real-time.
 * Handles nullable references.
 *
 * IMPORTANT! YOU MUST MEMOIZE the inputted memoizedTargetRefOrQuery or BAD THINGS WILL HAPPEN
 * use useMemo to memoize it per React guidence.  Also make sure that it's dependencies are stable
 * references
 *
 *
 * @template T Optional type for document data. Defaults to any.
 * @param {DocumentReference<DocumentData> | null | undefined} docRef -
 * The Firestore DocumentReference. Waits if null/undefined.
 * @returns {UseDocResult<T>} Object with data, isLoading, error.
 */
export function useDoc<T = any>(
  memoizedDocRef:
    | (DocumentReference<DocumentData> & { __memo?: boolean })
    | null
    | undefined,
  options?: { cooldownMs?: number },
): UseDocResult<T> {
  type StateDataType = WithId<T> | null;

  const cooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!!memoizedDocRef);
  const [error, setError] = useState<FirestoreError | Error | null>(null);
  const [pausedUntil, setPausedUntil] = useState(0);
  const isPaused = pausedUntil > Date.now();

  const fetchData = useCallback(async () => {
    if (!memoizedDocRef) return;
    setIsLoading(true);
    try {
      const docSnap = await getDoc(memoizedDocRef);
      if (docSnap.exists()) {
        setData({ ...(docSnap.data() as T), id: docSnap.id });
      } else {
        setData(null);
      }
      setError(null);
    } catch (e: any) {
      setError(e);
      if (e?.code === "resource-exhausted") {
        setPausedUntil(Date.now() + cooldownMs);
      }
    } finally {
      setIsLoading(false);
    }
  }, [memoizedDocRef, cooldownMs]);

  useEffect(() => {
    if (!memoizedDocRef) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (pausedUntil > Date.now()) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    let unsubscribe: (() => void) | undefined;

    unsubscribe = onSnapshot(
      memoizedDocRef,
      (snapshot: DocumentSnapshot<DocumentData>) => {
        if (snapshot.exists()) {
          setData({ ...(snapshot.data() as T), id: snapshot.id });
        } else {
          setData(null);
        }
        setError(null);
        setIsLoading(false);
      },
      (error: FirestoreError) => {
        try {
          const auth = getAuth();
          if (error.code === "permission-denied" && !auth.currentUser) {
            setIsLoading(false);
            return; // Suppress error during logout.
          }
        } catch (e) {
          // Firebase app is likely unmounted, safe to ignore.
          return;
        }

        if (error.code === "resource-exhausted") {
          unsubscribe?.();
          setPausedUntil(Date.now() + cooldownMs);
          setError(error);
          setIsLoading(false);
          return;
        }

        const contextualError = new FirestorePermissionError({
          operation: "get",
          path: memoizedDocRef.path,
        });

        setError(contextualError);
        setData(null);
        setIsLoading(false);

        if (contextualError.request.auth) {
          errorEmitter.emit("permission-error", contextualError);
        }
      },
    );

    return () => unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoizedDocRef, pausedUntil]);

  useEffect(() => {
    if (pausedUntil <= Date.now()) return;
    const timeout = window.setTimeout(() => setPausedUntil(0), pausedUntil - Date.now());
    return () => window.clearTimeout(timeout);
  }, [pausedUntil]);

  if (memoizedDocRef && (memoizedDocRef as any).__memo !== true) {
    // This check helps prevent infinite loops by ensuring the docRef is memoized.
    // console.warn('useDoc detected a non-memoized docRef. This can lead to performance issues. Wrap the doc() call in useMemoFirebase().', memoizedDocRef);
  }

  return { data, isLoading, error, mutate: fetchData, isPaused };
}
