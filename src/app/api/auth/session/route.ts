import { NextRequest, NextResponse } from "next/server";
import { serverConfig } from "@/server/config";
import { getSession } from "@/server/auth/academicAuth";
import { readSessionId } from "@/server/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sid = readSessionId(req);
  // TEMP DEBUG：观察浏览器是否带上了会话 Cookie（只记录有无，不记录值）
  // eslint-disable-next-line no-console
  console.error("[session-debug] cookie present =", !!sid, "| url =", req.nextUrl.pathname);
  const session = getSession(sid);
  if (!session) {
    return NextResponse.json({
      authenticated: false,
      dataSource: serverConfig.dataSource,
    });
  }
  return NextResponse.json({
    authenticated: true,
    profile: session.profile,
    dataSource: serverConfig.dataSource,
  });
}
