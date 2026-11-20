-- Confirm & Remind, Phase 1 schema. All times are timestamptz (UTC) plus an IANA zone name where it matters.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  time_zone text not null default 'UTC',
  quiet_start time,                -- local time in time_zone, null = no quiet hours
  quiet_end time,
  show_task_title boolean not null default false,  -- false = generic push text
  created_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_text text not null,      -- the user's text, never rewritten by the app
  pinned boolean not null default false,
  version int not null default 1,
  client_id text,                   -- idempotency key from the device (draft id)
  search tsvector generated always as (to_tsvector('simple', original_text)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index notes_search_idx on public.notes using gin (search);
create index notes_user_idx on public.notes (user_id, pinned desc, updated_at desc);

create table public.note_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version int not null,
  text text not null,
  created_at timestamptz not null default now(),
  unique (note_id, version)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid references public.notes(id) on delete set null,
  title text not null,
  due_at timestamptz,               -- due date: SEPARATE from the reminder time
  time_zone text not null default 'UTC',
  status text not null default 'open' check (status in ('open','done','dismissed')),
  source text not null default 'manual' check (source in ('manual','ai')),  -- Phase 2 hook
  client_id text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index tasks_user_idx on public.tasks (user_id, status, due_at);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  remind_at timestamptz not null,   -- first occurrence, UTC
  time_zone text not null,          -- IANA name, used to expand repeats
  repeat text not null default 'none' check (repeat in ('none','daily','weekly','monthly')),
  local_time time not null,         -- wall-clock time in time_zone (repeat anchor)
  day_of_month int check (day_of_month between 1 and 31),
  expiry_minutes int not null default 120 check (expiry_minutes between 1 and 10080),
  active boolean not null default true,
  client_id text,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create table public.reminder_occurrences (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fire_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','queued','accepted','failed','completed','cancelled','expired')),
  claimed_by text,
  claimed_until timestamptz,
  attempts int not null default 0,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reminder_id, fire_at)     -- creating the same occurrence twice cannot duplicate
);
create index occ_due_idx on public.reminder_occurrences (status, fire_at);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  label text not null default 'This device',
  active boolean not null default true,
  failure_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table public.notification_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurrence_id uuid references public.reminder_occurrences(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  dispatch_key text not null unique,  -- reminder:occurrence:device, so retries never double-send
  status text not null check (status in ('queued','accepted','failed','gone')),
  http_status int,
  attempt_no int not null default 1,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,                      -- no FK: survives account deletion as an anonymous record
  kind text not null,                -- e.g. note.delete, account.delete (never note content)
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'pending' check (status in ('pending','done','failed')),
  requested_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Phase 2 placeholder: stays empty in Phase 1.
create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references public.notes(id) on delete cascade,
  note_version int,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_text text,
  source_quote text,
  proposed_due_at timestamptz,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- Create a profile row for each new auth user.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Full-text search scoped to the caller (security invoker: RLS applies).
create function public.search_notes(q text) returns setof public.notes
language sql stable security invoker as $$
  select * from public.notes
  where user_id = auth.uid()
    and search @@ websearch_to_tsquery('simple', q)
  order by pinned desc, updated_at desc
  limit 100
$$;
