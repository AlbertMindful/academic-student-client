"use client";

import type {
  AcademicEvent,
  AcademicEventState,
  AcademicSyncPayload,
} from "@/lib/types";
import { scoreAcademicEvent } from "@/lib/academic-events";

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

function key(studentId: string): string {
  return `student:${studentId}`;
}

export async function loadAcademicCache(studentId: string): Promise<AcademicCache | null> {
  try {
    return (await transact("readonly", (store) => store.get(key(studentId)))) ?? null;
  } catch {
    return null;
  }
}

export async function saveAcademicCache(studentId: string, cache: AcademicCache): Promise<void> {
  try {
    await transact("readwrite", (store) => store.put(cache, key(studentId)));
  } catch {
    // A private browsing policy may deny IndexedDB. The live view remains usable.
  }
}

function meaningfulSignature(event: AcademicEvent): string {
  return JSON.stringify({
    kind: event.kind,
    title: event.title,
    summary: event.summary,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    dueAt: event.dueAt,
    location: event.location,
    status: event.status,
    sources: event.sources.map(({ provider, sourceId }) => ({ provider, sourceId })),
  });
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
  const previousById = new Map(previous?.payload.events.map((event) => [event.id, event]));
  const events = incoming.events.map((event) => {
    const old = previousById.get(event.id);
    if (!old) return event;
    const changed = meaningfulSignature(old) !== meaningfulSignature(event);
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
  }

  return {
    payload: {
      ...incoming,
      events,
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
