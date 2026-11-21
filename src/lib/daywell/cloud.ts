import type { Collection } from './storage';
import { load, loadProfile } from './storage';
import { getSupabase } from './supabase';
import {
  expenseFromRow, expenseToRow, noteFromRow, noteToRow, overrideFromRow, prayerMap, routineFromRow, routineToRow, sessionFromRow, sessionToRow, taskFromRow, taskToRow,
  type ExpenseRow, type NoteRow, type OverrideRow, type PrayerRow, type ProfileRow, type RoutineRow, type SessionRow, type TaskRow,
} from './records';
import type { ClassOverride, ClassRoutine, ClassSession, DashboardBlock, Expense, InboxItem, Note, Preferences, Task } from './types';

export type Account = {
  email: string;
  name: string;
  createdAt: string;
  prefs: Partial<Preferences>;
  tasks: Task[];
  notes: Note[];
  expenses: Expense[];
  routines: ClassRoutine[];
  sessions: ClassSession[];
  overrides: Record<string, ClassOverride>;
  prayerLog: Record<string, string[]>;
  layout: DashboardBlock[] | null;
  inbox: InboxItem[];
  reminderMeta: { lastTick: number; firedIds: Record<string, number> } | null;
};

const tails = new Map<string, Promise<unknown>>();

function enqueue<T>(key: string, job: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.then(job, job);
  tails.set(key, run.then(() => undefined, () => undefined));
  return run;
}

function explain(error: { message: string; code?: string }) {
  console.error(error);
  if (error.code === 'PGRST205' || error.code === '42P01' || /does not exist|schema cache/i.test(error.message)) {
    return 'The Supabase tables are not there yet. Open the SQL editor, run db/schema.sql, then try again.';
  }
  return 'That change could not be saved to your account. Check your connection — it will retry on the next change.';
}

function emptyAccount(email: string): Account {
  return {
    email, name: email.split('@')[0] ?? '', createdAt: new Date().toISOString(), prefs: {},
    tasks: [], notes: [], expenses: [], routines: [], sessions: [], overrides: {}, prayerLog: {},
    layout: null, inbox: [], reminderMeta: null,
  };
}

function isBlank(account: Account) {
  return !account.tasks.length && !account.notes.length && !account.expenses.length && !account.sessions.length && !account.routines.length;
}

/** First sign-in keeps whatever was saved on this device before accounts existed. */
function claimLocal(userId: string, account: Account): Account {
  const local = loadProfile<{ id: string; name: string }>();
  if (!local || !isBlank(account)) return account;
  const own = <T extends { userId: string }>(rows: T[]) => rows.map(row => ({ ...row, userId }));
  return {
    ...account,
    name: account.name || local.name,
    prefs: load(local.id, 'user_preferences', account.prefs),
    tasks: own(load<Task[]>(local.id, 'tasks', [])),
    notes: own(load<Note[]>(local.id, 'notes', [])),
    expenses: own(load<Expense[]>(local.id, 'expenses', [])),
    routines: own(load<ClassRoutine[]>(local.id, 'class_routines', [])),
    sessions: own(load<ClassSession[]>(local.id, 'class_sessions', [])),
    overrides: load(local.id, 'class_overrides', {}),
    prayerLog: load(local.id, 'prayer_log', {}),
    layout: load<DashboardBlock[] | null>(local.id, 'dashboard_layouts', null),
    inbox: load(local.id, 'reminder_inbox', []),
    reminderMeta: load(local.id, 'reminder_meta', null),
  };
}

