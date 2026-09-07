import { NextRequest, NextResponse } from "next/server";
import type { AcademicEventState } from "@/lib/types";
import { readSessionId } from "@/server/api-helpers";
import { getSession } from "@/server/auth/academicAuth";
import { credentialCookieName, openCredentials } from "@/server/auth/credential-token";
import {
  databaseEnabled,
  databaseErrorDetails,
  databaseOwnerKey,
  readEventStates,
  writeEventStates,
} from "@/server/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_STATES = 2_000;
const MAX_EVENT_ID_LENGTH = 256;

function identity(req: NextRequest): string | null {
  const session = getSession(readSessionId(req));
  if (session?.profile?.studentId) return session.profile.studentId;
  return openCredentials(req.cookies.get(credentialCookieName)?.value)?.username ?? null;
}

function validState(value: unknown): value is AcademicEventState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<AcademicEventState>;
  return typeof state.read === "boolean" &&
    typeof state.done === "boolean" &&
    typeof state.ignored === "boolean" &&
    typeof state.pinned === "boolean" &&
    typeof state.updatedAt === "string" &&
    state.updatedAt.length <= 40 &&
    Number.isFinite(Date.parse(state.updatedAt));
}

function unauthorized() {
  return NextResponse.json({ error: { code: "NOT_CONNECTED", message: "请先连接教务系统。" } }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const account = identity(req);
  if (!account) return unauthorized();
  try {
    return NextResponse.json({ enabled: databaseEnabled(), states: await readEventStates(databaseOwnerKey(account)) });
  } catch (cause) {
    console.error("[preferences] database read failed", databaseErrorDetails(cause));
    return NextResponse.json({ error: { code: "DATABASE_UNAVAILABLE", message: "云端状态暂时不可用。" } }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const account = identity(req);
  if (!account) return unauthorized();
  const body = await req.json().catch(() => null) as { states?: unknown } | null;
  if (!body?.states || typeof body.states !== "object" || Array.isArray(body.states)) {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "状态数据无效。" } }, { status: 400 });
  }
  const entries = Object.entries(body.states);
  if (entries.length > MAX_STATES || entries.some(([eventId, state]) =>
    !eventId || eventId.length > MAX_EVENT_ID_LENGTH || !validState(state)
  )) {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "状态数据无效。" } }, { status: 400 });
  }
  const states = Object.fromEntries(entries) as Record<string, AcademicEventState>;
  try {
    await writeEventStates(databaseOwnerKey(account), states);
    return NextResponse.json({ enabled: databaseEnabled(), ok: true });
  } catch (cause) {
    console.error("[preferences] database write failed", databaseErrorDetails(cause));
    return NextResponse.json({ error: { code: "DATABASE_UNAVAILABLE", message: "云端状态暂时不可用。" } }, { status: 503 });
  }
}
