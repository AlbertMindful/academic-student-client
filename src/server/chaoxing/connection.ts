import crypto from "node:crypto";
import { CookieJar } from "@/server/auth/cookie-jar";
import { SchoolHttpClient } from "@/server/http";
import { openChaoxingSession, sealChaoxingSession } from "@/server/chaoxing/session-token";
import { serverConfig } from "@/server/config";

const PASSPORT = "https://passport2.chaoxing.com";
const LOGIN_URL = `${PASSPORT}/login?fid=&newversion=true&refer=https%3A%2F%2Fi.chaoxing.com`;
const HOME_URL = "https://i.chaoxing.com";
const PENDING_TTL = 4 * 60_000;
const SESSION_TTL = Number(process.env.CHAOXING_SESSION_TTL_MS ?? 180 * 24 * 60 * 60_000);

interface PendingConnection {
  id: string;
  uuid: string;
  enc: string;
  jar: CookieJar;
  client: SchoolHttpClient;
  createdAt: number;
}

type PendingGlobal = typeof globalThis & { __chaoxingPending?: Map<string, PendingConnection> };
const connectionGlobal = globalThis as PendingGlobal;
const pending = connectionGlobal.__chaoxingPending ?? (connectionGlobal.__chaoxingPending = new Map());

function cleanup(): void {
  const cutoff = Date.now() - PENDING_TTL;
  for (const [id, value] of pending) if (value.createdAt < cutoff) pending.delete(id);
}

export async function beginChaoxingConnection(): Promise<{ pendingId: string }> {
  cleanup();
  const jar = new CookieJar();
  const client = new SchoolHttpClient(jar);
  const response = await client.get(LOGIN_URL);
  const uuid = response.body.match(/id=["']uuid["'][^>]*value=["']([a-f0-9]+)["']/i)?.[1]
    ?? response.body.match(/value=["']([a-f0-9]+)["'][^>]*id=["']uuid["']/i)?.[1];
  const enc = response.body.match(/id=["']enc["'][^>]*value=["']([a-f0-9]+)["']/i)?.[1]
    ?? response.body.match(/value=["']([a-f0-9]+)["'][^>]*id=["']enc["']/i)?.[1];
  if (!uuid || !enc) throw new Error("无法取得学习通登录二维码");
  const id = crypto.randomBytes(24).toString("base64url");
  pending.set(id, { id, uuid, enc, jar, client, createdAt: Date.now() });
  return { pendingId: id };
}

export function getPendingConnection(id: string): PendingConnection | null {
  cleanup();
  return pending.get(id) ?? null;
}

export function chaoxingQrUrl(connection: PendingConnection): string {
  return `${PASSPORT}/createqr?uuid=${encodeURIComponent(connection.uuid)}&fid=-1`;
}

export async function pollChaoxingConnection(id: string): Promise<
  | { status: "waiting" | "scanned" }
  | { status: "connected"; token: string }
  | { status: "expired" | "error" }
> {
  const connection = getPendingConnection(id);
  if (!connection) return { status: "expired" };
  const response = await connection.client.post(`${PASSPORT}/getauthstatus/v2`, {
    enc: connection.enc,
    uuid: connection.uuid,
    doubleFactorLogin: "0",
    forbidotherlogin: "0",
  }, { headers: { Referer: LOGIN_URL, "X-Requested-With": "XMLHttpRequest" } });
  let result: { status?: boolean; type?: number; containTwoFactorLogin?: boolean };
  try { result = JSON.parse(response.body); } catch { return { status: "waiting" }; }
  if (result.status) {
    // The official page navigates to i.chaoxing.com after QR confirmation. That
    // navigation is part of login finalisation and may issue the cookies needed
    // by course/inbox hosts; sealing the jar before it creates a false success.
    if (result.containTwoFactorLogin) {
      pending.delete(id);
      return { status: "error" };
    }
    try {
      const home = await connection.client.get(HOME_URL, { headers: { Referer: LOGIN_URL } });
      if (new URL(home.url).hostname.endsWith("passport2.chaoxing.com") || /<title>\s*用户登录\s*<\/title>/i.test(home.body)) {
        pending.delete(id);
        return { status: "error" };
      }
    } catch {
      pending.delete(id);
      return { status: "error" };
    }
    pending.delete(id);
    const now = Date.now();
    return { status: "connected", token: sealChaoxingSession({ version: 1, cookies: connection.jar.toJSON(), createdAt: now, expiresAt: now + SESSION_TTL }) };
  }
  if (result.type === 2 || result.type === 4 || result.type === 5) return { status: "scanned" };
  if (Date.now() - connection.createdAt >= PENDING_TTL) { pending.delete(id); return { status: "expired" }; }
  return { status: "waiting" };
}

export interface ChaoxingConnection {
  client: SchoolHttpClient;
  refreshedToken: () => string;
}

export function chaoxingConnectionFromToken(token?: string): ChaoxingConnection | null {
  const payload = openChaoxingSession(token);
  if (!payload) return null;
  const jar = CookieJar.fromJSON(payload.cookies);
  return {
    client: new SchoolHttpClient(jar),
    refreshedToken: () => sealChaoxingSession({
      version: 1,
      cookies: jar.toJSON(),
      createdAt: payload.createdAt,
      expiresAt: Date.now() + SESSION_TTL,
    }),
  };
}

export function chaoxingCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: serverConfig.cookieSecure, path: "/", maxAge: Math.floor(SESSION_TTL / 1000) };
}

export const chaoxingCookieName = "chaoxing_session";
