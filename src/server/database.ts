import crypto from "node:crypto";
import postgres from "postgres";
import type { AcademicEventState, AcademicSyncPayload } from "@/lib/types";
import { serverConfig } from "@/server/config";

type DatabaseGlobal = typeof globalThis & {
  __academicDatabase?: ReturnType<typeof postgres>;
  __academicDatabaseReady?: Promise<void>;
};

export interface AppUserRecord {
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
}

const databaseGlobal = globalThis as DatabaseGlobal;

function client(): ReturnType<typeof postgres> | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  // Neon includes libpq's channel_binding option in new connection strings.
  // Postgres.js forwards unknown query parameters to the server as startup
  // settings, where channel_binding is rejected. TLS remains mandatory below.
  const connectionUrl = new URL(url);
  connectionUrl.searchParams.delete("channel_binding");
  return databaseGlobal.__academicDatabase ??= postgres(connectionUrl.toString(), {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: "require",
  });
}

async function ready(sql: ReturnType<typeof postgres>): Promise<void> {
  databaseGlobal.__academicDatabaseReady ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS academic_event_states (
        owner_key TEXT NOT NULL,
        event_id TEXT NOT NULL,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (owner_key, event_id)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS academic_event_snapshots (
        owner_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        synced_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS app_users (
        id UUID PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS app_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
  })();
  try {
    await databaseGlobal.__academicDatabaseReady;
  } catch (cause) {
    // A temporary Neon wake-up or network failure must not poison this process
    // until the next deployment.
    delete databaseGlobal.__academicDatabaseReady;
    throw cause;
  }
}

/** The database never receives a raw student number or username. */
export function databaseOwnerKey(identity: string): string {
  return crypto
    .createHmac("sha256", `${serverConfig.sessionSecret || "academic-local-development-session-key"}:database-owner`)
    .update(identity.trim().toLowerCase())
    .digest("hex");
}

export function databaseEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** Safe for server logs: deliberately excludes messages, queries and config. */
export function databaseErrorDetails(cause: unknown): { name: string; code?: string } {
  if (!(cause instanceof Error)) return { name: "UnknownDatabaseError" };
  const code = "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
  return { name: cause.name, ...(code ? { code } : {}) };
}

export async function readEventStates(ownerKey: string): Promise<Record<string, AcademicEventState>> {
  const sql = client();
  if (!sql) return {};
  await ready(sql);
  const rows = await sql<Array<{ event_id: string; state: AcademicEventState; updated_at: Date }>>`
    SELECT event_id, state, updated_at
    FROM academic_event_states
    WHERE owner_key = ${ownerKey}
  `;
  return Object.fromEntries(rows.map((row) => [row.event_id, {
    ...row.state,
    updatedAt: new Date(row.updated_at).toISOString(),
  }]));
}

export async function writeEventStates(
  ownerKey: string,
  states: Record<string, AcademicEventState>,
): Promise<Record<string, AcademicEventState>> {
  const sql = client();
  if (!sql) return {};
  await ready(sql);
  const entries = Object.entries(states);
  if (!entries.length) return {};
  const batches = await sql.begin((transaction) => entries.map(([eventId, state]) => transaction<Array<{
    event_id: string;
    state: AcademicEventState;
    updated_at: Date;
  }>>`
    WITH accepted AS (
      INSERT INTO academic_event_states (owner_key, event_id, state, updated_at)
      VALUES (${ownerKey}, ${eventId}, ${JSON.stringify(state)}::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (owner_key, event_id) DO UPDATE
      SET state = EXCLUDED.state, updated_at = CURRENT_TIMESTAMP
      WHERE COALESCE(
        NULLIF(academic_event_states.state->>'updatedAt', '')::timestamptz,
        academic_event_states.updated_at
      ) <= ${state.updatedAt}::timestamptz
      RETURNING event_id, state, updated_at
    )
    SELECT event_id, state, updated_at FROM accepted
    UNION ALL
    SELECT event_id, state, updated_at
    FROM academic_event_states
    WHERE owner_key = ${ownerKey}
      AND event_id = ${eventId}
      AND NOT EXISTS (SELECT 1 FROM accepted)
  `));
  return Object.fromEntries(batches.flat().map((row) => [row.event_id, {
    ...row.state,
    updatedAt: new Date(row.updated_at).toISOString(),
  }]));
}

export async function readAcademicSnapshot(ownerKeys: string[]): Promise<AcademicSyncPayload | null> {
  const sql = client();
  if (!sql || !ownerKeys.length) return null;
  await ready(sql);
  const rows = await sql<Array<{ payload: AcademicSyncPayload }>>`
    SELECT payload
    FROM academic_event_snapshots
    WHERE owner_key IN ${sql(ownerKeys)}
    ORDER BY synced_at DESC, updated_at DESC
    LIMIT 1
  `;
  return rows[0]?.payload ?? null;
}

export async function writeAcademicSnapshot(
  ownerKeys: string[],
  payload: AcademicSyncPayload,
): Promise<void> {
  const sql = client();
  if (!sql || !ownerKeys.length) return;
  await ready(sql);
  await sql.begin((transaction) => ownerKeys.map((ownerKey) => transaction`
    INSERT INTO academic_event_snapshots (owner_key, payload, synced_at, updated_at)
    VALUES (${ownerKey}, ${JSON.stringify(payload)}::jsonb, ${payload.syncedAt}::timestamptz, CURRENT_TIMESTAMP)
    ON CONFLICT (owner_key) DO UPDATE
    SET payload = EXCLUDED.payload,
        synced_at = EXCLUDED.synced_at,
        updated_at = CURRENT_TIMESTAMP
    WHERE academic_event_snapshots.synced_at <= EXCLUDED.synced_at
  `));
}

export async function appOwnerExists(): Promise<boolean> {
  const sql = client();
  if (!sql) throw new Error("DatabaseUnavailable");
  await ready(sql);
  const rows = await sql<Array<{ present: boolean }>>`SELECT EXISTS (SELECT 1 FROM app_users) AS present`;
  return Boolean(rows[0]?.present);
}

export async function createAppOwner(record: AppUserRecord): Promise<AppUserRecord | null> {
  const sql = client();
  if (!sql) throw new Error("DatabaseUnavailable");
  await ready(sql);
  const rows = await sql<Array<{ id: string; username: string; password_hash: string; password_salt: string }>>`
    INSERT INTO app_users (id, username, password_hash, password_salt)
    SELECT ${record.id}::uuid, ${record.username}, ${record.passwordHash}, ${record.passwordSalt}
    WHERE NOT EXISTS (SELECT 1 FROM app_users)
    ON CONFLICT DO NOTHING
    RETURNING id, username, password_hash, password_salt
  `;
  const row = rows[0];
  return row ? { id: row.id, username: row.username, passwordHash: row.password_hash, passwordSalt: row.password_salt } : null;
}

export async function findAppUserByUsername(username: string): Promise<AppUserRecord | null> {
  const sql = client();
  if (!sql) throw new Error("DatabaseUnavailable");
  await ready(sql);
  const rows = await sql<Array<{ id: string; username: string; password_hash: string; password_salt: string }>>`
    SELECT id, username, password_hash, password_salt FROM app_users WHERE username = ${username} LIMIT 1
  `;
  const row = rows[0];
  return row ? { id: row.id, username: row.username, passwordHash: row.password_hash, passwordSalt: row.password_salt } : null;
}

export async function createAppSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void> {
  const sql = client();
  if (!sql) throw new Error("DatabaseUnavailable");
  await ready(sql);
  await sql`DELETE FROM app_sessions WHERE expires_at <= CURRENT_TIMESTAMP`;
  await sql`INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES (${tokenHash}, ${userId}::uuid, ${expiresAt})`;
}

export async function findAppUserBySession(tokenHash: string): Promise<Pick<AppUserRecord, "id" | "username"> | null> {
  const sql = client();
  if (!sql) return null;
  await ready(sql);
  const rows = await sql<Array<{ id: string; username: string }>>`
    SELECT users.id, users.username
    FROM app_sessions sessions
    JOIN app_users users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ${tokenHash} AND sessions.expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function deleteAppSession(tokenHash: string): Promise<void> {
  const sql = client();
  if (!sql) return;
  await ready(sql);
  await sql`DELETE FROM app_sessions WHERE token_hash = ${tokenHash}`;
}
