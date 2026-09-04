const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function weekdayCN(date: Date | string): string {
  const d = typeof date === "string" ? parseIsoDate(date) : date;
  return `周${WEEKDAYS[d.getDay()]}`;
}

export function fullDateCN(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekdayCN(d)}`;
}

export function shortDateCN(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatScore(score: number | string): string {
  return typeof score === "number" ? String(score) : String(score);
}

/** 相对考试天数文案。 */
export function examCountdown(iso: string, now = new Date()): {
  text: string;
  tone: "soon" | "upcoming" | "past";
} {
  const target = parseIsoDate(iso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays < 0) return { text: "已结束", tone: "past" };
  if (diffDays === 0) return { text: "今天", tone: "soon" };
  if (diffDays === 1) return { text: "明天", tone: "soon" };
  if (diffDays <= 3) return { text: `${diffDays} 天后`, tone: "soon" };
  return { text: `${diffDays} 天后`, tone: "upcoming" };
}

export function gpaLabel(source: "official" | "computed" | null): string {
  if (source === "official") return "学校官方 GPA";
  if (source === "computed") return "客户端计算 GPA";
  return "GPA";
}
