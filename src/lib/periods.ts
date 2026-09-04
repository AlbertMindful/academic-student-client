/**
 * Standard class-period time mapping (节次 → 起止时间).
 *
 * The school timetable only exposes section numbers (第 N 节), so we map
 * them to clock times locally for the "next class" countdown. If your school
 * uses a different timetable, adjust this single table.
 */
export interface Period {
  section: number;
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

export const PERIODS: Period[] = [
  { section: 1, start: "08:00", end: "08:45" },
  { section: 2, start: "08:55", end: "09:40" },
  { section: 3, start: "10:00", end: "10:45" },
  { section: 4, start: "10:55", end: "11:40" },
  { section: 5, start: "14:00", end: "14:45" },
  { section: 6, start: "14:55", end: "15:40" },
  { section: 7, start: "16:00", end: "16:45" },
  { section: 8, start: "16:55", end: "17:40" },
  { section: 9, start: "19:00", end: "19:45" },
  { section: 10, start: "19:55", end: "20:40" },
  { section: 11, start: "20:50", end: "21:35" },
];

export function periodStart(section: number): string {
  return PERIODS.find((p) => p.section === section)?.start ?? "08:00";
}

export function periodEnd(section: number): string {
  return PERIODS.find((p) => p.section === section)?.end ?? "08:45";
}

export function periodRange(startSection: number, endSection: number): string {
  const s = periodStart(startSection);
  const e = periodEnd(endSection);
  return `${s}-${e}`;
}
