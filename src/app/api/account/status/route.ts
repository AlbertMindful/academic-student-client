import { NextRequest, NextResponse } from "next/server";
import { currentAppUser } from "@/server/app-auth";
import { appOwnerExists } from "@/server/database";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const [setupComplete, user] = await Promise.all([appOwnerExists(), currentAppUser(req)]);
    return NextResponse.json({ setupComplete, authenticated: Boolean(user), username: user?.username });
  } catch {
    return NextResponse.json({ error: { code: "DATABASE_UNAVAILABLE", message: "系统账户暂时不可用。" } }, { status: 503 });
  }
}
