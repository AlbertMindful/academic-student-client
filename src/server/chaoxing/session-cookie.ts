import type { NextRequest, NextResponse } from "next/server";
import { chaoxingCookieName, chaoxingCookieOptions } from "@/server/chaoxing/connection";

// A Chaoxing login can contain enough upstream cookies to exceed a browser's
// per-cookie limit after encryption. Keep the payload encrypted, but split it
// across small HttpOnly cookies so a successful QR login is not silently lost.
const CHUNK_SIZE = 2_800;
const MAX_CHUNKS = 8;

function chunkName(index: number): string {
  return `${chaoxingCookieName}_${index}`;
}

export function readChaoxingSessionToken(req: NextRequest): string | undefined {
  const chunks: string[] = [];
  for (let index = 0; index < MAX_CHUNKS; index += 1) {
    const value = req.cookies.get(chunkName(index))?.value;
    if (!value) break;
    chunks.push(value);
  }
  return chunks.length ? chunks.join("") : req.cookies.get(chaoxingCookieName)?.value;
}

export function writeChaoxingSessionToken(response: NextResponse, token: string): void {
  const chunks = token.match(new RegExp(`.{1,${CHUNK_SIZE}}`, "g")) ?? [];
  if (chunks.length > MAX_CHUNKS) throw new Error("学习通会话数据过大，无法安全保存");

  response.cookies.set(chaoxingCookieName, "", { ...chaoxingCookieOptions(), maxAge: 0 });
  for (let index = 0; index < MAX_CHUNKS; index += 1) {
    const value = chunks[index];
    response.cookies.set(chunkName(index), value ?? "", {
      ...chaoxingCookieOptions(),
      ...(value ? {} : { maxAge: 0 }),
    });
  }
}

export function clearChaoxingSessionToken(response: NextResponse): void {
  response.cookies.set(chaoxingCookieName, "", { ...chaoxingCookieOptions(), maxAge: 0 });
  for (let index = 0; index < MAX_CHUNKS; index += 1) {
    response.cookies.set(chunkName(index), "", { ...chaoxingCookieOptions(), maxAge: 0 });
  }
}
