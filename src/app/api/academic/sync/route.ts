import { NextRequest, NextResponse } from "next/server";
import type { CourseSchedule, Exam, Grade, ProviderHealth, Semester, StudentProfile } from "@/lib/types";
import { deduplicateAcademicEvents, examsToEvents, gradesToEvents, scheduleToEvents } from "@/lib/academic-events";
import { computeTeachingWeek } from "@/lib/teaching-week";
import { sessionCookieOptions } from "@/server/api-helpers";
import { AcademicError } from "@/server/auth/errors";
import { credentialsAreInvalid, withPersistentAcademicLogin } from "@/server/auth/persistent-login";
import { credentialCookieName, credentialCookieOptions } from "@/server/auth/credential-token";
import { serverConfig } from "@/server/config";
import { chaoxingConnectionFromToken } from "@/server/chaoxing/connection";
import { clearChaoxingSessionToken, readChaoxingSessionToken, writeChaoxingSessionToken } from "@/server/chaoxing/session-cookie";
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

async function synchronize(
  req: NextRequest,
  cachedOfficialCourseNames: string[] = [],
  cachedKnownAcademicCourseNames: string[] = [],
) {
  const syncedAt = new Date().toISOString();
  const warnings: string[] = [];
  let profile: StudentProfile | undefined;
  let currentSemester: Semester | null = null;
  let scheduleResult: SourceResult<CourseSchedule[]> = { data: [] };
  let examResult: SourceResult<Exam[]> = { data: [] };
  let gradeResult: SourceResult<Grade[]> = { data: [] };
  let renewedAcademicToken: string | undefined;
  let clearAcademicCredentials = false;
  let academicHealth: ProviderHealth = {
    provider: "academic", label: "教务系统", status: "reauth_required",
    lastAttemptAt: syncedAt, message: "需要登录教务系统",
  };

  // The academic system is one independent provider, not a gate for the app.
  try {
    const academic = await withPersistentAcademicLogin(req, async (adapter) => {
      const [nextProfile, semesters] = await Promise.all([
        adapter.getStudentProfile(),
        adapter.getSemesters(),
      ]);
      const semester = semesters.find((item) => item.isCurrent) ?? semesters[0] ?? null;
      const [schedule, exams, grades] = await Promise.all([
        semester
          ? isolate<CourseSchedule[]>([], () => adapter.getSchedule(semester.id))
          : Promise.resolve<SourceResult<CourseSchedule[]>>({ data: [] }),
        semester
          ? isolate<Exam[]>([], () => adapter.getExams(semester.id))
          : Promise.resolve<SourceResult<Exam[]>>({ data: [] }),
        isolate<Grade[]>([], () => adapter.getGrades()),
      ]);
      return { nextProfile, semester, schedule, exams, grades };
    });
    renewedAcademicToken = academic.renewedSessionToken;
    profile = academic.data.nextProfile;
    currentSemester = academic.data.semester;
    scheduleResult = academic.data.schedule;
    examResult = academic.data.exams;
    gradeResult = academic.data.grades;
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
    clearAcademicCredentials = credentialsAreInvalid(cause);
    const reauth = clearAcademicCredentials || (cause instanceof AcademicError && cause.code === "SESSION_EXPIRED");
    academicHealth = {
      provider: "academic", label: "教务系统",
      status: reauth ? "reauth_required" : "degraded",
      lastAttemptAt: syncedAt,
      message: clearAcademicCredentials ? "密码可能已变更，请重新连接" : reauth ? "登录已失效，请重新连接" : "暂时无法更新",
    };
    warnings.push(`教务系统：${academicHealth.message}`);
  }

  const liveOfficialCourseNames = scheduleResult.data.map((course) => course.courseName).filter(Boolean);
  const officialCourseNames = Array.from(new Set(
    (liveOfficialCourseNames.length ? liveOfficialCourseNames : cachedOfficialCourseNames)
      .map((name) => name.trim())
      .filter((name) => name.length >= 2 && name.length <= 100),
  )).slice(0, 100);
  const knownAcademicCourseNames = Array.from(new Set([
    ...officialCourseNames,
    ...cachedKnownAcademicCourseNames,
    ...examResult.data.map((exam) => exam.courseName),
    ...gradeResult.data.map((grade) => grade.courseName),
  ].map((name) => name.trim()).filter((name) => name.length >= 2 && name.length <= 100))).slice(0, 200);
  const chaoxingConnection = chaoxingConnectionFromToken(readChaoxingSessionToken(req));
  let chaoxingEvents = [] as ReturnType<typeof gradesToEvents>;
  let chaoxingCourseCount = 0;
  let chaoxingCounts = { inbox: 0, activities: 0, assignments: 0, onlineExams: 0 };
  let chaoxingHealth: ProviderHealth = {
    provider: "chaoxing", label: "学习通", status: "not_connected",
    lastAttemptAt: syncedAt, message: "尚未连接",
  };
  if (chaoxingConnection) {
    try {
      const data = await getChaoxingAcademicData(
        chaoxingConnection.client,
        syncedAt,
        officialCourseNames,
        knownAcademicCourseNames,
      );
      chaoxingEvents = data.events;
      chaoxingCourseCount = data.courses.length;
      chaoxingCounts = data.counts;
      chaoxingHealth = {
        provider: "chaoxing", label: "学习通",
        status: data.warnings.length ? "degraded" : "ok",
        lastAttemptAt: syncedAt, lastSuccessAt: syncedAt,
        message: data.warnings.length ? `${data.warnings.length} 项内容暂时未更新` : "已同步",
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

  const response = NextResponse.json({
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
        chaoxingInbox: chaoxingCounts.inbox,
        chaoxingActivities: chaoxingCounts.activities,
        chaoxingAssignments: chaoxingCounts.assignments,
        chaoxingOnlineExams: chaoxingCounts.onlineExams,
      },
      warnings,
    },
  });
  if (renewedAcademicToken) {
    response.cookies.set(serverConfig.sessionCookieName, renewedAcademicToken, sessionCookieOptions());
  }
  if (clearAcademicCredentials) {
    response.cookies.set(credentialCookieName, "", { ...credentialCookieOptions(), maxAge: 0 });
  }
  if (chaoxingConnection) {
    if (chaoxingHealth.status === "reauth_required") {
      clearChaoxingSessionToken(response);
    } else {
      writeChaoxingSessionToken(response, chaoxingConnection.refreshedToken());
    }
  }
  return response;
}

export async function GET(req: NextRequest) {
  return synchronize(req);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { officialCourseNames?: unknown; knownAcademicCourseNames?: unknown };
  const cachedOfficialCourseNames = Array.isArray(body.officialCourseNames)
    ? body.officialCourseNames.filter((name): name is string => typeof name === "string")
    : [];
  const cachedKnownAcademicCourseNames = Array.isArray(body.knownAcademicCourseNames)
    ? body.knownAcademicCourseNames.filter((name): name is string => typeof name === "string").slice(0, 200)
    : [];
  return synchronize(req, cachedOfficialCourseNames, cachedKnownAcademicCourseNames);
}
