import type { Db } from "./db";
import { materializeNext } from "./service";
import { quietHoursEnd } from "./time";
import type { Occurrence } from "./types";

export interface PushPayload { title: string; body: string; url: string; tag: string }
export interface PushTarget { endpoint: string; p256dh: string; auth: string }
/** Returns the HTTP status of the push service (201 = accepted). Never throws for HTTP errors. */
export interface PushSender { send(target: PushTarget, payload: PushPayload): Promise<{ status: number }> }

export const MAX_ATTEMPTS = 4;
export const MAX_SUB_FAILURES = 5;
export const GENERIC_TEXT = "You have a reminder. Open Confirm & Remind.";
const backoffMs = (attempt: number) => Math.min(60, 2 ** attempt) * 60_000; // 2, 4, 8 minutes

export interface DispatchResult { claimed: number; sent: number; skipped: number; expired: number; retried: number; failed: number }

/** One scheduler tick: claim -> recheck -> send -> record. Safe to run concurrently and to repeat. */
export async function dispatchDue(db: Db, sender: PushSender, nowMs: number, worker = "worker", max = 50): Promise<DispatchResult> {
  const res: DispatchResult = { claimed: 0, sent: 0, skipped: 0, expired: 0, retried: 0, failed: 0 };
  const claimed = await db.claimDue(worker, max, 120, nowMs);
  res.claimed = claimed.length;
  for (const claim of claimed) {
    try {
      await handle(db, sender, claim, nowMs, res);
    } catch {
      // release the lock; the occurrence is retried after the lock expires. Never log note content.
      await db.update("reminder_occurrences", { id: claim.id }, { claimed_by: null });
      res.failed++;
    }
  }
  return res;
}

async function handle(db: Db, sender: PushSender, claim: Occurrence, nowMs: number, res: DispatchResult) {
  const setOcc = (patch: Partial<Occurrence>) => db.update("reminder_occurrences", { id: claim.id }, { claimed_by: null, claimed_until: null, ...patch });
  // Recheck with fresh data: the user may have completed or cancelled since the claim.
  const [occ] = await db.select("reminder_occurrences", { id: claim.id });
  const [rem] = occ ? await db.select("reminders", { id: occ.reminder_id }) : [];
  const [task] = rem ? await db.select("tasks", { id: rem.task_id }) : [];
  if (!occ || !rem || !task || !rem.active || task.status !== "open" || (occ.status !== "queued")) {
    if (occ && occ.status === "queued") await setOcc({ status: "cancelled" });
    res.skipped++;
    return;
  }
  const fireMs = Date.parse(occ.fire_at);
  if (nowMs > fireMs + rem.expiry_minutes * 60_000) {
    await setOcc({ status: "expired" }); // no late alerts
    await materializeNext(db, rem, nowMs);
    res.expired++;
    return;
  }
  const [profile] = await db.select("profiles", { id: occ.user_id });
  if (profile) {
    const end = quietHoursEnd(nowMs, profile.time_zone, profile.quiet_start, profile.quiet_end);
    if (end !== null) {
      if (end <= fireMs + rem.expiry_minutes * 60_000) {
        await setOcc({ status: "scheduled", next_attempt_at: new Date(end).toISOString() }); // hold until quiet hours end
        res.skipped++;
      } else {
        await setOcc({ status: "expired" }); // would arrive after its expiry window: drop, never alert late
        await materializeNext(db, rem, nowMs);
        res.expired++;
      }
      return;
    }
  }
  const subs = (await db.select("push_subscriptions", { user_id: occ.user_id })).filter((s) => s.active);
  if (!subs.length) {
    await setOcc({ status: "failed" });
    res.failed++;
    return;
  }
  const payload: PushPayload = {
    title: "Confirm & Remind",
    body: profile?.show_task_title ? task.title.slice(0, 120) : GENERIC_TEXT,
    url: `/?task=${task.id}`,
    tag: occ.id,
  };
  let accepted = 0, pending = 0;
  for (const sub of subs) {
    const key = `${rem.id}:${occ.id}:${sub.id}`; // reminder + occurrence + device
    const prev = (await db.select("notification_attempts", { dispatch_key: key }))[0];
    if (prev && prev.status === "accepted") { accepted++; continue; }
    const attemptNo = (prev?.attempt_no ?? 0) + 1;
    let status = 0;
    try { status = (await sender.send(sub, payload)).status; } catch { status = 0; }
    const ok = status >= 200 && status < 300;
    const gone = status === 404 || status === 410;
    const rowStatus = ok ? "accepted" : gone ? "gone" : "failed";
    if (prev) await db.update("notification_attempts", { id: prev.id }, { status: rowStatus, http_status: status, attempt_no: attemptNo });
    else await db.insert("notification_attempts", { user_id: occ.user_id, occurrence_id: occ.id, subscription_id: sub.id, dispatch_key: key, status: rowStatus, http_status: status, attempt_no: attemptNo });
    if (ok) { accepted++; await db.update("push_subscriptions", { id: sub.id }, { failure_count: 0 }); res.sent++; }
    else if (gone) await db.update("push_subscriptions", { id: sub.id }, { active: false }); // expired subscription
    else {
      const fc = sub.failure_count + 1;
      await db.update("push_subscriptions", { id: sub.id }, { failure_count: fc, active: fc < MAX_SUB_FAILURES });
      pending++;
    }
  }
  const attempts = occ.attempts + 1;
  if (pending > 0 && attempts < MAX_ATTEMPTS) {
    await setOcc({ status: "queued", attempts, next_attempt_at: new Date(nowMs + backoffMs(attempts)).toISOString() });
    res.retried++;
    return;
  }
  await setOcc({ status: accepted > 0 ? "accepted" : "failed", attempts });
  if (accepted > 0) { /* counted in sent */ } else res.failed++;
  await materializeNext(db, rem, nowMs);
}
