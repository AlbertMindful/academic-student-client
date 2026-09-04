import { NextRequest } from "next/server";
import { getAdapter } from "@/server/auth/academicAuth";
import { readSessionId, toErrorResponse } from "@/server/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const adapter = getAdapter(readSessionId(req));
    const semesters = await adapter.getSemesters();
    return Response.json(semesters);
  } catch (e) {
    return toErrorResponse(e);
  }
}
