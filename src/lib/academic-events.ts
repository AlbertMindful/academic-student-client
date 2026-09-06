import type {
  AcademicEvent,
  AcademicEventKind,
  AcademicEventSource,
  CourseSchedule,
  Exam,
  Grade,
  Semester,
} from "@/lib/types";
import { computeTeachingWeek } from "@/lib/teaching-week";
import { isoDayOfWeek, sessionOnWeek } from "@/lib/schedule";
import { chinaDateKey, chinaDateTime } from "@/lib/china-time";

const DAY_MS = 86_400_000;

function atLocal(date: string, time?: string): string | undefined {
  if (!date || !time) return undefined;
  const parsed = chinaDateTime(date, time);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function source(
  provider: AcademicEventSource["provider"],
  sourceId: string,
  raw?: unknown,
): AcademicEventSource {
  return {
    provider,
    providerLabel: provider === "academic" ? "教务系统" : "学习通",
    sourceId,
    raw,
  };
}

function minutesUntil(event: AcademicEvent, now: Date): number | null {
  const anchor = event.dueAt ?? event.startsAt ?? (event.dueOn ? `${event.dueOn}T23:59:59+08:00` : event.startsOn ? `${event.startsOn}T12:00:00+08:00` : undefined);
  if (!anchor) return null;
  const timestamp = new Date(anchor).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return (timestamp - now.getTime()) / 60_000;
}

/** Importance is recomputed at display time, so deadlines rise naturally. */
export function scoreAcademicEvent(event: AcademicEvent, now = new Date()): number {
  const base: Record<AcademicEventKind, number> = {
    schedule_change: 82,
    assignment: 58,
    exam: 64,
    class: 34,
    grade: 28,
    notice: 36,
    material: 12,
  };
  let score = base[event.kind];
  if (event.sourceUnread) score += 6;
  const minutes = minutesUntil(event, now);
  if (minutes != null) {
    if (minutes < -180) score -= event.kind === "class" ? 70 : 28;
    else if (minutes <= 120) score += 32;
    else if (minutes <= 24 * 60) score += 24;
    else if (minutes <= 3 * 24 * 60) score += 14;
    else if (minutes <= 7 * 24 * 60) score += 7;
  }
  return Math.max(0, Math.min(100, score));
}

function eventId(kind: AcademicEventKind, key: string): string {
  return `${kind}_${stableHash(key)}`;
}

export function scheduleToEvents(
  courses: CourseSchedule[],
  semester: Semester | null,
  fetchedAt: string,
  now = new Date(),
  days = 14,
): AcademicEvent[] {
  if (!semester?.startDate) return [];
  const events: AcademicEvent[] = [];
  const start = new Date(`${chinaDateKey(now)}T12:00:00Z`);

  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(start.getTime() + offset * DAY_MS);
    const dateKey = date.toISOString().slice(0, 10);
    const weekday = isoDayOfWeek(date);
    const week = computeTeachingWeek(semester.startDate, date);
    for (const course of courses) {
      for (const [sessionIndex, session] of course.sessions.entries()) {
        if (session.dayOfWeek !== weekday || !sessionOnWeek(course, session, week)) continue;
        const startsAt = atLocal(dateKey, session.startTime);
        const endsAt = atLocal(dateKey, session.endTime);
        // Keep the occurrence id stable when its time or classroom changes, so
        // reconciliation can surface the difference instead of inventing a new class.
        const key = `${course.id}|${dateKey}|${sessionIndex}`;
        const event: AcademicEvent = {
          id: eventId("class", key),
          kind: "class",
          title: course.courseName,
          summary: [course.teacher, `第 ${session.startSection}-${session.endSection} 节`]
            .filter(Boolean)
            .join(" · "),
          courseName: course.courseName,
          startsAt,
          endsAt,
          location: session.location || undefined,
          semesterId: semester.id,
          sources: [source("academic", key, { courseId: course.id, session, week })],
          firstSeenAt: fetchedAt,
          updatedAt: fetchedAt,
          priority: 0,
        };
        event.priority = scoreAcademicEvent(event, now);
        events.push(event);
      }
    }
  }
  return events;
}

