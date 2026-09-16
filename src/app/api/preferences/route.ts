import { NextRequest, NextResponse } from "next/server";
import type { AcademicEventState } from "@/lib/types";
import { academicAccountIdentities } from "@/server/account-identity";
import { currentAppUser } from "@/server/app-auth";
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

async function ownerKeys(req: NextRequest): Promise<string[]> {
  const user = await currentAppUser(req);
  if (!user) return [];
  return Array.from(new Set([
    databaseOwnerKey(`app-user:${user.id}`),
    ...academicAccountIdentities(req).map(databaseOwnerKey),
  ]));
}

function newerState(a: AcademicEventState | undefined, b: AcademicEventState): AcademicEventState {
  if (!a) return b;
  return Date.parse(b.updatedAt) >= Date.parse(a.updatedAt) ? b : a;
}

async function linkedStates(keys: string[]): Promise<Record<string, AcademicEventState>> {
  const stores = await Promise.all(keys.map(readEventStates));
  const merged: Record<string, AcademicEventState> = {};
  for (const states of stores) {
    for (const [eventId, state] of Object.entries(states)) {
      merged[eventId] = newerState(merged[eventId], state);
    }
  }
  // Heal old split identities opportunistically. Future requests can then use
  // either the login name or the official student number and see the same data.
  await Promise.all(keys.map(async (key, index) => {
    const missingOrOlder = Object.fromEntries(Object.entries(merged).filter(([eventId, state]) => {
      const existing = stores[index][eventId];
      return !existing || Date.parse(existing.updatedAt) < Date.parse(state.updatedAt);
    }));
    if (Object.keys(missingOrOlder).length) await writeEventStates(key, missingOrOlder);
  }));
  return merged;
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
  const keys = await ownerKeys(req);
  if (!keys.length) return unauthorized();
  try {
    return NextResponse.json({ enabled: databaseEnabled(), states: await linkedStates(keys) });
  } catch (cause) {
    console.error("[preferences] database read failed", databaseErrorDetails(cause));
    return NextResponse.json({ error: { code: "DATABASE_UNAVAILABLE", message: "云端状态暂时不可用。" } }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const keys = await ownerKeys(req);
  if (!keys.length) return unauthorized();
  const body = await req.json().catch(() => null) as { states?: unknown; mode?: unknown } | null;
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
    // Clients before state-sync v2 pushed their entire cache after every refresh.
    // Ignore those legacy bulk writes so a stale device cannot undo newer actions.
    if (body.mode !== "mutation" && entries.length > 1) {
      return NextResponse.json({ enabled: databaseEnabled(), ok: true, states: await linkedStates(keys) });
    }
    const results = await Promise.all(keys.map((key) => writeEventStates(key, states)));
    const written: Record<string, AcademicEventState> = {};
    for (const result of results) {
      for (const [eventId, state] of Object.entries(result)) {
        written[eventId] = newerState(written[eventId], state);
      }
    }
    return NextResponse.json({ enabled: databaseEnabled(), ok: true, states: written });
  } catch (cause) {
    console.error("[preferences] database write failed", databaseErrorDetails(cause));
    return NextResponse.json({ error: { code: "DATABASE_UNAVAILABLE", message: "云端状态暂时不可用。" } }, { status: 503 });
  }
}
