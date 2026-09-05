/**
 * Per-user cookie jar.
 *
 * 学校系统依赖 Cookie 会话（JSESSIONID 等）。每个登录会话持有自己独立的
 * CookieJar，绝不跨用户共享。这里实现最小但正确的 RFC 6265 子集：
 * 解析 Set-Cookie、按 Domain/Path 匹配、按 Expires/Max-Age 过期。
 */

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number | null; // epoch ms；null 表示会话 Cookie
  httpOnly: boolean;
  secure: boolean;
  sameSite: string | null;
}

function parseExpires(value: string): number | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function parseSetCookie(setCookie: string): StoredCookie | null {
  const parts = setCookie.split(";");
  const first = parts[0];
  const eq = first.indexOf("=");
  if (eq <= 0) return null;

  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  let domain = "";
  let path = "/";
  let expires: number | null = null;
  let httpOnly = false;
  let secure = false;
  let sameSite: string | null = null;

  for (const raw of parts.slice(1)) {
    const attr = raw.trim();
    if (attr.length === 0) continue;
    const i = attr.indexOf("=");
    const key = (i === -1 ? attr : attr.slice(0, i)).trim().toLowerCase();
    const val = i === -1 ? "" : attr.slice(i + 1).trim();

    switch (key) {
      case "domain":
        domain = val.replace(/^\./, "").toLowerCase();
        break;
      case "path":
        path = val.startsWith("/") ? val : "/";
        break;
      case "expires":
        expires = parseExpires(val);
        break;
      case "max-age": {
        const secs = Number(val);
        if (!Number.isNaN(secs)) expires = Date.now() + secs * 1000;
        break;
      }
      case "httponly":
        httpOnly = true;
        break;
      case "secure":
        secure = true;
        break;
      case "samesite":
        sameSite = val.toLowerCase();
        break;
      default:
        break;
    }
  }

  return { name, value, domain, path, expires, httpOnly, secure, sameSite };
}

function domainMatches(cookieDomain: string, host: string): boolean {
  if (!cookieDomain) return true; // host-only cookie 由 store 时补上
  return host === cookieDomain || host.endsWith(`.${cookieDomain}`);
}

function pathMatches(cookiePath: string, requestPath: string): boolean {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}

export class CookieJar {
  private cookies: StoredCookie[] = [];

  /** 从可信的、已解密会话数据恢复学校 Cookie。 */
  static fromJSON(value: unknown): CookieJar {
    const jar = new CookieJar();
    if (!Array.isArray(value)) return jar;
    jar.cookies = value.filter((item): item is StoredCookie => {
      if (!item || typeof item !== "object") return false;
      const cookie = item as Partial<StoredCookie>;
      return (
        typeof cookie.name === "string" &&
        typeof cookie.value === "string" &&
        typeof cookie.domain === "string" &&
        typeof cookie.path === "string" &&
        (cookie.expires === null || typeof cookie.expires === "number") &&
        typeof cookie.httpOnly === "boolean" &&
        typeof cookie.secure === "boolean" &&
        (cookie.sameSite === null || typeof cookie.sameSite === "string")
      );
    });
    jar.purgeExpired();
    return jar;
  }

  /** 记录一次响应返回的所有 Set-Cookie。 */
  store(url: string, setCookies: string[]): void {
    const host = new URL(url).hostname.toLowerCase();
    for (const sc of setCookies) {
      const cookie = parseSetCookie(sc);
      if (!cookie) continue;
      // host-only：未指定 Domain 时绑定到请求主机
      const domain = cookie.domain || host;
      const stored: StoredCookie = { ...cookie, domain };
      // 同名同域同路径覆盖
      const idx = this.cookies.findIndex(
        (c) =>
          c.name === stored.name &&
          c.domain === stored.domain &&
          c.path === stored.path,
      );
      if (idx >= 0) this.cookies[idx] = stored;
      else this.cookies.push(stored);
    }
    this.purgeExpired();
  }

  /** 为某请求生成 Cookie 头；无匹配时返回 null。 */
  getCookieHeader(url: string): string | null {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname || "/";
    this.purgeExpired();

    const matched = this.cookies.filter(
      (c) => domainMatches(c.domain, host) && pathMatches(c.path, path),
    );
    if (matched.length === 0) return null;
    // 路径更长的优先（更具体）
    matched.sort((a, b) => b.path.length - a.path.length);
    return matched.map((c) => `${c.name}=${c.value}`).join("; ");
  }

  clear(): void {
    this.cookies = [];
  }

  /** 仅用于写入服务端加密会话，调用方不得将结果直接返回前端。 */
  toJSON(): StoredCookie[] {
    this.purgeExpired();
    return this.cookies.map((cookie) => ({ ...cookie }));
  }

  private purgeExpired(): void {
    const now = Date.now();
    this.cookies = this.cookies.filter(
      (c) => c.expires === null || c.expires > now,
    );
  }

  /** 仅供调试/观测：返回 Cookie 名与域，绝不返回值。 */
  describe(): Array<{ name: string; domain: string; path: string }> {
    this.purgeExpired();
    return this.cookies.map((c) => ({
      name: c.name,
      domain: c.domain,
      path: c.path,
    }));
  }
}
