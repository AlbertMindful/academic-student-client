import { NextRequest } from "next/server";
import { getAdapter } from "@/server/auth/academicAuth";
import { readSessionId, toErrorResponse } from "@/server/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const adapter = getAdapter(readSessionId(req));
    const semesterId = req.nextUrl.searchParams.get("semesterId") ?? undefined;
    let schedule;
    if (semesterId) {
      schedule = await adapter.getSchedule(semesterId);
    } else {
      const semesters = await adapter.getSemesters();
      const cur = semesters.find((s) => s.isCurrent) ?? semesters[0];
      schedule = cur ? await adapter.getSchedule(cur.id) : [];
    }
    return Response.json(schedule);
  } catch (e) {
    return toErrorResponse(e);
  }
}
