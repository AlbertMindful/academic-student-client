import { NextRequest } from "next/server";
import type { DashboardData, Grade } from "@/lib/types";
import { getAdapter } from "@/server/auth/academicAuth";
import { readSessionId, toErrorResponse } from "@/server/api-helpers";
import { computeTeachingWeek } from "@/lib/teaching-week";
import { findNextClass, todayClasses } from "@/lib/schedule";
import { computeGpa } from "@/lib/gpa";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const adapter = getAdapter(readSessionId(req));
    const now = new Date();

    const profile = await adapter.getStudentProfile();
    const semesters = await adapter.getSemesters();
    const current = semesters.find((s) => s.isCurrent) ?? semesters[0] ?? null;

    // 成绩页一次返回全部学期成绩（并提取官方绩点）
    const grades = await adapter.getGrades().catch(() => [] as Grade[]);

    const [schedule, exams, officialGpa] = await Promise.all([
      current
        ? adapter.getSchedule(current.id).catch(() => [])
        : Promise.resolve([]),
      current
        ? adapter.getExams(current.id).catch(() => [])
        : Promise.resolve([]),
      adapter.getOfficialGpa
        ? adapter.getOfficialGpa().catch(() => null)
        : Promise.resolve(null),
    ]);

    const teachingWeek =
      current && current.startDate
        ? {
            current: computeTeachingWeek(current.startDate, now),
            startDate: current.startDate,
            endDate: current.endDate,
          }
        : null;

    const nextClass = teachingWeek
      ? findNextClass(schedule, teachingWeek.startDate, now)
      : null;
    const today = teachingWeek
      ? todayClasses(schedule, teachingWeek.startDate, now)
      : [];

    const todayStr = todayIso();
    const upcomingExams = exams
      .filter((e) => e.date >= todayStr)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, 5);

    const gpa = computeGpa(grades, officialGpa);

    const data: DashboardData = {
      profile,
      currentSemester: current,
      teachingWeek,
      nextClass,
      todayClasses: today,
      upcomingExams,
      gpa,
    };

    return Response.json(data);
  } catch (e) {
    return toErrorResponse(e);
  }
}
