import { NextRequest, NextResponse } from "next/server";
import { serverConfig } from "@/server/config";
import {
  AcademicError,
  ERROR_MESSAGES,
  type AcademicErrorCode,
} from "@/server/auth/errors";

export function readSessionId(req: NextRequest): string | undefined {
  return req.cookies.get(serverConfig.sessionCookieName)?.value;
}

/** 设置我方会话 Cookie（httpOnly；生产环境启用 Secure）。 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: serverConfig.cookieSecure,
    path: "/",
    maxAge: Math.floor(serverConfig.sessionTtlMs / 1000),
  };
}

export function errorResponse(
  code: AcademicErrorCode,
  status: number,
  message = ERROR_MESSAGES[code],
) {
  return NextResponse.json(
    { error: { code, message } },
    { status },
  );
}

const STATUS_BY_CODE: Partial<Record<AcademicErrorCode, number>> = {
  SESSION_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_NOT_FOUND: 401,
  WRONG_PASSWORD: 401,
  WRONG_CODE: 401,
  RATE_LIMITED: 429,
  SMS_SEND_FAILED: 502,
  SMS_LIMIT: 429,
  CAPTCHA_REQUIRED: 401,
  MFA_REQUIRED: 401,
  UNKNOWN_AUTH_FAILURE: 401,
  NETWORK_ERROR: 502,
  SERVER_UNAVAILABLE: 503,
  MAINTENANCE: 503,
  DATA_PARSE_ERROR: 502,
  UNKNOWN_ERROR: 500,
};

/** 统一把异常映射为 JSON 错误响应。 */
export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof AcademicError) {
    return errorResponse(e.code, STATUS_BY_CODE[e.code] ?? 500, e.message);
  }
  return errorResponse("UNKNOWN_ERROR", 500);
}
