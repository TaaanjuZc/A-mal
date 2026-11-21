import type { ClassOverride, ClassRoutine, ClassSession, Expense, Note, Task } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Stable id for a row. Existing UUID values stay put so class timers keep their keys. */
export async function asUuid(id: string) {
  if (UUID.test(id)) return id;
  const bytes = new TextEncoder().encode(`daywell:${id}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes)).slice(0, 16);
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x50;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type TaskRow = {
  id: string; user_id: string; title: string; description: string; category: string; task_date: string;
  start_time: string; end_time: string; reminder_minutes: number | null; recurrence: Task['recurrence'];
  recurrence_until: string | null; status_overrides: Task['statusOverrides']; created_at: string; updated_at: string;
};
export type NoteRow = {
  id: string; user_id: string; title: string; category: string; color: Note['color']; kind: NonNullable<Note['kind']>;
  journal_date: string | null; blocks: Note['blocks']; days: NonNullable<Note['days']>; created_at: string; updated_at: string;
};
export type ExpenseRow = { id: string; user_id: string; title: string; amount: number | string; category: string; spent_on: string };
export type RoutineRow = { id: string; user_id: string; name: string; source_file: string | null; created_at: string };
export type SessionRow = {
  id: string; user_id: string; routine_id: string | null; course_name: string; course_code: string; day_of_week: number;
  start_time: string; end_time: string; room: string; faculty: string; section: string;
};
export type OverrideRow = { occurrence_key: string; started_at: number | string | null; ended_at: number | string | null };
export type PrayerRow = { day: string; prayer: string };
export type ProfileRow = {
  email?: string; display_name?: string; created_at?: string; preferences?: Partial<import('./types').Preferences>;
  layout?: import('./types').DashboardBlock[]; reminder_inbox?: import('./types').InboxItem[];
  reminder_meta?: { lastTick: number; firedIds: Record<string, number> } | null;
};

const clock = (value: string) => value.slice(0, 5);

export async function taskToRow(userId: string, t: Task): Promise<TaskRow> {
  return {
    id: await asUuid(t.id), user_id: userId, title: t.title, description: t.description, category: t.category,
    task_date: t.date, start_time: t.start, end_time: t.end, reminder_minutes: t.reminderMinutes, recurrence: t.recurrence,
    recurrence_until: t.recurrenceUntil, status_overrides: t.statusOverrides, created_at: t.createdAt, updated_at: t.updatedAt,
  };
}

export function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id, userId: row.user_id, title: row.title, description: row.description, category: row.category,
    date: row.task_date, start: clock(row.start_time), end: clock(row.end_time), reminderMinutes: row.reminder_minutes,
    recurrence: row.recurrence, recurrenceUntil: row.recurrence_until, statusOverrides: row.status_overrides ?? {},
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function noteToRow(userId: string, n: Note): Promise<NoteRow> {
  return {
    id: await asUuid(n.id), user_id: userId, title: n.title, category: n.category, color: n.color, kind: n.kind ?? 'note',
    journal_date: n.journalDate ?? null, blocks: n.blocks, days: n.days ?? {}, created_at: n.createdAt, updated_at: n.updatedAt,
  };
}

export function noteFromRow(row: NoteRow): Note {
  const note: Note = {
    id: row.id, userId: row.user_id, title: row.title, category: row.category, color: row.color,
    blocks: row.blocks ?? [], kind: row.kind || 'note', days: row.days ?? {}, createdAt: row.created_at, updatedAt: row.updated_at,
  };
  if (row.journal_date) note.journalDate = row.journal_date;
  return note;
}

export async function expenseToRow(userId: string, e: Expense): Promise<ExpenseRow> {
  return { id: await asUuid(e.id), user_id: userId, title: e.title, amount: e.amount, category: e.category, spent_on: e.date };
}

export function expenseFromRow(row: ExpenseRow): Expense {
  return { id: row.id, userId: row.user_id, title: row.title, amount: Number(row.amount), category: row.category, date: row.spent_on };
}

export async function routineToRow(userId: string, r: ClassRoutine): Promise<RoutineRow> {
  return { id: await asUuid(r.id), user_id: userId, name: r.name, source_file: r.sourceFile, created_at: r.createdAt };
}

export function routineFromRow(row: RoutineRow): ClassRoutine {
  return { id: row.id, userId: row.user_id, name: row.name, sourceFile: row.source_file, createdAt: row.created_at };
}

export async function sessionToRow(userId: string, s: ClassSession): Promise<SessionRow> {
  return {
    id: await asUuid(s.id), user_id: userId, routine_id: s.routineId ? await asUuid(s.routineId) : null,
    course_name: s.courseName, course_code: s.courseCode, day_of_week: s.day, start_time: s.start, end_time: s.end,
    room: s.room, faculty: s.faculty, section: s.section,
  };
}

export function sessionFromRow(row: SessionRow): ClassSession {
  return {
    id: row.id, userId: row.user_id, routineId: row.routine_id, courseName: row.course_name, courseCode: row.course_code,
    day: Number(row.day_of_week), start: clock(row.start_time), end: clock(row.end_time), room: row.room, faculty: row.faculty, section: row.section,
  };
}

export function overrideFromRow(row: OverrideRow): { key: string; value: ClassOverride } {
  const value: ClassOverride = {};
  if (row.started_at != null) value.startedAt = Number(row.started_at);
  if (row.ended_at != null) value.endedAt = Number(row.ended_at);
  return { key: row.occurrence_key, value };
}

export function prayerMap(rows: PrayerRow[]) {
  const log: Record<string, string[]> = {};
  for (const row of rows) log[row.day] = [...(log[row.day] ?? []), row.prayer];
  return log;
}
