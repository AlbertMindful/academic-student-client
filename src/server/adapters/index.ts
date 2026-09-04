import { serverConfig } from "@/server/config";
import { CookieJar } from "@/server/auth/cookie-jar";
import { MockAcademicAdapter } from "@/server/adapters/mock";
import { RealAcademicAdapter } from "@/server/adapters/real";
import type { AcademicSystemAdapter } from "@/server/adapters/types";

/**
 * 按 ACADEMIC_DATA_SOURCE 创建适配器。
 * real：真实登录 + 数据抓取；mock：本地假数据（前端开发用）。
 */
export function createAdapter(jar: CookieJar): AcademicSystemAdapter {
  if (serverConfig.dataSource === "real") {
    return new RealAcademicAdapter(jar);
  }
  return new MockAcademicAdapter();
}
