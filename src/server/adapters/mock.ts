import type {
  CourseSchedule,
  CourseSession,
  Exam,
  Grade,
  LoginCredentials,
  Semester,
  StudentProfile,
} from "@/lib/types";
import { periodEnd, periodStart } from "@/lib/periods";
import { startOfWeek } from "@/lib/teaching-week";
import type { AcademicSystemAdapter } from "@/server/adapters/types";
import { AcademicError } from "@/server/auth/errors";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function currentYearLabel(now: Date): string {
  const y = now.getFullYear();
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function currentTerm(now: Date): 1 | 2 | 3 {
  const m = now.getMonth();
  if (m >= 7 || m === 0) return 1;
  return 2;
}

function semesterName(yearLabel: string, term: 1 | 2 | 3): string {
  const t = term === 1 ? "第一学期" : term === 2 ? "第二学期" : "暑期学期";
  return `${yearLabel}学年${t}`;
}

function prevSemester(
  yearLabel: string,
  term: 1 | 2 | 3,
): { yearLabel: string; term: 1 | 2 | 3 } {
  const [a, b] = yearLabel.split("-").map(Number);
  if (term === 1) return { yearLabel: `${a - 1}-${a}`, term: 2 };
  if (term === 2) return { yearLabel: `${a}-${b}`, term: 1 };
  return { yearLabel, term: 2 };
}

interface MockState {
  profile: StudentProfile;
  semesters: Semester[];
  schedule: CourseSchedule[];
  grades: Grade[];
  exams: Exam[];
}

let cached: MockState | null = null;
let cachedWeek = -1;

function buildState(): MockState {
  const now = new Date();
  const anchor = startOfWeek(now); // 本周周一 → 恒为第 1 教学周
  const nowWeek = now.getTime();

  // 避免同一周内重复生成导致日期抖动
  if (cached && cachedWeek === anchor.getTime()) return cached;

  const yearLabel = currentYearLabel(now);
  const term = currentTerm(now);
  const curId = `${yearLabel}-${term}`;
  const curName = semesterName(yearLabel, term);

  const semesters: Semester[] = [
    {
      id: curId,
      name: curName,
      year: yearLabel,
      term,
      startDate: iso(anchor),
      endDate: iso(new Date(anchor.getTime() + 20 * WEEK_MS - 1)),
      isCurrent: true,
    },
  ];
  let prev = { yearLabel, term };
  for (let i = 0; i < 2; i++) {
    prev = prevSemester(prev.yearLabel, prev.term);
    semesters.push({
      id: `${prev.yearLabel}-${prev.term}`,
      name: semesterName(prev.yearLabel, prev.term),
      year: prev.yearLabel,
      term: prev.term,
      startDate: iso(new Date(anchor.getTime() - (i + 1) * 20 * WEEK_MS)),
      endDate: iso(new Date(anchor.getTime() - i * 20 * WEEK_MS - 1)),
      isCurrent: false,
    });
  }

  const profile: StudentProfile = {
    studentId: "2024010101",
    name: "张明",
    college: "计算机与软件学院",
    major: "计算机科学与技术",
    className: "计算机2401班",
    grade: "2024",
    educationLevel: "本科",
  };

  const mk = (
    dayOfWeek: number,
    startSection: number,
    endSection: number,
    weekType: "all" | "odd" | "even" = "all",
    location: string,
  ): CourseSession => ({
    dayOfWeek,
    startSection,
    endSection,
    startTime: periodStart(startSection),
    endTime: periodEnd(endSection),
    weekType,
    location,
  });

  const range = (a: number, b: number) =>
    Array.from({ length: b - a + 1 }, (_, i) => a + i);

  const schedule: CourseSchedule[] = [
    {
      id: `${curId}-ds`,
      courseName: "数据结构",
      courseCode: "CS2102",
      teacher: "陈志远",
      weeks: "1-16周",
      weekNumbers: range(1, 16),
      credit: 4,
      semesterId: curId,
      sessions: [
        mk(1, 1, 2, "all", "博远楼 203"),
        mk(3, 3, 4, "all", "博远楼 203"),
      ],
    },
    {
      id: `${curId}-cn`,
      courseName: "计算机网络",
      courseCode: "CS2104",
      teacher: "刘思敏",
      weeks: "1-16周",
      weekNumbers: range(1, 16),
      credit: 3.5,
      semesterId: curId,
      sessions: [
        mk(2, 3, 4, "all", "知行楼 305"),
        mk(5, 1, 2, "all", "知行楼 305"),
      ],
    },
    {
      id: `${curId}-os`,
      courseName: "操作系统",
      courseCode: "CS2201",
      teacher: "王建国",
      weeks: "1-16周",
      weekNumbers: range(1, 16),
      credit: 4,
      semesterId: curId,
      sessions: [
        mk(2, 5, 6, "all", "格物楼 412"),
        mk(4, 7, 8, "all", "格物楼 412"),
      ],
    },
    {
      id: `${curId}-db`,
      courseName: "数据库原理",
      courseCode: "CS2103",
      teacher: "赵丽华",
      weeks: "1-16周(单)",
      weekNumbers: range(1, 16),
      credit: 3.5,
      semesterId: curId,
      sessions: [mk(4, 1, 2, "odd", "博远楼 301")],
    },
    {
      id: `${curId}-eng`,
      courseName: "大学英语（四）",
      courseCode: "EN2104",
      teacher: "周雪",
      weeks: "1-16周",
      weekNumbers: range(1, 16),
      credit: 2,
      semesterId: curId,
      sessions: [mk(3, 1, 2, "all", "文渊楼 108")],
    },
    {
      id: `${curId}-pe`,
      courseName: "羽毛球",
      courseCode: "PE2008",
      teacher: "孙教练",
      weeks: "1-16周",
      weekNumbers: range(1, 16),
      credit: 1,
      semesterId: curId,
      sessions: [mk(5, 5, 6, "all", "体育馆")],
    },
    {
      id: `${curId}-marx`,
      courseName: "马克思主义基本原理",
      courseCode: "MY2101",
      teacher: "吴建国",
      weeks: "9-16周",
      weekNumbers: range(9, 16),
      credit: 3,
      semesterId: curId,
      sessions: [mk(3, 7, 8, "all", "明德楼 201")],
    },
    {
      id: `${curId}-situ`,
      courseName: "形势与政策",
      courseCode: "MY2001",
      teacher: "郑洁",
      weeks: "1-8周(双)",
      weekNumbers: range(1, 8),
      credit: 0.5,
      semesterId: curId,
      sessions: [mk(1, 9, 10, "even", "明德楼 101")],
    },
  ];

  const prev1 = semesters[1];
  const prev2 = semesters[2];

  const grade = (
    semester: Semester,
    courseName: string,
    credit: number,
    score: number,
    gradePoint: number,
    category: string,
  ): Grade => ({
    id: `${semester.id}-${courseName}`,
    courseName,
    credit,
    score,
    gradePoint,
    semesterId: semester.id,
    semesterName: semester.name,
    category,
    examType: "考试",
  });

  const grades: Grade[] = [
    grade(prev1, "高等数学（下）", 5, 91, 4.0, "公共基础"),
    grade(prev1, "大学物理", 3.5, 86, 3.7, "公共基础"),
    grade(prev1, "程序设计基础（C语言）", 4, 88, 3.7, "学科基础"),
    grade(prev1, "大学英语（三）", 2, 82, 3.3, "公共基础"),
    grade(prev1, "线性代数", 3, 78, 3.0, "公共基础"),
    grade(prev1, "思想道德与法治", 2, 90, 4.0, "公共基础"),
    grade(prev2, "高等数学（上）", 5, 89, 3.7, "公共基础"),
    grade(prev2, "大学英语（二）", 2, 85, 3.7, "公共基础"),
    grade(prev2, "大学体育（一）", 1, 92, 4.0, "公共基础"),
    grade(prev2, "计算机导论", 2, 80, 3.0, "学科基础"),
  ];

  const exam = (
    semester: Semester,
    courseName: string,
    date: string,
    startTime: string,
    endTime: string,
    location: string,
    seat: string,
  ): Exam => ({
    id: `${semester.id}-${courseName}-${date}`,
    courseName,
    date,
    startTime,
    endTime,
    location,
    seatNumber: seat,
    semesterId: semester.id,
    semesterName: semester.name,
  });

  const fmt = (d: Date) => iso(d);
  const exams: Exam[] = [
    // 即将到来的考试（当前学期）
    exam(
      semesters[0],
      "数据结构",
      fmt(new Date(nowWeek + 3 * DAY_MS)),
      "09:00",
      "11:00",
      "博远楼 203",
      "12",
    ),
    exam(
      semesters[0],
      "计算机网络",
      fmt(new Date(nowWeek + 10 * DAY_MS)),
      "14:00",
      "16:00",
      "知行楼 305",
      "05",
    ),
    exam(
      semesters[0],
      "操作系统",
      fmt(new Date(nowWeek + 17 * DAY_MS)),
      "09:00",
      "11:00",
      "格物楼 412",
      "23",
    ),
    // 历史考试
    exam(
      prev1,
      "高等数学（下）",
      fmt(new Date(nowWeek - 8 * WEEK_MS + 5 * DAY_MS)),
      "09:00",
      "11:00",
      "明德楼 301",
      "08",
    ),
    exam(
      prev1,
      "程序设计基础（C语言）",
      fmt(new Date(nowWeek - 8 * WEEK_MS + 12 * DAY_MS)),
      "14:00",
      "16:00",
      "格物楼 205",
      "16",
    ),
  ];

  cached = { profile, semesters, schedule, grades, exams };
  cachedWeek = anchor.getTime();
  return cached;
}

export class MockAcademicAdapter implements AcademicSystemAdapter {
  async login(credentials: LoginCredentials): Promise<void> {
    if (!credentials.username || !credentials.password) {
      throw new AcademicError("INVALID_CREDENTIALS", "请输入账号和密码。");
    }
    // mock 模式：任意非空凭证即可登录（仅供前端开发）。
  }

  async prepareSmsLogin(
    username: string,
    captchaWidth: number,
  ): Promise<{ cooldown: number }> {
    if (!username) {
      throw new AcademicError("INVALID_CREDENTIALS", "请输入账号。");
    }
    if (!captchaWidth || captchaWidth <= 0) {
      throw new AcademicError("CAPTCHA_REQUIRED", "请先完成人机校验。");
    }
    // mock 模式：模拟发送成功
    return { cooldown: 60 };
  }

  async completeSmsLogin(username: string, code: string): Promise<void> {
    if (!username || !code) {
      throw new AcademicError("INVALID_CREDENTIALS", "请输入账号和验证码。");
    }
    // mock 模式：任意非空验证码即可登录
  }

  async logout(): Promise<void> {
    // 无操作
  }

  async getStudentProfile(): Promise<StudentProfile> {
    return buildState().profile;
  }

  async getSemesters(): Promise<Semester[]> {
    return buildState().semesters;
  }

  async getSchedule(semesterId: string): Promise<CourseSchedule[]> {
    return buildState().schedule.filter((c) => c.semesterId === semesterId);
  }

  async getGrades(semesterId?: string): Promise<Grade[]> {
    const all = buildState().grades;
    if (!semesterId) return all;
    return all.filter((g) => g.semesterId === semesterId);
  }

  async getExams(semesterId?: string): Promise<Exam[]> {
    const all = buildState().exams;
    if (!semesterId) return all;
    return all.filter((e) => e.semesterId === semesterId);
  }

  async getOfficialGpa(): Promise<number | null> {
    return 3.52;
  }
}
