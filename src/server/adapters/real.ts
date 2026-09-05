import type {
  CourseSchedule,
  Exam,
  Grade,
  LoginCredentials,
  Semester,
  StudentProfile,
} from "@/lib/types";
import { serverConfig } from "@/server/config";
import { CookieJar } from "@/server/auth/cookie-jar";
import { aesEcbEncryptBase64, randomUuid } from "@/server/auth/aes";
import {
  AcademicError,
  ERROR_MESSAGES,
  type AcademicErrorCode,
} from "@/server/auth/errors";
import { SchoolHttpClient, isLoginRedirect } from "@/server/http";
import {
  buildSemesters,
  extractCurrentSemesterId,
  extractOfficialGpa,
  extractExamQueryForm,
  extractExamSources,
  parseExamsHtml,
  parsePortalExamsHtml,
  parseGradesHtml,
  parseProfileHtml,
  parseScheduleHtml,
  semesterIdToName,
} from "@/server/adapters/jwgl-parsers";
import type { AcademicSystemAdapter } from "@/server/adapters/types";

function looksLikeLoginPage(html: string): boolean {
  return (
    html.includes("/uaa/login_process") ||
    html.includes('name="password"') ||
    html.includes('name="passwd"') ||
    html.includes('name="userAccount"') ||
    html.includes('id="userAccount"') ||
    html.includes("请输入密码") ||
    html.includes("请输入账号")
  );
}

function classifyLoginError(msg: string): AcademicErrorCode {
  const m = msg ?? "";
  if (/频繁|上限|次数|超限|过快|太多|稍后|限制|冻结/.test(m)) return "SMS_LIMIT";
  if (/(验证码|动态码).*(错误|不正确|已过期|失效|有误|无效)|(?:错误|不正确|已过期|失效|有误|无效).*(验证码|动态码)/.test(m)) return "WRONG_CODE";
  if (/滑块|人机|图形验证码/.test(m)) return "CAPTCHA_REQUIRED";
  if (/不存在|无此用户|未注册|未绑定(?:手机|手机号)|手机号.*未绑定/.test(m)) return "ACCOUNT_NOT_FOUND";
  if (/密码|口令/.test(m)) return "WRONG_PASSWORD";
  if (/维护|升级|暂停服务/.test(m)) return "MAINTENANCE";
  if (/扫码|MFA|二次验证/.test(m)) return "MFA_REQUIRED";
  return "INVALID_CREDENTIALS";
}