export function examsToEvents(
  exams: Exam[],
  fetchedAt: string,
  now = new Date(),
): AcademicEvent[] {
  return exams.map((exam) => {
    const key = `${exam.id}|${exam.date}|${exam.startTime ?? ""}`;
    const detail = [exam.category, exam.seatNumber ? `座位 ${exam.seatNumber}` : ""]
      .filter(Boolean)
      .join(" · ");
    const event: AcademicEvent = {
      id: eventId("exam", key),
      kind: "exam",
      title: `${exam.courseName}考试`,
      summary: detail || undefined,
      courseName: exam.courseName,
      startsAt: atLocal(exam.date, exam.startTime),
      endsAt: atLocal(exam.date, exam.endTime),
      startsOn: exam.date,
      location: exam.location || undefined,
      status: exam.status,
      semesterId: exam.semesterId,
      sources: [source("academic", exam.id, exam)],
      firstSeenAt: fetchedAt,
      updatedAt: fetchedAt,
      priority: 0,
    };
    event.priority = scoreAcademicEvent(event, now);
    return event;
  });
}

export function gradesToEvents(grades: Grade[], fetchedAt: string): AcademicEvent[] {
  return grades.map((grade) => {
    const key = `${grade.semesterId}|${grade.id}`;
    const event: AcademicEvent = {
      id: eventId("grade", key),
      kind: "grade",
      title: `${grade.courseName}成绩已可查看`,
      summary: `成绩 ${grade.score}${grade.gradePoint != null ? ` · 绩点 ${grade.gradePoint}` : ""}`,
      courseName: grade.courseName,
      semesterId: grade.semesterId,
      sources: [source("academic", grade.id, grade)],
      firstSeenAt: fetchedAt,
      updatedAt: fetchedAt,
      priority: 28,
    };
    return event;
  });
}

function normalizedText(value?: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .replace(/(?:课程|通知|安排|关于|本周|考试)$/g, "");
}

function grams(value: string): Set<string> {
  const text = normalizedText(value);
  const result = new Set<string>();
  if (text.length < 2) result.add(text);
  for (let i = 0; i < text.length - 1; i += 1) result.add(text.slice(i, i + 2));
  return result;
}

