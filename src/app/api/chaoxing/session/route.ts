import { NextRequest, NextResponse } from "next/server";
import { chaoxingConnectionFromToken } from "@/server/chaoxing/connection";
import { clearChaoxingSessionToken, readChaoxingSessionToken, writeChaoxingSessionToken } from "@/server/chaoxing/session-cookie";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const connection = chaoxingConnectionFromToken(readChaoxingSessionToken(req));
  const response = NextResponse.json({ connected: Boolean(connection) });
  if (connection) writeChaoxingSessionToken(response, connection.refreshedToken());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ connected: false });
  clearChaoxingSessionToken(response);
  return response;
}
