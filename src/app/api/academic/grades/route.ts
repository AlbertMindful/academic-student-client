import { NextRequest } from "next/server";
import { getAdapter } from "@/server/auth/academicAuth";
import { readSessionId, toErrorResponse } from "@/server/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const adapter = getAdapter(readSessionId(req));
    const semesterId = req.nextUrl.searchParams.get("semesterId") ?? undefined;
    const grades = await adapter.getGrades(semesterId);
    return Response.json(grades);
  } catch (e) {
    return toErrorResponse(e);
  }
}
