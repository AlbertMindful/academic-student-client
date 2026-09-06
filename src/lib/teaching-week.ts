import { chinaDateKey } from "@/lib/china-time";

/**
 * Teaching-week calculation.
 *
 * 教学周从学期开始那周的周一开始，计为第 1 周。这里使用“ISO 周一”作为
 * 一周的起点，避免因学校设置差异引入的不确定性。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 返回某日期所在周的周一（本地时区，ISO 周一为一周首日）。 */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function parseDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * 计算当前教学周。
 * @param semesterStart 学期开始日期（ISO yyyy-MM-dd）
 * @param now 当前时间
 * @returns 1-based 教学周；学期开始前返回 1，超出后按周数继续累加
 */
export function computeTeachingWeek(semesterStart: string, now: Date): number {
  const start = startOfWeek(parseDate(semesterStart));
  const current = startOfWeek(parseDate(chinaDateKey(now)));
  const diff = Math.floor((current.getTime() - start.getTime()) / (7 * DAY_MS));
  return Math.max(1, diff + 1);
}

/** 教学周区间描述 */
export function teachingWeekLabel(week: number): string {
  return `第 ${week} 周`;
}

export function formatToday(now: Date): string {
  const weekdays = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ];
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}年${m}月${d}日 ${weekdays[now.getDay()]}`;
}

/** 将 Date 转为 HH:mm */
export function toHHmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}
