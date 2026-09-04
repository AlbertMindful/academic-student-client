/** 认证/数据访问错误码，前端据此给出友好提示。 */
export type AcademicErrorCode =
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_NOT_FOUND"
  | "WRONG_PASSWORD"
  | "WRONG_CODE"
  | "RATE_LIMITED"
  | "SMS_SEND_FAILED"
  | "SMS_LIMIT"
  | "CAPTCHA_REQUIRED"
  | "MFA_REQUIRED"
  | "SESSION_EXPIRED"
  | "SERVER_UNAVAILABLE"
  | "NETWORK_ERROR"
  | "MAINTENANCE"
  | "DATA_PARSE_ERROR"
  | "UNKNOWN_AUTH_FAILURE"
  | "UNKNOWN_ERROR";

export class AcademicError extends Error {
  code: AcademicErrorCode;
  constructor(code: AcademicErrorCode, message: string) {
    super(message);
    this.name = "AcademicError";
    this.code = code;
  }
}

/** 用户可读的错误文案映射（不含任何敏感信息）。 */
export const ERROR_MESSAGES: Record<AcademicErrorCode, string> = {
  INVALID_CREDENTIALS: "账号或密码不正确，请检查后重试。",
  ACCOUNT_NOT_FOUND: "该账号不存在，请核对学号/工号。",
  WRONG_PASSWORD: "密码错误，请重新输入。",
  WRONG_CODE: "验证码错误，请重新输入。",
  RATE_LIMITED: "操作过于频繁，请稍后再试。",
  SMS_SEND_FAILED: "验证码发送失败，请稍后重试。",
  SMS_LIMIT: "验证码发送过于频繁，请稍后再试。",
  CAPTCHA_REQUIRED: "需要人机校验，请完成验证码后再试。",
  MFA_REQUIRED: "需要二次验证（短信/扫码等），请在官方页面完成。",
  SESSION_EXPIRED: "登录已过期，请重新登录。",
  SERVER_UNAVAILABLE: "教务系统暂时不可用，请稍后重试。",
  NETWORK_ERROR: "无法连接教务系统，请检查网络后重试。",
  MAINTENANCE: "教务系统维护中，请稍后再试。",
  DATA_PARSE_ERROR: "教务数据解析失败，请稍后重试。",
  UNKNOWN_AUTH_FAILURE: "登录失败，请稍后重试或联系管理员。",
  UNKNOWN_ERROR: "发生了未知错误，请稍后重试。",
};
