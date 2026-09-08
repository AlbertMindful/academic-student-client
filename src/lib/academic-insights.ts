import type { CourseSchedule, Exam } from "@/lib/types";
import { PERIODS } from "@/lib/periods";

export const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export interface FreeWindow {
  day: string;
  label: string;
  startSection: number;
  endSection: number;
}

export function weeklyLoad(schedule: CourseSchedule[]): number[] {
  const load = Array(7).fill(0) as number[];
  schedule.forEach((course) =>
    course.sessions.forEach((session) => {
      load[session.dayOfWeek - 1] += session.endSection - session.startSection + 1;
    }),
  );
  return load;
}

export function findFreeWindows(schedule: CourseSchedule[]): FreeWindow[] {
  const windows: FreeWindow[] = [];
  for (let day = 1; day <= 5; day += 1) {
    const occupied = new Set<number>();
    schedule.forEach((course) =>
      course.sessions
        .filter((session) => session.dayOfWeek === day)
        .forEach((session) => {
          for (let section = session.startSection; section <= session.endSection; section += 1) {
            occupied.add(section);
          }
        }),
    );

    let start = 1;
    while (start <= 10) {
      while (start <= 10 && occupied.has(start)) start += 1;
      if (start > 10) break;
      let end = start;
      while (end + 1 <= 10 && !occupied.has(end + 1)) end += 1;
      if (end - start + 1 >= 2) {
        windows.push({
          day: DAY_NAMES[day - 1],
          label: `${PERIODS[start - 1].start}–${PERIODS[end - 1].end}`,
          startSection: start,
          endSection: end,
        });
      }
      start = end + 1;
    }
  }
  return windows.sort((a, b) => {
    const dayDiff = DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day);
    return dayDiff || a.startSection - b.startSection || a.endSection - b.endSection;
  });
}

export function upcomingExams(exams: Exam[], now = new Date()): Exam[] {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return exams.filter((exam) => exam.date >= today).sort((a, b) => a.date.localeCompare(b.date));
}

export function requiredGpa(
  currentGpa: number,
  currentCredits: number,
  plannedCredits: number,
  targetGpa: number,
): number {
  if (plannedCredits <= 0) return 0;
  return (targetGpa * (currentCredits + plannedCredits) - currentGpa * currentCredits) / plannedCredits;
}

export function examCalendarFile(exams: Exam[]): string {
  const escape = (value: string) => value.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const time = (date: string, value?: string) =>
    `${date.replaceAll("-", "")}${value ? `T${value.replace(":", "")}00` : ""}`;
  const events = upcomingExams(exams).map((exam) => [
    "BEGIN:VEVENT",
    `UID:${escape(exam.id)}@academic-assistant`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${time(exam.date, exam.startTime)}`,
    `DTEND:${time(exam.date, exam.endTime ?? exam.startTime)}`,
    `SUMMARY:${escape(`${exam.courseName}考试`)}`,
    `LOCATION:${escape(exam.location || "待定")}`,
    exam.seatNumber ? `DESCRIPTION:${escape(`座位号 ${exam.seatNumber}`)}` : "",
    "END:VEVENT",
  ].filter(Boolean).join("\r\n"));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Academic Assistant//CN", ...events, "END:VCALENDAR"].join("\r\n");
}

function calendarDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
}

function weekMonday(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  const weekday = date.getDay() || 7;
  date.setDate(date.getDate() - weekday + 1);
  return date;
}

/** Build one importable calendar containing every actual class and exam.
 * Expanding teaching weeks into individual events keeps the result reliable
 * across calendar apps and naturally handles skipped/odd/even weeks. */
export function academicCalendarFile(
  schedule: CourseSchedule[],
  exams: Exam[],
  semesterStartDate: string,
): string {
  const escape = (value: string) => value.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const monday = weekMonday(semesterStartDate);
  const events: string[] = [];

  for (const course of schedule) {
    for (const session of course.sessions) {
      for (const week of course.weekNumbers) {
        if (session.weekType === "odd" && week % 2 === 0) continue;
        if (session.weekType === "even" && week % 2 === 1) continue;
        const date = new Date(monday);
        date.setDate(monday.getDate() + (week - 1) * 7 + session.dayOfWeek - 1);
        const day = calendarDate(date);
        events.push([
          "BEGIN:VEVENT",
          `UID:course-${escape(course.id)}-${week}-${session.dayOfWeek}-${session.startSection}@academic-assistant`,
          `DTSTAMP:${stamp}`,
          `DTSTART;TZID=Asia/Shanghai:${day}T${session.startTime.replace(":", "")}00`,
          `DTEND;TZID=Asia/Shanghai:${day}T${session.endTime.replace(":", "")}00`,
          `SUMMARY:${escape(course.courseName)}`,
          `LOCATION:${escape(session.location || "待定")}`,
          `DESCRIPTION:${escape([course.teacher, `第 ${week} 周 · 第 ${session.startSection}-${session.endSection} 节`].filter(Boolean).join(" · "))}`,
          "END:VEVENT",
        ].join("\r\n"));
      }
    }
  }

  for (const exam of upcomingExams(exams, new Date(0))) {
    const day = exam.date.replaceAll("-", "");
    const hasTime = Boolean(exam.startTime);
    const start = hasTime
      ? `DTSTART;TZID=Asia/Shanghai:${day}T${exam.startTime!.replace(":", "")}00`
      : `DTSTART;VALUE=DATE:${day}`;
    const end = hasTime
      ? `DTEND;TZID=Asia/Shanghai:${day}T${(exam.endTime ?? exam.startTime!).replace(":", "")}00`
      : undefined;
    events.push([
      "BEGIN:VEVENT",
      `UID:exam-${escape(exam.id)}@academic-assistant`,
      `DTSTAMP:${stamp}`,
      start,
      end,
      `SUMMARY:${escape(`${exam.courseName}考试`)}`,
      `LOCATION:${escape(exam.location || "待定")}`,
      exam.seatNumber ? `DESCRIPTION:${escape(`座位号 ${exam.seatNumber}`)}` : "",
      "END:VEVENT",
    ].filter(Boolean).join("\r\n"));
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "PRODID:-//Academic Assistant//CN",
    "X-WR-CALNAME:我的学业",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}
