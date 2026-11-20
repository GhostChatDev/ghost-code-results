-- Row-level security on every user table. The service role (server-only) bypasses RLS by design.
alter table public.profiles enable row level security;
alter table public.notes enable row level security;
alter table public.note_versions enable row level security;
alter table public.tasks enable row level security;
alter table public.reminders enable row level security;
alter table public.reminder_occurrences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_attempts enable row level security;
alter table public.audit_events enable row level security;
alter table public.deletion_jobs enable row level security;
alter table public.ai_suggestions enable row level security;

-- profiles: id is the owner
create policy profiles_select on public.profiles for select using (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- notes / tasks / reminders / subscriptions: full CRUD on own rows only
create policy notes_all on public.notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tasks_all on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reminders_all on public.reminders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_all on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- versions are append-only for the owner
create policy versions_select on public.note_versions for select using (user_id = auth.uid());
create policy versions_insert on public.note_versions for insert with check (user_id = auth.uid());

-- occurrences: owner may read and change status (done/snooze/reschedule); creation by server only
create policy occ_select on public.reminder_occurrences for select using (user_id = auth.uid());
create policy occ_update on public.reminder_occurrences for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- attempts, audit, deletion jobs: owner can read; only the server writes
create policy attempts_select on public.notification_attempts for select using (user_id = auth.uid());
create policy audit_select on public.audit_events for select using (user_id = auth.uid());
create policy deletion_select on public.deletion_jobs for select using (user_id = auth.uid());

-- ai_suggestions: owner only (Phase 2)
create policy ai_all on public.ai_suggestions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Claiming occurrences for dispatch: atomic, uses SKIP LOCKED so two schedulers never take the same row.
-- Callable by the service role only.
create function public.claim_due_occurrences(worker text, max_rows int, lock_seconds int)
returns setof public.reminder_occurrences
language plpgsql security definer set search_path = public as $$
begin
  return query
  with picked as (
    select id from public.reminder_occurrences
    where status in ('scheduled','queued')
      and fire_at <= now()
      and coalesce(next_attempt_at, fire_at) <= now()
      and (claimed_until is null or claimed_until < now())
    order by fire_at
    limit max_rows
    for update skip locked
  )
  update public.reminder_occurrences o
     set claimed_by = worker,
         claimed_until = now() + make_interval(secs => lock_seconds),
         status = 'queued'
    from picked where o.id = picked.id
  returning o.*;
end $$;
revoke all on function public.claim_due_occurrences(text, int, int) from public, anon, authenticated;
grant execute on function public.claim_due_occurrences(text, int, int) to service_role;

-- Stop users from changing ownership columns.
create function public.forbid_owner_change() returns trigger language plpgsql as $$
begin
  if new.user_id <> old.user_id then raise exception 'user_id is immutable'; end if;
  return new;
end $$;
create trigger notes_owner before update on public.notes for each row execute function public.forbid_owner_change();
create trigger tasks_owner before update on public.tasks for each row execute function public.forbid_owner_change();
create trigger reminders_owner before update on public.reminders for each row execute function public.forbid_owner_change();
