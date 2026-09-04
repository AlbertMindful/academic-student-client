/**
 * 强智（Sinosoft）jwgl 学生端 HTML → 领域模型 解析器。
 *
 * 学校返回的原始字段（kcmc/jsxm/jxcdmc/zcd/jcs 等）只在这里出现，
 * 统一转换为前端领域模型。解析逻辑基于真实抓取的页面结构。
 */
import * as cheerio from "cheerio";
import type {
  CourseSchedule,
  CourseSession,
  Exam,
  Grade,
  Semester,
  StudentProfile,
} from "@/lib/types";
import { periodEnd, periodStart } from "@/lib/periods";
import { parseWeeks } from "@/lib/schedule";
import { AcademicError } from "@/server/auth/errors";

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// 节次/周次/学期
// ---------------------------------------------------------------------------

/** 将行标签（"第1,2节"/"1-2节"/"第一大节"/"晚上"）解析为 [起始节, 结束节]。 */
export function parseSectionRange(label: string): [number, number] {
  const t = label.replace(/\s/g, "");
  const big: Record<string, [number, number]> = {
    第一: [1, 2],
    第二: [3, 4],
    第三: [5, 6],
    第四: [7, 8],
    第五: [9, 10],
    晚上: [9, 10],
    早: [1, 2],
    上午: [1, 4],
    下午: [5, 8],
  };
  for (const [k, v] of Object.entries(big)) {
    if (t.includes(k)) return v;
  }
  const nums = (t.match(/\d+/g) ?? []).map(Number);
  if (nums.length === 0) return [1, 1];
  if (nums.length === 1) return [nums[0], nums[0]];
  return [Math.min(nums[0], nums[1]), Math.max(nums[0], nums[1])];
}

export function parseSemesterId(raw: string): string {
  const m = raw.match(/(\d{4}-\d{4}-\d)/);
  return m ? m[1] : raw.trim();
}

export function semesterIdToName(id: string): string {
  const m = id.match(/^(\d{4})-(\d{4})-(\d)$/);
  if (!m) return id;
  const [, a, b, term] = m;
  const termName = term === "1" ? "第一学期" : term === "2" ? "第二学期" : "暑期学期";
  return `${a}-${b}学年${termName}`;
}

