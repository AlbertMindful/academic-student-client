/**
 * 极简内存滑动窗口限流，用于登录端点，防止批量爆破账号。
 * 生产环境建议替换为 Redis 等集中式限流。
 */

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const buckets = new Map<string, number[]>();

export function hit(identifier: string): boolean {
  const now = Date.now();
  const timestamps = (buckets.get(identifier) ?? []).filter(
    (t) => now - t < WINDOW_MS,
  );
  if (timestamps.length >= MAX_ATTEMPTS) {
    buckets.set(identifier, timestamps);
    return true;
  }
  timestamps.push(now);
  buckets.set(identifier, timestamps);
  return false;
}

export function reset(identifier: string): void {
  buckets.delete(identifier);
}

/** 定期清理过期的桶。 */
export function cleanup(): void {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (v.every((t) => now - t >= WINDOW_MS)) buckets.delete(k);
  }
}

if (typeof setInterval !== "undefined") {
  setInterval(cleanup, WINDOW_MS).unref?.();
}
