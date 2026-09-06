import crypto from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { StoredCookie } from "@/server/auth/cookie-jar";
import { serverConfig } from "@/server/config";

const PREFIX = "cx1";
const AAD = Buffer.from("academic-chaoxing-session-v1");

export interface ChaoxingSessionPayload {
  version: 1;
  cookies: StoredCookie[];
  createdAt: number;
  expiresAt: number;
}

function key(): Buffer {
  return crypto.createHash("sha256").update(`${serverConfig.sessionSecret || "academic-local-development-session-key"}:chaoxing`).digest();
}

export function sealChaoxingSession(payload: ChaoxingSessionPayload): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(AAD);
  const compressed = deflateRawSync(Buffer.from(JSON.stringify(payload), "utf8"));
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return [PREFIX, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function openChaoxingSession(token?: string): ChaoxingSessionPayload | null {
  if (!token) return null;
  try {
    const [prefix, iv, tag, encrypted, extra] = token.split(".");
    if (prefix !== PREFIX || !iv || !tag || !encrypted || extra) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const compressed = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]);
    const value = JSON.parse(inflateRawSync(compressed, { maxOutputLength: 64 * 1024 }).toString("utf8")) as Partial<ChaoxingSessionPayload>;
    if (value.version !== 1 || !Array.isArray(value.cookies) || typeof value.createdAt !== "number" || typeof value.expiresAt !== "number" || value.expiresAt <= Date.now()) return null;
    return value as ChaoxingSessionPayload;
  } catch {
    return null;
  }
}
