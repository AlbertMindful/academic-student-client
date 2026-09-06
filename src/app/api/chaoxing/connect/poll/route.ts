import { NextRequest, NextResponse } from "next/server";
import { pollChaoxingConnection } from "@/server/chaoxing/connection";
import { writeChaoxingSessionToken } from "@/server/chaoxing/session-cookie";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { pendingId?: unknown };
  const result = await pollChaoxingConnection(String(body.pendingId ?? ""));
  if (result.status !== "connected") return Response.json(result);
  const response = NextResponse.json({ status: "connected" });
  writeChaoxingSessionToken(response, result.token);
  return response;
}
