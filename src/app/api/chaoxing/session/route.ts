import { NextRequest, NextResponse } from "next/server";
import { chaoxingClientFromToken, chaoxingCookieName, chaoxingCookieOptions } from "@/server/chaoxing/connection";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return Response.json({ connected: Boolean(chaoxingClientFromToken(req.cookies.get(chaoxingCookieName)?.value)) });
}

export async function DELETE() {
  const response = NextResponse.json({ connected: false });
  response.cookies.set(chaoxingCookieName, "", { ...chaoxingCookieOptions(), maxAge: 0 });
  return response;
}
