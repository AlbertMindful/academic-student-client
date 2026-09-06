import { NextRequest, NextResponse } from "next/server";
import { serverConfig } from "@/server/config";
import { logout } from "@/server/auth/academicAuth";
import { readSessionId, sessionCookieOptions } from "@/server/api-helpers";
import { credentialCookieName, credentialCookieOptions } from "@/server/auth/credential-token";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sessionId = readSessionId(req);
  await logout(sessionId);

  const res = NextResponse.json({ ok: true });
  // 清除我方会话 Cookie
  res.cookies.set(serverConfig.sessionCookieName, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
  res.cookies.set(credentialCookieName, "", {
    ...credentialCookieOptions(),
    maxAge: 0,
  });
  return res;
}
