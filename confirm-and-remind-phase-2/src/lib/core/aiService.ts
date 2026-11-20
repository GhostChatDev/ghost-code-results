import { validateAiExtraction } from "./ai";
import type { Db } from "./db";
import { HttpError, type AiJob, type AiSuggestion, type Note } from "./types";
import { createReminder, createTask } from "./service";

export const AI_NOTE_LIMIT = 12_000;
export const AI_MAX_TASKS = 20;
export const isoNow = () => new Date().toISOString();

export interface AiUsageResult {
  inputTokens: number;
  outputTokens: number;
  actualCents: number;
  requestId: string | null;
}

export function assertNoteEligible(note: Note): void {
  if (!note.original_text.trim()) throw new HttpError(422, "There is no note text to review.");
  if (note.original_text.length > AI_NOTE_LIMIT) throw new HttpError(413, `AI review is limited to ${AI_NOTE_LIMIT.toLocaleString()} characters. Your note is still saved.`);
}

/** Idempotent, owner-scoped invalidation. Confirmed rows and their reminders are deliberately untouched. */
export async function discardStaleSuggestions(db: Db, userId: string, noteId: string, version: number): Promise<void> {
  const pending = await db.select("ai_suggestions", { user_id: userId, note_id: noteId, status: "pending" });
  await Promise.all(pending.filter((s) => s.note_version !== version).map((s) =>
    db.update("ai_suggestions", { id: s.id, user_id: userId, status: "pending" }, { status: "stale" })));
  await db.update("ai_jobs", { user_id: userId, note_id: noteId, status: "reserved" }, { status: "stale", completed_at: isoNow() });
  await db.update("ai_jobs", { user_id: userId, note_id: noteId, status: "running" }, { status: "stale", completed_at: isoNow() });
  if (pending.some((s) => s.note_version !== version)) {
    await db.update("notes", { id: noteId, user_id: userId }, { ai_review_pending: true });
  }
}

/** Called only after the model returns. It can insert suggestions, never tasks or reminders. */
export async function storeAiSuggestions(db: Db, job: AiJob, value: unknown, usage: AiUsageResult): Promise<number> {
  const notes = await db.select("notes", { id: job.note_id, user_id: job.user_id });
  const note = notes[0];
  if (!note || note.version !== job.note_version) {
    await settleAiUsage(db, job, usage, "stale");
    return 0;
  }
  const valid = validateAiExtraction(value, note.original_text, job.note_created_at, job.time_zone);
  if (!valid) {
    await settleAiUsage(db, job, usage, "failed", "invalid_json");
    await db.update("notes", { id: note.id, user_id: job.user_id, version: job.note_version }, { ai_status: "failed" });
    return 0;
  }
  const tasks = valid.tasks.slice(0, AI_MAX_TASKS);
  for (const [index, task] of tasks.entries()) {
    await db.insert("ai_suggestions", {
      user_id: job.user_id, note_id: note.id, note_version: job.note_version, task_index: index,
      title: valid.title, text: task.text, source_quote: task.source_quote,
      proposed_due: task.proposed_due, proposed_reminder: task.proposed_reminder,
      resolved_due: task.resolved_due, resolved_reminder: task.resolved_reminder,
      needs_clarification: task.needs_clarification, ambiguity_note: task.ambiguity_note,
      time_zone: job.time_zone, note_created_at: job.note_created_at, status: "pending",
      confirmed_task_id: null, confirmed_reminder_id: null,
    });
  }
  await settleAiUsage(db, job, usage, tasks.length ? "ready" : "empty");
  await db.update("notes", { id: note.id, user_id: job.user_id, version: job.note_version }, { ai_status: tasks.length ? "ready" : "empty" });
  return tasks.length;
}

export async function settleAiUsage(db: Db, job: AiJob, usage: AiUsageResult, status: AiJob["status"], errorCode: string | null = null): Promise<void> {
  await db.insert("ai_usage", {
    user_id: job.user_id, job_id: job.id, note_version: job.note_version, model: job.model,
    input_tokens: Math.max(0, Math.floor(usage.inputTokens)), output_tokens: Math.max(0, Math.floor(usage.outputTokens)),
    reserved_cents: job.reserved_cents, actual_cents: Math.max(0, usage.actualCents), request_id: usage.requestId,
  });
  await db.update("ai_jobs", { id: job.id, user_id: job.user_id }, {
    status, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
    actual_cents: usage.actualCents, error_code: errorCode, completed_at: isoNow(),
  });
  await db.settleAiBudget(job, Math.max(0, usage.actualCents));
}

export interface ConfirmationEdit {
  title?: string;
  dueAt?: string | null;
  reminderAt?: string | null;
  createReminder: boolean;
}

/** This is the only AI path that calls createTask/createReminder. API callers must authenticate first. */
export async function confirmAiSuggestion(db: Db, userId: string, suggestionId: string, timeZone: string, edit?: ConfirmationEdit) {
  const suggestion = (await db.select("ai_suggestions", { id: suggestionId, user_id: userId }))[0];
  if (!suggestion) throw new HttpError(404, "Suggestion not found.");
  if (suggestion.status !== "pending") throw new HttpError(409, "This suggestion is no longer available.");
  const note = (await db.select("notes", { id: suggestion.note_id, user_id: userId }))[0];
  if (!note || note.version !== suggestion.note_version) {
    await db.update("ai_suggestions", { id: suggestion.id, user_id: userId, status: "pending" }, { status: "stale" });
    throw new HttpError(409, "This note changed. Review its linked reminders?");
  }
  const title = edit?.title?.trim() || suggestion.text;
  if (title.length > 300) throw new HttpError(400, "Task title is too long.");
  const dueAt = edit && "dueAt" in edit ? edit.dueAt ?? null : suggestion.resolved_due;
  const reminderAt = edit?.createReminder === false ? null : edit && "reminderAt" in edit ? edit.reminderAt ?? null : suggestion.resolved_reminder;
  if (dueAt && Number.isNaN(Date.parse(dueAt))) throw new HttpError(400, "Choose a valid due date.");
  if (reminderAt && Number.isNaN(Date.parse(reminderAt))) throw new HttpError(400, "Choose a valid reminder time.");
  if (edit?.createReminder && !reminderAt) throw new HttpError(400, "Choose an exact reminder time first.");
  const task = await createTask(db, userId, { noteId: note.id, title, dueAt, source: "ai" });
  let reminder = null;
  if (reminderAt) reminder = (await createReminder(db, userId, { taskId: task.id, remindAt: reminderAt, repeat: "none" })).reminder;
  await db.update("ai_suggestions", { id: suggestion.id, user_id: userId, status: "pending" }, {
    status: "confirmed", confirmed_task_id: task.id, confirmed_reminder_id: reminder?.id ?? null,
  });
  const remaining = await db.select("ai_suggestions", { user_id: userId, note_id: note.id, note_version: note.version, status: "pending" });
  if (!remaining.length) await db.update("notes", { id: note.id, user_id: userId }, { ai_review_pending: false });
  return { suggestion: { ...suggestion, status: "confirmed" as const, confirmed_task_id: task.id, confirmed_reminder_id: reminder?.id ?? null }, task, reminder };
}

export async function dismissAiSuggestion(db: Db, userId: string, suggestionId: string): Promise<AiSuggestion> {
  const rows = await db.update("ai_suggestions", { id: suggestionId, user_id: userId, status: "pending" }, { status: "dismissed" });
  if (!rows[0]) throw new HttpError(409, "This suggestion is no longer available.");
  return rows[0];
}
