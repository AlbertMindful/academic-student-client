import { beginChaoxingConnection } from "@/server/chaoxing/connection";

export const dynamic = "force-dynamic";

export async function POST() {
  try { return Response.json(await beginChaoxingConnection()); }
  catch { return Response.json({ error: { code: "CHAOXING_UNAVAILABLE", message: "暂时无法连接学习通，请稍后重试。" } }, { status: 502 }); }
}
