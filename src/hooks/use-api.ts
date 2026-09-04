"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";

interface UseApiResult<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * 客户端数据获取 hook：处理 loading / error / 401 会话过期跳转。
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList,
): UseApiResult<T> {
  const router = useRouter();
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [nonce, setNonce] = React.useState(0);

  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const err = e instanceof ApiError ? e : new ApiError("UNKNOWN_ERROR", "请求失败。", 0);
        setError(err);
        setLoading(false);
        if (err.code === "SESSION_EXPIRED") {
          router.replace("/login");
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, reload };
}
