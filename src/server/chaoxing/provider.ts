import * as cheerio from "cheerio";
import type { AcademicEvent, AcademicEventKind } from "@/lib/types";
import { scoreAcademicEvent } from "@/lib/academic-events";
import { courseMatches } from "@/lib/course-matching";
import { chinaDateTime } from "@/lib/china-time";
import type { SchoolHttpClient } from "@/server/http";

const COURSE_API = "https://mooc1-api.chaoxing.com/mycourse/backclazzdata?rss=1&view=json";
const HOME_URL = "https://i.chaoxing.com/base";
const UNIFIED_WORK_URL = "https://mooc1-api.chaoxing.com/mooc-ans/mooc2/work/all-task";
const UNIFIED_EXAM_URL = "https://mooc1-2.chaoxing.com/exam-ans/exam/test/examcode/examlist";

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

function cleanMessageContent(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const $ = cheerio.load(`<div id="academic-message-root">${raw}</div>`);
  const root = $("#academic-message-root");
  root.find("script,style,noscript,svg,button").remove();
  root.find("br").replaceWith("\n");
  root.find("p,li,blockquote,div").each((_, node) => { $(node).prepend("\n").append("\n"); });
  const text = root.text()
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!text || /^(?:null|undefined)$/i.test(text)) return undefined;
  return text.slice(0, 6000);
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
  const local = chinaDateTime(date, match[4]);
  return Number.isNaN(local.getTime()) ? { on: date } : { at: local.toISOString() };
}

