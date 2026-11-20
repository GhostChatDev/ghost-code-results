// Attempt 10's adapter: the five names the review test uses, forwarded to the functions attempt 10's own API
// routes call. Nothing else is added: no locks, no checks, no retries.
//   POST /api/notes             → reserveForNote (aiStore().reserve) then runJob (runAiJob(aiStore(), model, id))
//   POST /api/ai/suggestions/…/confirm → aiStore().confirm(userId, id, { title, dueAt, remindAt, repeat })
//   POST /api/ai/suggestions/…/dismiss → aiStore().dismiss(userId, id)
// Without Supabase configured, aiStore() is MemoryAiStore (src/lib/server/ai.ts), so that's what runs here.
// In production the confirm goes to the database function ai_confirm, which fails on every call (see ATTEMPTS.md).
import { MemoryDb } from "../src/lib/core/db";
import { createNote } from "../src/lib/core/service";
import { MemoryAiStore } from "../src/lib/core/ai/store";
import { runAiJob } from "../src/lib/core/ai/notes";
import type { Db } from "../src/lib/core/db";

export { MemoryDb, createNote };

// The limits the server uses by default (AI_LIMITS in src/lib/server/ai.ts).
const LIMITS = { user: 30, global: 1000, userBudget: 2_000_000, globalBudget: 20_000_000, note: 20_000 };

// The review test's mocked model returns { value, usage }; attempt 10's model port returns { raw, tokens, cost }.
type ReviewModel = () => Promise<{ value: unknown; usage: { inputTokens: number; outputTokens: number } }>;

// POST /api/notes: reserve a job for the saved note, then run it.
export async function processSavedNote(db: Db, userId: string, noteId: string, model: ReviewModel) {
  const store = new MemoryAiStore(db);
  const [note] = await db.select("notes", { id: noteId, user_id: userId });
  const { job } = await store.reserve({ userId, note: note!, hash: `${note!.id}:${note!.version}`, reservedCost: 100_000, limits: LIMITS });
  if (!job) return;
  await runAiJob(store, { extract: async () => { const r = await model(); return { raw: r.value, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costMicros: 0 }; } }, job.id);
}

// POST …/confirm: the review sheet sends the suggestion's own title and proposed times.
export async function confirmAiSuggestion(db: Db, userId: string, suggestionId: string, _timeZone: string) {
  const [s] = await db.select("ai_suggestions", { id: suggestionId });
  return new MemoryAiStore(db).confirm(userId, suggestionId, { title: s?.title ?? "", dueAt: s?.proposed_due ?? null, remindAt: s?.proposed_reminder ?? null, repeat: "none" });
}

// POST …/dismiss
export async function dismissAiSuggestion(db: Db, userId: string, suggestionId: string) {
  return new MemoryAiStore(db).dismiss(userId, suggestionId);
}
