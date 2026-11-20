import { type Db } from "./db";
import { HttpError, type Note, type Occurrence, type OccStatus, type Reminder, type Repeat, type Task } from "./types";
import { isValidTimeZone, localParts, nextOccurrenceAfter, tomorrowMorning } from "./time";

// Every function takes the authenticated userId and puts it in EVERY query filter, so one user
// can never read or change another user's rows (RLS in Postgres is the second layer).

const MAX_TEXT = 20000;
const MAX_TITLE = 300;
const iso = (ms: number) => new Date(ms).toISOString();
const pad = (n: number) => String(n).padStart(2, "0");

function cleanText(t: unknown, max: number): string {
  if (typeof t !== "string" || !t.trim()) throw new HttpError(400, "Text is required");
  if (t.length > max) throw new HttpError(400, "Text is too long");
  return t; // original text is stored exactly as typed
}

export async function ensureProfile(db: Db, userId: string) {
  const found = await db.select("profiles", { id: userId });
  return found[0] ?? (await db.insert("profiles", { id: userId }));
}

export async function updateProfile(db: Db, userId: string, p: { time_zone?: string; quiet_start?: string | null; quiet_end?: string | null; show_task_title?: boolean }) {
  if (p.time_zone !== undefined && !isValidTimeZone(p.time_zone)) throw new HttpError(400, "Unknown time zone");
  await ensureProfile(db, userId);
  const patch: Record<string, unknown> = {};
  for (const k of ["time_zone", "quiet_start", "quiet_end", "show_task_title"] as const) if (p[k] !== undefined) patch[k] = p[k];
  return (await db.update("profiles", { id: userId }, patch))[0]!;
}

async function audit(db: Db, userId: string | null, kind: string, meta: Record<string, unknown> = {}) {
  await db.insert("audit_events", { user_id: userId, kind, meta }); // never note content
}

// ---------- notes ----------
export async function createNote(db: Db, userId: string, input: { text: string; clientId?: string }): Promise<Note> {
  const text = cleanText(input.text, MAX_TEXT);
  if (input.clientId) {
    const existing = await db.select("notes", { user_id: userId, client_id: input.clientId });
    if (existing[0]) return existing[0]; // same save twice = same note
  }
  const note = await db.insert("notes", { user_id: userId, original_text: text, client_id: input.clientId ?? null });
  await db.insert("note_versions", { note_id: note.id, user_id: userId, version: 1, text });
  return note;
}

export async function updateNote(db: Db, userId: string, id: string, patch: { text?: string; pinned?: boolean }): Promise<Note> {
  const [note] = await db.select("notes", { id, user_id: userId });
  if (!note) throw new HttpError(404, "Not found");
  const upd: Partial<Note> = {};
  if (patch.pinned !== undefined) upd.pinned = patch.pinned;
  if (patch.text !== undefined && patch.text !== note.original_text) {
    const text = cleanText(patch.text, MAX_TEXT);
    upd.original_text = text;
    upd.version = note.version + 1;
    await db.insert("note_versions", { note_id: id, user_id: userId, version: upd.version, text });
  }
  return (await db.update("notes", { id, user_id: userId }, upd))[0]!;
}

export async function deleteNote(db: Db, userId: string, id: string): Promise<void> {
  const n = await db.remove("notes", { id, user_id: userId });
  if (!n) throw new HttpError(404, "Not found");
  await db.remove("note_versions", { note_id: id, user_id: userId });
  await audit(db, userId, "note.delete", { note_id: id });
}

export async function listNotes(db: Db, userId: string, q?: string): Promise<Note[]> {
  const rows = q && q.trim() ? await db.searchNotes(userId, q.trim().slice(0, 200)) : await db.select("notes", { user_id: userId });
  return rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
}

// ---------- tasks ----------
export async function createTask(db: Db, userId: string, input: { title: string; noteId?: string | null; dueAt?: string | null; clientId?: string }): Promise<Task> {
  const title = cleanText(input.title, MAX_TITLE);
  if (input.clientId) {
    const ex = await db.select("tasks", { user_id: userId, client_id: input.clientId });
    if (ex[0]) return ex[0];
  }
  if (input.noteId) {
    const [n] = await db.select("notes", { id: input.noteId, user_id: userId });
    if (!n) throw new HttpError(404, "Note not found"); // cannot attach to someone else's note
  }
  if (input.dueAt && Number.isNaN(Date.parse(input.dueAt))) throw new HttpError(400, "Bad due date");
  const profile = await ensureProfile(db, userId);
  return db.insert("tasks", { user_id: userId, title, note_id: input.noteId ?? null, due_at: input.dueAt ? iso(Date.parse(input.dueAt)) : null, time_zone: profile.time_zone, client_id: input.clientId ?? null });
}