/** 估算学期起始日期（用于教学周计算）。可被 ACADEMIC_SEMESTER_START_DATE 覆盖。 */
function guessSemesterStart(id: string): string {
  if (serverConfig.semesterStartDate) return serverConfig.semesterStartDate;
  const m = id.match(/^(\d{4})-(\d{4})-(\d)$/);
  if (!m) return "";
  const startYear = Number(m[1]);
  const term = Number(m[3]);
  // 秋季：包含 9 月 1 日那一周的周一；春季：包含次年 3 月 1 日那一周的周一
  const anchor =
    term === 1
      ? new Date(startYear, 8, 1)
      : term === 2
        ? new Date(startYear + 1, 2, 1)
        : null;
  if (!anchor) return "";
  const d = new Date(anchor);
  const day = d.getDay(); // 0=周日
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dayStr = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dayStr}`;
}

/**
 * 真实教务系统适配器。
 *
 * 完整复现官方浏览器登录流程：
 *  jw Logon.do → 302 → SSO /oauth/authorize → 滑块设备码 → AES 加密密码
 *  → POST /uaa/login_process → 携带 code 回跳 jw → 建立 jw 会话。
 *
 * 每个实例绑定独立 CookieJar，学校会话 Cookie 永不暴露给前端。
 */
export class RealAcademicAdapter implements AcademicSystemAdapter {
  private client: SchoolHttpClient;
  private deviceId: string | null = null;
  private deviceCode: string | null = null;

  constructor(private jar: CookieJar) {
    this.client = new SchoolHttpClient(jar);
  }

  /** 建立登录上下文：进入 SSO authorize，取得滑块设备码（复现 initCode）。 */
  private async establishContext(username: string): Promise<void> {
    const {
      ssoBaseUrl,
      jwBaseUrl,
      loginEntryPath,
      ssoDeviceCodePath,
      ssoVerificationPath,
    } = serverConfig;
    await this.client.get(`${jwBaseUrl}${loginEntryPath}?method=logonByCqdzzy`);
    this.deviceId = randomUuid();
    const devicePath = ssoDeviceCodePath.replace(
      "{deviceId}",
      encodeURIComponent(this.deviceId),
    );
    const deviceRes = await this.client.get(
      `${ssoBaseUrl}${devicePath}`,
    );
    this.deviceCode = deviceRes.body.trim();
    // 探测是否需要人机校验（官方前端据此显示滑块）
    await this.client
      .get(`${ssoBaseUrl}${ssoVerificationPath}?userCode=${encodeURIComponent(username)}`)
      .catch(() => undefined);
  }

  /** 解析登录响应并完成回跳；失败抛出分类后的 AcademicError。 */
  private async finishLogin(payload: {
    code?: number | string;
    msg?: string;
    redirectUrl?: string;
  }): Promise<void> {
    const { jwBaseUrl, loginEntryPath } = serverConfig;
    if (String(payload.code) !== "1") {
      const rawMsg = String(payload.msg ?? "").trim();
      const code = classifyLoginError(rawMsg);
      const message =
        code === "INVALID_CREDENTIALS" && rawMsg
          ? rawMsg.slice(0, 60)
          : ERROR_MESSAGES[code];
      throw new AcademicError(code, message);
    }
    const redirectUrl =
      payload.redirectUrl ??
      `${jwBaseUrl}${loginEntryPath}?method=logonByCqdzzy`;
    await this.client.get(redirectUrl);
    try {
      await this.getStudentProfile();
    } catch (e) {
      if (e instanceof AcademicError && e.code === "SESSION_EXPIRED") {
        throw new AcademicError(
          "UNKNOWN_AUTH_FAILURE",
          ERROR_MESSAGES.UNKNOWN_AUTH_FAILURE,
        );
      }
      // 保留已建立会话，忽略主页解析类错误
    }
  }

  async login(credentials: LoginCredentials): Promise<void> {
    const { ssoBaseUrl, ssoAesKey, ssoLoginPath } = serverConfig;
    try {
      await this.establishContext(credentials.username);
      const encryptedPwd = aesEcbEncryptBase64(credentials.password, ssoAesKey);
      const loginRes = await this.client.post(`${ssoBaseUrl}${ssoLoginPath}`, {
        username: credentials.username,
        password: encryptedPwd,
        type: "1",
        deviceId: this.deviceId ?? "",
        imgCode: this.deviceCode ?? "",
        key: ssoAesKey,
      });
      let payload;
      try {
        payload = JSON.parse(loginRes.body);
      } catch {
        throw new AcademicError(
          "UNKNOWN_AUTH_FAILURE",
          ERROR_MESSAGES.UNKNOWN_AUTH_FAILURE,
        );
      }
      await this.finishLogin(payload);
    } catch (e) {
      if (e instanceof AcademicError) throw e;
      throw new AcademicError("NETWORK_ERROR", ERROR_MESSAGES.NETWORK_ERROR);
    }
  }

  async prepareSmsLogin(
    username: string,
    captchaWidth: number,
  ): Promise<{ cooldown: number }> {
    const { ssoBaseUrl, ssoSmsSendPath } = serverConfig;
    try {
      await this.establishContext(username);
      const sendRes = await this.client.post(`${ssoBaseUrl}${ssoSmsSendPath}`, {
        userCode: username,
        code: String(captchaWidth),
      });
      let payload: {
        code?: number | string;
        msg?: string;
        intervalTime?: number;
      };
      try {
        payload = JSON.parse(sendRes.body);
      } catch {
        throw new AcademicError(
          "SMS_SEND_FAILED",
          ERROR_MESSAGES.SMS_SEND_FAILED,
        );
      }
      if (String(payload.code) !== "1") {
        const rawMsg = String(payload.msg ?? "").trim();
        const classified = classifyLoginError(rawMsg);
        const code =
          classified === "INVALID_CREDENTIALS"
            ? "SMS_SEND_FAILED"
            : classified;
        // 未识别时直接透传学校短提示（更友好），否则用映射文案
        const message =
          classified === "INVALID_CREDENTIALS" && rawMsg
            ? rawMsg.slice(0, 60)
            : ERROR_MESSAGES[code];
        throw new AcademicError(code, message);
      }
      return { cooldown: payload.intervalTime ?? 60 };
    } catch (e) {
      if (e instanceof AcademicError) throw e;
      throw new AcademicError("SMS_SEND_FAILED", ERROR_MESSAGES.SMS_SEND_FAILED);
    }
  }

  async completeSmsLogin(username: string, code: string): Promise<void> {
    const { ssoBaseUrl, ssoLoginPath } = serverConfig;
    try {
      const loginRes = await this.client.post(`${ssoBaseUrl}${ssoLoginPath}`, {
        loginUserCode: username,
        code,
        deviceId: this.deviceId ?? "",
        imgCode: this.deviceCode ?? "",
        type: "2",
      });
      let payload;
      try {
        payload = JSON.parse(loginRes.body);
      } catch {
        throw new AcademicError(
          "UNKNOWN_AUTH_FAILURE",
          ERROR_MESSAGES.UNKNOWN_AUTH_FAILURE,
        );
      }
      await this.finishLogin(payload);
    } catch (e) {
      if (e instanceof AcademicError) throw e;
      throw new AcademicError("NETWORK_ERROR", ERROR_MESSAGES.NETWORK_ERROR);
    }
  }

  async logout(): Promise<void> {
    try {
      await this.client.get(`${serverConfig.jwBaseUrl}${serverConfig.jwgl.logout}`);
    } catch {
      // 忽略登出请求失败，本地会话仍会被删除
    }
    this.jar.clear();
  }

  private async fetchPage(path: string): Promise<{ body: string; url: string }> {
    const res = await this.client.get(`${serverConfig.jwBaseUrl}${path}`);
    if (isLoginRedirect(res.url) || looksLikeLoginPage(res.body)) {
      throw new AcademicError("SESSION_EXPIRED", ERROR_MESSAGES.SESSION_EXPIRED);
    }
    return { body: res.body, url: res.url };
  }

  async getStudentProfile(): Promise<StudentProfile> {
    // 优先个人信息页；失败回退学生主框架
    let html = "";
    try {
      html = (await this.fetchPage(serverConfig.jwgl.profile)).body;
    } catch {
      html = (await this.fetchPage(serverConfig.jwgl.studentMain)).body;
    }
    const parsed = parseProfileHtml(html);
    if (!parsed.name && !parsed.studentId) {
      throw new AcademicError("DATA_PARSE_ERROR", ERROR_MESSAGES.DATA_PARSE_ERROR);
    }
    return {
      studentId: parsed.studentId ?? "-",
      name: parsed.name ?? "同学",
      college: parsed.college,
      major: parsed.major,
      className: parsed.className,
      grade: parsed.grade,
      educationLevel: parsed.educationLevel,
    };
  }

  async getSemesters(): Promise<Semester[]> {
    const html = (await this.fetchPage(serverConfig.jwgl.studentMain)).body;
    const currentId = extractCurrentSemesterId(html);
    const semesters = buildSemesters(currentId);
    if (semesters[0]) {
      semesters[0].startDate = guessSemesterStart(semesters[0].id);
    }
    return semesters;
  }

  async getSchedule(semesterId: string): Promise<CourseSchedule[]> {
    const html = (
      await this.fetchPage(
        `${serverConfig.jwgl.schedule}?xnxq01id=${encodeURIComponent(semesterId)}`,
      )
    ).body;
    return parseScheduleHtml(html, semesterId);
  }

  private officialGpa: number | null = null;

  async getGrades(semesterId?: string): Promise<Grade[]> {
    // 成绩页默认返回全部学期成绩，一次抓取后按学期过滤
    const html = (await this.fetchPage(serverConfig.jwgl.grades)).body;
    const gpa = extractOfficialGpa(html);
    if (gpa != null) this.officialGpa = gpa;
    const all = parseGradesHtml(html);
    if (!semesterId) return all;
    return all.filter((g) => g.semesterId === semesterId);
  }

  async getExams(semesterId?: string): Promise<Exam[]> {
    let id = semesterId;
    if (!id) {
      const sems = await this.getSemesters();
      id = (sems.find((s) => s.isCurrent) ?? sems[0])?.id;
    }
    if (!id) return [];

    const semester = encodeURIComponent(id);
    let portalHtml = "";
    try {
      portalHtml = (await this.fetchPage(serverConfig.jwgl.studentMainView)).body;
    } catch {
      // 门户页不可用时继续使用考试列表页。
    }

    const candidates: Array<{ path: string; category?: string }> = [
      ...extractExamSources(portalHtml),
      { path: `${serverConfig.jwgl.examQuery}?Ves632DSdyV=NEW_XSD_KSBM&xnxq01id=${semester}` },
      { path: `${serverConfig.jwgl.exams}?xnxq01id=${semester}` },
      { path: `/xsks/xsksap_query?Ves632DSdyV=NEW_XSD_KSBM&xnxq01id=${semester}` },
      { path: `/xsks/xsksap_list?xnxq01id=${semester}` },
    ];
    const trace: Array<Record<string, string | number | boolean>> = [];
    const found: Exam[] = portalHtml
      ? parsePortalExamsHtml(portalHtml, id, semesterIdToName(id))
      : [];
    for (const source of candidates) {
      try {
        const res = await this.client.get(`${serverConfig.jwBaseUrl}${source.path}`);
        if (looksLikeLoginPage(res.body) || /非法访问|错误提示|404/.test(res.body)) {
          trace.push({ source: source.path.split("?")[0], status: res.status, rejected: true });
          continue;
        }
        const portalExams = parsePortalExamsHtml(res.body, id, semesterIdToName(id));
        const parsed = portalExams.length
          ? portalExams
          : parseExamsHtml(res.body, id, semesterIdToName(id));
        const queryForm = extractExamQueryForm(res.body, id);
        trace.push({
          source: source.path.split("?")[0],
          status: res.status,
          parsed: parsed.length,
          form: Boolean(queryForm),
          formFields: queryForm
            ? Object.entries(queryForm.fields)
                .map(([name, value]) => `${name}:${value === id ? "semester" : value ? "set" : "empty"}`)
                .join(",")
            : "",
        });
        found.push(...parsed.map((exam) => ({
          ...exam,
          category: exam.category || source.category,
        })));

        // 查询页本身通常没有结果，浏览器需要再点击一次“查询”。读取该页的
        // 原始表单并按相同方式提交，避免依赖易变的厂商字段名。
        if (queryForm) {
          const actionUrl = new URL(queryForm.action || res.url, res.url);
          if (actionUrl.origin !== new URL(serverConfig.jwBaseUrl).origin) continue;
          let queryRes;
          if (queryForm.method === "POST") {
            queryRes = await this.client.post(actionUrl.toString(), queryForm.fields, {
              headers: { Referer: res.url },
            });
          } else {
            for (const [key, value] of Object.entries(queryForm.fields)) {
              actionUrl.searchParams.set(key, value);
            }
            queryRes = await this.client.get(actionUrl.toString(), {
              headers: { Referer: res.url },
            });
          }
          if (!looksLikeLoginPage(queryRes.body) && !/非法访问|错误提示|404/.test(queryRes.body)) {
            const queried = parseExamsHtml(queryRes.body, id, semesterIdToName(id));
            trace.push({
              query: actionUrl.pathname,
              method: queryForm.method,
              status: queryRes.status,
              parsed: queried.length,
            });
            found.push(...queried.map((exam) => ({
              ...exam,
              category: exam.category || source.category,
            })));
          }
        }
      } catch {
        trace.push({ source: source.path.split("?")[0], failed: true });
        continue;
      }
    }
    const exams = [...new Map(found.map((exam) => [
      `${exam.courseName}|${exam.date}|${exam.startTime ?? ""}|${exam.location}|${exam.category ?? ""}`,
      exam,
    ])).values()];
    if (exams.length === 0) {
      // 仅记录请求阶段和数量，绝不记录学生信息、Cookie 或教务页面内容。
      console.warn("[academic-exams] no rows", JSON.stringify({ semester: id, trace }));
    }
    return exams;
  }

  async getOfficialGpa(): Promise<number | null> {
    if (this.officialGpa == null) {
      await this.getGrades().catch(() => undefined);
    }
    return this.officialGpa;
  }
}
