"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { AcademicEventState } from "@/lib/types";
import {
  loadAcademicCache,
  reconcileSync,
  saveAcademicCache,
  updateEventState,
  type AcademicCache,
} from "@/lib/academic-store";

export function useAcademicCenter(studentId?: string) {
  const router = useRouter();
  const [cache, setCache] = React.useState<AcademicCache | null>(null);
  const [loadingCache, setLoadingCache] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);
  const syncRef = React.useRef(0);

  const sync = React.useCallback(async () => {
    if (!studentId || syncing) return;
    const requestNumber = ++syncRef.current;
    setSyncing(true);
    setError(null);
    try {
      const payload = await api.syncAcademicCenter();
      if (requestNumber !== syncRef.current) return;
      setCache((current) => {
        const next = reconcileSync(payload, current);
        void saveAcademicCache(studentId, next);
        return next;
      });
    } catch (cause) {
      if (requestNumber !== syncRef.current) return;
      const apiError = cause instanceof ApiError
        ? cause
        : new ApiError("UNKNOWN_ERROR", "暂时无法更新，正在显示上次结果。", 0);
      setError(apiError);
      if (apiError.code === "SESSION_EXPIRED" && !cache) router.replace("/login");
    } finally {
      if (requestNumber === syncRef.current) setSyncing(false);
    }
  }, [cache, router, studentId, syncing]);

  React.useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    loadAcademicCache(studentId).then((stored) => {
      if (cancelled) return;
      setCache(stored);
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
  }, [studentId]);

  const setEventState = React.useCallback((
    eventId: string,
    patch: Partial<Omit<AcademicEventState, "updatedAt">>,
  ) => {
    if (!studentId) return;
    setCache((current) => {
      if (!current) return current;
      const next = updateEventState(current, eventId, patch);
      void saveAcademicCache(studentId, next);
      return next;
    });
  }, [studentId]);

  return { cache, loadingCache, syncing, error, sync, setEventState };
}
