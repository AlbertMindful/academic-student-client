import type { Exam } from "@/lib/types";

/** 只根据学校返回的考试性质或状态识别补考，不结合成绩推测。 */
export function isOfficialMakeupExam(exam: Exam): boolean {
  return /补考/.test(`${exam.category ?? ""}${exam.status ?? ""}`);
}

export function isOfficialSpecialExam(exam: Exam): boolean {
  return /补考|重修|缓考/.test(`${exam.category ?? ""}${exam.status ?? ""}`);
}