function parseTaskDeadline(text: string, now: Date): { at?: string; on?: string } {
  const calendar = parseCalendarDate(text, now);
  if (calendar.at || calendar.on) return calendar;
  const relative = text.match(/(?:剩余|还有)\s*(?:(\d+)\s*天)?\s*(?:(\d+)\s*(?:小时|时))?\s*(?:(\d+)\s*分(?:钟)?)?/);
  if (!relative || !relative.slice(1).some(Boolean)) return {};
  const milliseconds = Number(relative[1] ?? 0) * 86_400_000
    + Number(relative[2] ?? 0) * 3_600_000
    + Number(relative[3] ?? 0) * 60_000;
  return milliseconds > 0 ? { at: new Date(now.getTime() + milliseconds).toISOString() } : {};
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

interface InboxFields {
  sourceId: string;
  title: string;
  publishedText?: string;
  publishedAt?: string;
  sender?: string;
  unread?: boolean;
  url?: string;
  content?: string;
}

function inboxEventFromFields(
  fields: InboxFields,
  pageUrl: string,
  officialCourseNames: string[],
  fetchedAt: string,
): AcademicEvent | null {
  const now = new Date(fetchedAt);
  const title = cleanText(fields.title);
  if (!title || /评价任务|评学问卷|满意度调查/.test(title)) return null;
  const published = parseCalendarDate(cleanText(fields.publishedText ?? ""), now);
  const publishedAt = fields.publishedAt ?? published.at ?? (published.on ? chinaDateTime(published.on, "12:00").toISOString() : undefined);
  const ageDays = publishedAt ? (now.getTime() - new Date(publishedAt).getTime()) / 86_400_000 : 0;
  const highSignal = /考试|测验|作业|提交|截止|调课|停课|教室|资料|课件|成绩/.test(title);
  if (ageDays > 45 || (ageDays > 14 && !highSignal)) return null;

  const extractedCourse = courseFromTitle(title);
  const officialCourse = extractedCourse
    ? officialCourseNames.find((name) => courseMatches(extractedCourse, name))
    : undefined;
  if (extractedCourse && officialCourseNames.length && !officialCourse) return null;

  const sender = cleanText(fields.sender ?? "") || undefined;
  const content = cleanMessageContent(fields.content);
  const kind = classifyTitle(title);
  const eventTitle = kind === "notice" || kind === "material" ? title : title.replace(/^作业[:：]\s*/, "");
  return makeEvent({
    id: `${kind}_${stableHash(`inbox:${fields.sourceId}`)}`,
    kind,
    title: eventTitle,
    summary: content ?? [officialCourse, sender ? `来自 ${sender}` : "", "收件箱"].filter(Boolean).join(" · "),
    courseName: officialCourse,
    publishedAt,
    sender,
    sourceUnread: fields.unread,
    contextLabel: "收件箱",
    sources: [{
      provider: "chaoxing",
      providerLabel: "学习通",
      sourceId: `inbox:${fields.sourceId}`,
      url: safeChaoxingUrl(fields.url ?? "", pageUrl) ?? HOME_URL,
      raw: { sender, publishedAt, channel: "inbox", contentAvailable: Boolean(content) },
    }],
    firstSeenAt: fetchedAt,
    updatedAt: publishedAt ?? fetchedAt,
  }, now);
}

function parseInboxPage(
  html: string,
  pageUrl: string,
  officialCourseNames: string[],
  fetchedAt: string,
): AcademicEvent[] {
  const $ = cheerio.load(html);
  const events: AcademicEvent[] = [];
  $("li.dataBody_item").slice(0, 40).each((_, node) => {
    const item = $(node);
    const title = cleanText(item.find(".notice_title").first().text());
    const event = inboxEventFromFields({
      sourceId: item.attr("data-id") ?? item.find(".dataBody_check").attr("data-id") ?? item.attr("id") ?? title,
      title,
      publishedText: item.find(".notice_time").first().text(),
      sender: item.find(".receiverName").first().text(),
      unread: item.find(".redDot").filter((_, dot) => $(dot).css("opacity") !== "0").length > 0,
      url: item.find(".openNotice").first().attr("data-url"),
      content: item.find(".notice_content,.notice-content,.notice_summary,.notice-summary").first().html() ?? undefined,
    }, pageUrl, officialCourseNames, fetchedAt);
    if (event) events.push(event);
  });
  return events;
}

function parseInboxApi(payload: unknown, pageUrl: string, officialCourseNames: string[], fetchedAt: string): AcademicEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const notices = root.notices && typeof root.notices === "object" ? root.notices as Record<string, unknown> : {};
  const records = [root.topNotices, root.urgentUnreadList, notices.list]
    .flatMap((value) => Array.isArray(value) ? value : [])
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    .slice(0, 40);
  const events: AcademicEvent[] = [];
  for (const item of records) {
    const sourceId = stringValue(item.idCode ?? item.uuid ?? item.id);
    const title = stringValue(item.title);
    if (!sourceId || !title) continue;
    const rawTime = item.insertTime;
    const numericTime = typeof rawTime === "number" || /^\d{10,13}$/.test(stringValue(rawTime)) ? Number(rawTime) : null;
    const publishedAt = numericTime && Number.isFinite(numericTime)
      ? new Date(numericTime < 1e12 ? numericTime * 1000 : numericTime).toISOString()
      : undefined;
    const detailPath = `/pc/notice/${stringValue(item.uuid ?? item.idCode)}/detail?sendTag=${encodeURIComponent(stringValue(item.sendTag))}`;
    const event = inboxEventFromFields({
      sourceId,
      title,
      publishedText: publishedAt ? undefined : stringValue(rawTime),
      publishedAt,
      sender: stringValue(item.createrName),
      unread: Number(item.isread) === 0 && Number(item.redDot) === 0,
      url: stringValue(item.sourceUrl) || detailPath,
      content: stringValue(item.content ?? item.contentText ?? item.contentTxt ?? item.noticeContent ?? item.summary ?? item.abstract),
    }, pageUrl, officialCourseNames, fetchedAt);
    if (event && !events.some((current) => current.id === event.id)) events.push(event);
  }
  return events;
}

function parseInboxDetail(html: string, title: string): string | undefined {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg,header,footer,nav,.header,.footer,.toolbar,.operation,.operate").remove();
  const selectors = [
    "#noticeContent",
    ".noticeContent",
    ".notice-content",
    ".notice_content",
    ".notice-detail-content",
    ".notice_detail_content",
    ".detail-content",
    ".detail_content",
    ".article-content",
    ".article_content",
    ".message-content",
    ".msg-content",
    "textarea[name*='content']",
  ];
  for (const selector of selectors) {
    for (const node of $(selector).toArray()) {
      const element = $(node);
      const content = cleanMessageContent(element.is("textarea") ? element.val() : element.html());
      if (content && content !== title && content.length >= 2) return content;
    }
  }
  return undefined;
}

