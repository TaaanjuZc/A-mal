create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  display_name   text not null default '',
  preferences    jsonb not null default '{}'::jsonb,  -- theme, prayer, reminders, budget, categories
  layout         jsonb not null default '[]'::jsonb,  -- dashboard blocks
  reminder_inbox jsonb not null default '[]'::jsonb,
  reminder_meta  jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.tasks (
  id                uuid primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  title             text not null,
  description       text not null default '',
  category          text not null default '',
  task_date         date not null,
  start_time        text not null,
  end_time          text not null,
  reminder_minutes  integer,
  recurrence        text not null default 'none',
  recurrence_until  date,
  status_overrides  jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists tasks_user_date on public.tasks (user_id, task_date);

create table if not exists public.notes (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null default '',
  category     text not null default 'Personal',
  color        text not null default 'plain',
  kind         text not null default 'note',
  journal_date date,
  blocks       jsonb not null default '[]'::jsonb,
  days         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists notes_user_updated on public.notes (user_id, updated_at desc);

create table if not exists public.expenses (
  id       uuid primary key,
  user_id  uuid not null references auth.users (id) on delete cascade,
  title    text not null,
  amount   numeric(12, 2) not null check (amount > 0),
  category text not null,
  spent_on date not null
);
create index if not exists expenses_user_date on public.expenses (user_id, spent_on);

create table if not exists public.class_routines (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  source_file text,
  created_at  timestamptz not null default now()
);

create table if not exists public.class_sessions (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  routine_id   uuid,
  course_name  text not null default '',
  course_code  text not null default '',
  day_of_week  smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time   text not null,
  end_time     text not null,
  room         text not null default '',
  faculty      text not null default '',
  section      text not null default ''
);
create index if not exists class_sessions_user_day on public.class_sessions (user_id, day_of_week);

create table if not exists public.class_overrides (
  user_id        uuid not null references auth.users (id) on delete cascade,
  occurrence_key text not null, -- sessionId@YYYY-MM-DD
  started_at     bigint,
  ended_at       bigint,
  primary key (user_id, occurrence_key)
);

-- ── Namaz log: one row per prayer marked on a day ───────────────────────────
create table if not exists public.prayer_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  prayer  text not null,
  primary key (user_id, day, prayer)
);

-- ── Create the profile row when someone signs up ────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the profile email in step when the login email changes.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
      set email = coalesce(new.email, ''), updated_at = now()
      where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ── Only the signed-in person can see their rows ────────────────────────────
alter table public.profiles enable row level security;
drop policy if exists profiles_owner on public.profiles;
create policy profiles_owner on public.profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'tasks', 'notes', 'expenses', 'class_routines', 'class_sessions', 'class_overrides', 'prayer_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t
    );
    execute format('revoke all on table public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;

revoke all on table public.profiles from anon, public;
grant select, insert, update, delete on table public.profiles to authenticated;
