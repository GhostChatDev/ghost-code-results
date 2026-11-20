import "server-only";
import { assertNoteEligible, discardStaleSuggestions, settleAiUsage, storeAiSuggestions, type AiUsageResult } from "../core/aiService";
import type { Db } from "../core/db";
import { ensureProfile } from "../core/service";
import type { Note } from "../core/types";
import { aiConfig, extractWithModel, type AiExtractor } from "./ai";

const noUsage = (errorCode: string): AiUsageResult => ({ inputTokens: 0, outputTokens: 0, actualCents: 0, requestId: errorCode === "reused" ? null : null });

/** Returns quickly to the save route. A null reservation means AI is off, ineligible, or over quota. */
export async function reserveForNote(db: Db, userId: string, note: Note) {
  const profile = await ensureProfile(db, userId);
  if (!profile.ai_enabled || !aiConfig().configured) {
    await db.update("notes", { id: note.id, user_id: userId }, { ai_status: "disabled" });
    return null;
  }
  try { assertNoteEligible(note); }
  catch {
    await db.update("notes", { id: note.id, user_id: userId }, { ai_status: "failed" });
    return null;
  }
  await discardStaleSuggestions(db, userId, note.id, note.version);
  const limits = aiConfig().limits;
  const job = await db.reserveAiJob({
    userId, noteId: note.id, noteVersion: note.version, model: aiConfig().model,
    reserveCents: limits.reserveCents, monthlyBudgetCents: limits.monthlyBudgetCents,
    userDailyJobs: limits.dailyJobs, userMonthlyJobs: limits.monthlyUserJobs,
    globalMonthlyJobs: limits.monthlyGlobalJobs,
  });
  if (job) await db.update("notes", { id: note.id, user_id: userId, version: note.version }, { ai_status: "pending", ai_context_version: note.version });
  else await db.update("notes", { id: note.id, user_id: userId }, { ai_status: "quota_exceeded" });
  return job;
}

/** Scheduling is deliberately absent here: this worker can only persist proposals and usage. */
export async function runAiJob(db: Db, jobId: string, userId: string, extractor: AiExtractor = extractWithModel): Promise<void> {
  const job = (await db.select("ai_jobs", { id: jobId, user_id: userId }))[0];
  if (!job || !["reserved", "running"].includes(job.status)) return;
  const note = (await db.select("notes", { id: job.note_id, user_id: userId }))[0];
  if (!note || note.version !== job.note_version) {
    await settleAiUsage(db, job, noUsage("stale"), "stale");
    return;
  }
  await db.update("ai_jobs", { id: job.id, user_id: userId, status: job.status }, { status: "running" });
  try {
    const result = await extractor(note.original_text, job.note_created_at, job.time_zone);
    await storeAiSuggestions(db, job, result.value, result.usage);
  } catch (error) {
    const code = error instanceof Error ? error.message.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40) : "ai_failed";
    // Do not double-settle if storage already completed and a later operation failed.
    const current = (await db.select("ai_jobs", { id: job.id, user_id: userId }))[0];
    if (current && ["reserved", "running"].includes(current.status)) {
      await settleAiUsage(db, current, noUsage("outage"), "failed", "provider_error");
      await db.update("notes", { id: note.id, user_id: userId, version: job.note_version }, { ai_status: "failed" });
    }
    void code;
  }
}

export async function processSavedNote(db: Db, userId: string, noteId: string, extractor: AiExtractor = extractWithModel): Promise<void> {
  const note = (await db.select("notes", { id: noteId, user_id: userId }))[0];
  if (!note) return;
  const job = await reserveForNote(db, userId, note);
  if (job) await runAiJob(db, job.id, userId, extractor);
}
