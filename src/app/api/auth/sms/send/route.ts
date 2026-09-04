import { NextRequest, NextResponse } from "next/server";
import { initiateSmsLogin } from "@/server/auth/academicAuth";
import { errorResponse, toErrorResponse } from "@/server/api-helpers";
import { hit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  let body: { username?: unknown; captchaWidth?: unknown; previousPendingId?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_CREDENTIALS", 400);
  }

  const username = String(body?.username ?? "").trim();
  const captchaWidth = Number(body?.captchaWidth ?? 0);
  const previousPendingId = String(body?.previousPendingId ?? "").trim() || undefined;

  if (!username || username.length > 128) {
    return errorResponse("INVALID_CREDENTIALS", 400);
  }
  if (!Number.isFinite(captchaWidth) || captchaWidth <= 0 || captchaWidth > 2000) {
    return errorResponse("CAPTCHA_REQUIRED", 400);
  }
  // Parse first so malformed requests do not consume the quota. Include the
  // account in the key so users behind the same campus NAT do not block each
  // other from receiving a code.
  if (hit(`sms:${ip}:${username}`)) {
    return errorResponse("RATE_LIMITED", 429);
  }

  try {
    const { pendingId, cooldown } = await initiateSmsLogin(
      username,
      captchaWidth,
      previousPendingId,
    );
    return NextResponse.json({ ok: true, pendingId, cooldown });
  } catch (e) {
    return toErrorResponse(e);
  }
}
