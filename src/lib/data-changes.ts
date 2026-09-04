import type { CourseSchedule, Exam, Grade } from "@/lib/types";

export type ChangeKind = "grade" | "exam" | "schedule";

export interface DataChange {
  id: string;
  kind: ChangeKind;
  title: string;
  detail: string;
}

export interface AcademicSnapshot {
  version: 1;
  grades: Record<string, string>;
  exams: Record<string, string>;
  schedule: Record<string, string>;
}

function scoreLabel(score: number | string): string {
  return String(score).trim();
}

function gradeKey(grade: Grade): string {
  return `${grade.semesterId}|${grade.courseCode || grade.courseName}`;
}

function examKey(exam: Exam): string {
  return `${exam.semesterId}|${exam.courseName}`;
}

function courseKey(course: CourseSchedule): string {
  return `${course.semesterId}|${course.courseCode || course.courseName}`;
}

function examSignature(exam: Exam): string {
  return [
    exam.date,
    exam.startTime ?? "",
    exam.endTime ?? "",
    exam.location,
    exam.seatNumber ?? "",
  ].join("|");
}

function scheduleSignature(course: CourseSchedule): string {
  const sessions = [...course.sessions]
    .sort((a, b) =>
      a.dayOfWeek - b.dayOfWeek || a.startSection - b.startSection,
    )
    .map((session) =>
      [
        session.dayOfWeek,
        session.startSection,
        session.endSection,
        session.weekType,
        session.location,
      ].join("/"),
    )
    .join(";");
  return [course.teacher, course.weeks, sessions].join("|");
}

export function createAcademicSnapshot(data: {
  grades: Grade[];
  exams: Exam[];
  schedule: CourseSchedule[];
}): AcademicSnapshot {
  return {
    version: 1,
    grades: Object.fromEntries(
      data.grades.map((grade) => [gradeKey(grade), scoreLabel(grade.score)]),
    ),
    exams: Object.fromEntries(
      data.exams.map((exam) => [examKey(exam), examSignature(exam)]),
    ),
    schedule: Object.fromEntries(
      data.schedule.map((course) => [courseKey(course), scheduleSignature(course)]),
    ),
  };
}

export function isAcademicSnapshot(value: unknown): value is AcademicSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AcademicSnapshot>;
  return (
    candidate.version === 1 &&
    !!candidate.grades &&
    typeof candidate.grades === "object" &&
    !!candidate.exams &&
    typeof candidate.exams === "object" &&
    !!candidate.schedule &&
    typeof candidate.schedule === "object"
  );
}

export function detectAcademicChanges(
  previous: AcademicSnapshot,
  currentData: {
    grades: Grade[];
    exams: Exam[];
    schedule: CourseSchedule[];
  },
): DataChange[] {
  const current = createAcademicSnapshot(currentData);
  const changes: DataChange[] = [];

  currentData.grades.forEach((grade) => {
    const key = gradeKey(grade);
    const oldScore = previous.grades[key];
    const newScore = current.grades[key];
    if (oldScore == null) {
      changes.push({
        id: `grade:new:${key}:${newScore}`,
        kind: "grade",
        title: "新成绩已发布",
        detail: `${grade.courseName} · ${newScore} 分`,
      });
    } else if (oldScore !== newScore) {
      changes.push({
        id: `grade:update:${key}:${newScore}`,
        kind: "grade",
        title: "成绩有更新",
        detail: `${grade.courseName} · ${oldScore} → ${newScore}`,
      });
    }
  });

  currentData.exams.forEach((exam) => {
    const key = examKey(exam);
    const oldValue = previous.exams[key];
    const newValue = current.exams[key];
    if (oldValue == null) {
      changes.push({
        id: `exam:new:${key}:${newValue}`,
        kind: "exam",
        title: "新增考试安排",
        detail: `${exam.courseName} · ${exam.date}${exam.startTime ? ` ${exam.startTime}` : ""}`,
      });
    } else if (oldValue !== newValue) {
      changes.push({
        id: `exam:update:${key}:${newValue}`,
        kind: "exam",
        title: "考试安排有变",
        detail: `${exam.courseName} · ${exam.date}${exam.startTime ? ` ${exam.startTime}` : ""} · ${exam.location || "地点待定"}`,
      });
    }
  });

  currentData.schedule.forEach((course) => {
    const key = courseKey(course);
    const oldValue = previous.schedule[key];
    const newValue = current.schedule[key];
    const firstSession = course.sessions[0];
    const detail = firstSession
      ? `${course.courseName} · 周${firstSession.dayOfWeek} ${firstSession.startTime} · ${firstSession.location}`
      : course.courseName;
    if (oldValue == null) {
      changes.push({
        id: `schedule:new:${key}:${newValue}`,
        kind: "schedule",
        title: "新增课程安排",
        detail,
      });
    } else if (oldValue !== newValue) {
      changes.push({
        id: `schedule:update:${key}:${newValue}`,
        kind: "schedule",
        title: "课程安排有变",
        detail,
      });
    }
  });

  return changes.slice(0, 20);
}
