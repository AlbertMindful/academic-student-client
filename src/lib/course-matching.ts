export function comparableCourseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s《》()（）\[\]【】]/g, "")
    .replace(/(?:课程|及应用|第?\d+期|20\d{2}-20\d{2}-[12]|[一二三四五六七八九十\d]+)$/g, "");
}

/**
 * Deliberately conservative: a Chaoxing course is trusted only when its name
 * clearly maps to a course supplied by the academic system.
 */
export function courseMatches(candidate: string, official: string): boolean {
  const a = comparableCourseName(candidate);
  const b = comparableCourseName(official);
  if (!a || !b) return false;
  return a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)));
}
