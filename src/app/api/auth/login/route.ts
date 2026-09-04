import { NextRequest, NextResponse } from "next/server";
import { serverConfig } from "@/server/config";
import { login } from "@/server/auth/academicAuth";
import { errorResponse, sessionCookieOptions, toErrorResponse } from "@/server/api-helpers";
import { hit } from "@/server/rate-limit";

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
    // 密码仅在此处用于完成登录，函数返回后即丢弃（不落库、不缓存、不写日志）。
    const sessionId = await login({ username, password });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(serverConfig.sessionCookieName, sessionId, sessionCookieOptions());
    return res;
  } catch (e) {
    return toErrorResponse(e);
  }
}
