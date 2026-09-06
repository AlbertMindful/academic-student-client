import { NextRequest } from "next/server";
import type {
  CourseSchedule,
  Exam,
  Grade,
  ProviderHealth,
} from "@/lib/types";
import {
  deduplicateAcademicEvents,
  examsToEvents,
  gradesToEvents,
  scheduleToEvents,
} from "@/lib/academic-events";
import { computeTeachingWeek } from "@/lib/teaching-week";
import { getAdapter } from "@/server/auth/academicAuth";
import { readSessionId, toErrorResponse } from "@/server/api-helpers";
import { AcademicError } from "@/server/auth/errors";

export const dynamic = "force-dynamic";

interface SourceResult<T> {
  data: T;
  error?: string;
}

async function isolate<T>(fallback: T, operation: () => Promise<T>): Promise<SourceResult<T>> {
  try {
    return { data: await operation() };
  } catch (cause) {
    if (cause instanceof AcademicError && cause.code === "SESSION_EXPIRED") throw cause;
    return { data: fallback, error: "本项暂时无法更新" };
  }
}

export async function GET(req: NextRequest) {
  const syncedAt = new Date().toISOString();
  try {
    const adapter = getAdapter(readSessionId(req));
    // These two identify the workspace and are required for a useful sync.
    const [profile, semesters] = await Promise.all([
      adapter.getStudentProfile(),
      adapter.getSemesters(),
    ]);
    const currentSemester = semesters.find((semester) => semester.isCurrent) ?? semesters[0] ?? null;

    const [scheduleResult, examResult, gradeResult] = await Promise.all([
      currentSemester
        ? isolate<CourseSchedule[]>([], () => adapter.getSchedule(currentSemester.id))
        : Promise.resolve<SourceResult<CourseSchedule[]>>({ data: [] }),
      currentSemester
        ? isolate<Exam[]>([], () => adapter.getExams(currentSemester.id))
        : Promise.resolve<SourceResult<Exam[]>>({ data: [] }),
      isolate<Grade[]>([], () => adapter.getGrades()),
    ]);

    const warnings = [
      scheduleResult.error && `课表：${scheduleResult.error}`,
      examResult.error && `考试：${examResult.error}`,
      gradeResult.error && `成绩：${gradeResult.error}`,
    ].filter((message): message is string => Boolean(message));
    const academicHealth: ProviderHealth = {
      provider: "academic",
      label: "教务系统",
      status: warnings.length ? "degraded" : "ok",
      lastAttemptAt: syncedAt,
      lastSuccessAt: warnings.length === 3 ? undefined : syncedAt,
      message: warnings.length ? `${warnings.length} 项数据暂时未更新` : "已同步",
    };

    const events = deduplicateAcademicEvents([
      ...scheduleToEvents(scheduleResult.data, currentSemester, syncedAt),
      ...examsToEvents(examResult.data, syncedAt),
      ...gradesToEvents(gradeResult.data, syncedAt),
    ]);

    return Response.json({
      profile,
      currentSemester,
      teachingWeek: currentSemester?.startDate
        ? {
            current: computeTeachingWeek(currentSemester.startDate, new Date()),
            startDate: currentSemester.startDate,
            endDate: currentSemester.endDate,
          }
        : null,
      events,
      providers: [
        academicHealth,
        {
          provider: "chaoxing",
          label: "学习通",
          status: "not_connected",
          lastAttemptAt: syncedAt,
          message: "尚未连接",
        },
      ],
      syncedAt,
      diagnostics: {
        counts: {
          courses: scheduleResult.data.length,
          exams: examResult.data.length,
          grades: gradeResult.data.length,
          events: events.length,
        },
        warnings,
      },
    });
  } catch (cause) {
    return toErrorResponse(cause);
  }
}