export function derivePreviousSemesters(
  id: string,
  count = 3,
): Array<{ id: string; name: string }> {
  const m = id.match(/^(\d{4})-(\d{4})-(\d)$/);
  if (!m) return [];
  let [, a, b, term] = m.map(Number);
  const out: Array<{ id: string; name: string }> = [];
  for (let i = 0; i < count; i++) {
    if (term === 1) {
      a -= 1;
      b -= 1;
      term = 2;
    } else if (term === 2) {
      term = 1;
    } else {
      term = 2;
    }
    const idStr = `${a}-${b}-${term}`;
    out.push({ id: idStr, name: semesterIdToName(idStr) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 学生信息（学籍卡片）
// ---------------------------------------------------------------------------

export function parseProfileHtml(html: string): Partial<StudentProfile> {
  const $ = cheerio.load(html);
  const cells = $("td, th")
    .toArray()
    .map((el) => clean($(el).text()))
    .filter(Boolean);
  const text = cells.join(" ");

  const pick = (patterns: RegExp[]): string | undefined => {
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1] && m[1].trim()) return m[1].trim();
    }
    return undefined;
  };

  const profile: Partial<StudentProfile> = {};
  profile.studentId = pick([
    /学号[：:]\s*([A-Za-z0-9]+)/,
    /学号\s+([A-Za-z0-9]{6,20})/,
  ]);
  profile.name = pick([/姓名(?!拼音)[：:]?\s*([\u4e00-\u9fa5·]{2,6})/]);
  profile.college = pick([
    /院系[：:]\s*(.*?)(?=\s*(?:专业|学制|班级|学号)[：:])/,
    /院系[：:]\s*(.*)$/,
    /学院[：:]\s*(.*?)(?=\s*(?:专业|学制|班级|学号)[：:])/,
  ]);
  profile.major = pick([
    /专业(?!方向)[：:]\s*(.*?)(?=\s*(?:学制|班级|学号)[：:])/,
    /专业(?!方向)[：:]\s*(.*)$/,
  ]);
  profile.className = pick([
    /班级[：:]\s*(.*?)(?=\s*(?:学号|学制)[：:])/,
    /班级[：:]\s*(.*)$/,
  ]);
  profile.educationLevel = pick([
    /学习层次\s*[：:]?\s*([\u4e00-\u9fa5]+)/,
    /层次\s*[：:]?\s*([\u4e00-\u9fa5]+)/,
  ]);
  return profile;
}

/** 从学生主页/主框架提取当前学年学期 id。 */
export function extractCurrentSemesterId(html: string): string | null {
  const patterns = [
    /xnxq01id\s*=\s*["']([0-9]{4}-[0-9]{4}-[0-9])["']/,
    /xnxqdm\s*=\s*["']([0-9]{4}-[0-9]{4}-[0-9])["']/,
    /value=["']([0-9]{4}-[0-9]{4}-[0-9])["']\s*selected/,
    /"xnxq01id"\s*:\s*"([0-9]{4}-[0-9]{4}-[0-9])"/,
    /([0-9]{4}-[0-9]{4}-[0-9])\s*学年/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

// ---------------------------------------------------------------------------
// 课表
// ---------------------------------------------------------------------------

interface ScheduleSeed {
  courseName: string;
  teacher: string;
  location: string;
  weeksText: string;
  dayOfWeek: number;
  startSection: number;
  endSection: number;
  startTime: string;
  endTime: string;
}

export function parseScheduleHtml(
  html: string,
  semesterId: string,
): CourseSchedule[] {
  const $ = cheerio.load(html);
  const table = $("table").first();
  if (!table.length) {
    throw new AcademicError("DATA_PARSE_ERROR", "未找到课表数据。");
  }

  const seeds: ScheduleSeed[] = [];

  for (const tr of table.find("tr").toArray()) {
    const tds = $(tr).find("td, th").toArray();
    if (tds.length < 8) continue;

    const firstText = clean($(tds[0]).text());
    const secMatch = firstText.match(/(\d+(?:,\d+)*)\s*节/);
    if (!secMatch) continue; // 表头行（星期一…星期日）

    const nums = secMatch[1].split(",").map(Number);
    const startSection = Math.min(...nums);
    const endSection = Math.max(...nums);
    const timeMatch = firstText.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    const startTime = timeMatch?.[1] ?? periodStart(startSection);
    const endTime = timeMatch?.[2] ?? periodEnd(endSection);

    for (let col = 1; col <= 7; col++) {
      const dayOfWeek = col;
      const cell = $(tds[col]);
      cell.find("div.kbcontent").each((_, el) => {
        const div = $(el);
        const teacher = clean(div.find("font[title='老师']").text());
        const weeksSections = clean(
          div.find("font[title='周次(节次)']").text(),
        );
        const location = clean(div.find("font[title='教室']").text());

        // 课程名 = 第一个文本节点（<br> 之前）
        let courseName = "";
        div.contents().each((_, node) => {
          if (!courseName && node.type === "text") {
            courseName = clean((node as unknown as { data?: string }).data ?? "");
          }
        });
        if (!courseName) return;

        const weeksText = weeksSections.replace(/\[.*?\]/g, "").trim();
        seeds.push({
          courseName,
          teacher,
          location,
          weeksText: weeksText || "1-16周",
          dayOfWeek,
          startSection,
          endSection,
          startTime,
          endTime,
        });
      });
    }
  }

  return aggregateSchedule(seeds, semesterId);
}

function aggregateSchedule(
  seeds: ScheduleSeed[],
  semesterId: string,
): CourseSchedule[] {
  const map = new Map<string, CourseSchedule>();
  for (const seed of seeds) {
    const key = `${semesterId}|${seed.courseName}|${seed.teacher}`;
    let course = map.get(key);
    if (!course) {
      const { weekNumbers } = parseWeeks(seed.weeksText);
      course = {
        id: key,
        courseName: seed.courseName,
        teacher: seed.teacher,
        weeks: seed.weeksText,
        weekNumbers,
        semesterId,
        sessions: [],
      };
      map.set(key, course);
    }
    const { weekType } = parseWeeks(seed.weeksText);
    const session: CourseSession = {
      dayOfWeek: seed.dayOfWeek,
      startSection: seed.startSection,
      endSection: seed.endSection,
      startTime: seed.startTime,
      endTime: seed.endTime,
      weekType,
      location: seed.location,
    };
    course.sessions.push(session);
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// 成绩
// ---------------------------------------------------------------------------

/** 提取学校官方平均学分绩点。 */
export function extractOfficialGpa(html: string): number | null {
  const m = html.match(/平均学分绩点[：:]\s*([\d.]+)/);
  if (m) {
    const v = parseFloat(m[1]);
    return Number.isNaN(v) ? null : v;
  }
  return null;
}

export function parseGradesHtml(html: string): Grade[] {
  const $ = cheerio.load(html);
  const rows = $("tr").toArray();

  const col: Record<string, number> = {};
  for (const tr of rows) {
    const ths = $(tr).find("th, td").toArray().map((el) => clean($(el).text()));
    if (ths.includes("课程名称") || ths.includes("课程名")) {
      ths.forEach((h, i) => {
        if (h === "课程名称" || h === "课程名") col.course = i;
        else if (h === "课程编号" || h === "课程代码") col.code = i;
        else if (h === "开课学期") col.semester = i;
        else if (h === "成绩") col.score = i;
        else if (h === "学分") col.credit = i;
        else if (h === "绩点") col.gradePoint = i;
        else if (h === "考核方式") col.examType = i;
        else if (h === "课程性质") col.category = i;
      });
      break;
    }
  }

  const grades: Grade[] = [];
  for (const tr of rows) {
    const tds = $(tr).find("td").toArray().map((el) => clean($(el).text()));
    if (tds.length < 8) continue;
    const courseName = col.course != null ? tds[col.course] : tds[0];
    if (!courseName || courseName === "课程名称") continue;

    const rowSemesterId =
      col.semester != null && tds[col.semester]
        ? tds[col.semester]
        : "";
    const scoreRaw = col.score != null ? tds[col.score] : "";
    const creditRaw = col.credit != null ? parseFloat(tds[col.credit]) : NaN;
    const gpRaw = col.gradePoint != null ? parseFloat(tds[col.gradePoint]) : NaN;
    const scoreNum = parseFloat(scoreRaw);

    grades.push({
      id: `${rowSemesterId}|${courseName}`,
      courseName,
      courseCode: col.code != null ? tds[col.code] : undefined,
      credit: Number.isNaN(creditRaw) ? 0 : creditRaw,
      score: Number.isNaN(scoreNum) ? (scoreRaw || "-") : scoreNum,
      gradePoint: Number.isNaN(gpRaw) ? undefined : gpRaw,
      semesterId: rowSemesterId,
      semesterName: semesterIdToName(rowSemesterId),
      category: col.category != null ? tds[col.category] : undefined,
      examType: col.examType != null ? tds[col.examType] : undefined,
    });
  }
  return grades;
}

// ---------------------------------------------------------------------------
// 考试安排
// ---------------------------------------------------------------------------

export function parseExamsHtml(
  html: string,
  semesterId: string,
  semesterName: string,
): Exam[] {
  const $ = cheerio.load(html);
  const rows = $("tr").toArray();
  let colMap: Record<string, number> = {};
  for (const tr of rows) {
    const ths = $(tr).find("th, td").toArray().map((el) => clean($(el).text()));
    if (ths.some((t) => /课程|考试/.test(t))) {
      colMap = {};
      ths.forEach((h, i) => {
        if (/课程名称|课程|科目/.test(h) && !/代码/.test(h)) colMap.course = i;
        if (/日期|时间/.test(h) && /日期/.test(h)) colMap.date = i;
        if (/时间|时段/.test(h) && !/日期/.test(h)) colMap.time = i;
        if (/地点|考场|教室/.test(h)) colMap.location = i;
        if (/座位/.test(h)) colMap.seat = i;
      });
      break;
    }
  }

  const exams: Exam[] = [];
  for (const tr of rows) {
    const tds = $(tr).find("td").toArray().map((el) => clean($(el).text()));
    if (tds.length === 0) continue;
    const courseName = colMap.course != null ? tds[colMap.course] : tds[0];
    if (!courseName || /课程|名称/.test(courseName)) continue;

    const dateRaw = colMap.date != null ? tds[colMap.date] : "";
    const timeRaw = colMap.time != null ? tds[colMap.time] : "";
    const dateMatch = dateRaw.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
    const date = dateMatch
      ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(
          dateMatch[3],
        ).padStart(2, "0")}`
      : dateRaw;

    let startTime: string | undefined;
    let endTime: string | undefined;
    const timeMatch = timeRaw.match(/(\d{1,2}:\d{2})[^\d]*[-~至]?[^\d]*(\d{1,2}:\d{2})?/);
    if (timeMatch) {
      startTime = timeMatch[1];
      if (timeMatch[2]) endTime = timeMatch[2];
    }

    exams.push({
      id: `${semesterId}|${courseName}|${date}`,
      courseName,
      date,
      startTime,
      endTime,
      location: colMap.location != null ? tds[colMap.location] : "",
      seatNumber: colMap.seat != null ? tds[colMap.seat] : undefined,
      semesterId,
      semesterName,
    });
  }
  return exams;
}

/** 从校历页提取当前教学周。 */
export function extractTeachingWeek(html: string): number | null {
  const patterns = [
    /第\s*(\d+)\s*周[^<]{0,30}(?:当前|本周)/,
    /(?:当前|本周)[^<]{0,30}第\s*(\d+)\s*周/,
    /当前教学周[：:]\s*(\d+)/,
    /本周[：:]\s*第?\s*(\d+)/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      const v = parseInt(m[1], 10);
      if (!Number.isNaN(v)) return v;
    }
  }
  return null;
}

/** 汇总为学期列表（含派生历史学期）。 */
export function buildSemesters(currentId: string | null): Semester[] {
  const out: Semester[] = [];
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();

  if (currentId) {
    out.push({
      id: currentId,
      name: semesterIdToName(currentId),
      year: currentId.slice(0, 9),
      term: (Number(currentId.slice(-1)) as 1 | 2 | 3) || 1,
      startDate: "",
      endDate: "",
      isCurrent: true,
    });
  } else {
    const yearLabel =
      nowMonth >= 7 ? `${nowYear}-${nowYear + 1}` : `${nowYear - 1}-${nowYear}`;
    const term = nowMonth >= 7 || nowMonth === 0 ? 1 : 2;
    const id = `${yearLabel}-${term}`;
    out.push({
      id,
      name: semesterIdToName(id),
      year: yearLabel,
      term: term as 1 | 2 | 3,
      startDate: "",
      endDate: "",
      isCurrent: true,
    });
  }

  const currentIdForDerive = currentId ?? out[0].id;
  for (const p of derivePreviousSemesters(currentIdForDerive, 4)) {
    out.push({
      id: p.id,
      name: p.name,
      year: p.id.slice(0, 9),
      term: (Number(p.id.slice(-1)) as 1 | 2 | 3) || 1,
      startDate: "",
      endDate: "",
      isCurrent: false,
    });
  }
  return out;
}
