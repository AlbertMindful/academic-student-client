/**
 * Shared domain models.
 *
 * These are the canonical shapes the UI consumes. The real adapter is
 * responsible for mapping vendor-specific fields (e.g. `kcmc`, `jsxm`,
 * `jxcdmc`) onto these, so the frontend never depends on school raw fields.
 */

export interface StudentProfile {
  /** 学号 */
  studentId: string;
  /** 姓名 */
  name: string;
  /** 学院 */
  college?: string;
  /** 专业 */
  major?: string;
  /** 班级 */
  className?: string;
  /** 年级，如 2023 */
  grade?: string;
  /** 培养层次，如 本科 */
  educationLevel?: string;
}

export interface Semester {
  /** 稳定标识，如 "2024-2025-1" */
  id: string;
  /** 展示名，如 "2024-2025学年第一学期" */
  name: string;
  /** 学年，如 "2024-2025" */
  year: string;
  /** 学期序号：1 上 / 2 下 / 3 暑期 */
  term: 1 | 2 | 3;
  /** 学期开始日期（ISO yyyy-MM-dd） */
  startDate: string;
  /** 学期结束日期（ISO yyyy-MM-dd） */
  endDate: string;
  isCurrent: boolean;
}

export interface CourseSession {
  /** 星期几，1=周一 … 7=周日 */
  dayOfWeek: number;
  /** 起始节次 */
  startSection: number;
  /** 结束节次 */
  endSection: number;
  /** 开始时间 HH:mm */
  startTime: string;
  /** 结束时间 HH:mm */
  endTime: string;
  /** 单双周约束 */
  weekType: "all" | "odd" | "even";
  /** 上课地点 */
  location: string;
}

export interface CourseSchedule {
  id: string;
  /** 课程名 */
  courseName: string;
  /** 课程代码 */
  courseCode?: string;
  /** 任课教师 */
  teacher: string;
  /** 周次描述，如 "1-16周" / "1-8,10-16周" */
  weeks: string;
  /** 具体周次列表 */
  weekNumbers: number[];
  /** 上课时间段（一门课可能有多个时段） */
  sessions: CourseSession[];
  credit?: number;
  semesterId: string;
}

export interface Grade {
  id: string;
  courseName: string;
  courseCode?: string;
  /** 学分 */
  credit: number;
  /** 成绩（分数或等级，如 90 / "优"） */
  score: number | string;
  /** 绩点（仅当学校提供时） */
  gradePoint?: number;
  semesterId: string;
  semesterName: string;
  /** 课程性质：必修 / 选修 / 公共基础 … */
  category?: string;
  /** 考核方式 */
  examType?: string;
  /** 成绩记录类型，如正常考试 / 重修 */
  resultType?: string;
  /** 学校单独返回的重修成绩 */
  retakeScore?: number | string;
}

export interface Exam {
  id: string;
  courseName: string;
  /** 考试日期 ISO yyyy-MM-dd */
  date: string;
  startTime?: string;
  endTime?: string;
  /** 考场 */
  location: string;
  /** 座位号 */
  seatNumber?: string;
  /** 考试性质，如期末考试 / 重修考试 */
  category?: string;
  /** 学校返回的安排状态 */
  status?: string;
  semesterId: string;
  semesterName: string;
}

export interface GpaSummary {
  /** GPA 数值；未知时为 null */
  value: number | null;
  /** GPA 来源 */
  source: "official" | "computed" | null;
  /** 当前成绩记录包含的学分合计 */
  totalCredits: number;
}

export interface TeachingWeek {
  /** 当前教学周（从 1 开始） */
  current: number;
  /** 学期起始日期 */
  startDate: string;
  /** 学期结束日期 */
  endDate: string;
}

export interface NextClass {
  course: CourseSchedule;
  session: CourseSession;
  /** 开课时间 */
  startAt: string;
  /** 距离开课的描述 */
  countdownText: string;
}

export interface DashboardData {
  profile: StudentProfile;
  currentSemester: Semester | null;
  teachingWeek: TeachingWeek | null;
  nextClass: NextClass | null;
  todayClasses: CourseSchedule[];
  upcomingExams: Exam[];
  gpa: GpaSummary;
}

export type AcademicEventKind =
  | "class"
  | "schedule_change"
  | "assignment"
  | "exam"
  | "grade"
  | "notice"
  | "material";

export type AcademicSourceId = "academic" | "chaoxing";

export interface AcademicEventSource {
  provider: AcademicSourceId;
  providerLabel: string;
  sourceId: string;
  url?: string;
  raw?: unknown;
}

/** A real-world academic item after provider normalization and cautious merging. */
export interface AcademicEvent {
  id: string;
  kind: AcademicEventKind;
  title: string;
  summary?: string;
  courseName?: string;
  startsAt?: string;
  endsAt?: string;
  dueAt?: string;
  /** Calendar date when the provider did not supply a reliable time. */
  startsOn?: string;
  dueOn?: string;
  location?: string;
  status?: string;
  semesterId?: string;
  sources: AcademicEventSource[];
  firstSeenAt: string;
  updatedAt: string;
  priority: number;
  merge?: {
    strategy: "exact" | "similar" | "manual";
    confidence: number;
    reason: string;
  };
  conflicts?: Array<{
    field: "time" | "date" | "location" | "status";
    academicValue?: string;
    otherValue?: string;
    resolution: "academic_preferred";
  }>;
}

export interface AcademicEventState {
  read: boolean;
  done: boolean;
  ignored: boolean;
  pinned: boolean;
  updatedAt: string;
}

export type ProviderHealthStatus =
  | "ok"
  | "degraded"
  | "reauth_required"
  | "not_connected";

export interface ProviderHealth {
  provider: AcademicSourceId;
  label: string;
  status: ProviderHealthStatus;
  lastAttemptAt: string;
  lastSuccessAt?: string;
  message?: string;
}

export interface AcademicSyncPayload {
  profile?: StudentProfile;
  currentSemester: Semester | null;
  teachingWeek: TeachingWeek | null;
  /** Current courses confirmed by the academic system. */
  officialCourseNames?: string[];
  events: AcademicEvent[];
  providers: ProviderHealth[];
  syncedAt: string;
  diagnostics: {
    counts: Record<string, number>;
    warnings: string[];
  };
}

/** 登录凭证（仅在认证模块内部流转） */
export interface LoginCredentials {
  username: string;
  password: string;
}
