/**
 * Server-side configuration, sourced from environment variables.
 * Defaults are chosen to be safe for local development.
 */

export type DataSource = "mock" | "real";

function readDataSource(): DataSource {
  const v = process.env.ACADEMIC_DATA_SOURCE;
  if (v === "real") return "real";
  return "mock";
}

export const serverConfig = {
  dataSource: readDataSource(),

  /** 我方会话 Cookie 名（httpOnly，浏览器拿不到值） */
  sessionCookieName: "academic_session",

  /** 会话空闲过期时间（毫秒），默认保持 30 天。 */
  sessionTtlMs: Number(process.env.ACADEMIC_SESSION_TTL_MS ?? 30 * 24 * 60 * 60 * 1000),

  /** 用于加密持久化会话；生产环境必须配置独立随机值。 */
  sessionSecret: process.env.ACADEMIC_SESSION_SECRET ?? "",

  /** 生产环境才启用 Secure Cookie */
  isProduction: process.env.NODE_ENV === "production",

  /** 会话 Cookie 是否加 Secure 标记（本地 HTTP 应为 false，HTTPS 部署设 true） */
  cookieSecure: process.env.ACADEMIC_COOKIE_SECURE === "true",

  /** 教务系统（jw）基础地址 */
  jwBaseUrl: process.env.ACADEMIC_JW_BASE_URL ?? "https://jw.cquet.edu.cn",

  /** 统一身份认证（SSO）基础地址 */
  ssoBaseUrl: process.env.ACADEMIC_SSO_BASE_URL ?? "https://sso.cquet.edu.cn",

  /** SSO 密码登录接口路径 */
  ssoLoginPath: process.env.ACADEMIC_SSO_LOGIN_PATH ?? "/uaa/login_process",

  /** SSO 短信验证码发送接口路径 */
  ssoSmsSendPath:
    process.env.ACADEMIC_SSO_SMS_SEND_PATH ?? "/oauthv2/sms/getCodeByUser",

  /** SSO 滑块设备码接口路径模板 */
  ssoDeviceCodePath:
    process.env.ACADEMIC_SSO_DEVICE_CODE_PATH ?? "/validata/deviceCode/{deviceId}",

  /** SSO 是否出验证码探测接口路径 */
  ssoVerificationPath:
    process.env.ACADEMIC_SSO_VERIFICATION_PATH ?? "/verificationCode",

  /** OAuth 客户端 id（由 jw 转发而来） */
  oauthClientId: process.env.ACADEMIC_OAUTH_CLIENT_ID ?? "jw-legal-web",

  /** 登录发起地址（会 302 到 SSO authorize） */
  loginEntryPath: "/Logon.do",

  /**
   * SSO 登录页公开 JS 中的 AES 密钥（loginData.key）。
   * 属于官方客户端加密处理，复现官方网页行为，非服务端密钥破解。
   */
  ssoAesKey: process.env.ACADEMIC_SSO_AES_KEY ?? "mlGrb9XRQvSMyO1p",

  /** 当前学期起始日期（可选）。未设置时按“开学首月第一个周一”估算教学周。 */
  semesterStartDate: process.env.ACADEMIC_SEMESTER_START_DATE ?? "",

  /** 强智（Sinosoft）学生端 jwgl 路径 */
  jwgl: {
    studentMain: "/jsxsd/framework/xsMain.jsp",
    profile: "/jsxsd/grxx/xsxx",
    schedule: "/jsxsd/xskb/xskb_list.do",
    grades: "/jsxsd/kscj/cjcx_list",
    exams: "/jsxsd/xsks/xsksap_list",
    examQuery: "/jsxsd/xsks/xsksap_query",
    calendar: "/jxzl/jxzl_query",
    logout: "/jsxsd/framework/logout",
  },
};
