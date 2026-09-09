import type { CourseSchedule, Exam } from "@/lib/types";

function escapeCalendar(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function calendarDay(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("");
}

function mondayOf(dateValue: string): Date {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  const weekday = date.getDay() || 7;
  date.setDate(date.getDate() - weekday + 1);
  return date;
}

function calendar(lines: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "PRODID:-//Academic Center//CN",
    "X-WR-TIMEZONE:Asia/Shanghai",
    ...lines,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function scheduleCalendarFile(schedule: CourseSchedule[], semesterStartDate: string): string {
  const semesterMonday = mondayOf(semesterStartDate);
  const createdAt = stamp();
  const events: string[] = [];
  for (const course of schedule) {
    for (const session of course.sessions) {
      for (const week of course.weekNumbers) {
        if (session.weekType === "odd" && week % 2 === 0) continue;
        if (session.weekType === "even" && week % 2 === 1) continue;
        const date = new Date(semesterMonday);
        date.setDate(semesterMonday.getDate() + (week - 1) * 7 + session.dayOfWeek - 1);
        const day = calendarDay(date);
        events.push([
          "BEGIN:VEVENT",
          `UID:course-${encodeURIComponent(course.id)}-${week}-${session.dayOfWeek}-${session.startSection}@academic-center`,
          `DTSTAMP:${createdAt}`,
          `DTSTART;TZID=Asia/Shanghai:${day}T${session.startTime.replace(":", "")}00`,
          `DTEND;TZID=Asia/Shanghai:${day}T${session.endTime.replace(":", "")}00`,
          `SUMMARY:${escapeCalendar(course.courseName)}`,
          `LOCATION:${escapeCalendar(session.location || "待定")}`,
          `DESCRIPTION:${escapeCalendar([course.teacher, `第 ${week} 周`, `第 ${session.startSection}-${session.endSection} 节`].filter(Boolean).join(" · "))}`,
          "END:VEVENT",
        ].join("\r\n"));
      }
    }
  }
  return calendar(events);
}

export function examCalendarFile(exams: Exam[]): string {
  const createdAt = stamp();
  const events = [...exams].sort((a, b) => a.date.localeCompare(b.date)).map((exam) => {
    const day = exam.date.replaceAll("-", "");
    const timeLines = exam.startTime
      ? [
          `DTSTART;TZID=Asia/Shanghai:${day}T${exam.startTime.replace(":", "")}00`,
          `DTEND;TZID=Asia/Shanghai:${day}T${(exam.endTime ?? exam.startTime).replace(":", "")}00`,
        ]
      : (() => {
          const next = new Date(`${exam.date}T12:00:00`);
          next.setDate(next.getDate() + 1);
          return [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${calendarDay(next)}`];
        })();
    return [
      "BEGIN:VEVENT",
      `UID:exam-${encodeURIComponent(exam.id)}@academic-center`,
      `DTSTAMP:${createdAt}`,
      ...timeLines,
      `SUMMARY:${escapeCalendar(`${exam.courseName}考试`)}`,
      `LOCATION:${escapeCalendar(exam.location || "待定")}`,
      exam.seatNumber ? `DESCRIPTION:${escapeCalendar(`座位号 ${exam.seatNumber}`)}` : "",
      "END:VEVENT",
    ].filter(Boolean).join("\r\n");
  });
  return calendar(events);
}

export function downloadCalendarFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
