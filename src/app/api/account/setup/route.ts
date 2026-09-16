import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { AcademicEventState } from "@/lib/types";
import { academicAccountIdentities } from "@/server/account-identity";
import { appSessionCookieName, appSessionCookieOptions, hashAppPassword, normalizeAppUsername, startAppSession } from "@/server/app-auth";
import { appOwnerExists, createAppOwner, databaseOwnerKey, readEventStates, writeEventStates } from "@/server/database";
import { migrateDriveOwners } from "@/server/drive";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (await appOwnerExists()) return NextResponse.json({ error: { code: "SETUP_COMPLETE", message: "系统账户已经创建。" } }, { status: 409 });
  const identities = academicAccountIdentities(req);
  if (!identities.length) return NextResponse.json({ error: { code: "ACADEMIC_AUTH_REQUIRED", message: "首次创建账户前，请先保持教务系统连接。" } }, { status: 401 });
  const oldOwnerKeys = identities.map((identity) => databaseOwnerKey(identity));
  const oldStores = await Promise.all(oldOwnerKeys.map(readEventStates));
  if (!oldStores.some((states) => Object.keys(states).length > 0)) {
    return NextResponse.json({ error: { code: "OWNER_PROOF_REQUIRED", message: "暂时无法确认原账户，请先在旧版本中同步并完成任意一条动态。" } }, { status: 403 });
  }
  const body = await req.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
  const username = normalizeAppUsername(String(body?.username ?? ""));
  const password = String(body?.password ?? "");
  if (!/^[a-z0-9._-]{3,32}$/.test(username) || password.length < 10 || password.length > 128) {
    return NextResponse.json({ error: { code: "INVALID_ACCOUNT", message: "用户名需为 3–32 位字母或数字，密码至少 10 位。" } }, { status: 400 });
  }
  const passwordData = await hashAppPassword(password);
  const record = await createAppOwner({ id: crypto.randomUUID(), username, passwordHash: passwordData.hash, passwordSalt: passwordData.salt });
  if (!record) return NextResponse.json({ error: { code: "SETUP_COMPLETE", message: "系统账户已经创建。" } }, { status: 409 });

  // Copy historical completion state from every identity used by the old
  // architecture into the immutable app-user owner key.
  const targetKey = databaseOwnerKey(`app-user:${record.id}`);
  const merged: Record<string, AcademicEventState> = {};
  for (const states of oldStores) {
    for (const [eventId, state] of Object.entries(states)) {
      if (!merged[eventId] || Date.parse(state.updatedAt) > Date.parse(merged[eventId].updatedAt)) merged[eventId] = state;
    }
  }
  if (Object.keys(merged).length) await writeEventStates(targetKey, merged);
  await migrateDriveOwners(oldOwnerKeys, targetKey);

  const token = await startAppSession(record.id);
  const response = NextResponse.json({ ok: true, username: record.username });
  response.cookies.set(appSessionCookieName, token, appSessionCookieOptions());
  return response;
}
