"use client";

import * as React from "react";
import { api, ApiError } from "@/lib/api-client";
import type { AcademicEventState } from "@/lib/types";
import {
  loadAcademicCache,
  filterCacheByConnections,
  reconcileSync,
  saveAcademicCache,
  updateEventState,
  type AcademicCache,
} from "@/lib/academic-store";

export function useAcademicCenter() {
  const [cache, setCache] = React.useState<AcademicCache | null>(null);
  const [loadingCache, setLoadingCache] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [syncSlow, setSyncSlow] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);
  const syncRef = React.useRef(0);
  const cacheRef = React.useRef<AcademicCache | null>(null);

  const sync = React.useCallback(async () => {
    if (syncing) return;
    const requestNumber = ++syncRef.current;
    setSyncing(true);
    setSyncSlow(false);
    setError(null);
    const slowTimer = window.setTimeout(() => {
      if (requestNumber === syncRef.current) setSyncSlow(true);
    }, 20_000);
    try {
      const cachedPayload = cacheRef.current?.payload;
      const knownAcademicCourseNames = Array.from(new Set((cachedPayload?.events ?? [])
        .filter((event) => event.courseName && event.sources.some((source) => source.provider === "academic"))
        .map((event) => event.courseName!)));
      const payload = await api.syncAcademicCenter(cachedPayload?.officialCourseNames ?? [], knownAcademicCourseNames);
      if (requestNumber !== syncRef.current) return;
      setCache((current) => {
        const next = reconcileSync(payload, current);
        cacheRef.current = next;
        void saveAcademicCache(next);
        return next;
      });
    } catch (cause) {
      if (requestNumber !== syncRef.current) return;
      const apiError = cause instanceof ApiError
        ? cause
        : new ApiError("UNKNOWN_ERROR", "暂时无法更新，正在显示上次结果。", 0);
      setError(apiError);
    } finally {
      window.clearTimeout(slowTimer);
      if (requestNumber === syncRef.current) {
        setSyncing(false);
        setSyncSlow(false);
      }
    }
  }, [syncing]);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadAcademicCache(),
      api.getConnections().catch(() => null),
    ]).then(([stored, connections]) => {
      if (cancelled) return;
      const validCache = stored && connections ? filterCacheByConnections(stored, connections) : stored;
      setCache(validCache);
      cacheRef.current = validCache;
      if (validCache && validCache !== stored) void saveAcademicCache(validCache);
      setLoadingCache(false);
      // Stale-while-revalidate: paint local data first, then refresh quietly.
      window.setTimeout(() => void sync(), 0);
    });
    return () => {
      cancelled = true;
      syncRef.current += 1;
    };
    // sync intentionally runs once for this student; manual refresh uses callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const reload = () => void loadAcademicCache().then((stored) => {
      cacheRef.current = stored;
      setCache(stored);
    });
    window.addEventListener("academic-cache-changed", reload);
    return () => window.removeEventListener("academic-cache-changed", reload);
  }, []);

  const setEventState = React.useCallback((
    eventId: string,
    patch: Partial<Omit<AcademicEventState, "updatedAt">>,
  ) => {
    setCache((current) => {
      if (!current) return current;
      const next = updateEventState(current, eventId, patch);
      cacheRef.current = next;
      void saveAcademicCache(next);
      return next;
    });
  }, []);

  return { cache, loadingCache, syncing, syncSlow, error, sync, setEventState };
}
