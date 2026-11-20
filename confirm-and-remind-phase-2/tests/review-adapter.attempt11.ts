// Attempt 11's adapter: the five names the review test uses, forwarded to what attempt 11's own code paths do.
// Nothing else is added: no locks, no checks, no retries.
//   POST /api/notes                      → createNote (it queues the AI job in ai_jobs)
//   the scheduled AI job (/api/cron/ai)  → runAiJob(db): claims a queued job and calls the AI provider with fetch
//   POST /api/ai/suggestions/{id}/confirm → db.confirmAiSuggestion(userId, id, noteVersion, confirmation, now),
//                                           with exactly the body ReviewSuggestions.tsx sends (clientId "ai-<id>")
//   POST /api/ai/suggestions (dismiss)   → update ai_suggestions set status "dismissed" where pending
// The job has no way to take a mocked model, so the provider is stood in for: fetch answers in the
// OpenAI-compatible shape the app reads, with the review test's own mocked model output.
// src/lib/server/ai.ts starts with `import "server-only"`, a marker Next.js supplies when it builds the app (as a
// no-op on the server). Outside Next.js it doesn't exist, so it's stood in for here, in the adapter, as a no-op.
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runAiJob } from "../src/lib/server/ai";
import { validateConfirmation } from "../src/lib/core/ai";
import type { Db } from "../src/lib/core/db";

export { MemoryDb } from "../src/lib/core/db";
export { createNote } from "../src/lib/core/service";

type ReviewModel = () => Promise<{ value: unknown; usage: { inputTokens: number; outputTokens: number } }>;

// The scheduled AI job, with the AI provider answering the review test's model output.
export async function processSavedNote(db: Db, _userId: string, _noteId: string, model: ReviewModel) {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => {
    const r = await model();
    return new Response(JSON.stringify({ id: "review-test", choices: [{ message: { content: JSON.stringify(r.value) } }], usage: { prompt_tokens: r.usage.inputTokens, completion_tokens: r.usage.outputTokens } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await runAiJob(db);
  } finally {
    globalThis.fetch = real;
  }
}

// POST …/confirm, with the body the review screen sends.
export async function confirmAiSuggestion(db: Db, userId: string, suggestionId: string, _timeZone: string) {
  const [s] = await db.select("ai_suggestions", { id: suggestionId });
  if (!s) throw new Error("Suggestion not found");
  const confirmation = validateConfirmation({ taskText: s.task_text, dueAt: s.proposed_due, remindAt: s.proposed_reminder, amount: s.proposed_amount, clientId: `ai-${s.id}` });
  return db.confirmAiSuggestion(userId, suggestionId, s.note_version, confirmation, Date.now());
}

// POST /api/ai/suggestions { action: "dismiss" }
export async function dismissAiSuggestion(db: Db, userId: string, suggestionId: string) {
  return db.update("ai_suggestions", { id: suggestionId, user_id: userId, status: "pending" }, { status: "dismissed" });
}