async function hydrateInboxDetails(
  client: SchoolHttpClient,
  events: AcademicEvent[],
  inboxUrl: string,
): Promise<AcademicEvent[]> {
  return mapWithConcurrency(events, 4, async (event) => {
    const source = event.sources.find((item) => item.provider === "chaoxing");
    const raw = source?.raw && typeof source.raw === "object" ? source.raw as Record<string, unknown> : {};
    if (raw.contentAvailable || !source?.url) return event;
    try {
      const detail = await client.get(source.url, { headers: { Referer: inboxUrl } });
      if (isChaoxingLoginPage(detail.url, detail.body)) throw new ChaoxingReauthError();
      const content = parseInboxDetail(detail.body, event.title);
      if (!content) return event;
      return {
        ...event,
        summary: content,
        sources: event.sources.map((item) => item === source
          ? { ...item, raw: { ...raw, contentAvailable: true } }
          : item),
      };
    } catch (cause) {
      if (cause instanceof ChaoxingReauthError) throw cause;
      return event;
    }
  });
}

function courseForTask(
  label: string,
  rawUrl: string,
  courses: ChaoxingCourse[],
  officialCourseNames: string[],
  baseUrl = HOME_URL,
): string | undefined {
  const normalized = cleanText(label)
    .replace(/^(?:课程|来自课程)\s*[:：]?\s*/, "")
    .replace(/^《+|》+$/g, "");
  const byName = normalized
    ? officialCourseNames.find((name) => courseMatches(normalized, name))
    : undefined;
  if (byName) return byName;
  try {
    const url = new URL(rawUrl, baseUrl);
    const decoded = decodeURIComponent(url.searchParams.get("refer") ?? rawUrl);
    const courseId = url.searchParams.get("courseId") ?? url.searchParams.get("courseid") ?? url.searchParams.get("moocId")
      ?? decoded.match(/[?&]courseId=(\d+)/i)?.[1];
    const matched = courses.find((course) => course.courseId === courseId);
    if (matched) return officialCourseNames.find((name) => courseMatches(matched.name, name));
  } catch { /* malformed task URL */ }
  return undefined;
}

function parseGlobalWorkPage(
  html: string,
  courses: ChaoxingCourse[],
  officialCourseNames: string[],
  fetchedAt: string,
): AcademicEvent[] {
  const $ = cheerio.load(html);
  const now = new Date(fetchedAt);
  const events: AcademicEvent[] = [];
  $("li[data][onclick*='goTask'], ul.nav > li[data]").each((_, node) => {
    const item = $(node);
    const option = item.find("div[role='option']").first();
    const content = option.length ? option : item;
    const title = cleanText(content.find("p").first().text());
    const statusElement = content.find("span").filter((_, element) => /未提交|未交|待提交|进行中|待批阅|已完成|已截止|已结束/.test(cleanText($(element).text()))).first();
    const status = cleanText(statusElement.text());
    const courseLabel = cleanText(content.find("span").filter((_, element) => /《.+》/.test(cleanText($(element).text()))).last().text());
    const remaining = cleanText(content.find(".fr").first().text());
    const rawUrl = item.attr("data") ?? content.attr("data") ?? content.find("a[href]").first().attr("href") ?? "";
    const courseName = courseForTask(courseLabel, rawUrl, courses, officialCourseNames, UNIFIED_WORK_URL);
    if (!title || !courseName) return;
    if (!/未提交|未交|未完成|待提交|进行中/.test(status) || /已提交|已完成|待批阅|已截止|已结束/.test(status)) return;
    const deadline = parseTaskDeadline(`${remaining} ${content.text()}`, now);
    const url = safeChaoxingUrl(rawUrl, UNIFIED_WORK_URL) ?? UNIFIED_WORK_URL;
    const sourceId = rawUrl || `${courseName}:${title}`;
    events.push(makeEvent({
      id: `assignment_${stableHash(`global-work:${sourceId}`)}`,
      kind: "assignment",
      title,
      summary: [courseName, status || "未完成", remaining].filter(Boolean).join(" · "),
      courseName,
      dueAt: deadline.at,
      dueOn: deadline.on,
      status: status || "未完成",
      contextLabel: "课程作业",
      sources: [{ provider: "chaoxing", providerLabel: "学习通", sourceId: `work:${sourceId}`, url, raw: { channel: "work", status, remaining } }],
      firstSeenAt: fetchedAt,
      updatedAt: fetchedAt,
    }, now));
  });
  return events;
}