export async function listTasks(db: Db, userId: string, status?: Task["status"]): Promise<Task[]> {
  const rows = status ? await db.select("tasks", { user_id: userId, status }) : await db.select("tasks", { user_id: userId });
  return rows.sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") || a.created_at.localeCompare(b.created_at));
}

export async function updateTask(db: Db, userId: string, id: string, patch: { title?: string; dueAt?: string | null }): Promise<Task> {
  const [t] = await db.select("tasks", { id, user_id: userId });
  if (!t) throw new HttpError(404, "Not found");
  const upd: Partial<Task> = {};
  if (patch.title !== undefined) upd.title = cleanText(patch.title, MAX_TITLE);
  if (patch.dueAt !== undefined) {
    if (patch.dueAt !== null && Number.isNaN(Date.parse(patch.dueAt))) throw new HttpError(400, "Bad due date");
    upd.due_at = patch.dueAt === null ? null : iso(Date.parse(patch.dueAt));
  }
  return (await db.update("tasks", { id, user_id: userId }, upd))[0]!;
}

const LIVE: OccStatus[] = ["scheduled", "queued", "accepted", "failed"];

async function closeReminders(db: Db, userId: string, taskId: string, to: OccStatus) {
  for (const r of await db.select("reminders", { task_id: taskId, user_id: userId })) {
    await db.update("reminders", { id: r.id, user_id: userId }, { active: false });
    for (const o of await db.select("reminder_occurrences", { reminder_id: r.id, user_id: userId })) {
      if (o.status === "scheduled" || o.status === "queued" || o.status === "failed" || (o.status === "accepted" && to === "completed")) {
        await db.update("reminder_occurrences", { id: o.id, user_id: userId }, { status: to, claimed_by: null, claimed_until: null });
      }
    }
  }
}

/** done / dismissed stop every reminder of the task; "open" (undo) does not re-arm them. */
export async function setTaskStatus(db: Db, userId: string, id: string, status: Task["status"]): Promise<Task> {
  const [t] = await db.select("tasks", { id, user_id: userId });
  if (!t) throw new HttpError(404, "Not found");
  if (!["open", "done", "dismissed"].includes(status)) throw new HttpError(400, "Bad status");
  const done = status === "done";
  const updated = (await db.update("tasks", { id, user_id: userId }, { status, completed_at: done ? iso(Date.now()) : null }))[0]!;
  if (status !== "open") await closeReminders(db, userId, id, done ? "completed" : "cancelled");
  await audit(db, userId, "task." + status, { task_id: id });
  return updated;
}

export async function deleteTask(db: Db, userId: string, id: string): Promise<void> {
  const [t] = await db.select("tasks", { id, user_id: userId });
  if (!t) throw new HttpError(404, "Not found");
  await closeReminders(db, userId, id, "cancelled");
  for (const r of await db.select("reminders", { task_id: id, user_id: userId })) {
    await db.remove("reminder_occurrences", { reminder_id: r.id, user_id: userId });
    await db.remove("reminders", { id: r.id, user_id: userId });
  }
  await db.remove("tasks", { id, user_id: userId });
}

// ---------- reminders ----------
export interface ReminderInput {
  taskId: string;
  remindAt: string;
  repeat?: Repeat;
  dayOfMonth?: number | null;
  expiryMinutes?: number;
  clientId?: string;
}

