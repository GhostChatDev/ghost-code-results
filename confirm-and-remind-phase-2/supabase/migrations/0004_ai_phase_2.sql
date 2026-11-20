-- Phase 2: server-owned AI jobs, proposals and content-free usage accounting.
alter table public.profiles add column ai_enabled boolean not null default false;
alter table public.notes add column ai_status text not null default 'disabled'
  check (ai_status in ('disabled','pending','ready','empty','failed','quota_exceeded'));
alter table public.notes add column ai_context_version int;
alter table public.notes add column ai_review_pending boolean not null default false;

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  note_version int not null,
  note_created_at timestamptz not null,
  time_zone text not null,
  status text not null check (status in ('reserved','running','ready','empty','failed','stale')),
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  reserved_cents int not null,
  actual_cents int not null default 0,
  request_id text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(note_id, note_version),
  foreign key (note_id, note_version) references public.note_versions(note_id, version) on delete cascade
);
create index ai_jobs_user_created on public.ai_jobs(user_id, created_at);

create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.notes(id) on delete cascade,
  note_version int not null,
  task_index int not null,
  title text not null,
  text text not null,
  source_quote text not null,
  proposed_due text,
  proposed_reminder text,
  resolved_due timestamptz,
  resolved_reminder timestamptz,
  needs_clarification boolean not null default false,
  ambiguity_note text,
  time_zone text not null,
  note_created_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','confirmed','dismissed','stale')),
  confirmed_task_id uuid references public.tasks(id) on delete set null,
  confirmed_reminder_id uuid references public.reminders(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(note_id, note_version, task_index),
  foreign key (note_id, note_version) references public.note_versions(note_id, version) on delete cascade
);
create index ai_suggestions_review on public.ai_suggestions(user_id, status, note_id);

-- Deliberately no note id, quote, title, prompt, response or other note content here.
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null unique references public.ai_jobs(id) on delete cascade,
  note_version int not null,
  model text not null,
  input_tokens int not null,
  output_tokens int not null,
  reserved_cents int not null,
  actual_cents int not null,
  request_id text,
  created_at timestamptz not null default now()
);
create index ai_usage_user_created on public.ai_usage(user_id, created_at);

create table public.ai_budgets (
  id uuid primary key default gen_random_uuid(),
  month text primary key,
  reserved_cents int not null default 0 check (reserved_cents >= 0),
  spent_cents int not null default 0 check (spent_cents >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ai_jobs enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_budgets enable row level security;
-- No browser policies: all access goes through owner-scoped server routes/service role.

create or replace function public.reserve_ai_job(
  p_user_id uuid, p_note_id uuid, p_note_version int, p_model text,
  p_reserve_cents int, p_monthly_budget_cents int, p_user_daily_jobs int,
  p_user_monthly_jobs int, p_global_monthly_jobs int
) returns public.ai_jobs
language plpgsql security definer set search_path = public as $$
declare
  n public.notes;
  p public.profiles;
  j public.ai_jobs;
  b public.ai_budgets;
  month text := to_char(timezone('UTC', now()), 'YYYY-MM');
begin
  -- One transaction-level lock serializes both quota checks and budget reservation.
  perform pg_advisory_xact_lock(741852963);
  select * into p from public.profiles where id = p_user_id for update;
  if not found or not p.ai_enabled then return null; end if;
  select * into n from public.notes where id = p_note_id and user_id = p_user_id for update;
  if not found or n.version <> p_note_version or length(n.original_text) > 12000 then return null; end if;
  if (select count(*) from public.ai_jobs where user_id = p_user_id and created_at >= date_trunc('day', timezone('UTC', now()))) >= p_user_daily_jobs
    or (select count(*) from public.ai_jobs where user_id = p_user_id and created_at >= date_trunc('month', timezone('UTC', now()))) >= p_user_monthly_jobs
    or (select count(*) from public.ai_jobs where created_at >= date_trunc('month', timezone('UTC', now()))) >= p_global_monthly_jobs then
    update public.notes set ai_status = 'quota_exceeded' where id = n.id;
    return null;
  end if;
  insert into public.ai_budgets(month) values(month) on conflict(month) do nothing;
  select * into b from public.ai_budgets where ai_budgets.month = month for update;
  if b.reserved_cents + b.spent_cents + p_reserve_cents > p_monthly_budget_cents then
    update public.notes set ai_status = 'quota_exceeded' where id = n.id;
    return null;
  end if;
  insert into public.ai_jobs(user_id, note_id, note_version, note_created_at, time_zone, status, model, reserved_cents)
    values(p_user_id, n.id, n.version, n.created_at, p.time_zone, 'reserved', p_model, p_reserve_cents)
    on conflict(note_id, note_version) do nothing returning * into j;
  if j.id is null then return null; end if;
  update public.ai_budgets set reserved_cents = reserved_cents + p_reserve_cents, updated_at = now() where ai_budgets.month = month;
  update public.notes set ai_status = 'pending', ai_context_version = n.version where id = n.id;
  return j;
end;
$$;

create or replace function public.adjust_ai_budget(p_month text, p_reserved_delta int, p_spent_delta int)
returns void language sql security definer set search_path = public as $$
  insert into public.ai_budgets(month, reserved_cents, spent_cents)
  values(p_month, greatest(0, p_reserved_delta), greatest(0, p_spent_delta))
  on conflict(month) do update set
    reserved_cents = greatest(0, public.ai_budgets.reserved_cents + p_reserved_delta),
    spent_cents = greatest(0, public.ai_budgets.spent_cents + p_spent_delta),
    updated_at = now();
$$;

revoke all on function public.reserve_ai_job(uuid,uuid,int,text,int,int,int,int,int) from public, anon, authenticated;
revoke all on function public.adjust_ai_budget(text,int,int) from public, anon, authenticated;
grant execute on function public.reserve_ai_job(uuid,uuid,int,text,int,int,int,int,int) to service_role;
grant execute on function public.adjust_ai_budget(text,int,int) to service_role;
