import crypto from "node:crypto";
import postgres from "postgres";
import type { AcademicEventState } from "@/lib/types";
import { serverConfig } from "@/server/config";

type DatabaseGlobal = typeof globalThis & {
  __academicDatabase?: ReturnType<typeof postgres>;
  __academicDatabaseReady?: Promise<void>;
};

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
    INSERT INTO academic_event_states (owner_key, event_id, state, updated_at)
    VALUES (${ownerKey}, ${eventId}, ${JSON.stringify(state)}::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT (owner_key, event_id) DO UPDATE
    SET state = EXCLUDED.state, updated_at = CURRENT_TIMESTAMP
    RETURNING event_id, state, updated_at
  `));
  return Object.fromEntries(batches.flat().map((row) => [row.event_id, {
    ...row.state,
    updatedAt: new Date(row.updated_at).toISOString(),
  }]));
}
