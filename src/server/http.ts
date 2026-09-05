import { CookieJar } from "@/server/auth/cookie-jar";
import { AcademicError } from "@/server/auth/errors";

export interface HttpOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  /** 表单体（x-www-form-urlencoded）或原始字符串 */
  body?: string | URLSearchParams;
}

export interface HttpResult {
  status: number;
  url: string;
  headers: Headers;
  body: string;
  location: string | null;
  setCookies: string[];
}

const MAX_REDIRECTS = 12;

function normalizeCharset(raw: string): string {
  const charset = raw.trim().replace(/["']/g, "").toLowerCase();
  if (["gbk", "gb2312", "x-gbk", "cp936"].includes(charset)) return "gb18030";
  return charset || "utf-8";
}

/** 按响应头或页面 meta 声明解码强智旧页面（部分页面仍使用 GBK）。 */
async function decodeResponseBody(res: Response): Promise<string> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "";
  const headerCharset = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1];
  const asciiHead = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const metaCharset =
    asciiHead.match(/<meta[^>]+charset\s*=\s*["']?([^\s"'/>;]+)/i)?.[1] ??
    asciiHead.match(/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([^\s"';>]+)/i)?.[1];
  const charset = normalizeCharset(headerCharset ?? metaCharset ?? "utf-8");
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function sanitizeForError(u: string): string {
  try {
    const url = new URL(u);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "[invalid-url]";
  }
}

/**
 * 面向学校系统的 HTTP 客户端。使用 per-user CookieJar：
 * - 每次请求自动附带该用户 Cookie；
 * - 每次响应自动吸收 Set-Cookie；
 * - 手动跟随 302/303/307/308 重定向（捕获每一跳的 Cookie）。
 * 所有错误信息均被净化，绝不包含 Cookie/认证头等敏感内容。
 */
export class SchoolHttpClient {
  constructor(private jar: CookieJar) {}

  private buildHeaders(
    url: string,
    opts?: HttpOptions,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      // 复现浏览器常规 UA，避免被学校网关拦截
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      ...(opts?.headers ?? {}),
    };
    const cookie = this.jar.getCookieHeader(url);
    if (cookie) headers["Cookie"] = cookie;
    return headers;
  }

  /** 单跳请求（不跟随重定向）。 */
  async request(url: string, opts?: HttpOptions): Promise<HttpResult> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts?.method ?? "GET",
        headers: this.buildHeaders(url, opts),
        body:
          opts?.body instanceof URLSearchParams
            ? opts.body.toString()
            : opts?.body,
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new AcademicError(
        "NETWORK_ERROR",
        `无法连接教务系统（${sanitizeForError(url)}）。`,
      );
    }

    const setCookies = res.headers.getSetCookie();
    this.jar.store(res.url, setCookies);

    const location = res.headers.get("location");
    const body = await decodeResponseBody(res);

    return {
      status: res.status,
      url: res.url,
      headers: res.headers,
      body,
      location,
      setCookies,
    };
  }

  /** 多跳请求：跟随重定向并捕获每一跳 Cookie。 */
  async follow(url: string, opts?: HttpOptions): Promise<HttpResult> {
    let current = url;
    let result: HttpResult | null = null;
    for (let i = 0; i < MAX_REDIRECTS; i++) {
      result = await this.request(current, opts);
      const code = result.status;
      if (
        (code === 301 || code === 302 || code === 303 || code === 307 || code === 308) &&
        result.location
      ) {
        current = new URL(result.location, current).toString();
        // 重定向后改用 GET（除 307/308 外）
        if (code !== 307 && code !== 308) {
          opts = { ...opts, method: "GET", body: undefined };
        }
        continue;
      }
      return result;
    }
    throw new AcademicError(
      "SERVER_UNAVAILABLE",
      "教务系统重定向次数过多，请稍后重试。",
    );
  }

  get(url: string, opts?: HttpOptions): Promise<HttpResult> {
    return this.follow(url, { ...opts, method: "GET" });
  }

  post(
    url: string,
    form: Record<string, string>,
    opts?: HttpOptions,
  ): Promise<HttpResult> {
    const body = new URLSearchParams(form);
    return this.follow(url, {
      ...opts,
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(opts?.headers ?? {}),
      },
    });
  }
}

/** 判断某地址是否表示“未登录/会话过期”（跳回登录页）。 */
export function isLoginRedirect(url: string | null): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  return (
    u.includes("/logon.do") ||
    u.includes("/oauth/authorize") ||
    u.includes("/sso.cquet.edu.cn")
  );
}
