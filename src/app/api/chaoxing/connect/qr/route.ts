import { NextRequest } from "next/server";
import { chaoxingQrUrl, getPendingConnection } from "@/server/chaoxing/connection";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const connection = getPendingConnection(req.nextUrl.searchParams.get("pendingId") ?? "");
  if (!connection) return new Response("Expired", { status: 404 });
  try {
    const response = await fetch(chaoxingQrUrl(connection), { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return new Response("Unavailable", { status: 502 });
    return new Response(await response.arrayBuffer(), { headers: { "Content-Type": response.headers.get("content-type") ?? "image/png", "Cache-Control": "no-store" } });
  } catch { return new Response("Unavailable", { status: 502 }); }
}
