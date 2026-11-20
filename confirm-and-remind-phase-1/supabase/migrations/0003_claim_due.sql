-- Atomic claim for the scheduler: rows are locked with SKIP LOCKED so two workers never take the same occurrence.
create function public.claim_due_occurrences(p_worker text, p_max int, p_lock_seconds int, p_now timestamptz)
returns setof public.reminder_occurrences
language sql security definer set search_path = public as $$
  with due as (
    select id from public.reminder_occurrences
    where status in ('scheduled','queued')
      and fire_at <= p_now
      and coalesce(next_attempt_at, fire_at) <= p_now
      and (claimed_until is null or claimed_until < p_now)
    order by fire_at
    limit p_max
    for update skip locked
  )
  update public.reminder_occurrences o
     set status = 'queued', claimed_by = p_worker,
         claimed_until = p_now + make_interval(secs => p_lock_seconds)
    from due where o.id = due.id
  returning o.*;
$$;

-- Only the server (service role) may call it.
revoke all on function public.claim_due_occurrences(text, int, int, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_due_occurrences(text, int, int, timestamptz) to service_role;
