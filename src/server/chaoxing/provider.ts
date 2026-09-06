import * as cheerio from "cheerio";
import type { AcademicEvent, AcademicEventKind } from "@/lib/types";
import { scoreAcademicEvent } from "@/lib/academic-events";
import { courseMatches } from "@/lib/course-matching";
import type { SchoolHttpClient } from "@/server/http";

const COURSE_API = "https://mooc1-api.chaoxing.com/mycourse/backclazzdata?rss=1&view=json";
const HOME_URL = "https://i.chaoxing.com/base";

export class ChaoxingReauthError extends Error {}

function isChaoxingLoginPage(url: string, body: string): boolean {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { /* invalid final URL */ }
  if (host === "passport2.chaoxing.com" || host.endsWith(".passport2.chaoxing.com")) return true;
  return /<title>\s*用户登录\s*<\/title>/i.test(body)
    || (/(?:id=["']loginBtn["']|loginByPhoneAndPwd)/i.test(body) && /id=["'](?:phone|pwd)["']/i.test(body));
}

interface ChaoxingCourse {
  courseId: string;
  clazzId: string;
  cpi?: string;
  name: string;
}

export interface ChaoxingAcademicData {
  courses: ChaoxingCourse[];
  events: AcademicEvent[];
  warnings: string[];
  counts: {
    inbox: number;
    activities: number;
    assignments: number;
    onlineExams: number;
  };
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
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
    const courseData = Array.isArray(course.data) && course.data[0] && typeof course.data[0] === "object"
      ? course.data[0] as Record<string, unknown>
      : course;
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
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function safeChaoxingUrl(value: string, base: string): string | undefined {
  if (!value || /^javascript:/i.test(value)) return undefined;
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || !/(^|\.)chaoxing\.com$/i.test(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function parseCalendarDate(text: string, now = new Date()): { at?: string; on?: string } {
  const normalized = text.replace(/年|\//g, "-").replace(/月/g, "-").replace(/日/g, " ");
  const matches = [...normalized.matchAll(/(?:(20\d{2})-)?(\d{1,2})-(\d{1,2})(?:\([^)]*\))?(?:\s+|\s*[截到][止期]?\s*)?(\d{1,2}:\d{2})?/g)];
  if (!matches.length) return {};
  const match = matches[matches.length - 1];
  let year = Number(match[1] ?? now.getFullYear());
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return {};
  if (!match[1]) {
    const tentative = new Date(year, month - 1, day);
    if (tentative.getTime() > now.getTime() + 45 * 86_400_000) year -= 1;
  }
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!match[4]) return { on: date };
  const local = new Date(`${date}T${match[4]}:00`);
  return Number.isNaN(local.getTime()) ? { on: date } : { at: local.toISOString() };
}

function classifyTitle(title: string): AcademicEventKind {
  if (/考试|测验/.test(title)) return "exam";
  if (/作业|提交|任务/.test(title)) return "assignment";
  if (/资料|课件|教材|携带/.test(title)) return "material";
  return "notice";
}

function courseFromTitle(title: string): string | undefined {
  return cleanText(title.match(/《([^》]{2,80})》/)?.[1] ?? "") || undefined;
}

function makeEvent(input: Omit<AcademicEvent, "priority">, now = new Date()): AcademicEvent {
  const event: AcademicEvent = { ...input, priority: 0 };
  event.priority = scoreAcademicEvent(event, now);
  return event;
}

function parseInboxPage(
  html: string,
  pageUrl: string,
  officialCourseNames: string[],
  fetchedAt: string,
): AcademicEvent[] {
  const $ = cheerio.load(html);
  const now = new Date(fetchedAt);
  const events: AcademicEvent[] = [];
  $("li.dataBody_item").slice(0, 40).each((_, node) => {
    const item = $(node);
    const title = cleanText(item.find(".notice_title").first().text());
    if (!title || /评价任务|评学问卷|满意度调查/.test(title)) return;
    const published = parseCalendarDate(cleanText(item.find(".notice_time").first().text()), now);
    const publishedAt = published.at ?? (published.on ? new Date(`${published.on}T12:00:00`).toISOString() : undefined);
    const ageDays = publishedAt ? (now.getTime() - new Date(publishedAt).getTime()) / 86_400_000 : 0;
    const highSignal = /考试|测验|作业|提交|截止|调课|停课|教室|资料|课件|成绩/.test(title);
    if (ageDays > 45 || (ageDays > 14 && !highSignal)) return;

    const extractedCourse = courseFromTitle(title);
    const officialCourse = extractedCourse
      ? officialCourseNames.find((name) => courseMatches(extractedCourse, name))
      : undefined;
    if (extractedCourse && officialCourseNames.length && !officialCourse) return;

    const sender = cleanText(item.find(".receiverName").first().text()) || undefined;
    const sourceId = item.attr("data-id") ?? item.find(".dataBody_check").attr("data-id") ?? item.attr("id") ?? `${title}:${publishedAt ?? ""}`;
    const kind = classifyTitle(title);
    const eventTitle = kind === "notice" || kind === "material" ? title : title.replace(/^作业[:：]\s*/, "");
    events.push(makeEvent({
      id: `${kind}_${stableHash(`inbox:${sourceId}`)}`,
      kind,
      title: eventTitle,
      summary: [officialCourse, sender ? `来自 ${sender}` : "", "收件箱"].filter(Boolean).join(" · "),
      courseName: officialCourse,
      publishedAt,
      sender,
      sourceUnread: item.find(".notice_unread,.redDot").length > 0,
      contextLabel: "收件箱",
      sources: [{
        provider: "chaoxing",
        providerLabel: "学习通",
        sourceId: `inbox:${sourceId}`,
        url: HOME_URL,
        raw: { sender, publishedAt, channel: "inbox" },
      }],
      firstSeenAt: fetchedAt,
      updatedAt: publishedAt ?? fetchedAt,
    }, now));
  });
  return events;
}

function parseWorkPage(html: string, course: ChaoxingCourse, pageUrl: string, fetchedAt: string): AcademicEvent[] {
  const $ = cheerio.load(html);
  const events: AcademicEvent[] = [];
  const now = new Date(fetchedAt);
  $(".workList li, .work-list li, .work-list-item, .workList-item, .task-list li, .workList_tr, tr").each((_, node) => {
    const item = $(node);
    const text = cleanText(item.text());
    const link = item.find("a[href]").first();
    const title = cleanText(link.attr("title") || item.find(".overHidden2,.work-name,.title,h3,h4").first().text() || link.text());
    if (!title || title.length > 160 || !/作业|任务|测验|考试/.test(`${title} ${text}`)) return;
    if (/已交|待批阅|已完成|已结束|已截止/.test(text) && !/未完成|未交|进行中/.test(text)) return;
    const parsed = parseCalendarDate(text, now);
    const parsedTime = parsed.at ? Date.parse(parsed.at) : parsed.on ? Date.parse(`${parsed.on}T23:59:59`) : null;
    if (parsedTime != null && parsedTime < now.getTime() - 3 * 60 * 60_000) return;
    const href = safeChaoxingUrl(link.attr("href") ?? "", pageUrl) ?? pageUrl;
    const sourceId = href === pageUrl ? `${course.clazzId}:${title}` : href;
    const kind = /考试|测验/.test(title) ? "exam" : "assignment";
    events.push(makeEvent({
      id: `${kind}_${stableHash(sourceId)}`,
      kind,
      title,
      summary: [course.name, kind === "exam" ? "线上测验" : "未完成"].join(" · "),
      courseName: course.name,
      dueAt: /截止|结束/.test(text) ? parsed.at : undefined,
      dueOn: /截止|结束/.test(text) ? parsed.on : undefined,
      startsAt: !/截止|结束/.test(text) ? parsed.at : undefined,
      startsOn: !/截止|结束/.test(text) ? parsed.on : undefined,
      status: "未完成",
      contextLabel: kind === "exam" ? "线上测验" : "课程作业",
      sources: [{ provider: "chaoxing", providerLabel: "学习通", sourceId, url: href, raw: { channel: "work" } }],
      firstSeenAt: fetchedAt,
      updatedAt: fetchedAt,
    }, now));
  });
  return events;
}

function parseExamPage(html: string, course: ChaoxingCourse, pageUrl: string, fetchedAt: string): AcademicEvent[] {
  const $ = cheerio.load(html);
  const events: AcademicEvent[] = [];
  const now = new Date(fetchedAt);
  $(".exam-list li, .examList li, .exam-list-item, .ks_list li, tr").each((_, node) => {
    const item = $(node);
    const text = cleanText(item.text());
    const link = item.find("a[href]").first();
    const title = cleanText(link.attr("title") || item.find(".examName,.exam-name,.overHidden2,.title,h3,h4").first().text() || link.text());
    if (!title || title.length > 160 || !/考试|测验/.test(`${title} ${text}`)) return;
    if (/已完成|已交卷|已结束|已过期/.test(text) && !/未完成|进行中/.test(text)) return;
    const parsed = parseCalendarDate(text, now);
    const parsedTime = parsed.at ? Date.parse(parsed.at) : parsed.on ? Date.parse(`${parsed.on}T23:59:59`) : null;
    if (parsedTime != null && parsedTime < now.getTime() - 3 * 60 * 60_000) return;
    const deadline = /截止|结束/.test(text);
    const href = safeChaoxingUrl(link.attr("href") ?? "", pageUrl) ?? pageUrl;
    const sourceId = href === pageUrl ? `${course.clazzId}:exam:${title}` : href;
    events.push(makeEvent({
      id: `exam_${stableHash(sourceId)}`,
      kind: "exam",
      title,
      summary: `${course.name} · 线上考试`,
      courseName: course.name,
      dueAt: deadline ? parsed.at : undefined,
      dueOn: deadline ? parsed.on : undefined,
      startsAt: deadline ? undefined : parsed.at,
      startsOn: deadline ? undefined : parsed.on,
      status: "线上考试",
      contextLabel: "线上考试",
      sources: [{ provider: "chaoxing", providerLabel: "学习通", sourceId, url: href, raw: { channel: "exam" } }],
      firstSeenAt: fetchedAt,
      updatedAt: fetchedAt,
    }, now));
  });
  return events;
}

function parseActivityPage(html: string, course: ChaoxingCourse, pageUrl: string, fetchedAt: string): AcademicEvent[] {
  const $ = cheerio.load(html);
  const events: AcademicEvent[] = [];
  $("li[activeid]").each((_, node) => {
    const item = $(node);
    if (item.attr("activestatus") && item.attr("activestatus") !== "1") return;
    const title = cleanText(item.find(".right-content p,.overHidden2").first().text());
    if (!title || /签到|投票|选人|抢答/.test(title)) return;
    const remaining = cleanText(item.find(".time").first().text());
    const kind = classifyTitle(title);
    const sourceId = item.attr("activeid") ?? `${course.clazzId}:activity:${title}`;
    events.push(makeEvent({
      id: `${kind}_${stableHash(`activity:${sourceId}`)}`,
      kind,
      title,
      summary: [course.name, remaining].filter(Boolean).join(" · "),
      courseName: course.name,
      status: remaining || "进行中",
      contextLabel: "课程动态",
      sources: [{
        provider: "chaoxing",
        providerLabel: "学习通",
        sourceId: `activity:${sourceId}`,
        url: pageUrl,
        raw: { activeType: item.attr("activetype"), channel: "activity" },
      }],
      firstSeenAt: fetchedAt,
      updatedAt: fetchedAt,
    }));
  });
  return events;
}

function courseQuery(course: ChaoxingCourse): URLSearchParams {
  const query = new URLSearchParams({ courseid: course.courseId, clazzid: course.clazzId, ut: "s" });
  if (course.cpi) query.set("cpi", course.cpi);
  return query;
}

async function fetchCourseEvents(client: SchoolHttpClient, course: ChaoxingCourse, fetchedAt: string) {
  const query = courseQuery(course);
  const workQuery = new URLSearchParams({ courseId: course.courseId, clazzId: course.clazzId, ut: "s" });
  if (course.cpi) workQuery.set("cpi", course.cpi);
  const urls = {
    activity: `https://mobilelearn.chaoxing.com/page/active/stuActiveList?${query}`,
    work: `https://mooc1-api.chaoxing.com/work/stu-work?${workQuery}`,
    exam: `https://mooc1.chaoxing.com/exam-ans/mooc2/exam/exam-list?${query}`,
  };
  const fetchOne = async (kind: keyof typeof urls) => {
    try {
      const page = await client.get(urls[kind], { headers: { Referer: "https://i.chaoxing.com/" } });
      if (isChaoxingLoginPage(page.url, page.body) || /请重新登录/.test(page.body)) throw new ChaoxingReauthError();
      return kind === "activity"
        ? parseActivityPage(page.body, course, urls[kind], fetchedAt)
        : kind === "work"
          ? parseWorkPage(page.body, course, urls[kind], fetchedAt)
          : parseExamPage(page.body, course, urls[kind], fetchedAt);
    } catch (cause) {
      if (cause instanceof ChaoxingReauthError) throw cause;
      return null;
    }
  };
  const [activities, work, exams] = await Promise.all([fetchOne("activity"), fetchOne("work"), fetchOne("exam")]);
  const failed = [activities, work, exams].filter((value) => value === null).length;
  return {
    events: [...(activities ?? []), ...(work ?? []), ...(exams ?? [])],
    warning: failed === 3 ? `${course.name}暂时无法更新` : undefined,
  };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, operation: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      result[current] = await operation(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return result;
}

async function fetchInbox(
  client: SchoolHttpClient,
  officialCourseNames: string[],
  fetchedAt: string,
): Promise<{ events: AcademicEvent[]; warning?: string }> {
  try {
    const home = await client.get(HOME_URL);
    if (isChaoxingLoginPage(home.url, home.body) || /请重新登录/.test(home.body)) throw new ChaoxingReauthError();
    const $ = cheerio.load(home.body);
    const rawUrl = $("[name='收件箱'][dataurl], [dataurl*='/pc/notice/myNotice']").first().attr("dataurl")
      ?? "https://notice.chaoxing.com/pc/notice/myNotice";
    const inboxUrl = safeChaoxingUrl(rawUrl, HOME_URL);
    if (!inboxUrl) return { events: [], warning: "收件箱暂时无法更新" };
    const page = await client.get(inboxUrl, { headers: { Referer: HOME_URL } });
    if (isChaoxingLoginPage(page.url, page.body) || /请重新登录/.test(page.body)) throw new ChaoxingReauthError();
    return { events: parseInboxPage(page.body, inboxUrl, officialCourseNames, fetchedAt) };
  } catch (cause) {
    if (cause instanceof ChaoxingReauthError) throw cause;
    return { events: [], warning: "收件箱暂时无法更新" };
  }
}

function deduplicateChaoxingEvents(events: AcademicEvent[]): AcademicEvent[] {
  const result: AcademicEvent[] = [];
  const identity = (value: string) => value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  for (const event of events) {
    const existing = result.find((candidate) =>
      candidate.kind === event.kind &&
      identity(candidate.title) === identity(event.title) &&
      (
        (!candidate.courseName && !event.courseName) ||
        (candidate.courseName && event.courseName && courseMatches(candidate.courseName, event.courseName))
      ),
    );
    if (!existing) {
      result.push(event);
      continue;
    }
    existing.sources.push(...event.sources.filter((source) =>
      !existing.sources.some((current) => current.sourceId === source.sourceId),
    ));
    existing.sourceUnread = existing.sourceUnread || event.sourceUnread;
    existing.publishedAt = existing.publishedAt ?? event.publishedAt;
    existing.dueAt = existing.dueAt ?? event.dueAt;
    existing.dueOn = existing.dueOn ?? event.dueOn;
    existing.startsAt = existing.startsAt ?? event.startsAt;
    existing.startsOn = existing.startsOn ?? event.startsOn;
    existing.status = existing.status ?? event.status;
    existing.contextLabel = "课程消息";
    existing.priority = Math.max(existing.priority, event.priority);
  }
  return result;
}

export async function getChaoxingAcademicData(
  client: SchoolHttpClient,
  fetchedAt: string,
  officialCourseNames: string[] = [],
): Promise<ChaoxingAcademicData> {
  const response = await client.get(COURSE_API, { headers: { Referer: HOME_URL } });
  if (isChaoxingLoginPage(response.url, response.body)) {
    throw new ChaoxingReauthError("学习通登录已过期");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(response.body);
  } catch {
    throw new Error("学习通课程数据暂时无法读取");
  }
  const root = payload as { result?: number | boolean; status?: boolean; msg?: string };
  if (/重新登录|登录已过期|请先登录/.test(root.msg ?? "")) {
    throw new ChaoxingReauthError("学习通登录已过期");
  }
  if (root.result === 0 || root.status === false) throw new Error("学习通课程数据暂时无法读取");
  const discoveredCourses = findCourses(payload);
  // Without a current official course list we cannot reliably distinguish this
  // semester's courses from historical/public courses. Cached trusted events stay
  // visible in the client; new course-scoped data waits for academic sync.
  const courses = officialCourseNames.length
    ? discoveredCourses.filter((course) => officialCourseNames.some((official) => courseMatches(course.name, official)))
    : [];

  const [inbox, courseResults] = await Promise.all([
    fetchInbox(client, officialCourseNames, fetchedAt),
    mapWithConcurrency(courses, 3, (course) => fetchCourseEvents(client, course, fetchedAt)),
  ]);
  const rawEvents = [
    ...inbox.events,
    ...courseResults.flatMap((result) => result.events),
  ];
  const events = deduplicateChaoxingEvents(rawEvents);
  return {
    courses,
    events,
    warnings: [
      ...(inbox.warning ? [inbox.warning] : []),
      ...courseResults.flatMap((result) => result.warning ? [result.warning] : []),
    ],
    counts: {
      inbox: inbox.events.length,
      activities: rawEvents.filter((event) => event.contextLabel === "课程动态").length,
      assignments: rawEvents.filter((event) => event.kind === "assignment").length,
      onlineExams: rawEvents.filter((event) => event.kind === "exam").length,
    },
  };
}
