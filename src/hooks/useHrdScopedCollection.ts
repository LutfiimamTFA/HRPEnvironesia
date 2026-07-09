"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  documentId,
  getDocs,
  onSnapshot,
  query,
  where,
  type CollectionReference,
  type DocumentData,
  type FirestoreError,
  type Query,
  type QueryConstraint,
  type QuerySnapshot,
} from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { chunkArray } from "@/lib/hrd-scope";
import { useHrdScope } from "@/hooks/useHrdScope";

type WithId<T> = T & { id: string };

type ScopedCollectionOptions = {
  brandField?: string;
  constraints?: QueryConstraint[];
  enabled?: boolean;
  realtime?: boolean;
};

function snapshotToRows<T>(snapshot: QuerySnapshot<DocumentData>): WithId<T>[] {
  return snapshot.docs.map((docSnap) => ({
    ...(docSnap.data() as T),
    id: docSnap.id,
  }));
}

export function useHrdScopedCollection<T = any>(
  collectionPath: string,
  options?: ScopedCollectionOptions,
) {
  const firestore = useFirestore();
  const {
    isLoading: isScopeLoading,
    isConfigured,
    isAllCompanies,
    isSuperAdmin,
    allowedBrandIds,
    scope,
    emptyStateMessage,
  } = useHrdScope();

  const brandField = options?.brandField ?? "brandId";
  const constraints = useMemo(() => options?.constraints ?? [], [options?.constraints]);
  const enabled = options?.enabled !== false;
  const realtime = options?.realtime !== false;
  const [data, setData] = useState<WithId<T>[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const targets = useMemo(() => {
    if (!enabled || isScopeLoading) return [];
    if (!isConfigured) return [];

    const baseRef = collection(firestore, collectionPath) as CollectionReference<DocumentData>;
    if (isSuperAdmin || isAllCompanies) {
      return [query(baseRef, ...constraints)];
    }

    return chunkArray(allowedBrandIds, 10).map((brandIds) =>
      query(baseRef, where(brandField, "in", brandIds), ...constraints),
    );
  }, [
    allowedBrandIds,
    brandField,
    collectionPath,
    constraints,
    enabled,
    firestore,
    isAllCompanies,
    isConfigured,
    isScopeLoading,
    isSuperAdmin,
  ]);

  const fetchOnce = useCallback(async () => {
    if (!enabled || isScopeLoading) return;
    if (targets.length === 0) {
      setData([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const snapshots = await Promise.all(targets.map((target) => getDocs(target)));
      const rowsById = new Map<string, WithId<T>>();
      snapshots.flatMap(snapshotToRows<T>).forEach((row) => rowsById.set(row.id, row));
      setData(Array.from(rowsById.values()));
    } catch (err: any) {
      setError(err);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, isScopeLoading, targets]);

  useEffect(() => {
    if (!enabled || isScopeLoading) {
      setData([]);
      setError(null);
      setIsLoading(isScopeLoading);
      return;
    }

    if (targets.length === 0) {
      setData([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (!realtime) {
      fetchOnce();
      return;
    }

    setIsLoading(true);
    setError(null);
    const rowsByTarget = new Map<number, WithId<T>[]>();
    let remainingInitialSnapshots = targets.length;

    const emitRows = () => {
      const rowsById = new Map<string, WithId<T>>();
      Array.from(rowsByTarget.values())
        .flat()
        .forEach((row) => rowsById.set(row.id, row));
      setData(Array.from(rowsById.values()));
    };

    const unsubscribes = targets.map((target, index) =>
      onSnapshot(
        target,
        (snapshot) => {
          rowsByTarget.set(index, snapshotToRows<T>(snapshot));
          emitRows();
          remainingInitialSnapshots -= 1;
          if (remainingInitialSnapshots <= 0) setIsLoading(false);
        },
        (err) => {
          setError(err);
          setData(null);
          setIsLoading(false);
        },
      ),
    );

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [enabled, fetchOnce, isScopeLoading, realtime, reloadKey, targets]);

  return {
    data,
    isLoading,
    error,
    mutate: () => setReloadKey((value) => value + 1),
    scope,
    isScopeLoading,
    isScopeConfigured: isConfigured,
    isAllCompaniesScope: isAllCompanies,
    emptyStateMessage,
  };
}

export function useHrdScopedBrands() {
  const firestore = useFirestore();
  const {
    isLoading: isScopeLoading,
    isConfigured,
    isAllCompanies,
    isSuperAdmin,
    allowedBrandIds,
    scope,
    emptyStateMessage,
  } = useHrdScope();
  const [data, setData] = useState<WithId<any>[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const targets: Query<DocumentData>[] = useMemo(() => {
    if (isScopeLoading || !isConfigured) return [];
    const baseRef = collection(firestore, "brands") as CollectionReference<DocumentData>;
    if (isSuperAdmin || isAllCompanies) return [query(baseRef)];
    return chunkArray(allowedBrandIds, 10).map((brandIds) =>
      query(baseRef, where(documentId(), "in", brandIds)),
    );
  }, [allowedBrandIds, firestore, isAllCompanies, isConfigured, isScopeLoading, isSuperAdmin]);

  useEffect(() => {
    if (isScopeLoading) {
      setIsLoading(true);
      return;
    }

    if (targets.length === 0) {
      setData([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    Promise.all(targets.map((target) => getDocs(target)))
      .then((snapshots) => {
        const rowsById = new Map<string, WithId<any>>();
        snapshots.flatMap(snapshotToRows<any>).forEach((row) => rowsById.set(row.id, row));
        setData(Array.from(rowsById.values()));
      })
      .catch((err) => {
        setError(err);
        setData(null);
      })
      .finally(() => setIsLoading(false));
  }, [isScopeLoading, reloadKey, targets]);

  return {
    data,
    isLoading,
    error,
    mutate: () => setReloadKey((value) => value + 1),
    scope,
    emptyStateMessage,
  };
}
