import crypto from "node:crypto";
import type { StudentProfile } from "@/lib/types";
import { serverConfig } from "@/server/config";
import { CookieJar } from "@/server/auth/cookie-jar";
import { createAdapter } from "@/server/adapters";
import type { AcademicSystemAdapter } from "@/server/adapters/types";

export interface SessionRecord {
  /** 我方会话 id（浏览器持有的 httpOnly cookie 值） */
  id: string;
  /** 该用户的学校 Cookie Jar（与其他用户完全隔离） */
  jar: CookieJar;
  /** 绑定该会话的适配器 */
  adapter: AcademicSystemAdapter;
  profile: StudentProfile | null;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
}

/**
 * 内存会话存储（开发版）。
 * 浏览器只持有我方 session id；学校 Cookie Jar 只保存在服务端会话内，
 * 绝不暴露给前端。生产环境可替换为 Redis 等集中式存储。
 */
class SessionStore {
  private sessions = new Map<string, SessionRecord>();

  create(): SessionRecord {
    const jar = new CookieJar();
    return this.adopt(jar, createAdapter(jar));
  }

  /** 用已存在的 CookieJar + 适配器（例如短信登录上下文）提升为正式会话。 */
  adopt(jar: CookieJar, adapter: AcademicSystemAdapter): SessionRecord {
    const id = crypto.randomBytes(32).toString("base64url");
    const now = Date.now();
    const record: SessionRecord = {
      id,
      jar,
      adapter,
      profile: null,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now + serverConfig.sessionTtlMs,
    };
    this.sessions.set(id, record);
    return record;
  }

  /** 读取会话；空闲滑动续期。过期或不存在返回 undefined。 */
  get(id: string | undefined | null): SessionRecord | undefined {
    if (!id) return undefined;
    const record = this.sessions.get(id);
    if (!record) return undefined;
    const now = Date.now();
    if (record.expiresAt <= now) {
      this.sessions.delete(id);
      return undefined;
    }
    record.lastUsedAt = now;
    record.expiresAt = now + serverConfig.sessionTtlMs;
    return record;
  }

  delete(id: string | undefined | null): void {
    if (id) this.sessions.delete(id);
  }

  setProfile(id: string, profile: StudentProfile): void {
    const r = this.sessions.get(id);
    if (r) r.profile = profile;
  }

  /** 清理过期会话。 */
  cleanup(): void {
    const now = Date.now();
    for (const [id, r] of this.sessions) {
      if (r.expiresAt <= now) this.sessions.delete(id);
    }
  }

  /** 当前会话数（用于观测/健康检查，不含任何敏感信息）。 */
  size(): number {
    return this.sessions.size;
  }
}

type SessionStoreGlobal = typeof globalThis & {
  __academicSessionStore?: SessionStore;
  __academicSessionCleanupTimer?: ReturnType<typeof setInterval>;
};

// Authentication routes and academic data routes can be loaded as different
// Next.js server bundles. A process-level singleton prevents a freshly loaded
// bundle (or development HMR) from losing otherwise valid sessions.
const sessionGlobal = globalThis as SessionStoreGlobal;
export const sessionStore =
  sessionGlobal.__academicSessionStore ??
  (sessionGlobal.__academicSessionStore = new SessionStore());

if (!sessionGlobal.__academicSessionCleanupTimer) {
  const timer = setInterval(
    () => sessionStore.cleanup(),
    Math.min(serverConfig.sessionTtlMs, 5 * 60 * 1000),
  );
  timer.unref?.();
  sessionGlobal.__academicSessionCleanupTimer = timer;
}
