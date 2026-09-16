import { NextRequest, NextResponse } from "next/server";
import { appSessionCookieName, appSessionCookieOptions, loginAppUser } from "@/server/app-auth";
import { hit } from "@/server/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (hit(`app-login:${ip}`)) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "尝试次数过多，请稍后再试。" } }, { status: 429 });
  const body = await req.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
  const result = await loginAppUser(String(body?.username ?? ""), String(body?.password ?? ""));
  if (!result) return NextResponse.json({ error: { code: "INVALID_CREDENTIALS", message: "用户名或密码不正确。" } }, { status: 401 });
  const response = NextResponse.json({ ok: true, username: result.username });
  response.cookies.set(appSessionCookieName, result.token, appSessionCookieOptions());
  return response;
}
