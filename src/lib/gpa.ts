import type { GpaSummary, Grade } from "@/lib/types";

/** 判断某成绩是否及格（用于统计已修学分）。 */
export function isPassed(score: number | string): boolean {
  if (typeof score === "number") return score >= 60;
  const s = String(score).trim();
  if (/^(优|良|中|合格|及格|通过|P|A|B|C)$/i.test(s)) return true;
  if (/^(不合格|不及格|不通过|缺考|缓考|旷考|F|D)$/i.test(s)) return false;
  // 无法判断的按未通过处理，避免高估学分
  return false;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 计算 GPA 摘要。
 *
 * - 若学校提供官方 GPA，则直接采用并标记为 "official"。
 * - 否则，若每门课带有学校给出的绩点（gradePoint），按学分加权平均计算，
 *   标记为 "computed"（仅汇总学校已给的绩点，不猜测绩点换算规则）。
 * - 两者皆无时，value 为 null，前端明确标注“未知”。
 */
export function computeGpa(
  grades: Grade[],
  official: number | null,
): GpaSummary {
  let earnedCredits = 0;
  let totalCredits = 0;
  for (const g of grades) {
    const credit = typeof g.credit === "number" ? g.credit : 0;
    totalCredits += credit;
    if (isPassed(g.score)) earnedCredits += credit;
  }
  totalCredits = round2(totalCredits);
  earnedCredits = round2(earnedCredits);

  if (official != null) {
    return {
      value: round2(official),
      source: "official",
      earnedCredits,
      totalCredits,
    };
  }

  const scored = grades.filter(
    (g) => typeof g.gradePoint === "number" && typeof g.credit === "number",
  );
  if (scored.length > 0) {
    const creditSum = scored.reduce((s, g) => s + (g.credit as number), 0);
    if (creditSum > 0) {
      const weighted = scored.reduce(
        (s, g) => s + (g.credit as number) * (g.gradePoint as number),
        0,
      );
      return {
        value: round2(weighted / creditSum),
        source: "computed",
        earnedCredits,
        totalCredits,
      };
    }
  }

  return { value: null, source: null, earnedCredits, totalCredits };
}
