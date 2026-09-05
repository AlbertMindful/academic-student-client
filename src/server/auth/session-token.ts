import crypto from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { StudentProfile } from "@/lib/types";
import type { StoredCookie } from "@/server/auth/cookie-jar";
import { serverConfig } from "@/server/config";

const TOKEN_PREFIX = "v1";
const TOKEN_AAD = Buffer.from("academic-session-v1");

export interface PersistedSession {
  version: 1;
  id: string;
  cookies: StoredCookie[];
  profile: StudentProfile | null;
  createdAt: number;
  expiresAt: number;
}

function encryptionKey(): Buffer {
  const secret = serverConfig.sessionSecret;
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error("ACADEMIC_SESSION_SECRET must contain at least 32 characters");
  }
  return crypto
    .createHash("sha256")
    .update(secret || "academic-local-development-session-key")
    .digest();
}

export function sealSession(payload: PersistedSession): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(TOKEN_AAD);
  const compressed = deflateRawSync(Buffer.from(JSON.stringify(payload), "utf8"));
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    TOKEN_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function openSession(token: string): PersistedSession | null {
  try {
    const [version, ivValue, tagValue, encryptedValue, extra] = token.split(".");
    if (
      version !== TOKEN_PREFIX ||
      !ivValue ||
      !tagValue ||
      !encryptedValue ||
      extra
    ) {
      return null;
    }
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAAD(TOKEN_AAD);
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const compressed = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]);
    const raw = inflateRawSync(compressed, { maxOutputLength: 64 * 1024 });
    const value = JSON.parse(raw.toString("utf8")) as Partial<PersistedSession>;
    if (
      value.version !== 1 ||
      typeof value.id !== "string" ||
      !Array.isArray(value.cookies) ||
      typeof value.createdAt !== "number" ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= Date.now()
    ) {
      return null;
    }
    return value as PersistedSession;
  } catch {
    return null;
  }
}
