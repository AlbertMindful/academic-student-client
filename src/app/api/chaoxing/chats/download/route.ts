import { NextRequest, NextResponse } from "next/server";
import { chaoxingConnectionFromToken } from "@/server/chaoxing/connection";
import { ChaoxingChatError, downloadChaoxingChatFile, openChatDownload } from "@/server/chaoxing/chat";
import { readChaoxingSessionToken, writeChaoxingSessionToken } from "@/server/chaoxing/session-cookie";

export const dynamic = "force-dynamic";

function contentDisposition(name: string): string {
  const safe = name.replace(/[\r\n"\\]/g, "_").slice(0, 180) || "download";
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export async function GET(req: NextRequest) {
  const connection = chaoxingConnectionFromToken(readChaoxingSessionToken(req));
  if (!connection) {
    return NextResponse.json({ error: { code: "NOT_CONNECTED", message: "请先连接学习通。" } }, { status: 401 });
  }
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) throw new ChaoxingChatError("INVALID_DOWNLOAD", "下载链接不完整。", 400);
    const reference = openChatDownload(token);
    const upstream = await downloadChaoxingChatFile(connection, reference, req.headers.get("range"));
    const headers = new Headers();
    for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set("Content-Disposition", contentDisposition(reference.name));
    headers.set("Cache-Control", "private, no-store");
    const response = new NextResponse(upstream.body, { status: upstream.status, headers });
    writeChaoxingSessionToken(response, connection.refreshedToken());
    return response;
  } catch (cause) {
    if (cause instanceof ChaoxingChatError) {
      return NextResponse.json({ error: { code: cause.code, message: cause.message } }, { status: cause.status });
    }
    console.error("Chaoxing chat download failed", cause instanceof Error ? cause.message : "unknown error");
    return NextResponse.json({ error: { code: "UPSTREAM_ERROR", message: "文件暂时无法下载，请稍后重试。" } }, { status: 502 });
  }
}
