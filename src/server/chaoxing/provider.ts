import * as cheerio from "cheerio";
import type { AcademicEvent } from "@/lib/types";
import { scoreAcademicEvent } from "@/lib/academic-events";
import { courseMatches } from "@/lib/course-matching";
import type { SchoolHttpClient } from "@/server/http";

const COURSE_API = "https://mooc1-api.chaoxing.com/mycourse/backclazzdata?rss=1&view=json";

export class ChaoxingReauthError extends Error {}

interface ChaoxingCourse {
  courseId: string;
  clazzId: string;
  cpi?: string;
  name: string;
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function findCourses(value: unknown, result: ChaoxingCourse[] = []): ChaoxingCourse[] {
  if (Array.isArray(value)) {
    for (const item of value) findCourses(item, result);
    return result;
  }
  if (!value || typeof value !== "object") return result;
  const item = value as Record<string, unknown>;
  const course = item.course && typeof item.course === "object" ? item.course as Record<string, unknown> : null;
  if (course) {
    const courseData = Array.isArray(course.data) && course.data[0] && typeof course.data[0] === "object" ? course.data[0] as Record<string, unknown> : course;
    const courseId = stringValue(courseData.id ?? courseData.courseId ?? course.id ?? course.courseId);
    const clazzId = stringValue(item.id ?? item.clazzId ?? item.clazzid);
    const name = stringValue(courseData.name ?? courseData.courseName ?? course.name);
    const cpi = stringValue(item.cpi ?? item.personId ?? item.cpiId) || undefined;
    if (courseId && clazzId && name && !result.some((entry) => entry.courseId === courseId && entry.clazzId === clazzId)) {
      result.push({ courseId, clazzId, name, cpi });
    }
  }
  for (const child of Object.values(item)) findCourses(child, result);
  return result;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

function absoluteUrl(value: string): string | undefined {
  if (!value || /^javascript:/i.test(value)) return undefined;
  try { return new URL(value, "https://mooc1-api.chaoxing.com").toString(); } catch { return undefined; }
}

function parseDate(text: string): { dueAt?: string; dueOn?: string } {
  const normalized = text.replace(/年|\//g, "-").replace(/月/g, "-").replace(/日/g, " ");
  const matches = [...normalized.matchAll(/(?:(20\d{2})-)?(\d{1,2})-(\d{1,2})(?:\s+|\s*[截到][止期]?\s*)?(\d{1,2}:\d{2})?/g)];
  if (!matches.length) return {};
  const match = matches[matches.length - 1];
  const year = Number(match[1] ?? new Date().getFullYear());
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return {};
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!match[4]) return { dueOn: date };
  const local = new Date(`${date}T${match[4]}:00`);
  return Number.isNaN(local.getTime()) ? { dueOn: date } : { dueAt: local.toISOString() };
}

function parseWorkPage(html: string, course: ChaoxingCourse, fetchedAt: string): AcademicEvent[] {
  const $ = cheerio.load(html);
  const events: AcademicEvent[] = [];
  const candidates = $(".workList li, .work-list li, .work-list-item, .workList-item, .task-list li, tr").toArray();
  for (const node of candidates) {
    const element = $(node);
    const text = element.text().replace(/\s+/g, " ").trim();
    const link = element.find("a[href]").first();
    const title = (link.attr("title") || element.find(".overHidden2,.work-name,.title,h3,h4").first().text() || link.text()).replace(/\s+/g, " ").trim();
    const href = absoluteUrl(link.attr("href") ?? "");
    if (!title || title.length > 160 || (!href && !/作业|任务|测验|考试/.test(text))) continue;
    if (/已交|待批阅|已完成/.test(text) && !/未完成|未交/.test(text)) continue;
    const dates = parseDate(text);
    const sourceId = href ?? `${course.clazzId}:${title}`;
    const event: AcademicEvent = {
      id: `assignment_${stableHash(sourceId)}`,
      kind: "assignment",
      title,
      summary: /考试|测验/.test(text) ? `${course.name} · 在线测验` : course.name,
      courseName: course.name,
      ...dates,
      sources: [{ provider: "chaoxing", providerLabel: "学习通", sourceId, url: href, raw: { courseId: course.courseId, clazzId: course.clazzId } }],
      firstSeenAt: fetchedAt,
      updatedAt: fetchedAt,
      priority: 0,
    };
    event.priority = scoreAcademicEvent(event);
    events.push(event);
  }
  return events;
}

export async function getChaoxingAcademicData(client: SchoolHttpClient, fetchedAt: string, officialCourseNames: string[] = []): Promise<{ courses: ChaoxingCourse[]; events: AcademicEvent[]; warnings: string[] }> {
  const response = await client.get(COURSE_API, { headers: { Referer: "https://i.chaoxing.com/" } });
  let payload: unknown;
  try { payload = JSON.parse(response.body); } catch { throw new ChaoxingReauthError("学习通会话无效"); }
  const root = payload as { result?: number | boolean; status?: boolean; msg?: string };
  if (root.result === 0 || root.status === false || /重新登录/.test(root.msg ?? "")) throw new ChaoxingReauthError("学习通登录已过期");
  const discoveredCourses = findCourses(payload);
  // When the academic system is available, never treat Chaoxing's public,
  // self-study or historical classes as official courses. With no current
  // school list available we cap the fallback scan; the client still filters
  // results against its last known official list before displaying anything.
  const courses = officialCourseNames.length
    ? discoveredCourses.filter((course) => officialCourseNames.some((official) => courseMatches(course.name, official)))
    : discoveredCourses.slice(0, 20);
  if (!courses.length) return { courses, events: [], warnings: [] };

  const results = await Promise.all(courses.map(async (course) => {
    const query = new URLSearchParams({ courseId: course.courseId, clazzId: course.clazzId, ut: "s" });
    if (course.cpi) query.set("cpi", course.cpi);
    try {
      const page = await client.get(`https://mooc1-api.chaoxing.com/work/stu-work?${query}`, { headers: { Referer: "https://i.chaoxing.com/" } });
      if (/请重新登录|用户登录/.test(page.body)) throw new ChaoxingReauthError();
      return { events: parseWorkPage(page.body, course, fetchedAt) };
    } catch (cause) {
      if (cause instanceof ChaoxingReauthError) throw cause;
      return { events: [] as AcademicEvent[], warning: `${course.name}作业暂时无法更新` };
    }
  }));
  return {
    courses,
    events: results.flatMap((result) => result.events),
    warnings: results.flatMap((result) => result.warning ? [result.warning] : []),
  };
}
