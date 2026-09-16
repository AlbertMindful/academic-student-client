import { NextRequest, NextResponse } from "next/server";
import { appSessionCookieName, appSessionCookieOptions, endAppSession } from "@/server/app-auth";

export async function POST(req: NextRequest) {
  await endAppSession(req);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(appSessionCookieName, "", { ...appSessionCookieOptions(), maxAge: 0 });
  return response;
}