/** Creating the same reminder twice (same clientId, or same task + time + repeat) returns the first one. */
export async function createReminder(db: Db, userId: string, input: ReminderInput): Promise<{ reminder: Reminder; occurrence: Occurrence }> {
  const [task] = await db.select("tasks", { id: input.taskId, user_id: userId });
  if (!task) throw new HttpError(404, "Task not found");
  if (task.status !== "open") throw new HttpError(409, "Task is not open");
  const at = Date.parse(input.remindAt);
  if (Number.isNaN(at)) throw new HttpError(400, "Bad reminder time");
  const repeat: Repeat = input.repeat ?? "none";
  if (!["none", "daily", "weekly", "monthly"].includes(repeat)) throw new HttpError(400, "Bad repeat");
  const expiry = input.expiryMinutes ?? 120;
  if (!Number.isInteger(expiry) || expiry < 1 || expiry > 10080) throw new HttpError(400, "Bad expiry");
  const profile = await ensureProfile(db, userId);
  const lp = localParts(at, profile.time_zone);
  const localTime = `${pad(lp.h)}:${pad(lp.min)}`;
  const dom = repeat === "monthly" ? input.dayOfMonth ?? lp.d : null;
  if (dom !== null && (dom < 1 || dom > 31)) throw new HttpError(400, "Bad day of month");

  const mine = await db.select("reminders", { user_id: userId, task_id: input.taskId });
  const dup = mine.find((r) => (input.clientId && r.client_id === input.clientId) || (r.active && r.repeat === repeat && Date.parse(r.remind_at) === at));
  if (dup) {
    const occ = (await db.select("reminder_occurrences", { reminder_id: dup.id, user_id: userId })).sort((a, b) => a.fire_at.localeCompare(b.fire_at));
    return { reminder: dup, occurrence: occ.find((o) => LIVE.includes(o.status)) ?? occ[0]! };
  }
  const reminder = await db.insert("reminders", { user_id: userId, task_id: input.taskId, remind_at: iso(at), time_zone: profile.time_zone, repeat, local_time: localTime, day_of_month: dom, expiry_minutes: expiry, client_id: input.clientId ?? null });
  const occurrence = await db.insert("reminder_occurrences", { reminder_id: reminder.id, user_id: userId, fire_at: iso(at) });
  await audit(db, userId, "reminder.create", { reminder_id: reminder.id });
  return { reminder, occurrence };
}

/** Insert the next occurrence of a repeating reminder (idempotent thanks to the unique key). */
export async function materializeNext(db: Db, r: Reminder, afterMs: number): Promise<Occurrence | null> {
  if (!r.active) return null;
  const next = nextOccurrenceAfter(r, afterMs);
  if (next === null) return null;
  const ex = await db.select("reminder_occurrences", { reminder_id: r.id, fire_at: iso(next) });
  if (ex[0]) return ex[0];
  return db.insert("reminder_occurrences", { reminder_id: r.id, user_id: r.user_id, fire_at: iso(next) });
}

async function ownOccurrence(db: Db, userId: string, id: string): Promise<Occurrence> {
  const [o] = await db.select("reminder_occurrences", { id, user_id: userId });
  if (!o) throw new HttpError(404, "Not found");
  if (!LIVE.includes(o.status)) throw new HttpError(409, "Reminder is already finished");
  return o;
}

async function moveOccurrence(db: Db, userId: string, o: Occurrence, toMs: number): Promise<Occurrence> {
  const clash = (await db.select("reminder_occurrences", { reminder_id: o.reminder_id, fire_at: iso(toMs) }))[0];
  if (clash && clash.id !== o.id) {
    await db.update("reminder_occurrences", { id: o.id, user_id: userId }, { status: "cancelled" });
    return clash;
  }
  return (await db.update("reminder_occurrences", { id: o.id, user_id: userId }, { fire_at: iso(toMs), status: "scheduled", attempts: 0, next_attempt_at: null, claimed_by: null, claimed_until: null }))[0]!;
}

export type SnoozeKind = "10m" | "1h" | "tomorrow";

/** Snooze moves THIS occurrence (not the reminder's other occurrences). */
export async function snooze(db: Db, userId: string, occurrenceId: string, kind: SnoozeKind, nowMs = Date.now()): Promise<Occurrence> {
  const o = await ownOccurrence(db, userId, occurrenceId);
  const [r] = await db.select("reminders", { id: o.reminder_id, user_id: userId });
  if (!r || !r.active) throw new HttpError(409, "Reminder is not active");
  const profile = await ensureProfile(db, userId);
  const to = kind === "10m" ? nowMs + 600_000 : kind === "1h" ? nowMs + 3_600_000 : kind === "tomorrow" ? tomorrowMorning(nowMs, profile.time_zone) : NaN;
  if (Number.isNaN(to)) throw new HttpError(400, "Bad snooze");
  return moveOccurrence(db, userId, o, to);
}