function parseGlobalExamPage(
  html: string,
  courses: ChaoxingCourse[],
  officialCourseNames: string[],
  fetchedAt: string,
): AcademicEvent[] {
  const $ = cheerio.load(html);
  const now = new Date(fetchedAt);
  const events: AcademicEvent[] = [];
  $("table tr.dataTr, table.dataTable tr").each((_, node) => {
    const item = $(node);
    const cells = item.find("td");
    if (cells.length < 6) return;
    const title = cleanText(cells.eq(1).text());
    const timing = cleanText(cells.eq(2).text());
    const examStatus = cleanText(cells.eq(4).text());
    const answerStatus = cleanText(cells.eq(5).text());
    const action = cells.eq(8).find("a").first();
    const onclick = action.attr("onclick") ?? "";
    const rawUrl = onclick.match(/go\(['"]([^'"]+)/)?.[1] ?? "";
    const status = [examStatus, answerStatus].filter(Boolean).join(" · ");
    const expired = /已结束|已过期|已关闭/.test(examStatus);
    const finished = /已完成|待批阅|已交卷|已提交/.test(answerStatus);
    const courseName = courseForTask(courseFromTitle(title) ?? "", rawUrl, courses, officialCourseNames, UNIFIED_EXAM_URL);
    if (!title || !courseName || expired || finished) return;
    const deadline = parseTaskDeadline(`${timing} ${item.text()}`, now);
    if (deadline.at && new Date(deadline.at).getTime() < now.getTime()) return;
    const url = safeChaoxingUrl(rawUrl, UNIFIED_EXAM_URL) ?? UNIFIED_EXAM_URL;
    const sourceId = rawUrl || `${courseName}:${title}`;
    events.push(makeEvent({
      id: `exam_${stableHash(`global-exam:${sourceId}`)}`,
      kind: "exam",
      title,
      summary: [courseName, status || "待完成", timing].filter(Boolean).join(" · "),
      courseName,
      dueAt: deadline.at,
      dueOn: deadline.on,
      status: status || "待完成",
      contextLabel: "线上考试",
      sources: [{ provider: "chaoxing", providerLabel: "学习通", sourceId: `exam:${sourceId}`, url, raw: { channel: "exam", status, timing } }],
      firstSeenAt: fetchedAt,
      updatedAt: fetchedAt,
    }, now));
  });
  return events;
}

function parseWorkDetailDeadline(html: string, fetchedAt: string): { at?: string; on?: string } {
  const $ = cheerio.load(html);
  const text = cleanText($("body").text());
  const range = text.match(/(?:作答时间|截止时间|提交时间)\s*[:：]?\s*((?:20\d{2}[-/.年])?\d{1,2}[-/.月]\d{1,2}(?:日)?\s+\d{1,2}:\d{2})\s*(?:至|到|—|-)\s*((?:20\d{2}[-/.年])?\d{1,2}[-/.月]\d{1,2}(?:日)?\s+\d{1,2}:\d{2})/);
  return parseTaskDeadline(range?.[2] ?? text, new Date(fetchedAt));
}

async function hydrateWorkDeadlines(
  client: SchoolHttpClient,
  events: AcademicEvent[],
  fetchedAt: string,
): Promise<AcademicEvent[]> {
  const now = new Date(fetchedAt);
  const hydrated = await mapWithConcurrency(events, 4, async (event) => {
    const source = event.sources[0];
    if (!source?.url || event.dueAt || event.dueOn) return event;
    try {
      const detail = await client.get(source.url, { headers: { Referer: UNIFIED_WORK_URL } });
      if (isChaoxingLoginPage(detail.url, detail.body)) throw new ChaoxingReauthError();
      const deadline = parseWorkDetailDeadline(detail.body, fetchedAt);
      return { ...event, dueAt: deadline.at, dueOn: deadline.on, priority: scoreAcademicEvent({ ...event, dueAt: deadline.at, dueOn: deadline.on }, now) };
    } catch (cause) {
      if (cause instanceof ChaoxingReauthError) throw cause;
      return event;
    }
  });
  return hydrated.filter((event) => !event.dueAt || new Date(event.dueAt).getTime() >= now.getTime());
}

function discoverUnifiedUrls(homeHtml: string): { work: string; exam: string } {
  const $ = cheerio.load(homeHtml);
  const find = (selector: string, fallback: string) => {
    const raw = $(selector).first().attr("dataurl") ?? $(selector).first().attr("href") ?? fallback;
    return safeChaoxingUrl(raw, HOME_URL) ?? fallback;
  };
  return {
    work: find("[name='作业'][dataurl], [name='我的作业'][dataurl], [dataurl*='/mooc-ans/mooc2/work/all-task'], [href*='/mooc-ans/mooc2/work/all-task']", UNIFIED_WORK_URL),
    exam: find("[name='考试'][dataurl], [name='考试列表'][dataurl], [name='在线考试'][dataurl], [dataurl*='/exam/test/examcode/examlist'], [href*='/exam/test/examcode/examlist']", UNIFIED_EXAM_URL),
  };
}

async function fetchUnifiedTasks(
  client: SchoolHttpClient,
  courses: ChaoxingCourse[],
  officialCourseNames: string[],
  fetchedAt: string,
): Promise<{ events: AcademicEvent[]; warnings: string[] }> {
  const home = await client.get(HOME_URL);
  if (isChaoxingLoginPage(home.url, home.body) || /请重新登录/.test(home.body)) throw new ChaoxingReauthError();
  const urls = discoverUnifiedUrls(home.body);
  const fetchOne = async (kind: "work" | "exam") => {
    const url = urls[kind];
    try {
      const page = await client.get(url, { headers: { Referer: HOME_URL } });
      if (isChaoxingLoginPage(page.url, page.body) || /请重新登录/.test(page.body)) throw new ChaoxingReauthError();
      const events = kind === "work"
        ? parseGlobalWorkPage(page.body, courses, officialCourseNames, fetchedAt)
        : parseGlobalExamPage(page.body, courses, officialCourseNames, fetchedAt);
      return kind === "work" ? hydrateWorkDeadlines(client, events, fetchedAt) : events;
    } catch (cause) {
      if (cause instanceof ChaoxingReauthError) throw cause;
      return null;
    }
  };
  const [work, exams] = await Promise.all([fetchOne("work"), fetchOne("exam")]);
  return {
    events: [...(work ?? []), ...(exams ?? [])],
    warnings: [
      ...(work === null ? ["作业暂时无法更新"] : []),
      ...(exams === null ? ["线上考试暂时无法更新"] : []),
    ],
  };
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
  const urls = {
    activity: `https://mobilelearn.chaoxing.com/page/active/stuActiveList?${query}`,
  };
  const fetchOne = async (kind: keyof typeof urls) => {
    try {
      const page = await client.get(urls[kind], { headers: { Referer: "https://i.chaoxing.com/" } });
      if (isChaoxingLoginPage(page.url, page.body) || /请重新登录/.test(page.body)) throw new ChaoxingReauthError();
      return parseActivityPage(page.body, course, urls[kind], fetchedAt);
    } catch (cause) {
      if (cause instanceof ChaoxingReauthError) throw cause;
      return null;
    }
  };
  const activities = await fetchOne("activity");
  return {
    events: activities ?? [],
    warning: activities === null ? `${course.name}暂时无法更新` : undefined,
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
    const renderedEvents = parseInboxPage(page.body, inboxUrl, officialCourseNames, fetchedAt);
    if (renderedEvents.length) return { events: await hydrateInboxDetails(client, renderedEvents, inboxUrl) };

    // The current inbox returns an HTML shell and fills its list through a
    // read-only JSON request. A server-side fetch does not execute that script.
    const apiUrl = new URL("/pc/notice/getNoticeList", inboxUrl).toString();
    const result = await client.post(apiUrl, {
      type: "", notice_type: "", lastValue: "", sort: "", folderUUID: "", kw: "",
      startTime: "", endTime: "", gKw: "", gName: "", year: "", tag: "",
      fidsCode: "", queryFolderNoticePrevYear: "0", filterSenderPuids: "", filterTags: "",
    }, { headers: { Referer: inboxUrl, "X-Requested-With": "XMLHttpRequest" } });
    if (isChaoxingLoginPage(result.url, result.body)) throw new ChaoxingReauthError();
    let payload: unknown;
    try { payload = JSON.parse(result.body); } catch { return { events: [], warning: "收件箱暂时无法更新" }; }
    const events = parseInboxApi(payload, inboxUrl, officialCourseNames, fetchedAt);
    return { events: await hydrateInboxDetails(client, events, inboxUrl) };
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

  const [inbox, globalTasks, courseResults] = await Promise.all([
    fetchInbox(client, officialCourseNames, fetchedAt),
    fetchUnifiedTasks(client, discoveredCourses, officialCourseNames, fetchedAt),
    mapWithConcurrency(courses, 3, (course) => fetchCourseEvents(client, course, fetchedAt)),
  ]);
  const rawEvents = [
    ...inbox.events,
    ...globalTasks.events,
    ...courseResults.flatMap((result) => result.events),
  ];
  const events = deduplicateChaoxingEvents(rawEvents);
  return {
    courses,
    events,
    warnings: [
      ...(inbox.warning ? [inbox.warning] : []),
      ...globalTasks.warnings,
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
