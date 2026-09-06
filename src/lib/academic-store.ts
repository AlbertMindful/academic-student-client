"use client";

import type {
  AcademicEvent,
  AcademicEventState,
  AcademicSyncPayload,
} from "@/lib/types";
import { scoreAcademicEvent } from "@/lib/academic-events";
import { courseMatches } from "@/lib/course-matching";
import { chinaDateTime } from "@/lib/china-time";

const DB_NAME = "academic-command-center";
const DB_VERSION = 1;
const STORE = "workspace";

export interface AcademicCache {
  payload: AcademicSyncPayload;
  states: Record<string, AcademicEventState>;
  savedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

const CACHE_KEY = "personal";

export async function loadAcademicCache(): Promise<AcademicCache | null> {
  try {
    const current = await transact("readonly", (store) => store.get(CACHE_KEY));
    if (current) return current as AcademicCache;
    // One-time migration from the earlier per-student cache layout.
    const all = await transact("readonly", (store) => store.getAll()) as AcademicCache[] | undefined;
    return [...(all ?? [])].sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null;
  } catch {
    return null;
  }
}

export async function saveAcademicCache(cache: AcademicCache): Promise<void> {
  try {
    await transact("readwrite", (store) => store.put(cache, CACHE_KEY));
  } catch {
    // A private browsing policy may deny IndexedDB. The live view remains usable.
  }
}

function keepOfficialCourseItems(incoming: AcademicSyncPayload, previous: AcademicCache | null): AcademicSyncPayload {
  const officialNames = [
    ...(incoming.officialCourseNames ?? []),
    ...(previous?.payload.officialCourseNames ?? []),
    ...incoming.events,
    ...(previous?.payload.events ?? []),
  ]
    .filter((value): value is string | AcademicEvent => typeof value === "string" || value.kind === "class")
    .map((value) => typeof value === "string" ? value : value.courseName)
    .filter((name): name is string => Boolean(name));
  if (!officialNames.length) {
    return { ...incoming, events: incoming.events.filter((event) => !event.courseName || !event.sources.some((source) => source.provider === "chaoxing")) };
  }
  return {
    ...incoming,
    events: incoming.events.filter((event) =>
      !event.sources.some((source) => source.provider === "chaoxing") ||
      !event.courseName || officialNames.some((official) => courseMatches(event.courseName!, official)),
    ),
  };
}

function meaningfulSignature(event: AcademicEvent): string {
  return JSON.stringify({
    kind: event.kind,
    title: event.title,
    summary: event.summary,
    publishedAt: event.publishedAt,
    sender: event.sender,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    dueAt: event.dueAt,
    startsOn: event.startsOn,
    dueOn: event.dueOn,
    location: event.location,
    status: event.status,
    sources: event.sources.map(({ provider, sourceId }) => ({ provider, sourceId })),
  });
}

function normalizeCachedAcademicTime(event: AcademicEvent): AcademicEvent {
  const source = event.sources.find((item) => item.provider === "academic");
  if (!source?.raw || typeof source.raw !== "object") return event;
  const raw = source.raw as Record<string, unknown>;
  if (event.kind === "exam") {
    const date = typeof raw.date === "string" ? raw.date : "";
    const startTime = typeof raw.startTime === "string" ? raw.startTime : "";
    const endTime = typeof raw.endTime === "string" ? raw.endTime : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(startTime)) return event;
    const normalized = {
      ...event,
      startsAt: chinaDateTime(date, startTime).toISOString(),
      endsAt: /^\d{1,2}:\d{2}$/.test(endTime) ? chinaDateTime(date, endTime).toISOString() : event.endsAt,
    };
    return { ...normalized, priority: scoreAcademicEvent(normalized) };
  }
  if (event.kind === "class") {
    const date = source.sourceId.split("|").find((part) => /^\d{4}-\d{2}-\d{2}$/.test(part)) ?? "";
    const session = raw.session && typeof raw.session === "object" ? raw.session as Record<string, unknown> : {};
    const startTime = typeof session.startTime === "string" ? session.startTime : "";
    const endTime = typeof session.endTime === "string" ? session.endTime : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(startTime)) return event;
    const normalized = {
      ...event,
      startsAt: chinaDateTime(date, startTime).toISOString(),
      endsAt: /^\d{1,2}:\d{2}$/.test(endTime) ? chinaDateTime(date, endTime).toISOString() : event.endsAt,
    };
    return { ...normalized, priority: scoreAcademicEvent(normalized) };
  }
  return event;
}

