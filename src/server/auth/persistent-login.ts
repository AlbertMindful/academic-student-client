import type { NextRequest } from "next/server";
import type { AcademicSystemAdapter } from "@/server/adapters/types";
import { AcademicError } from "@/server/auth/errors";
import { getAdapter, login, logout } from "@/server/auth/academicAuth";
import { credentialCookieName, credentialCookieOptions, openCredentials } from "@/server/auth/credential-token";
import { readSessionId, toErrorResponse } from "@/server/api-helpers";

export interface AcademicOperationResult<T> {
  data: T;
  /** Present only when the old school session was silently replaced. */
  renewedSessionToken?: string;
}

/**
 * Runs one complete academic operation and retries it once with the encrypted
 * password credential when the school's session has actually expired.
 */
export async function withPersistentAcademicLogin<T>(
  req: NextRequest,
  operation: (adapter: AcademicSystemAdapter) => Promise<T>,
): Promise<AcademicOperationResult<T>> {
  const currentToken = readSessionId(req);
  try {
    return { data: await operation(getAdapter(currentToken)) };
  } catch (cause) {
    if (!(cause instanceof AcademicError) || cause.code !== "SESSION_EXPIRED") throw cause;
    const credentials = openCredentials(req.cookies.get(credentialCookieName)?.value);
    if (!credentials) throw cause;

    await logout(currentToken);
    const renewedSessionToken = await login(credentials);
    return {
      data: await operation(getAdapter(renewedSessionToken)),
      renewedSessionToken,
    };
  }
}

export function credentialsAreInvalid(cause: unknown): boolean {
  return cause instanceof AcademicError && [
    "INVALID_CREDENTIALS",
    "ACCOUNT_NOT_FOUND",
    "WRONG_PASSWORD",
  ].includes(cause.code);
}

export function persistentLoginErrorResponse(cause: unknown) {
  const response = toErrorResponse(cause);
  if (credentialsAreInvalid(cause)) {
    response.cookies.set(credentialCookieName, "", { ...credentialCookieOptions(), maxAge: 0 });
  }
  return response;
}
