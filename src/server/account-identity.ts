import type { NextRequest } from "next/server";
import { readSessionId } from "@/server/api-helpers";
import { getSession } from "@/server/auth/academicAuth";
import { credentialCookieName, openCredentials } from "@/server/auth/credential-token";

/**
 * Every identifier currently known to belong to the signed-in academic
 * account. Keeping both the login name and the official student number lets
 * the database join records created before and after a school-session renewal.
 */
export function academicAccountIdentities(
  req: NextRequest,
  profileStudentId?: string,
): string[] {
  const session = getSession(readSessionId(req));
  const credentials = openCredentials(req.cookies.get(credentialCookieName)?.value);
  return Array.from(new Set([
    profileStudentId,
    session?.profile?.studentId,
    credentials?.username,
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}