export async function reschedule(db: Db, userId: string, occurrenceId: string, newIso: string, nowMs = Date.now()): Promise<Occurrence> {
  const o = await ownOccurrence(db, userId, occurrenceId);
  const to = Date.parse(newIso);
  if (Number.isNaN(to) || to < nowMs - 60_000) throw new HttpError(400, "Pick a time in the future");
  const [r] = await db.select("reminders", { id: o.reminder_id, user_id: userId });
  if (!r || !r.active) throw new HttpError(409, "Reminder is not active");
  return moveOccurrence(db, userId, o, to);
}

/** Honest label. "Scheduled" only for rows the server has stored; a not-yet-synced client shows its own offline label. */
export function statusLabel(s: OccStatus): string {
  switch (s) {
    case "scheduled": return "Scheduled";
    case "queued": return "Queued";
    case "accepted": return "Accepted by push service";
    case "failed": return "Failed";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    case "expired": return "Expired";
  }
}
export const OFFLINE_LABEL = "Saved on this device. Reminder is not scheduled yet.";

export async function listUpcoming(db: Db, userId: string): Promise<{ task: Task; occurrences: Occurrence[] }[]> {
  const tasks = await listTasks(db, userId);
  const out = [];
  for (const task of tasks) {
    const occurrences: Occurrence[] = [];
    for (const r of await db.select("reminders", { task_id: task.id, user_id: userId })) occurrences.push(...(await db.select("reminder_occurrences", { reminder_id: r.id, user_id: userId })));
    out.push({ task, occurrences: occurrences.sort((a, b) => a.fire_at.localeCompare(b.fire_at)) });
  }
  return out;
}

// ---------- push subscriptions ----------
export async function saveSubscription(db: Db, userId: string, s: { endpoint: string; p256dh: string; auth: string; label?: string }) {
  if (!/^https:\/\//.test(s.endpoint) || !s.p256dh || !s.auth) throw new HttpError(400, "Bad subscription");
  const ex = (await db.select("push_subscriptions", { user_id: userId, endpoint: s.endpoint }))[0];
  if (ex) return (await db.update("push_subscriptions", { id: ex.id, user_id: userId }, { p256dh: s.p256dh, auth: s.auth, active: true, failure_count: 0 }))[0]!;
  return db.insert("push_subscriptions", { user_id: userId, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, label: (s.label ?? "This device").slice(0, 60) });
}
export const listSubscriptions = (db: Db, userId: string) => db.select("push_subscriptions", { user_id: userId });
export async function removeSubscription(db: Db, userId: string, id: string) {
  if (!(await db.remove("push_subscriptions", { id, user_id: userId }))) throw new HttpError(404, "Not found");
}

// ---------- export / delete ----------
export async function exportAll(db: Db, userId: string) {
  const notes = await db.select("notes", { user_id: userId });
  const tasks = await db.select("tasks", { user_id: userId });
  const reminders = await db.select("reminders", { user_id: userId });
  const versions = await db.select("note_versions", { user_id: userId });
  const json = { exported_at: iso(Date.now()), notes, note_versions: versions, tasks, reminders };
  const md: string[] = ["# Confirm & Remind export", "", "## Notes", ""];
  for (const n of notes) md.push(`### Note ${n.id}${n.pinned ? " (pinned)" : ""}`, `_${n.created_at}_`, "", n.original_text, "");
  md.push("## Tasks", "");
  for (const t of tasks) md.push(`- [${t.status === "done" ? "x" : " "}] ${t.title.replace(/\n/g, " ")}${t.due_at ? ` (due ${t.due_at})` : ""} — ${t.status}`);
  return { json, markdown: md.join("\n") + "\n" };
}

/** Deletes every row of this user. Auth user removal is done by the API route with the service role. */
export async function deleteAccountData(db: Db, userId: string): Promise<void> {
  const job = await db.insert("deletion_jobs", { user_id: userId });
  for (const t of ["reminder_occurrences", "notification_attempts", "reminders", "tasks", "note_versions", "notes", "push_subscriptions", "audit_events"] as const) {
    await db.remove(t, { user_id: userId } as never);
  }
  await db.remove("profiles", { id: userId });
  await db.update("deletion_jobs", { id: job.id }, { status: "done", finished_at: iso(Date.now()) });
}