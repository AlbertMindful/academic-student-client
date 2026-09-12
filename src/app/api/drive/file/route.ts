import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/academicAuth";
import { credentialCookieName, openCredentials } from "@/server/auth/credential-token";
import { readSessionId } from "@/server/api-helpers";
import { databaseOwnerKey } from "@/server/database";
import { DriveError, driveFilePath } from "@/server/drive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4", ".mov": "video/quicktime",
  ".zip": "application/zip", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function ownerKey(req: NextRequest): string | null {
  const account = getSession(readSessionId(req))?.profile?.studentId
    ?? openCredentials(req.cookies.get(credentialCookieName)?.value)?.username;
  return account ? databaseOwnerKey(account) : null;
}

export async function GET(req: NextRequest) {
  const owner = ownerKey(req);
  if (!owner) return NextResponse.json({ error: { code: "NOT_CONNECTED", message: "请先连接教务系统。" } }, { status: 401 });
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ error: { code: "INVALID_FILE_NAME", message: "缺少文件名。" } }, { status: 400 });
  try {
    const filePath = driveFilePath(owner, name);
    const info = await stat(filePath);
    if (!info.isFile()) throw new DriveError("FILE_NOT_FOUND", "文件不存在。", 404);
    const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
    let start = 0;
    let end = info.size - 1;
    let status = 200;
    if (range) {
      if (range[1] === "" && range[2] !== "") {
        // Suffix range `bytes=-N` requests the last N bytes, not 0..N.
        const suffixLength = Number(range[2]);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
          return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
        }
        start = Math.max(0, info.size - suffixLength);
        end = info.size - 1;
      } else {
        start = range[1] ? Number(range[1]) : 0;
        end = range[2] ? Number(range[2]) : end;
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= info.size) {
        return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
      }
      status = 206;
    }
    const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Content-Length": String(end - start + 1),
      "Content-Type": MIME_TYPES[extension] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    if (status === 206) headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
    const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
    return new NextResponse(stream, { status, headers });
  } catch (cause) {
    if (cause instanceof DriveError) return NextResponse.json({ error: { code: cause.code, message: cause.message } }, { status: cause.status });
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return NextResponse.json({ error: { code: "FILE_NOT_FOUND", message: "文件不存在。" } }, { status: 404 });
    console.error("[drive] download failed", cause instanceof Error ? { name: cause.name } : { name: "UnknownDriveError" });
    return NextResponse.json({ error: { code: "DRIVE_UNAVAILABLE", message: "文件暂时无法下载。" } }, { status: 503 });
  }
}
