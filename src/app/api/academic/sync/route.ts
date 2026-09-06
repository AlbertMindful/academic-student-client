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
import { chaoxingClientFromToken, chaoxingCookieName } from "@/server/chaoxing/connection";
import { ChaoxingReauthError, getChaoxingAcademicData } from "@/server/chaoxing/provider";

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

    const chaoxingClient = chaoxingClientFromToken(req.cookies.get(chaoxingCookieName)?.value);
    let chaoxingEvents = [] as ReturnType<typeof gradesToEvents>;
    let chaoxingCourseCount = 0;
    let chaoxingHealth: ProviderHealth = { provider: "chaoxing", label: "学习通", status: "not_connected", lastAttemptAt: syncedAt, message: "尚未连接" };
    if (chaoxingClient) {
      try {
        const data = await getChaoxingAcademicData(chaoxingClient, syncedAt);
        chaoxingEvents = data.events;
        chaoxingCourseCount = data.courses.length;
        chaoxingHealth = { provider: "chaoxing", label: "学习通", status: data.warnings.length ? "degraded" : "ok", lastAttemptAt: syncedAt, lastSuccessAt: syncedAt, message: data.warnings.length ? `${data.warnings.length} 门课程暂时未更新` : "已同步" };
        warnings.push(...data.warnings.map((warning) => `学习通：${warning}`));
      } catch (cause) {
        chaoxingHealth = { provider: "chaoxing", label: "学习通", status: cause instanceof ChaoxingReauthError ? "reauth_required" : "degraded", lastAttemptAt: syncedAt, message: cause instanceof ChaoxingReauthError ? "登录已过期，请重新连接" : "暂时无法更新" };
      }
    }

    const events = deduplicateAcademicEvents([
      ...scheduleToEvents(scheduleResult.data, currentSemester, syncedAt),
      ...examsToEvents(examResult.data, syncedAt),
      ...gradesToEvents(gradeResult.data, syncedAt),
      ...chaoxingEvents,
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
        chaoxingHealth,
      ],
      syncedAt,
      diagnostics: {
        counts: {
          courses: scheduleResult.data.length,
          exams: examResult.data.length,
          grades: gradeResult.data.length,
          events: events.length,
          chaoxingCourses: chaoxingCourseCount,
        },
        warnings,
      },
    });
  } catch (cause) {
    return toErrorResponse(cause);
  }
}
