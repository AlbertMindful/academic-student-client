import type { Exam } from "@/lib/types";

/** 补考数据更新不稳定，产品暂不展示或参与提醒。 */
export function isMakeupExam(exam: Exam): boolean {
  return /补考/.test(
    `${exam.courseName}${exam.category ?? ""}${exam.status ?? ""}`,
  );
}