export async function loadAccount(userId: string, email: string): Promise<{ account: Account; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { account: emptyAccount(email), error: 'Supabase is not connected yet.' };
  const [profile, tasks, notes, expenses, routines, sessions, overrides, prayers] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('tasks').select('*').eq('user_id', userId),
    supabase.from('notes').select('*').eq('user_id', userId),
    supabase.from('expenses').select('*').eq('user_id', userId),
    supabase.from('class_routines').select('*').eq('user_id', userId),
    supabase.from('class_sessions').select('*').eq('user_id', userId),
    supabase.from('class_overrides').select('*').eq('user_id', userId),
    supabase.from('prayer_log').select('*').eq('user_id', userId),
  ]);
  const failed = [profile, tasks, notes, expenses, routines, sessions, overrides, prayers].find(r => r.error);
  if (failed?.error) return { account: emptyAccount(email), error: explain(failed.error) };
  const row = profile.data as ProfileRow | null;
  const overrideMap: Record<string, ClassOverride> = {};
  for (const item of ((overrides.data ?? []) as OverrideRow[]).map(overrideFromRow)) overrideMap[item.key] = item.value;
  const loginEmail = email || row?.email || '';
  if (!failed && loginEmail && row?.email && row.email !== loginEmail) void saveProfileEmail(userId, loginEmail);
  const account = claimLocal(userId, {
    email: loginEmail,
    name: row?.display_name || email.split('@')[0] || '',
    createdAt: row?.created_at ?? new Date().toISOString(),
    prefs: row?.preferences ?? {},
    tasks: ((tasks.data ?? []) as TaskRow[]).map(taskFromRow),
    notes: ((notes.data ?? []) as NoteRow[]).map(noteFromRow),
    expenses: ((expenses.data ?? []) as ExpenseRow[]).map(expenseFromRow),
    routines: ((routines.data ?? []) as RoutineRow[]).map(routineFromRow),
    sessions: ((sessions.data ?? []) as SessionRow[]).map(sessionFromRow),
    overrides: overrideMap,
    prayerLog: prayerMap((prayers.data ?? []) as PrayerRow[]),
    layout: row?.layout?.length ? row.layout : null,
    inbox: row?.reminder_inbox ?? [],
    reminderMeta: row?.reminder_meta ?? null,
  });
  return { account, error: null };
}

async function replaceRows(table: string, userId: string, rows: object[]) {
  const supabase = getSupabase();
  if (!supabase) return 'Supabase is not connected yet.';
  const removed = await supabase.from(table).delete().eq('user_id', userId);
  if (removed.error) return explain(removed.error);
  if (!rows.length) return null;
  const inserted = await supabase.from(table).insert(rows);
  return inserted.error ? explain(inserted.error) : null;
}

async function saveProfileColumn(userId: string, patch: Record<string, unknown>) {
  const supabase = getSupabase();
  if (!supabase) return 'Supabase is not connected yet.';
  const { error } = await supabase.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', userId);
  return error ? explain(error) : null;
}

export function saveDisplayName(userId: string, name: string) {
  return enqueue('profiles', () => saveProfileColumn(userId, { display_name: name }));
}

export function saveProfileEmail(userId: string, email: string) {
  return enqueue('profiles', () => saveProfileColumn(userId, { email }));
}

export function saveCollection(userId: string, collection: Collection, value: unknown): Promise<string | null> {
  if (collection === 'user_preferences') return enqueue('profiles', () => saveProfileColumn(userId, { preferences: value }));
  if (collection === 'dashboard_layouts') return enqueue('profiles', () => saveProfileColumn(userId, { layout: value }));
  if (collection === 'reminder_inbox') return enqueue('profiles', () => saveProfileColumn(userId, { reminder_inbox: value }));
  if (collection === 'reminder_meta') return enqueue('profiles', () => saveProfileColumn(userId, { reminder_meta: value }));
  return enqueue(collection, async () => {
    if (collection === 'tasks') return replaceRows('tasks', userId, await Promise.all((value as Task[]).map(t => taskToRow(userId, t))));
    if (collection === 'notes') return replaceRows('notes', userId, await Promise.all((value as Note[]).map(n => noteToRow(userId, n))));
    if (collection === 'expenses') return replaceRows('expenses', userId, await Promise.all((value as Expense[]).map(e => expenseToRow(userId, e))));
    if (collection === 'class_routines') return replaceRows('class_routines', userId, await Promise.all((value as ClassRoutine[]).map(r => routineToRow(userId, r))));
    if (collection === 'class_sessions') return replaceRows('class_sessions', userId, await Promise.all((value as ClassSession[]).map(s => sessionToRow(userId, s))));
    if (collection === 'class_overrides') {
      const entries = Object.entries(value as Record<string, ClassOverride>);
      return replaceRows('class_overrides', userId, entries.map(([key, v]) => ({ user_id: userId, occurrence_key: key, started_at: v.startedAt ?? null, ended_at: v.endedAt ?? null })));
    }
    if (collection === 'prayer_log') {
      const rows = Object.entries(value as Record<string, string[]>).flatMap(([day, prayers]) => prayers.map(prayer => ({ user_id: userId, day, prayer })));
      return replaceRows('prayer_log', userId, rows);
    }
    return null;
  });
}

export function explainAuth(message: string) {
  const m = message.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'That email and password don’t match.';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('already exists')) return 'An account with this email already exists.';
  if (m.includes('not confirmed')) return 'Confirm that email first, then sign in.';
  if (m.includes('different from the old')) return 'Choose a different password from the one you use now.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  if (m.includes('password')) return 'Use a password of at least 6 characters.';
  return message;
}
