import { NextRequest, NextResponse } from "next/server";
import { serverConfig } from "@/server/config";
import { completeSmsLogin } from "@/server/auth/academicAuth";
import { errorResponse, sessionCookieOptions, toErrorResponse } from "@/server/api-helpers";
import { hit } from "@/server/rate-limit";
import { credentialCookieName, credentialCookieOptions } from "@/server/auth/credential-token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  let body: { pendingId?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_CREDENTIALS", 400);
  }

  const pendingId = String(body?.pendingId ?? "").trim();
  const code = String(body?.code ?? "").trim();

  if (!pendingId || pendingId.length > 128 || !code || code.length > 20) {
    return errorResponse("INVALID_CREDENTIALS", 400);
  }
  if (hit(`sms-verify:${ip}:${pendingId}`)) {
    return errorResponse("RATE_LIMITED", 429);
  }

  try {
    const sessionId = await completeSmsLogin(pendingId, code);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(serverConfig.sessionCookieName, sessionId, sessionCookieOptions());
    // A successful SMS login must not retain a password from an older account.
    res.cookies.set(credentialCookieName, "", { ...credentialCookieOptions(), maxAge: 0 });
    return res;
  } catch (e) {
    return toErrorResponse(e);
  }
}
