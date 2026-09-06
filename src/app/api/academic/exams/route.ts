import { NextRequest, NextResponse } from "next/server";
import { persistentLoginErrorResponse, withPersistentAcademicLogin } from "@/server/auth/persistent-login";
import { sessionCookieOptions } from "@/server/api-helpers";
import { serverConfig } from "@/server/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const semesterId = req.nextUrl.searchParams.get("semesterId") ?? undefined;
    const result = await withPersistentAcademicLogin(req, (adapter) => adapter.getExams(semesterId));
    const response = NextResponse.json(result.data);
    if (result.renewedSessionToken) response.cookies.set(serverConfig.sessionCookieName, result.renewedSessionToken, sessionCookieOptions());
    return response;
  } catch (e) {
    return persistentLoginErrorResponse(e);
  }
}
