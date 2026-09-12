import crypto from "node:crypto";
import type { StudentProfile } from "@/lib/types";
import { serverConfig } from "@/server/config";
import { CookieJar } from "@/server/auth/cookie-jar";
import { createAdapter } from "@/server/adapters";
import type { AcademicSystemAdapter } from "@/server/adapters/types";
import { openSession, sealSession } from "@/server/auth/session-token";

export interface SessionRecord {
  /** 我方会话 id（仅作为加密会话中的不可预测标识） */
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
 * 活跃会话保留在内存中，同时可从浏览器携带的加密会话恢复。
 * 浏览器无法读取或篡改其中的学校 Cookie，服务重启后也能继续使用。
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
    const persisted = id.startsWith("v1.") ? openSession(id) : null;
    const recordId = persisted?.id ?? id;
    let record = this.sessions.get(recordId);
    if (!record && persisted) {
      const jar = CookieJar.fromJSON(persisted.cookies);
      record = {
        id: persisted.id,
        jar,
        adapter: createAdapter(jar),
        profile: persisted.profile,
        createdAt: persisted.createdAt,
        lastUsedAt: Date.now(),
        expiresAt: persisted.expiresAt,
      };
      this.sessions.set(record.id, record);
    }
    if (!record) return undefined;
    const now = Date.now();
    if (record.expiresAt <= now) {
      this.sessions.delete(recordId);
      return undefined;
    }
    record.lastUsedAt = now;
    record.expiresAt = now + serverConfig.sessionTtlMs;
    return record;
  }

  /** 生成带完整性校验的加密会话，用于安全持久化到 httpOnly Cookie。 */
  tokenFor(id: string): string {
    const record = this.sessions.get(id);
    if (!record) throw new Error("Session not found");
    const now = Date.now();
    record.lastUsedAt = now;
    record.expiresAt = now + serverConfig.sessionTtlMs;
    return sealSession({
      version: 1,
      id: record.id,
      cookies: record.jar.toJSON(),
      profile: record.profile,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    });
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
