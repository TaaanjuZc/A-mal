import { addDays, atTime, parseISODate } from './time';
import type { ISODate, Task, TaskOccurrence, TaskStatus } from './types';

export const DEFAULT_CATEGORIES = ['Work', 'Study', 'Personal', 'Health', 'Ideas'];

export function occursOn(task: Task, date: ISODate): boolean {
  if (date < task.date) return false;
  if (task.recurrenceUntil && date > task.recurrenceUntil) return false;
  const d = parseISODate(date);
  const origin = parseISODate(task.date);
  switch (task.recurrence) {
    case 'none': return date === task.date;
    case 'daily': return true;
    case 'weekdays': return d.getDay() !== 5 && d.getDay() !== 6;
    case 'weekly': return d.getDay() === origin.getDay();
    case 'monthly': return d.getDate() === origin.getDate();
  }
}

export function taskStatus(task: Task, date: ISODate, now: number): TaskStatus {
  const manual = task.statusOverrides[date];
  if (manual === 'completed') return 'completed';
  const { startAt, endAt } = occurrenceWindow(task, date);
  if (manual === 'in_progress') return now > endAt.getTime() ? 'overdue' : 'in_progress';
  if (now < startAt.getTime()) return 'upcoming';
  if (now <= endAt.getTime()) return 'in_progress';
  // Time passing never marks a task as done — it stays overdue until the user resolves it.
  return 'overdue';
}

export function occurrenceWindow(task: Task, date: ISODate) {
  const startAt = atTime(date, task.start);
  const endAt = atTime(date, task.end || task.start);
  if (endAt < startAt) endAt.setDate(endAt.getDate() + 1);
  return { startAt, endAt };
}

export function occurrencesOn(tasks: Task[], date: ISODate, now: number): TaskOccurrence[] {
  return tasks
    .filter(t => occursOn(t, date))
    .map(task => ({ task, date, ...occurrenceWindow(task, date), status: taskStatus(task, date, now) }))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

export function occurrencesBetween(tasks: Task[], from: ISODate, days: number, now: number) {
  const out: TaskOccurrence[] = [];
  for (let i = 0; i < days; i++) out.push(...occurrencesOn(tasks, addDays(from, i), now));
  return out;
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  upcoming: 'Upcoming',
  in_progress: 'In progress',
  completed: 'Completed',
  overdue: 'Overdue',
};

export const RECURRENCE_LABEL: Record<Task['recurrence'], string> = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekdays: 'Weekdays (Sun–Thu)',
  weekly: 'Every week',
  monthly: 'Every month',
};
