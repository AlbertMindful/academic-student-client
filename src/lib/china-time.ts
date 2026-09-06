const CHINA_TIME_ZONE = "Asia/Shanghai";

export function chinaDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function chinaDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+08:00`);
}

export function chinaDayOfWeek(date: Date): number {
  const day = new Date(`${chinaDateKey(date)}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}
