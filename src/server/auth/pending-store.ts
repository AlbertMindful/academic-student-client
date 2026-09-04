import crypto from "node:crypto";
import { CookieJar } from "@/server/auth/cookie-jar";
import { createAdapter } from "@/server/adapters";
import type { AcademicSystemAdapter } from "@/server/adapters/types";

export interface PendingLogin {
  id: string;
  jar: CookieJar;
  adapter: AcademicSystemAdapter;
  username: string;
  createdAt: number;
  expiresAt: number;
  verificationAttempts: number;
  verifying: boolean;
}

const TTL_MS = 5 * 60 * 1000; // 短信验证码有效期窗口

/**
 * “待完成登录”存储：短信登录分两步（先发验证码、再输验证码），两步之间
 * 需要保留 SSO 会话 Cookie 与设备码上下文。该上下文只短期驻留内存，
 * 一旦完成登录即被提升为正式会话并从本存储移除。
 */
class PendingStore {
  private map = new Map<string, PendingLogin>();

  create(username: string): PendingLogin {
    this.cleanup();
    const id = crypto.randomBytes(24).toString("base64url");
    const jar = new CookieJar();
    const now = Date.now();
    const record: PendingLogin = {
      id,
      jar,
      adapter: createAdapter(jar),
      username,
      createdAt: now,
      expiresAt: now + TTL_MS,
      verificationAttempts: 0,
      verifying: false,
    };
    this.map.set(id, record);
    return record;
  }

  get(id: string | undefined | null): PendingLogin | undefined {
    if (!id) return undefined;
    const r = this.map.get(id);
    if (!r) return undefined;
    if (r.expiresAt <= Date.now()) {
      this.map.delete(id);
      return undefined;
    }
    return r;
  }

  delete(id: string | undefined | null): void {
    if (id) this.map.delete(id);
  }

  deleteForUsername(id: string | undefined | null, username: string): void {
    const record = this.get(id);
    if (record?.username === username) this.map.delete(record.id);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [id, record] of this.map) {
      if (record.expiresAt <= now) this.map.delete(id);
    }
  }
}

type PendingStoreGlobal = typeof globalThis & {
  __academicPendingStore?: PendingStore;
  __academicPendingCleanupTimer?: ReturnType<typeof setInterval>;
};

// Next.js may evaluate the send and verify route bundles separately, and its
// development hot reload also re-evaluates modules. Keep the state on the Node
// process global so both steps always resolve the same pending login context.
const pendingGlobal = globalThis as PendingStoreGlobal;
export const pendingStore =
  pendingGlobal.__academicPendingStore ??
  (pendingGlobal.__academicPendingStore = new PendingStore());

if (!pendingGlobal.__academicPendingCleanupTimer) {
  const timer = setInterval(() => pendingStore.cleanup(), TTL_MS);
  timer.unref?.();
  pendingGlobal.__academicPendingCleanupTimer = timer;
}
