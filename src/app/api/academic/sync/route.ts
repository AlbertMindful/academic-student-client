import { NextRequest } from "next/server";
import type { CourseSchedule, Exam, Grade, ProviderHealth, Semester, StudentProfile } from "@/lib/types";
import { deduplicateAcademicEvents, examsToEvents, gradesToEvents, scheduleToEvents } from "@/lib/academic-events";
import { computeTeachingWeek } from "@/lib/teaching-week";
import { getAdapter } from "@/server/auth/academicAuth";
import { readSessionId } from "@/server/api-helpers";
import { AcademicError } from "@/server/auth/errors";
import { chaoxingClientFromToken, chaoxingCookieName } from "@/server/chaoxing/connection";
import { ChaoxingReauthError, getChaoxingAcademicData } from "@/server/chaoxing/provider";

export const dynamic = "force-dynamic";

interface SourceResult<T> { data: T; error?: string }

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
  const warnings: string[] = [];
  let profile: StudentProfile | undefined;
  let currentSemester: Semester | null = null;
  let scheduleResult: SourceResult<CourseSchedule[]> = { data: [] };
  let examResult: SourceResult<Exam[]> = { data: [] };
  let gradeResult: SourceResult<Grade[]> = { data: [] };
  let academicHealth: ProviderHealth = {
    provider: "academic", label: "教务系统", status: "reauth_required",
    lastAttemptAt: syncedAt, message: "需要登录教务系统",
  };

  // The academic system is one independent provider, not a gate for the app.
  try {
    const adapter = getAdapter(readSessionId(req));
    const [nextProfile, semesters] = await Promise.all([
      adapter.getStudentProfile(),
      adapter.getSemesters(),
    ]);
    profile = nextProfile;
    currentSemester = semesters.find((semester) => semester.isCurrent) ?? semesters[0] ?? null;
    [scheduleResult, examResult, gradeResult] = await Promise.all([
      currentSemester
        ? isolate<CourseSchedule[]>([], () => adapter.getSchedule(currentSemester!.id))
        : Promise.resolve<SourceResult<CourseSchedule[]>>({ data: [] }),
      currentSemester
        ? isolate<Exam[]>([], () => adapter.getExams(currentSemester!.id))
        : Promise.resolve<SourceResult<Exam[]>>({ data: [] }),
      isolate<Grade[]>([], () => adapter.getGrades()),
    ]);
    warnings.push(...[
      scheduleResult.error && `课表：${scheduleResult.error}`,
      examResult.error && `考试：${examResult.error}`,
      gradeResult.error && `成绩：${gradeResult.error}`,
    ].filter((message): message is string => Boolean(message)));
    const failedCount = [scheduleResult.error, examResult.error, gradeResult.error].filter(Boolean).length;
    academicHealth = {
      provider: "academic", label: "教务系统",
      status: failedCount ? "degraded" : "ok",
      lastAttemptAt: syncedAt,
      lastSuccessAt: failedCount === 3 ? undefined : syncedAt,
      message: failedCount ? `${failedCount} 项数据暂时未更新` : "已同步",
    };
  } catch (cause) {
    const reauth = cause instanceof AcademicError && cause.code === "SESSION_EXPIRED";
    academicHealth = {
      provider: "academic", label: "教务系统",
      status: reauth ? "reauth_required" : "degraded",
      lastAttemptAt: syncedAt,
      message: reauth ? "登录已失效，请重新连接" : "暂时无法更新",
    };
    warnings.push(`教务系统：${academicHealth.message}`);
  }

  const officialCourseNames = Array.from(new Set(scheduleResult.data.map((course) => course.courseName).filter(Boolean)));
  const chaoxingClient = chaoxingClientFromToken(req.cookies.get(chaoxingCookieName)?.value);
  let chaoxingEvents = [] as ReturnType<typeof gradesToEvents>;
  let chaoxingCourseCount = 0;
  let chaoxingHealth: ProviderHealth = {
    provider: "chaoxing", label: "学习通", status: "not_connected",
    lastAttemptAt: syncedAt, message: "尚未连接",
  };
  if (chaoxingClient) {
    try {
      const data = await getChaoxingAcademicData(chaoxingClient, syncedAt, officialCourseNames);
      chaoxingEvents = data.events;
      chaoxingCourseCount = data.courses.length;
      chaoxingHealth = {
        provider: "chaoxing", label: "学习通",
        status: data.warnings.length ? "degraded" : "ok",
        lastAttemptAt: syncedAt, lastSuccessAt: syncedAt,
        message: data.warnings.length ? `${data.warnings.length} 门课程暂时未更新` : "已同步",
      };
      warnings.push(...data.warnings.map((warning) => `学习通：${warning}`));
    } catch (cause) {
      chaoxingHealth = {
        provider: "chaoxing", label: "学习通",
        status: cause instanceof ChaoxingReauthError ? "reauth_required" : "degraded",
        lastAttemptAt: syncedAt,
        message: cause instanceof ChaoxingReauthError ? "登录已过期，请重新连接" : "暂时无法更新",
      };
      warnings.push(`学习通：${chaoxingHealth.message}`);
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
      ? { current: computeTeachingWeek(currentSemester.startDate, new Date()), startDate: currentSemester.startDate, endDate: currentSemester.endDate }
      : null,
    officialCourseNames,
    events,
    providers: [academicHealth, chaoxingHealth],
    syncedAt,
    diagnostics: {
      counts: {
        courses: scheduleResult.data.length, exams: examResult.data.length,
        grades: gradeResult.data.length, events: events.length,
        chaoxingCourses: chaoxingCourseCount,
      },
      warnings,
    },
  });
}
