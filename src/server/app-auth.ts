import crypto from "node:crypto";
import { promisify } from "node:util";
import type { NextRequest } from "next/server";
import { createAppSession, deleteAppSession, findAppUserBySession, findAppUserByUsername } from "@/server/database";
import { serverConfig } from "@/server/config";

const scrypt = promisify(crypto.scrypt);
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const appSessionCookieName = "academic_app_session";

export function normalizeAppUsername(value: string): string {
  return value.trim().toLowerCase();
}

export async function hashAppPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = await scrypt(password, salt, 64) as Buffer;
  return { hash: hash.toString("hex"), salt };
}

export async function verifyAppPassword(password: string, salt: string, expected: string): Promise<boolean> {
  const actual = (await scrypt(password, salt, 64) as Buffer);
  const target = Buffer.from(expected, "hex");
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function startAppSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await createAppSession(tokenHash(token), userId, new Date(Date.now() + SESSION_TTL_MS));
  return token;
}

export async function loginAppUser(username: string, password: string) {
  const user = await findAppUserByUsername(normalizeAppUsername(username));
  if (!user || !(await verifyAppPassword(password, user.passwordSalt, user.passwordHash))) return null;
  return { id: user.id, username: user.username, token: await startAppSession(user.id) };
}

export async function currentAppUser(req: NextRequest) {
  const token = req.cookies.get(appSessionCookieName)?.value;
  return token ? findAppUserBySession(tokenHash(token)) : null;
}

export async function endAppSession(req: NextRequest): Promise<void> {
  const token = req.cookies.get(appSessionCookieName)?.value;
  if (token) await deleteAppSession(tokenHash(token));
}

export function appSessionCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: serverConfig.cookieSecure, path: "/", maxAge: SESSION_TTL_MS / 1000 };
}
