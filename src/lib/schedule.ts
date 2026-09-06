import type { CourseSchedule, CourseSession, NextClass } from "@/lib/types";
import { computeTeachingWeek, toHHmm } from "@/lib/teaching-week";
import { chinaDateKey, chinaDateTime, chinaDayOfWeek } from "@/lib/china-time";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 按周一到周日、同一天从早到晚排列课程时段。 */
export function sortSessionsChronologically(
  sessions: CourseSession[],
): CourseSession[] {
  return [...sessions].sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek ||
      a.startSection - b.startSection ||
      a.endSection - b.endSection,
  );
}

/** 该时段在给定教学周是否上课（处理单双周 + 具体周次）。 */
export function sessionOnWeek(
  course: CourseSchedule,
  session: CourseSession,
  week: number,
): boolean {
  if (course.weekNumbers.length > 0 && !course.weekNumbers.includes(week)) {
    return false;
  }
  if (session.weekType === "odd" && week % 2 === 0) return false;
  if (session.weekType === "even" && week % 2 === 1) return false;
  return true;
}

/** ISO 周一为一周首日的星期序号（1=周一 … 7=周日）。 */
export function isoDayOfWeek(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

function toDateTime(date: Date, hhmm: string): Date {
  return chinaDateTime(chinaDateKey(date), hhmm);
}

/**
 * 计算“下一节课”。在接下来的 14 天窗口内寻找最近的、当前仍在未来
 * 且满足单双周/周次约束的上课时段。
 */
export function findNextClass(
  courses: CourseSchedule[],
  semesterStart: string,
  now: Date,
): NextClass | null {
  let best: { course: CourseSchedule; session: CourseSession; at: Date } | null =
    null;

  for (let offset = 0; offset < 14; offset++) {
    const date = new Date(now.getTime() + offset * DAY_MS);
    const week = computeTeachingWeek(semesterStart, date);
    const weekday = chinaDayOfWeek(date);

    for (const course of courses) {
      for (const session of course.sessions) {
        if (session.dayOfWeek !== weekday) continue;
        if (!sessionOnWeek(course, session, week)) continue;
        const at = toDateTime(date, session.startTime);
        if (at.getTime() <= now.getTime()) continue;
        if (!best || at.getTime() < best.at.getTime()) {
          best = { course, session, at };
        }
      }
    }
  }

  if (!best) return null;

  const diffMs = best.at.getTime() - now.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  let countdownText: string;
  if (diffMin < 1) countdownText = "即将开始";
  else if (diffMin < 60) countdownText = `${diffMin} 分钟后`;
  else if (diffMin < 60 * 24) {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    countdownText = `${h} 小时 ${m} 分钟后`;
  } else {
    const d = Math.floor(diffMin / (60 * 24));
    countdownText = `${d} 天后`;
  }

  return {
    course: best.course,
    session: best.session,
    startAt: best.at.toISOString(),
    countdownText,
  };
}

/** 今日课程（含已结束的课），按开始节次排序。 */
export function todayClasses(
  courses: CourseSchedule[],
  semesterStart: string,
  now: Date,
): CourseSchedule[] {
  const week = computeTeachingWeek(semesterStart, now);
  const weekday = chinaDayOfWeek(now);
  return courses
    .filter((c) =>
      c.sessions.some(
        (s) => s.dayOfWeek === weekday && sessionOnWeek(c, s, week),
      ),
    )
    .sort((a, b) => {
      const aStart = Math.min(
        ...a.sessions
          .filter((s) => s.dayOfWeek === weekday)
          .map((s) => s.startSection),
      );
      const bStart = Math.min(
        ...b.sessions
          .filter((s) => s.dayOfWeek === weekday)
          .map((s) => s.startSection),
      );
      return aStart - bStart;
    });
}

/** 从字符串解析周次列表，如 "1-16周" / "1-8,10-16周(单)"。 */
export function parseWeeks(raw: string): {
  weekNumbers: number[];
  weekType: "all" | "odd" | "even";
} {
  const text = raw.replace(/周/g, "").trim();
  let weekType: "all" | "odd" | "even" = "all";
  if (/\(单\)|单周/.test(text)) weekType = "odd";
  else if (/\(双\)|双周/.test(text)) weekType = "even";

  const numbers: number[] = [];
  const parts = text.replace(/\(.*?\)/g, "").split(/[,，、\s]+/);
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      for (let i = a; i <= b; i++) numbers.push(i);
    } else if (/^\d+$/.test(part)) {
      numbers.push(Number(part));
    }
  }
  return { weekNumbers: [...new Set(numbers)].sort((a, b) => a - b), weekType };
}

/** 课表格子的稳定配色（按课程名哈希）。 */
const COURSE_COLORS = [
  { bg: "bg-indigo-50 dark:bg-indigo-500/10", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-200 dark:border-indigo-500/20" },
  { bg: "bg-sky-50 dark:bg-sky-500/10", text: "text-sky-700 dark:text-sky-300", border: "border-sky-200 dark:border-sky-500/20" },
  { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-500/20" },
  { bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-500/20" },
  { bg: "bg-rose-50 dark:bg-rose-500/10", text: "text-rose-700 dark:text-rose-300", border: "border-rose-200 dark:border-rose-500/20" },
  { bg: "bg-violet-50 dark:bg-violet-500/10", text: "text-violet-700 dark:text-violet-300", border: "border-violet-200 dark:border-violet-500/20" },
  { bg: "bg-teal-50 dark:bg-teal-500/10", text: "text-teal-700 dark:text-teal-300", border: "border-teal-200 dark:border-teal-500/20" },
  { bg: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-500/20" },
];

export function courseColor(courseName: string) {
  let hash = 0;
  for (let i = 0; i < courseName.length; i++) {
    hash = (hash * 31 + courseName.charCodeAt(i)) >>> 0;
  }
  return COURSE_COLORS[hash % COURSE_COLORS.length];
}

export { toHHmm };
