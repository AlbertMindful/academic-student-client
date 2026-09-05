import { NextRequest } from "next/server";
import { getAdapter } from "@/server/auth/academicAuth";
import { readSessionId, toErrorResponse } from "@/server/api-helpers";
import { isMakeupExam } from "@/lib/exams";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const adapter = getAdapter(readSessionId(req));
    const semesterId = req.nextUrl.searchParams.get("semesterId") ?? undefined;
    const exams = (await adapter.getExams(semesterId)).filter(
      (exam) => !isMakeupExam(exam),
    );
    return Response.json(exams);
  } catch (e) {
    return toErrorResponse(e);
  }
}
