import { classesOn, classLabel } from './classes';
import { PRAYERS, prayerTimesFor } from './prayer';
import { occurrencesBetween } from './tasks';
import { addDays, formatClock, formatTime, toISODate } from './time';
import type { ClassSession, Preferences, ReminderInstance, Task } from './types';

/**
 * Reminders are derived from the current data on every tick rather than stored as
 * independent timers. Editing or deleting an activity therefore reschedules or cancels
 * its reminder automatically, and a new prayer calculation moves prayer reminders.
 */
export function buildReminders(
  input: { tasks: Task[]; sessions: ClassSession[]; prefs: Preferences },
  now: number,
  windowStart: number,
  windowEnd: number,
): ReminderInstance[] {
  const { tasks, sessions, prefs } = input;
  const r = prefs.reminders;
  if (!r.enabled) return [];
  const out: ReminderInstance[] = [];
  const from = addDays(toISODate(new Date(windowStart)), -1);
  const days = Math.ceil((windowEnd - windowStart) / 86_400_000) + 2;

  if (r.tasks) {
    for (const o of occurrencesBetween(tasks, from, days, now)) {
      if (o.task.reminderMinutes == null || o.status === 'completed') continue;
      const fireAt = o.startAt.getTime() - o.task.reminderMinutes * 60_000;
      out.push({
        id: `task:${o.task.id}:${o.date}:${fireAt}`,
        kind: 'task',
        sourceId: o.task.id,
        date: o.date,
        fireAt,
        eventAt: o.startAt.getTime(),
        title: o.task.title,
        body: `${o.task.category} · starts at ${formatTime(o.task.start)}`,
      });
    }
  }

  if (r.classes) {
    for (let i = 0; i < days; i++) {
      for (const c of classesOn(sessions, addDays(from, i))) {
        const fireAt = c.scheduledStart - r.classMinutes * 60_000;
        out.push({
          id: `class:${c.session.id}:${c.date}:${fireAt}`,
          kind: 'class',
          sourceId: c.session.id,
          date: c.date,
          fireAt,
          eventAt: c.scheduledStart,
          title: classLabel(c.session),
          body: [`Class at ${formatTime(c.session.start)}`, c.session.room && `Room ${c.session.room}`, c.session.faculty].filter(Boolean).join(' · '),
        });
      }
    }
  }

  if (r.prayers) {
    const p = prefs.prayer;
    for (let i = 0; i < days; i++) {
      const times = prayerTimesFor(p, new Date(windowStart), i - 1);
      for (const name of PRAYERS) {
        if (!p.reminders[name]) continue;
        const at = times[name].getTime();
        const fireAt = at - p.reminderMinutes * 60_000;
        const date = toISODate(times[name]);
        out.push({
          id: `prayer:${name}:${date}:${fireAt}`,
          kind: 'prayer',
          sourceId: name,
          date,
          fireAt,
          eventAt: at,
          title: `${name} prayer`,
          body: `${name} at ${formatClock(times[name], p.timeZone)} · ${p.locationName}`,
        });
      }
    }
  }

  return out.filter(x => x.fireAt > windowStart && x.fireAt <= windowEnd).sort((a, b) => a.fireAt - b.fireAt);
}
