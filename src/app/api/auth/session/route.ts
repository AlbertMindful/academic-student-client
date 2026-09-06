import { NextRequest, NextResponse } from "next/server";
import { serverConfig } from "@/server/config";
import { getSession, refreshSessionToken } from "@/server/auth/academicAuth";
import { credentialCookieName, credentialCookieOptions } from "@/server/auth/credential-token";
import { credentialsAreInvalid, withPersistentAcademicLogin } from "@/server/auth/persistent-login";
import { readSessionId, sessionCookieOptions } from "@/server/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sid = readSessionId(req);
  const session = getSession(sid);
  if (session) {
    const res = NextResponse.json({
      authenticated: true,
      profile: session.profile,
      dataSource: serverConfig.dataSource,
    });
    const refreshedToken = refreshSessionToken(sid);
    if (refreshedToken) res.cookies.set(serverConfig.sessionCookieName, refreshedToken, sessionCookieOptions());
    return res;
  }

  try {
    const renewed = await withPersistentAcademicLogin(req, (adapter) => adapter.getStudentProfile());
    const res = NextResponse.json({
      authenticated: true,
      profile: renewed.data,
      dataSource: serverConfig.dataSource,
    });
    if (renewed.renewedSessionToken) {
      res.cookies.set(serverConfig.sessionCookieName, renewed.renewedSessionToken, sessionCookieOptions());
    }
    return res;
  } catch (cause) {
    const res = NextResponse.json({
      authenticated: false,
      dataSource: serverConfig.dataSource,
    });
    if (credentialsAreInvalid(cause)) {
      res.cookies.set(credentialCookieName, "", { ...credentialCookieOptions(), maxAge: 0 });
    }
    return res;
  }
}
