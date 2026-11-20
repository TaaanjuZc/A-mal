-- Daywell PostgreSQL schema (Supabase-compatible).
-- The app currently persists the same shapes in browser storage under a local profile id
-- (src/lib/daywell/storage.ts). On first sign-in, that id's records are uploaded and
-- re-owned by the authenticated user's id — no data model changes required.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ── Accounts (Phase 5: architecture only) ────────────────────────────────────
create table users (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null check (char_length(full_name) between 1 and 120),
  email            citext not null unique,
  password_hash    text not null,                 -- Argon2id
  email_verified_at timestamptz,                  -- required before full activation
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table auth_sessions (                     -- referenced by an HTTP-only, Secure, SameSite cookie
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  user_agent  text
);

create table auth_tokens (                       -- email verification and password reset
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  purpose     text not null check (purpose in ('verify_email', 'reset_password')),
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz
);

-- ── Preferences ──────────────────────────────────────────────────────────────
create table user_preferences (
  user_id        uuid primary key references users(id) on delete cascade,
  display_name   text not null,
  dark_mode      boolean not null default true,
  lifestyle      text,
  monthly_budget numeric(12, 2) not null default 0 check (monthly_budget >= 0),  -- 0 = not set
  category_limits jsonb not null default '{}',  -- { "Food": 5000, ... } per month
  prayer         jsonb not null,   -- location, lat/lng, time_zone, method, madhab, adjustments, reminders
  reminders      jsonb not null,   -- enabled, per-kind toggles, lead times, browser delivery
  updated_at     timestamptz not null default now()
);

-- ── Tasks ────────────────────────────────────────────────────────────────────
create table task_categories (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  name      text not null check (char_length(name) between 1 and 30),
  is_default boolean not null default false,
  unique (user_id, name)
);

create table tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  category_id      uuid references task_categories(id) on delete set null,
  title            text not null check (char_length(title) between 1 and 120),
  description      text not null default '',
  date             date not null,
  start_time       time not null,
  end_time         time not null,
  reminder_minutes integer check (reminder_minutes >= 0),
  recurrence       text not null default 'none' check (recurrence in ('none', 'daily', 'weekdays', 'weekly', 'monthly')),
  recurrence_until date,
  status_overrides jsonb not null default '{}',   -- { "YYYY-MM-DD": "in_progress" | "completed" }
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index tasks_user_date on tasks (user_id, date);

-- ── Notes ────────────────────────────────────────────────────────────────────
create table notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  title       text not null default '',
  category    text not null default 'Personal',
  color       text not null default 'plain',
  content     jsonb not null default '[]',   -- ordered blocks: { id, type, text, checked?, marks? }
  kind        text not null default 'note' check (kind in ('note', 'everyday', 'journal')),
  journal_date date,                         -- set only for kind = 'journal'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index notes_user_updated on notes (user_id, updated_at desc);
create unique index notes_one_journal_per_day on notes (user_id, journal_date) where kind = 'journal';

-- One row per day an 'everyday' note's checklist was used; items snapshot { id, text, done }.
create table note_daily_records (
  note_id     uuid not null references notes(id) on delete cascade,
  day         date not null,
  items       jsonb not null default '[]',
  primary key (note_id, day)
);

-- ── Class routines ───────────────────────────────────────────────────────────
create table uploaded_files (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    integer not null check (size_bytes between 1 and 10485760),
  storage_key   text not null,               -- private object-storage path, served via signed URLs only
  created_at    timestamptz not null default now()
);

create table class_routines (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  name            text not null,
  source_file_id  uuid references uploaded_files(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table class_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  routine_id   uuid references class_routines(id) on delete cascade,
  course_name  text not null default '',
  course_code  text not null default '',
  day_of_week  smallint not null check (day_of_week between 0 and 6),   -- 0 = Sunday
  start_time   time not null,
  end_time     time not null check (end_time > start_time),
  room         text not null default '',
  faculty      text not null default '',
  section      text not null default ''
);
create index class_sessions_user_day on class_sessions (user_id, day_of_week);

create table class_session_overrides (     -- manual start / end, one row per class occurrence
  session_id  uuid not null references class_sessions(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  date        date not null,
  started_at  timestamptz,
  ended_at    timestamptz,
  primary key (session_id, date)          -- prevents duplicate active sessions for the same class
);

-- ── Prayer times & reminders ─────────────────────────────────────────────────
create table prayer_times (               -- cache of calculated times per user, location and day
  user_id     uuid not null references users(id) on delete cascade,
  date        date not null,
  settings_hash text not null,            -- invalidates when location/method/madhab/adjustments change
  times       jsonb not null,             -- { Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha } as timestamptz
  primary key (user_id, date, settings_hash)
);

create table prayer_log (
  user_id  uuid not null references users(id) on delete cascade,
  date     date not null,
  prayer   text not null check (prayer in ('Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha')),
  primary key (user_id, date, prayer)
);

create table reminders (
  id           text primary key,          -- kind:source:date:fire_at — rescheduling yields a new id
  user_id      uuid not null references users(id) on delete cascade,
  kind         text not null check (kind in ('task', 'class', 'prayer')),
  source_id    text not null,
  fire_at      timestamptz not null,
  delivered_at timestamptz,               -- set once; guarantees no duplicate push
  read_at      timestamptz,
  dismissed_at timestamptz
);
create index reminders_due on reminders (fire_at) where delivered_at is null;

create table push_subscriptions (         -- Web Push endpoints for the backend scheduler
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

-- ── Dashboard ────────────────────────────────────────────────────────────────
create table dashboard_layouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  name        text not null default 'Default',
  blocks      jsonb not null,             -- [{ id, order, size, visible }]
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- ── Expenses (existing module) ───────────────────────────────────────────────
create table expenses (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  title     text not null,
  amount    numeric(12, 2) not null check (amount > 0),
  category  text not null,
  date      date not null default current_date
);

-- ── Row-level security: a user can only ever touch their own rows ────────────
-- With Supabase, auth.uid() is the signed-in user; a FastAPI backend sets
-- `app.user_id` per request instead (set_config('app.user_id', ..., true)).
do $$
declare t text;
begin
  foreach t in array array[
    'user_preferences', 'task_categories', 'tasks', 'notes', 'uploaded_files', 'class_routines',
    'class_sessions', 'class_session_overrides', 'prayer_times', 'prayer_log', 'reminders',
    'push_subscriptions', 'dashboard_layouts', 'expenses'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I using (user_id = current_setting(''app.user_id'')::uuid) with check (user_id = current_setting(''app.user_id'')::uuid)',
      t || '_owner', t
    );
  end loop;
end $$;
