// Local repository used during the pre-authentication phase. Collections map 1:1 to the
// tables in db/schema.sql and are namespaced by user id, so swapping this module for an
// API-backed implementation (and uploading the local data on first sign-in) is isolated here.

const PREFIX = 'daywell:v1';

export type Collection =
  | 'user_preferences'
  | 'tasks'
  | 'notes'
  | 'expenses'
  | 'class_routines'
  | 'class_sessions'
  | 'class_overrides'
  | 'prayer_log'
  | 'dashboard_layouts'
  | 'reminder_inbox'
  | 'reminder_meta';

const available = () => typeof window !== 'undefined' && !!window.localStorage;

export function loadProfile<T>(): T | null {
  if (!available()) return null;
  try {
    const raw = localStorage.getItem(`${PREFIX}:profile`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveProfile<T>(profile: T) {
  localStorage.setItem(`${PREFIX}:profile`, JSON.stringify(profile));
}

export function load<T>(userId: string, collection: Collection, fallback: T): T {
  if (!available()) return fallback;
  try {
    const raw = localStorage.getItem(`${PREFIX}:${userId}:${collection}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Throws when the write fails (e.g. quota exceeded) so callers can surface it and retry. */
export function save<T>(userId: string, collection: Collection, value: T) {
  localStorage.setItem(`${PREFIX}:${userId}:${collection}`, JSON.stringify(value));
}
