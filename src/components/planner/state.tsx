import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type SetStateAction } from 'react';
import type { Session } from '@supabase/supabase-js';
import { DEFAULT_BUDGET, daysInMonth, monthOf } from '@/lib/daywell/budget';
import { explainAuth, loadAccount, saveCollection, saveDisplayName, saveProfileEmail, type Account } from '@/lib/daywell/cloud';
import { DEFAULT_LAYOUT, normalizeLayout } from '@/lib/daywell/layout';
import { DEFAULT_PRAYER_SETTINGS } from '@/lib/daywell/prayer';
import { save, type Collection } from '@/lib/daywell/storage';
import { getSupabase, supabaseConfigured } from '@/lib/daywell/supabase';
import { DEFAULT_CATEGORIES } from '@/lib/daywell/tasks';
import { toISODate, uid } from '@/lib/daywell/time';
import type {
  ClassOverride, ClassRoutine, ClassSession, DashboardBlock, Expense, InboxItem, ISODate, Note, Preferences, Profile, Task,
} from '@/lib/daywell/types';

export type { Task, Expense, Note } from '@/lib/daywell/types';

const DEFAULT_PREFS: Preferences = {
  dark: true,
  categories: DEFAULT_CATEGORIES,
  lifestyle: 'Student',
  prayer: DEFAULT_PRAYER_SETTINGS,
  reminders: { enabled: true, tasks: true, classes: true, prayers: true, browser: false, defaultTaskMinutes: 10, classMinutes: 10 },
  budget: DEFAULT_BUDGET,
};

function welcomeNote(userId: string): Note {
  const now = new Date().toISOString();
  const b = (type: Note['blocks'][number]['type'], text = '', extra = {}) => ({ id: uid(), type, text, ...extra });
  return {
    id: uid(), userId, title: 'Little things, big days.', category: 'Personal', color: 'yellow', createdAt: now, updatedAt: now,
    blocks: [
      b('paragraph', 'A good day doesn’t have to be a perfect day. Show up, do what matters, and leave a little room to breathe.'),
      b('subheading', 'Try it out'),
      b('todo', 'Press Enter to add a new block', { checked: true }),
      b('todo', 'Use the block menu to turn this into a heading, list, or quote'),
      b('quote', 'Less, but better.'),
    ],
  };
}

type Meta = { lastTick: number; firedIds: Record<string, number> };

function usePersist<T>(userId: string | null, collection: Collection, value: T, enabled: boolean, onError: (message: string) => void) {
  useEffect(() => {
    if (!enabled || !userId) return;
    try { save(userId, collection, value); } catch { onError('This browser blocked local storage. Your account is still the copy that matters.'); }
    const handle = window.setTimeout(() => { void saveCollection(userId, collection, value).then(err => onError(err ?? '')); }, 500);
    return () => window.clearTimeout(handle);
  }, [enabled, userId, collection, value, onError]);
}

function mergePrefs(saved: Partial<Preferences> & { dailyBudget?: number }): Preferences {
  const { dailyBudget, ...rest } = saved;
  const budget = rest.budget ?? (dailyBudget ? { ...DEFAULT_BUDGET, monthly: dailyBudget * daysInMonth(monthOf(toISODate(new Date()))) } : DEFAULT_BUDGET);
  return { ...DEFAULT_PREFS, ...rest, budget, prayer: { ...DEFAULT_PREFS.prayer, ...rest.prayer }, reminders: { ...DEFAULT_PREFS.reminders, ...rest.reminders } };
}

