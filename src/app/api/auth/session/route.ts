import { NextRequest, NextResponse } from "next/server";
import { serverConfig } from "@/server/config";
import { getSession, refreshSessionToken } from "@/server/auth/academicAuth";
import { readSessionId, sessionCookieOptions } from "@/server/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sid = readSessionId(req);
  const session = getSession(sid);
  if (!session) {
    return NextResponse.json({
      authenticated: false,
      dataSource: serverConfig.dataSource,
    });
  }
  const res = NextResponse.json({
    authenticated: true,
    profile: session.profile,
    dataSource: serverConfig.dataSource,
  });
  const refreshedToken = refreshSessionToken(sid);
  if (refreshedToken) {
    res.cookies.set(serverConfig.sessionCookieName, refreshedToken, sessionCookieOptions());
  }
  return res;
}
