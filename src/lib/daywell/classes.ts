import { addDays, atTime, toISODate } from './time';
import type { ClassOverride, ClassSession, ISODate } from './types';

export type ClassOccurrence = {
  session: ClassSession;
  date: ISODate;
  key: string;
  scheduledStart: number;
  scheduledEnd: number;
};

export type ClassState =
  | { kind: 'active'; occ: ClassOccurrence; startedAt: number; elapsed: number; remaining: number; manual: boolean }
  | { kind: 'upcoming'; occ: ClassOccurrence; startsIn: number }
  | { kind: 'idle' };

export const occurrenceKey = (sessionId: string, date: ISODate) => `${sessionId}@${date}`;

export function classesOn(sessions: ClassSession[], date: ISODate): ClassOccurrence[] {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return sessions
    .filter(s => s.day === weekday)
    .map(session => ({
      session,
      date,
      key: occurrenceKey(session.id, date),
      scheduledStart: atTime(date, session.start).getTime(),
      scheduledEnd: atTime(date, session.end).getTime(),
    }))
    .sort((a, b) => a.scheduledStart - b.scheduledStart);
}

/**
 * Derived purely from timestamps (scheduled times + persisted manual overrides), so the
 * timer is correct after a refresh, a sleeping tab, or a timezone change.
 */
export function classState(sessions: ClassSession[], overrides: Record<string, ClassOverride>, now: number): ClassState {
  const today = toISODate(new Date(now));
  const todays = classesOn(sessions, today);
  const isActive = (o: ClassOccurrence) => {
    const ov = overrides[o.key];
    if (ov?.endedAt) return false;
    const startedAt = ov?.startedAt ?? o.scheduledStart;
    return now >= startedAt && now < o.scheduledEnd;
  };
  // Only one class can be active; a manually started class takes precedence.
  const active =
    todays.find(o => overrides[o.key]?.startedAt && isActive(o)) ?? todays.find(isActive);
  if (active) {
    const ov = overrides[active.key];
    const startedAt = ov?.startedAt ?? active.scheduledStart;
    return { kind: 'active', occ: active, startedAt, elapsed: now - startedAt, remaining: active.scheduledEnd - now, manual: !!ov?.startedAt };
  }
  for (let i = 0; i <= 7; i++) {
    const next = classesOn(sessions, addDays(today, i)).find(o => o.scheduledStart > now && !overrides[o.key]?.endedAt);
    if (next) return { kind: 'upcoming', occ: next, startsIn: next.scheduledStart - now };
  }
  return { kind: 'idle' };
}

export function classLabel(s: ClassSession) {
  return [s.courseCode, s.courseName].filter(Boolean).join(' · ') || 'Untitled class';
}
