import { NextRequest, NextResponse } from "next/server";
import { chaoxingConnectionFromToken, chaoxingCookieName, chaoxingCookieOptions } from "@/server/chaoxing/connection";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const connection = chaoxingConnectionFromToken(req.cookies.get(chaoxingCookieName)?.value);
  const response = NextResponse.json({ connected: Boolean(connection) });
  if (connection) response.cookies.set(chaoxingCookieName, connection.refreshedToken(), chaoxingCookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ connected: false });
  response.cookies.set(chaoxingCookieName, "", { ...chaoxingCookieOptions(), maxAge: 0 });
  return response;
}
