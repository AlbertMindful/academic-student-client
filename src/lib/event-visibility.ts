import type { AcademicEvent, AcademicEventState } from "@/lib/types";

const DAY_MS = 86_400_000;

function parseMoment(value?: string): number | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00+08:00`
    : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function ageInDays(value: string | undefined, now: number): number | null {
  const timestamp = parseMoment(value);
  return timestamp == null ? null : (now - timestamp) / DAY_MS;
}

function eventEnd(event: AcademicEvent): number | null {
  return parseMoment(event.endsAt ?? event.dueAt ?? event.startsAt ?? event.dueOn ?? event.startsOn);
}

function recentlyAdded(event: AcademicEvent, days: number, now: number): boolean {
  const age = ageInDays(event.publishedAt ?? event.firstSeenAt ?? event.updatedAt, now);
  return age != null && age >= -1 && age <= days;
}

/**
 * Whether an event still deserves space in the daily information flow.
 *
 * The rules intentionally differ by event lifecycle: an upcoming exam remains
 * useful even after it is read, while an old notice or imported historical
 * grade does not. Pinned items are the explicit user override.
 */
export function isCurrentAcademicEvent(
  event: AcademicEvent,
  state: AcademicEventState | undefined,
  currentSemesterId: string | undefined,
  now = Date.now(),
): boolean {
  if (state?.pinned) return true;
  if (state?.done || state?.ignored) return false;

  const end = eventEnd(event);
  switch (event.kind) {
    case "class":
      return end != null && end >= now - 3 * 60 * 60 * 1000 && end <= now + 7 * DAY_MS;
    case "exam":
      return end != null
        ? end >= now - 6 * 60 * 60 * 1000
        : !state?.read && recentlyAdded(event, 30, now);
    case "assignment":
      return end != null
        ? end >= now - DAY_MS
        : !state?.read && recentlyAdded(event, 30, now);
    case "schedule_change":
      return end != null && end >= now - DAY_MS
        ? true
        : !state?.read && recentlyAdded(event, 14, now);
    case "grade":
      // The provider has no publication time for grades. Limit alerts to newly
      // discovered records from the current semester so an initial historical
      // import cannot create dozens of false notifications.
      return Boolean(
        currentSemesterId &&
        event.semesterId === currentSemesterId &&
        !state?.read &&
        recentlyAdded(event, 14, now),
      );
    case "material":
      return !state?.read && recentlyAdded(event, 14, now);
    case "notice":
      return !state?.read && recentlyAdded(event, 30, now);
  }
}

export function isHistoricalAcademicEvent(
  event: AcademicEvent,
  state: AcademicEventState | undefined,
  currentSemesterId: string | undefined,
  now = Date.now(),
): boolean {
  if (state?.done || state?.ignored || isCurrentAcademicEvent(event, state, currentSemesterId, now)) return false;
  // Classes beyond the seven-day activity horizon are upcoming, not history;
  // they remain available in the full schedule without cluttering this feed.
  if (event.kind === "class") {
    const end = eventEnd(event);
    return end != null && end < now - 3 * 60 * 60 * 1000;
  }
  return true;
}
