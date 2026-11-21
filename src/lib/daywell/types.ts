// Every user-owned record carries `userId` so the local profile can later be
// migrated 1:1 into an authenticated account (see db/schema.sql).

export type ISODate = string; // YYYY-MM-DD in the user's local calendar
export type HHmm = string; // 24h "HH:mm"

export type Profile = { id: string; name: string; email: string; createdAt: string };

export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';
export type TaskStatus = 'upcoming' | 'in_progress' | 'completed' | 'overdue';

export type Task = {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  date: ISODate;
  start: HHmm;
  end: HHmm;
  reminderMinutes: number | null;
  recurrence: Recurrence;
  recurrenceUntil: ISODate | null;
  /** Manual status per occurrence date; absent means "follow the schedule". */
  statusOverrides: Record<ISODate, 'in_progress' | 'completed'>;
  createdAt: string;
  updatedAt: string;
};

export type TaskOccurrence = { task: Task; date: ISODate; startAt: Date; endAt: Date; status: TaskStatus };

export type Expense = { id: string; userId: string; title: string; amount: number; category: string; date: ISODate };

export type BlockType = 'paragraph' | 'heading' | 'subheading' | 'bullet' | 'numbered' | 'todo' | 'quote' | 'divider';
export type BlockMarks = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean };
export type NoteBlock = { id: string; type: BlockType; text: string; checked?: boolean; marks?: BlockMarks };
export type NoteColor = 'yellow' | 'lime' | 'lilac' | 'coral' | 'sky' | 'mint' | 'plain';
/** 'everyday' notes have a checklist that starts fresh each day; 'journal' notes belong to one date. */
export type NoteKind = 'note' | 'everyday' | 'journal';
/** Snapshot of an everyday note's checklist on one date; today's is kept in sync with the live checklist. */
export type EverydayRecord = { items: { id: string; text: string; done: boolean }[] };
export type Note = {
  id: string;
  userId: string;
  title: string;
  category: string;
  color: NoteColor;
  blocks: NoteBlock[];
  /** Absent means 'note'. */
  kind?: NoteKind;
  journalDate?: ISODate;
  days?: Record<ISODate, EverydayRecord>;
  createdAt: string;
  updatedAt: string;
};

export type ClassSession = {
  id: string;
  userId: string;
  routineId: string | null;
  courseName: string;
  courseCode: string;
  day: number; // 0 = Sunday … 6 = Saturday
  start: HHmm;
  end: HHmm;
  room: string;
  faculty: string;
  section: string;
};

export type ClassRoutine = { id: string; userId: string; name: string; sourceFile: string | null; createdAt: string };

/** Manual start/end of a specific class occurrence, keyed by `${sessionId}@${date}`. */
export type ClassOverride = { startedAt?: number; endedAt?: number };

export type PrayerName = 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';
export type PrayerMethod =
  | 'Karachi' | 'MuslimWorldLeague' | 'Egyptian' | 'UmmAlQura' | 'Dubai' | 'MoonsightingCommittee'
  | 'NorthAmerica' | 'Kuwait' | 'Qatar' | 'Singapore' | 'Tehran' | 'Turkey';
export type PrayerSettings = {
  locationName: string;
  latitude: number;
  longitude: number;
  timeZone: string;
  method: PrayerMethod;
  madhab: 'hanafi' | 'shafi';
  /** 'islamic-foundation' adds Bangladesh's official safety minutes; unset means "Bangladesh locations only". */
  timetable?: 'islamic-foundation' | 'astronomical';
  adjustments: Record<PrayerName, number>;
  reminders: Record<PrayerName, boolean>;
  reminderMinutes: number;
};

export type ReminderSettings = {
  enabled: boolean;
  tasks: boolean;
  classes: boolean;
  prayers: boolean;
  browser: boolean;
  defaultTaskMinutes: number;
  classMinutes: number;
};

export type DashboardBlockId =
  | 'greeting' | 'stats' | 'today' | 'upcoming' | 'namaz' | 'classes' | 'activeClass' | 'notes' | 'reminders' | 'inspiration';
export type BlockSize = 'sm' | 'md' | 'lg' | 'full';
export type DashboardBlock = { id: DashboardBlockId; order: number; size: BlockSize; visible: boolean };

export type Preferences = {
  dark: boolean;
  categories: string[];
  lifestyle: string;
  prayer: PrayerSettings;
  reminders: ReminderSettings;
  budget: BudgetSettings;
};

/** `monthly` 0 means no limit set yet. Category limits are per month too. */
export type BudgetSettings = { monthly: number; categoryLimits: Record<string, number> };

export type ReminderKind = 'task' | 'class' | 'prayer';
export type ReminderInstance = {
  /** Includes fire time so rescheduling yields a new id and the stale one disappears. */
  id: string;
  kind: ReminderKind;
  sourceId: string;
  date: ISODate;
  fireAt: number;
  eventAt: number;
  title: string;
  body: string;
};
export type InboxItem = ReminderInstance & { missed: boolean; read: boolean; deliveredAt: number };
