import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type SetStateAction } from 'react';
import { DEFAULT_BUDGET, daysInMonth, monthOf } from '@/lib/daywell/budget';
import { DEFAULT_LAYOUT, normalizeLayout } from '@/lib/daywell/layout';
import { DEFAULT_PRAYER_SETTINGS } from '@/lib/daywell/prayer';
import { load, loadProfile, save, saveProfile, type Collection } from '@/lib/daywell/storage';
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

function usePersist<T>(userId: string | null, collection: Collection, value: T, onError: (failed: boolean) => void) {
  useEffect(() => {
    if (!userId) return;
    try { save(userId, collection, value); onError(false); } catch { onError(true); }
  }, [userId, collection, value, onError]);
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
  const [storageError, setStorageError] = useState(false);

  // Hydrate after mount: storage is browser-only and the shell is server-rendered.
  useEffect(() => {
    const p = loadProfile<Profile>();
    if (p) hydrate(p.id);
    setProfile(p);
    setReady(true);
  }, []);

  function hydrate(id: string) {
    const { dailyBudget, ...savedPrefs } = load<Partial<Preferences> & { dailyBudget?: number }>(id, 'user_preferences', {});
    const budget = savedPrefs.budget ?? (dailyBudget ? { ...DEFAULT_BUDGET, monthly: dailyBudget * daysInMonth(monthOf(toISODate(new Date()))) } : DEFAULT_BUDGET);
    setPrefs({ ...DEFAULT_PREFS, ...savedPrefs, budget, prayer: { ...DEFAULT_PREFS.prayer, ...savedPrefs.prayer }, reminders: { ...DEFAULT_PREFS.reminders, ...savedPrefs.reminders } });
    setTasks(load(id, 'tasks', []));
    setNotes(load(id, 'notes', [welcomeNote(id)]));
    setExpenses(load(id, 'expenses', []));
    setRoutines(load(id, 'class_routines', []));
    setSessions(load(id, 'class_sessions', []));
    setClassOverrides(load(id, 'class_overrides', {}));
    setPrayerLog(load(id, 'prayer_log', {}));
    setLayout(normalizeLayout(load<DashboardBlock[] | null>(id, 'dashboard_layouts', null)));
    setInbox(load(id, 'reminder_inbox', []));
    setReminderMeta(load(id, 'reminder_meta', { lastTick: Date.now(), firedIds: {} }));
  }

  const userId = profile?.id ?? null;
  const target = ready ? userId : null;
  usePersist(target, 'user_preferences', prefs, setStorageError);
  usePersist(target, 'tasks', tasks, setStorageError);
  usePersist(target, 'notes', notes, setStorageError);
  usePersist(target, 'expenses', expenses, setStorageError);
  usePersist(target, 'class_routines', routines, setStorageError);
  usePersist(target, 'class_sessions', sessions, setStorageError);
  usePersist(target, 'class_overrides', classOverrides, setStorageError);
  usePersist(target, 'prayer_log', prayerLog, setStorageError);
  usePersist(target, 'dashboard_layouts', layout, setStorageError);
  usePersist(target, 'reminder_inbox', inbox, setStorageError);
  usePersist(target, 'reminder_meta', reminderMeta, setStorageError);

  const setName = (name: string) => {
    const next: Profile = profile ? { ...profile, name } : { id: uid(), name, createdAt: new Date().toISOString() };
    saveProfile(next);
    if (!profile) hydrate(next.id);
    setProfile(next);
  };

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
    ready, profile, userId, setName, storageError,
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