function jaccard(a: string, b: string): number {
  const left = grams(a);
  const right = grams(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / (left.size + right.size - overlap);
}

function datePart(value?: string): string {
  return value ? value.slice(0, 10) : "";
}

function timePart(value?: string): string {
  return value ? value.slice(11, 16) : "";
}

export interface MergeDecision {
  merge: boolean;
  confidence: number;
  reason: string;
}

function authorityConflictMatch(a: AcademicEvent, b: AcademicEvent): boolean {
  const crossSource = a.sources.some((sourceA) => b.sources.some((sourceB) => sourceA.provider !== sourceB.provider));
  if (!crossSource || a.kind !== b.kind || !a.courseName || !b.courseName) return false;
  const sameCourse = normalizedText(a.courseName) === normalizedText(b.courseName) || jaccard(a.courseName, b.courseName) >= 0.88;
  return sameCourse && jaccard(a.title, b.title) >= 0.74;
}

function mergeWithAcademicAuthority(a: AcademicEvent, b: AcademicEvent): AcademicEvent {
  const academic = a.sources.some((sourceItem) => sourceItem.provider === "academic") ? a : b;
  const other = academic === a ? b : a;
  const conflicts: NonNullable<AcademicEvent["conflicts"]> = [];
  const academicAnchor = academic.dueAt ?? academic.startsAt ?? academic.dueOn ?? academic.startsOn;
  const otherAnchor = other.dueAt ?? other.startsAt ?? other.dueOn ?? other.startsOn;
  if (academicAnchor && otherAnchor && datePart(academicAnchor) !== datePart(otherAnchor)) {
    conflicts.push({ field: "date", academicValue: datePart(academicAnchor), otherValue: datePart(otherAnchor), resolution: "academic_preferred" });
  } else if (academicAnchor && otherAnchor && timePart(academicAnchor) && timePart(otherAnchor) && timePart(academicAnchor) !== timePart(otherAnchor)) {
    conflicts.push({ field: "time", academicValue: timePart(academicAnchor), otherValue: timePart(otherAnchor), resolution: "academic_preferred" });
  }
  if (academic.location && other.location && normalizedText(academic.location) !== normalizedText(other.location)) {
    conflicts.push({ field: "location", academicValue: academic.location, otherValue: other.location, resolution: "academic_preferred" });
  }
  if (academic.status && other.status && normalizedText(academic.status) !== normalizedText(other.status)) {
    conflicts.push({ field: "status", academicValue: academic.status, otherValue: other.status, resolution: "academic_preferred" });
  }
  return {
    ...academic,
    sources: [...academic.sources, ...other.sources],
    firstSeenAt: academic.firstSeenAt < other.firstSeenAt ? academic.firstSeenAt : other.firstSeenAt,
    updatedAt: academic.updatedAt > other.updatedAt ? academic.updatedAt : other.updatedAt,
    priority: Math.max(academic.priority, other.priority),
    merge: { strategy: "similar", confidence: 0.9, reason: "确认是同一事项；冲突字段以教务系统为准" },
    conflicts,
  };
}

/**
 * Conservative cross-source matching. Conflicting dates, times, locations or
 * course names are hard blockers; uncertain pairs remain separate.
 */
export function canMergeEvents(a: AcademicEvent, b: AcademicEvent): MergeDecision {
  if (a.sources.some((item) => b.sources.some((other) => item.provider === other.provider))) {
    return { merge: false, confidence: 0, reason: "同一来源的记录不自动合并" };
  }
  if (a.kind !== b.kind) return { merge: false, confidence: 0, reason: "事件类型不同" };

  const aAnchor = a.dueAt ?? a.startsAt ?? a.dueOn ?? a.startsOn;
  const bAnchor = b.dueAt ?? b.startsAt ?? b.dueOn ?? b.startsOn;
  if (aAnchor && bAnchor && datePart(aAnchor) !== datePart(bAnchor)) {
    return { merge: false, confidence: 0, reason: "日期冲突" };
  }
  if (aAnchor && bAnchor && timePart(aAnchor) && timePart(bAnchor) && timePart(aAnchor) !== timePart(bAnchor)) {
    return { merge: false, confidence: 0, reason: "时间冲突" };
  }
  if (a.location && b.location && normalizedText(a.location) !== normalizedText(b.location)) {
    return { merge: false, confidence: 0, reason: "地点冲突" };
  }

  const courseSimilarity = a.courseName && b.courseName
    ? jaccard(a.courseName, b.courseName)
    : 0;
  if (a.courseName && b.courseName && courseSimilarity < 0.72) {
    return { merge: false, confidence: courseSimilarity, reason: "课程名称不足以确认相同" };
  }
  const titleSimilarity = jaccard(a.title, b.title);
  const anchored = Boolean(aAnchor && bAnchor);
  const confidence = Math.min(0.99, 0.48 * titleSimilarity + 0.34 * courseSimilarity + (anchored ? 0.18 : 0));
  return confidence >= 0.86
    ? { merge: true, confidence, reason: "跨来源的类型、课程与时间高度一致" }
    : { merge: false, confidence, reason: "相似度未达到保守合并阈值" };
}

export function deduplicateAcademicEvents(events: AcademicEvent[]): AcademicEvent[] {
  const result: AcademicEvent[] = [];
  for (const event of events) {
    const exact = result.find((candidate) => candidate.id === event.id);
    if (exact) {
      exact.sources = [...exact.sources, ...event.sources.filter((sourceItem) =>
        !exact.sources.some((existing) => existing.provider === sourceItem.provider && existing.sourceId === sourceItem.sourceId),
      )];
      exact.updatedAt = event.updatedAt;
      continue;
    }
    const match = result.find((candidate) => canMergeEvents(candidate, event).merge);
    if (!match) {
      const conflictMatch = result.find((candidate) => authorityConflictMatch(candidate, event));
      if (conflictMatch) {
        result.splice(result.indexOf(conflictMatch), 1, mergeWithAcademicAuthority(conflictMatch, event));
        continue;
      }
      result.push({ ...event, sources: [...event.sources] });
      continue;
    }
    const decision = canMergeEvents(match, event);
    match.sources.push(...event.sources);
    match.firstSeenAt = match.firstSeenAt < event.firstSeenAt ? match.firstSeenAt : event.firstSeenAt;
    match.updatedAt = match.updatedAt > event.updatedAt ? match.updatedAt : event.updatedAt;
    match.priority = Math.max(match.priority, event.priority);
    match.merge = {
      strategy: "similar",
      confidence: decision.confidence,
      reason: decision.reason,
    };
  }
  return result;
}