function scheduleChange(oldEvent: AcademicEvent, nextEvent: AcademicEvent, at: string): AcademicEvent {
  const oldTime = oldEvent.startsAt ? new Date(oldEvent.startsAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "时间待定";
  const nextTime = nextEvent.startsAt ? new Date(nextEvent.startsAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "时间待定";
  const oldDescription = [oldTime, oldEvent.location].filter(Boolean).join(" · ");
  const nextDescription = [nextTime, nextEvent.location].filter(Boolean).join(" · ");
  const event: AcademicEvent = {
    id: `schedule_change_${nextEvent.id}_${Date.parse(at).toString(36)}`,
    kind: "schedule_change",
    title: `${nextEvent.courseName ?? nextEvent.title}上课安排有变化`,
    summary: `${oldDescription} → ${nextDescription}`,
    courseName: nextEvent.courseName,
    startsAt: nextEvent.startsAt,
    endsAt: nextEvent.endsAt,
    location: nextEvent.location,
    semesterId: nextEvent.semesterId,
    sources: nextEvent.sources,
    firstSeenAt: at,
    updatedAt: at,
    priority: 0,
  };
  event.priority = scoreAcademicEvent(event);
  return event;
}

function failedKinds(payload: AcademicSyncPayload): Set<AcademicEvent["kind"]> {
  const failed = new Set<AcademicEvent["kind"]>();
  for (const warning of payload.diagnostics.warnings) {
    if (warning.startsWith("课表")) { failed.add("class"); failed.add("schedule_change"); }
    if (warning.startsWith("考试")) failed.add("exam");
    if (warning.startsWith("成绩")) failed.add("grade");
  }
  return failed;
}

export function reconcileSync(
  incoming: AcademicSyncPayload,
  previous: AcademicCache | null,
): AcademicCache {
  incoming = keepOfficialCourseItems(incoming, previous);
  const previousById = new Map(previous?.payload.events.map((event) => [event.id, event]));
  const changedIds = new Set<string>();
  const events = incoming.events.map((event) => {
    const old = previousById.get(event.id);
    if (!old) return event;
    const changed = meaningfulSignature(old) !== meaningfulSignature(event);
    if (changed) changedIds.add(event.id);
    return {
      ...event,
      firstSeenAt: old.firstSeenAt,
      updatedAt: changed ? incoming.syncedAt : old.updatedAt,
    };
  });

  // A failed provider endpoint never erases previously cached information.
  const failed = failedKinds(incoming);
  for (const old of previous?.payload.events ?? []) {
    if (failed.has(old.kind) && !events.some((event) => event.id === old.id)) events.push(old);
  }
  for (const provider of incoming.providers) {
    if (provider.status !== "degraded" && provider.status !== "reauth_required") continue;
    for (const old of previous?.payload.events ?? []) {
      if (old.sources.some((source) => source.provider === provider.provider) && !events.some((event) => event.id === old.id)) events.push(old);
    }
  }

  // Turn a changed future class record into a first-class event. Retain recent
  // changes so the next successful sync does not make the alert disappear.
  for (const next of events.filter((event) => event.kind === "class")) {
    const old = previousById.get(next.id);
    if (old && meaningfulSignature(old) !== meaningfulSignature(next)) {
      events.push(scheduleChange(old, next, incoming.syncedAt));
    }
  }
  const retentionStart = Date.parse(incoming.syncedAt) - 7 * 86_400_000;
  for (const old of previous?.payload.events ?? []) {
    if (old.kind === "schedule_change" && Date.parse(old.firstSeenAt) >= retentionStart && !events.some((event) => event.id === old.id)) {
      events.push(old);
    }
  }

  // Migrate timestamps cached before the server timezone was made explicit.
  // The original official date/time is retained in each source record.
  for (let index = 0; index < events.length; index += 1) {
    events[index] = normalizeCachedAcademicTime(events[index]);
  }

  const states = { ...(previous?.states ?? {}) };
  // Existing grades are a baseline on first use, not dozens of false "new" alerts.
  if (!previous) {
    for (const event of events) {
      if (event.kind === "grade") {
        states[event.id] = {
          read: true,
          done: false,
          ignored: false,
          pinned: false,
          updatedAt: incoming.syncedAt,
        };
      }
    }
  } else {
    const quietBefore = Date.parse(incoming.syncedAt) - 3 * 86_400_000;
    for (const event of events) {
      if (
        !previousById.has(event.id) &&
        event.publishedAt &&
        Date.parse(event.publishedAt) < quietBefore
      ) {
        states[event.id] = {
          ...defaultEventState(),
          read: true,
          updatedAt: incoming.syncedAt,
        };
      }
    }
    for (const id of changedIds) {
      const event = events.find((item) => item.id === id);
      const state = states[id];
      if (event?.kind !== "class" && !state?.done && !state?.ignored) {
        states[id] = { ...(state ?? defaultEventState()), read: false, updatedAt: incoming.syncedAt };
      }
    }
  }

  const academicUnavailable = incoming.providers.some((provider) => provider.provider === "academic" && provider.status !== "ok");
  const chaoxingUnavailable = incoming.providers.some((provider) => provider.provider === "chaoxing" && provider.status !== "ok");
  const counts = { ...incoming.diagnostics.counts };
  if (academicUnavailable && previous) {
    for (const key of ["courses", "exams", "grades"] as const) {
      counts[key] = previous.payload.diagnostics.counts[key] ?? counts[key];
    }
  }
  if (chaoxingUnavailable && previous) {
    for (const key of Object.keys(previous.payload.diagnostics.counts).filter((item) => item.startsWith("chaoxing"))) {
      counts[key] = previous.payload.diagnostics.counts[key] ?? counts[key];
    }
  }
  counts.events = events.length;

  return {
    payload: {
      ...incoming,
      officialCourseNames: incoming.officialCourseNames?.length
        ? incoming.officialCourseNames
        : previous?.payload.officialCourseNames,
      events,
      diagnostics: { ...incoming.diagnostics, counts },
      providers: incoming.providers.map((provider) => {
        const old = previous?.payload.providers.find((item) => item.provider === provider.provider);
        return provider.status !== "ok" && old?.lastSuccessAt
          ? { ...provider, lastSuccessAt: old.lastSuccessAt }
          : provider;
      }),
    },
    states,
    savedAt: incoming.syncedAt,
  };
}

export function defaultEventState(): AcademicEventState {
  return { read: false, done: false, ignored: false, pinned: false, updatedAt: "" };
}

export function updateEventState(
  cache: AcademicCache,
  eventId: string,
  patch: Partial<Omit<AcademicEventState, "updatedAt">>,
): AcademicCache {
  const current = cache.states[eventId] ?? defaultEventState();
  return {
    ...cache,
    states: {
      ...cache.states,
      [eventId]: { ...current, ...patch, updatedAt: new Date().toISOString() },
    },
  };
}
