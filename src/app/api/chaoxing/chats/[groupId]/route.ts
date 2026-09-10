import { NextRequest, NextResponse } from "next/server";
import { chaoxingConnectionFromToken } from "@/server/chaoxing/connection";
import { ChaoxingChatError, getChaoxingChatDetail } from "@/server/chaoxing/chat";
import { readChaoxingSessionToken, writeChaoxingSessionToken } from "@/server/chaoxing/session-cookie";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ groupId: string }> }) {
  const connection = chaoxingConnectionFromToken(readChaoxingSessionToken(req));
  if (!connection) {
    return NextResponse.json({ error: { code: "NOT_CONNECTED", message: "请先在“数据来源”中连接学习通。" } }, { status: 401 });
  }
  try {
    const { groupId } = await context.params;
    const detail = await getChaoxingChatDetail(connection, groupId);
    const response = NextResponse.json(detail);
    writeChaoxingSessionToken(response, connection.refreshedToken());
    return response;
  } catch (cause) {
    if (cause instanceof ChaoxingChatError) {
      return NextResponse.json({ error: { code: cause.code, message: cause.message } }, { status: cause.status });
    }
    console.error("Chaoxing chat detail failed", cause instanceof Error ? cause.message : "unknown error");
    return NextResponse.json({ error: { code: "UPSTREAM_ERROR", message: "群聊消息暂时无法读取，请稍后重试。" } }, { status: 502 });
  }
}
