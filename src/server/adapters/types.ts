import type {
  CourseSchedule,
  Exam,
  Grade,
  LoginCredentials,
  Semester,
  StudentProfile,
} from "@/lib/types";

/**
 * 教务系统适配器接口。
 *
 * 学校原始字段（kcmc/jsxm/jxcdmc 等）只能存在于 adapter 内部，统一
 * 转换为前端领域模型后返回，前端绝不依赖学校原始字段。
 *
 * 每个登录会话持有自己的 adapter 实例（绑定独立 CookieJar）。
 */
export interface AcademicSystemAdapter {
  /** 使用账号密码完成官方登录流程；失败时抛出 AcademicError。 */
  login(credentials: LoginCredentials): Promise<void>;

  /**
   * 短信验证码登录第一步：建立会话上下文并触发学校发送验证码。
   * captchaWidth 为滑块校验结果（复现官方人机校验）。失败抛出 AcademicError。
   */
  prepareSmsLogin?(
    username: string,
    captchaWidth: number,
  ): Promise<{ cooldown: number }>;

  /**
   * 短信验证码登录第二步：提交验证码完成登录。必须在 prepareSmsLogin 之后调用。
   */
  completeSmsLogin?(username: string, code: string): Promise<void>;

  /** 调用学校 logout（若存在），并清理本适配器会话。 */
  logout(): Promise<void>;

  getStudentProfile(): Promise<StudentProfile>;
  getSemesters(): Promise<Semester[]>;
  getSchedule(semesterId: string): Promise<CourseSchedule[]>;
  getGrades(semesterId?: string): Promise<Grade[]>;
  getExams(semesterId?: string): Promise<Exam[]>;

  /** 可选：学校官方 GPA（若有）。缺省返回 null。 */
  getOfficialGpa?(): Promise<number | null>;
}
