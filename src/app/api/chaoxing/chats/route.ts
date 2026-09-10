import { NextRequest, NextResponse } from "next/server";
import { chaoxingConnectionFromToken } from "@/server/chaoxing/connection";
import { ChaoxingChatError, getChaoxingChatGroups } from "@/server/chaoxing/chat";
import { readChaoxingSessionToken, writeChaoxingSessionToken } from "@/server/chaoxing/session-cookie";

export const dynamic = "force-dynamic";

function failure(cause: unknown): NextResponse {
  if (cause instanceof ChaoxingChatError) {
    return NextResponse.json({ error: { code: cause.code, message: cause.message } }, { status: cause.status });
  }
  console.error("Chaoxing chats failed", cause instanceof Error ? cause.message : "unknown error");
  return NextResponse.json({ error: { code: "UPSTREAM_ERROR", message: "学习通群聊暂时无法访问，请稍后重试。" } }, { status: 502 });
}

export async function GET(req: NextRequest) {
  const connection = chaoxingConnectionFromToken(readChaoxingSessionToken(req));
  if (!connection) {
    return NextResponse.json({ error: { code: "NOT_CONNECTED", message: "请先在“数据来源”中连接学习通。" } }, { status: 401 });
  }
  try {
    const groups = await getChaoxingChatGroups(connection);
    const response = NextResponse.json({ groups });
    writeChaoxingSessionToken(response, connection.refreshedToken());
    return response;
  } catch (cause) { return failure(cause); }
}
