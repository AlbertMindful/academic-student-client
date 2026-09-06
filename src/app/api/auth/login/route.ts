import { NextRequest, NextResponse } from "next/server";
import { serverConfig } from "@/server/config";
import { login } from "@/server/auth/academicAuth";
import { errorResponse, sessionCookieOptions, toErrorResponse } from "@/server/api-helpers";
import { hit } from "@/server/rate-limit";
import { credentialCookieName, credentialCookieOptions, sealCredentials } from "@/server/auth/credential-token";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  if (hit(ip)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "尝试次数过多，请稍后再试。" } },
      { status: 429 },
    );
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_CREDENTIALS", 400);
  }

  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");

  if (!username || !password) {
    return errorResponse("INVALID_CREDENTIALS", 400);
  }

  try {
    const sessionId = await login({ username, password });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(serverConfig.sessionCookieName, sessionId, sessionCookieOptions());
    res.cookies.set(credentialCookieName, sealCredentials({ username, password }), credentialCookieOptions());
    return res;
  } catch (e) {
    return toErrorResponse(e);
  }
}
