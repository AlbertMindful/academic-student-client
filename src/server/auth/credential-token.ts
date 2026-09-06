import crypto from "node:crypto";
import { serverConfig } from "@/server/config";
import type { LoginCredentials } from "@/lib/types";

const PREFIX = "ac1";
const AAD = Buffer.from("academic-persistent-credentials-v1");
const CREDENTIAL_TTL_MS = Number(process.env.ACADEMIC_CREDENTIAL_TTL_MS ?? 180 * 24 * 60 * 60 * 1000);

interface CredentialPayload extends LoginCredentials {
  version: 1;
  createdAt: number;
  expiresAt: number;
}

function key(): Buffer {
  return crypto
    .createHash("sha256")
    .update(`${serverConfig.sessionSecret || "academic-local-development-session-key"}:credentials`)
    .digest();
}

export function sealCredentials(credentials: LoginCredentials): string {
  const now = Date.now();
  const payload: CredentialPayload = {
    version: 1,
    username: credentials.username,
    password: credentials.password,
    createdAt: now,
    expiresAt: now + CREDENTIAL_TTL_MS,
  };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return [
    PREFIX,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function openCredentials(token?: string): LoginCredentials | null {
  if (!token) return null;
  try {
    const [prefix, iv, tag, encrypted, extra] = token.split(".");
    if (prefix !== PREFIX || !iv || !tag || !encrypted || extra) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const value = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8")) as Partial<CredentialPayload>;
    if (
      value.version !== 1 ||
      typeof value.username !== "string" ||
      typeof value.password !== "string" ||
      !value.username ||
      !value.password ||
      value.username.length > 128 ||
      value.password.length > 512 ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= Date.now()
    ) return null;
    return { username: value.username, password: value.password };
  } catch {
    return null;
  }
}

export function credentialCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: serverConfig.cookieSecure,
    path: "/",
    maxAge: Math.floor(CREDENTIAL_TTL_MS / 1000),
  };
}

export const credentialCookieName = "academic_reauth";
