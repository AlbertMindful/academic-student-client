import type { LoginCredentials, StudentProfile } from "@/lib/types";
import { sessionStore } from "@/server/auth/session-store";
import { pendingStore } from "@/server/auth/pending-store";
import { AcademicError, ERROR_MESSAGES } from "@/server/auth/errors";
import type { AcademicSystemAdapter } from "@/server/adapters/types";

export interface AcademicSession {
  authenticated: boolean;
  expiresAt?: string;
  profile?: StudentProfile;
}

/**
 * 认证模块。密码只用于完成登录；登录成功后立即丢弃（不落库、不缓存、
 * 不写日志），后续操作只使用学校返回的会话 Cookie（保存在服务端 Jar 中）。
 */

/** 登录：成功返回加密会话，失败抛出 AcademicError。 */
export async function login(credentials: LoginCredentials): Promise<string> {
  const record = sessionStore.create();
  try {
    await record.adapter.login(credentials);
    try {
      record.profile = await record.adapter.getStudentProfile();
    } catch {
      record.profile = null;
    }
    return sessionStore.tokenFor(record.id);
  } catch (e) {
    sessionStore.delete(record.id);
    throw e;
  }
}

/** 短信登录第一步：发起验证码发送。返回 pendingId（后续提交用）与冷却秒数。 */
export async function initiateSmsLogin(
  username: string,
  captchaWidth: number,
  previousPendingId?: string,
): Promise<{ pendingId: string; cooldown: number }> {
  const pending = pendingStore.create(username);
  try {
    if (!pending.adapter.prepareSmsLogin) {
      throw new AcademicError("SMS_SEND_FAILED", ERROR_MESSAGES.SMS_SEND_FAILED);
    }
    const result = await pending.adapter.prepareSmsLogin(username, captchaWidth);
    // Only discard the old, still-usable context after a replacement code was
    // successfully sent. Binding the deletion to the username prevents one
    // pending id from invalidating another account's flow.
    pendingStore.deleteForUsername(previousPendingId, username);
    const rawCooldown = Number(result.cooldown);
    const cooldown = Number.isFinite(rawCooldown)
      ? Math.min(300, Math.max(1, Math.round(rawCooldown)))
      : 60;
    return { pendingId: pending.id, cooldown };
  } catch (e) {
    pendingStore.delete(pending.id);
    throw e;
  }
}

/** 短信登录第二步：提交验证码完成登录，成功返回加密会话。 */
export async function completeSmsLogin(
  pendingId: string,
  code: string,
): Promise<string> {
  const pending = pendingStore.get(pendingId);
  if (!pending) {
    throw new AcademicError("SESSION_EXPIRED", ERROR_MESSAGES.SESSION_EXPIRED);
  }
  if (pending.verifying || pending.verificationAttempts >= 5) {
    throw new AcademicError("RATE_LIMITED", ERROR_MESSAGES.RATE_LIMITED);
  }
  if (!pending.adapter.completeSmsLogin) {
    pendingStore.delete(pending.id);
    throw new AcademicError("UNKNOWN_AUTH_FAILURE", ERROR_MESSAGES.UNKNOWN_AUTH_FAILURE);
  }

  // Claim synchronously before the first await to prevent two concurrent
  // submissions from promoting the same school session twice.
  pending.verifying = true;
  pending.verificationAttempts += 1;
  try {
    // 验证码错误时保留上下文，允许用户重试（最多五次）
    await pending.adapter.completeSmsLogin(pending.username, code);
  } catch (e) {
    pending.verifying = false;
    throw e;
  }
  const session = sessionStore.adopt(pending.jar, pending.adapter);
  try {
    session.profile = await session.adapter.getStudentProfile();
  } catch {
    session.profile = null;
  }
  pendingStore.delete(pending.id);
  return sessionStore.tokenFor(session.id);
}

/** 退出：调用学校 logout（若存在），删除 Jar 与会话。 */
export async function logout(sessionId: string | undefined): Promise<void> {
  const record = sessionStore.get(sessionId);
  if (record) {
    try {
      await record.adapter.logout();
    } catch {
      // 学校登出失败不阻断本地清理
    }
    sessionStore.delete(record.id);
  }
}

/** 取得会话绑定的适配器（供业务 API 使用）。 */
export function getAdapter(sessionId: string | undefined): AcademicSystemAdapter {
  const record = sessionStore.get(sessionId);
  if (!record) {
    throw new AcademicError("SESSION_EXPIRED", ERROR_MESSAGES.SESSION_EXPIRED);
  }
  return record.adapter;
}

/** 读取会话状态。 */
export function getSession(
  sessionId: string | undefined,
): AcademicSession | null {
  const record = sessionStore.get(sessionId);
  if (!record) return null;
  return {
    authenticated: true,
    expiresAt: new Date(record.expiresAt).toISOString(),
    profile: record.profile ?? undefined,
  };
}

/** 刷新会话（滑动续期，不涉及密码，不自动重登）。 */
export function refreshSession(
  sessionId: string | undefined,
): AcademicSession | null {
  return getSession(sessionId);
}

/** 重新封装已滑动续期的会话，供浏览器更新持久化 Cookie。 */
export function refreshSessionToken(sessionToken: string | undefined): string | null {
  const record = sessionStore.get(sessionToken);
  return record ? sessionStore.tokenFor(record.id) : null;
}
