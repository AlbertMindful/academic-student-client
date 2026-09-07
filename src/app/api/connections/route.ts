import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/academicAuth";
import { readSessionId } from "@/server/api-helpers";
import { credentialCookieName, openCredentials } from "@/server/auth/credential-token";
import { chaoxingConnectionFromToken } from "@/server/chaoxing/connection";
import { readChaoxingSessionToken } from "@/server/chaoxing/session-cookie";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSession(readSessionId(req));
  const credentials = openCredentials(req.cookies.get(credentialCookieName)?.value);
  const academic = Boolean(session || credentials);
  const chaoxing = Boolean(chaoxingConnectionFromToken(readChaoxingSessionToken(req)));
  return NextResponse.json({
    academic,
    chaoxing,
    academicIdentity: session?.profile?.studentId ?? credentials?.username,
  });
}