async function withCurrentPassword(email: string, password: string) {
  const supabase = getSupabase();
  if (!supabase) return { supabase: null, error: 'Supabase is not connected yet.' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { supabase: null, error: explainAuth(error.message) } : { supabase, error: null };
}

function usePlannerState() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [routines, setRoutines] = useState<ClassRoutine[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [classOverrides, setClassOverrides] = useState<Record<string, ClassOverride>>({});
  const [prayerLog, setPrayerLog] = useState<Record<ISODate, string[]>>({});
  const [layout, setLayout] = useState<DashboardBlock[]>(DEFAULT_LAYOUT);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [reminderMeta, setReminderMeta] = useState<Meta>({ lastTick: 0, firedIds: {} });
  const [storageError, setStorageError] = useState('');
  const [persist, setPersist] = useState(false);
  const signedIn = useRef<string | null>(null);

  const applyAccount = useCallback((userId: string, account: Account, failed: boolean) => {
    setPrefs(mergePrefs(account.prefs));
    setTasks(account.tasks);
    setNotes(!failed && account.notes.length === 0 ? [welcomeNote(userId)] : account.notes);
    setExpenses(account.expenses);
    setRoutines(account.routines);
    setSessions(account.sessions);
    setClassOverrides(account.overrides);
    setPrayerLog(account.prayerLog);
    setLayout(normalizeLayout(account.layout));
    setInbox(account.inbox);
    setReminderMeta(account.reminderMeta ?? { lastTick: Date.now(), firedIds: {} });
    setProfile({ id: userId, name: account.name, email: account.email, createdAt: account.createdAt });
  }, []);

  const clearAccount = useCallback(() => {
    setProfile(null);
    setPrefs(DEFAULT_PREFS);
    setTasks([]);
    setNotes([]);
    setExpenses([]);
    setRoutines([]);
    setSessions([]);
    setClassOverrides({});
    setPrayerLog({});
    setLayout(DEFAULT_LAYOUT);
    setInbox([]);
    setReminderMeta({ lastTick: 0, firedIds: {} });
  }, []);

  const enter = useCallback((session: Session | null) => {
    if (!session) {
      signedIn.current = null;
      setPersist(false);
      clearAccount();
      setReady(true);
      return;
    }
    if (signedIn.current === session.user.id) return;
    signedIn.current = session.user.id;
    setPersist(false);
    setReady(false);
    const userId = session.user.id;
    void loadAccount(userId, session.user.email ?? '').then(({ account, error }) => {
      if (signedIn.current !== userId) return;
      applyAccount(userId, account, Boolean(error));
      setStorageError(error ?? '');
      setReady(true);
      if (!error) setPersist(true);
    });
  }, [applyAccount, clearAccount]);

  // Hydrate after mount: the session lives in the browser, and the shell is server-rendered.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) { setReady(true); return; }
    void supabase.auth.getSession().then(({ data }) => enter(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return;
      if (event === 'USER_UPDATED' && session && signedIn.current === session.user.id) {
        const email = session.user.email ?? '';
        if (email) {
          setProfile(p => (p && p.id === session.user.id && p.email !== email ? { ...p, email } : p));
          void saveProfileEmail(session.user.id, email);
        }
        return;
      }
      setTimeout(() => enter(session), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [enter]);

  const userId = profile?.id ?? null;
  usePersist(userId, 'user_preferences', prefs, persist, setStorageError);
  usePersist(userId, 'tasks', tasks, persist, setStorageError);
  usePersist(userId, 'notes', notes, persist, setStorageError);
  usePersist(userId, 'expenses', expenses, persist, setStorageError);
  usePersist(userId, 'class_routines', routines, persist, setStorageError);
  usePersist(userId, 'class_sessions', sessions, persist, setStorageError);
  usePersist(userId, 'class_overrides', classOverrides, persist, setStorageError);
  usePersist(userId, 'prayer_log', prayerLog, persist, setStorageError);
  usePersist(userId, 'dashboard_layouts', layout, persist, setStorageError);
  usePersist(userId, 'reminder_inbox', inbox, persist, setStorageError);
  usePersist(userId, 'reminder_meta', reminderMeta, persist, setStorageError);

  useEffect(() => {
    if (!persist || !profile) return;
    const handle = window.setTimeout(() => { void saveDisplayName(profile.id, profile.name).then(err => setStorageError(err ?? '')); }, 400);
    return () => window.clearTimeout(handle);
  }, [persist, profile]);

  const setName = (name: string) => setProfile(p => (p ? { ...p, name } : p));

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) return 'Supabase is not connected yet.';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? explainAuth(error.message) : null;
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) return 'Supabase is not connected yet.';
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name } } });
    if (error) return explainAuth(error.message);
    if (!data.session) return 'Confirm that email, then sign in.';
    return null;
  }, []);

  const signOut = useCallback(async () => {
    setPersist(false);
    await getSupabase()?.auth.signOut();
  }, []);

  const updateEmail = useCallback(async (nextEmail: string, currentPassword: string) => {
    const current = profile?.email ?? '';
    const email = nextEmail.trim().toLowerCase();
    if (!profile || !current) return { error: 'Sign in again, then change the email.' };
    if (email === current.toLowerCase()) return { error: 'That is already the email on this account.' };
    const { supabase, error } = await withCurrentPassword(current, currentPassword);
    if (!supabase || error) return { error: error ?? 'Supabase is not connected yet.' };
    const { data, error: updateError } = await supabase.auth.updateUser({ email });
    if (updateError) return { error: explainAuth(updateError.message) };
    const confirmed = (data.user?.email ?? '').toLowerCase() === email;
    if (!confirmed) return { notice: `Confirm ${email} from the message Supabase sends. Sign in with that address afterwards.` };
    setProfile(p => (p ? { ...p, email: data.user?.email ?? email } : p));
    const saved = await saveProfileEmail(profile.id, data.user?.email ?? email);
    return saved ? { error: saved } : { notice: 'Email updated. Sign in with it next time.' };
  }, [profile]);

  const updatePassword = useCallback(async (currentPassword: string, nextPassword: string) => {
    const current = profile?.email ?? '';
    if (!current) return { error: 'Sign in again, then change the password.' };
    if (nextPassword.length < 6) return { error: 'Use a password of at least 6 characters.' };
    const { supabase, error } = await withCurrentPassword(current, currentPassword);
    if (!supabase || error) return { error: error ?? 'Supabase is not connected yet.' };
    const { error: updateError } = await supabase.auth.updateUser({ password: nextPassword });
    return updateError ? { error: explainAuth(updateError.message) } : { notice: 'Password updated.' };
  }, [profile]);

  const updatePrefs = useCallback((patch: SetStateAction<Preferences>) => setPrefs(patch), []);
  const setDark = useCallback((dark: boolean) => setPrefs(p => ({ ...p, dark })), []);

  const addTask = useCallback((t: Omit<Task, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'statusOverrides'>) => {
    const now = new Date().toISOString();
    setTasks(p => [...p, { ...t, id: uid(), userId: userId ?? '', statusOverrides: {}, createdAt: now, updatedAt: now }]);
  }, [userId]);
  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks(p => p.map(t => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)));
  }, []);
  const deleteTask = useCallback((id: string) => setTasks(p => p.filter(t => t.id !== id)), []);
  const setOccurrenceStatus = useCallback((id: string, date: ISODate, status: 'in_progress' | 'completed' | null) => {
    setTasks(p => p.map(t => {
      if (t.id !== id) return t;
      const statusOverrides = { ...t.statusOverrides };
      if (status) statusOverrides[date] = status; else delete statusOverrides[date];
      return { ...t, statusOverrides, updatedAt: new Date().toISOString() };
    }));
  }, []);

  const addNote = useCallback((init: Partial<Pick<Note, 'title' | 'kind' | 'journalDate' | 'blocks'>> = {}) => {
    const now = new Date().toISOString();
    const note: Note = { id: uid(), userId: userId ?? '', title: '', category: 'Personal', color: 'plain', createdAt: now, updatedAt: now, blocks: [{ id: uid(), type: 'paragraph', text: '' }], ...init };
    setNotes(p => [note, ...p]);
    return note.id;
  }, [userId]);
  const saveNote = useCallback((note: Note) => {
    setNotes(p => p.map(n => (n.id === note.id ? { ...note, updatedAt: new Date().toISOString() } : n)));
  }, []);
  const deleteNote = useCallback((id: string) => setNotes(p => p.filter(n => n.id !== id)), []);
  const deleteNotes = useCallback((ids: string[]) => { const gone = new Set(ids); setNotes(p => p.filter(n => !gone.has(n.id))); }, []);

  const togglePrayer = useCallback((name: string, date: ISODate = toISODate(new Date())) => {
    setPrayerLog(log => {
      const day = log[date] ?? [];
      return { ...log, [date]: day.includes(name) ? day.filter(x => x !== name) : [...day, name] };
    });
  }, []);

  const startClass = useCallback((key: string) => {
    setClassOverrides(o => {
      const next = { ...o };
      // A manual start ends any other in-flight session so there is never more than one active.
      for (const [k, v] of Object.entries(next)) if (k !== key && v.startedAt && !v.endedAt) next[k] = { ...v, endedAt: Date.now() };
      next[key] = { startedAt: Date.now() };
      return next;
    });
  }, []);
  const endClass = useCallback((key: string) => setClassOverrides(o => ({ ...o, [key]: { ...o[key], endedAt: Date.now() } })), []);

  return {
    ready, configured: supabaseConfigured(), profile, userId, setName, storageError, signIn, signUp, signOut, updateEmail, updatePassword,
    prefs, updatePrefs, dark: prefs.dark, setDark,
    tasks, setTasks, addTask, updateTask, deleteTask, setOccurrenceStatus,
    notes, addNote, saveNote, deleteNote, deleteNotes,
    expenses, setExpenses,
    prayerLog, prayers: prayerLog[toISODate(new Date())] ?? [], togglePrayer,
    routines, setRoutines, sessions, setSessions, classOverrides, startClass, endClass,
    layout, setLayout,
    inbox, setInbox, reminderMeta, setReminderMeta,
  };
}

type State = ReturnType<typeof usePlannerState>;
const Context = createContext<State | null>(null);
export function PlannerProvider({ children }: { children: ReactNode }) {
  const state = usePlannerState();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function usePlanner() {
  const state = useContext(Context);
  if (!state) throw new Error('Planner provider missing');
  return state;
}

/** Re-renders on an interval; all time-based UI derives from this timestamp. */
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [intervalMs]);
  return now;
}
