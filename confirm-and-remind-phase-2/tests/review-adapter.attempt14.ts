// Attempt 14's adapter: the five names the review test uses, forwarded to what attempt 14's own code paths do.
// Nothing else is added: no locks, no checks, no retries.
//   POST /api/notes                       → createNote, then (the route's after()) enqueueAi(db, userId, noteId,
//                                           version) and, if queued, runAiJob(db, job.id, model, aiSettings())
//   POST /api/ai/suggestions/{id}         → confirmSuggestion(db, userId, id, body), with what AiReview.tsx sends
//                                           for a plain Confirm: {} (the suggestion's own text and times)
//   DELETE /api/ai/suggestions/{id}       → dismissSuggestion(db, userId, id)
// Stood in for: the AI provider (the cases' own mocked answer, given unchanged: this app works the dates out from
// the quote itself and only checks that the model proposed one), and the Next.js `server-only` marker that
// src/lib/server/ai.ts imports (a no-op, as Next.js makes it on the server).
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { enqueueAi, runAiJob, confirmSuggestion, dismissSuggestion } from "../src/lib/core/aiJobs";
import { aiSettings } from "../src/lib/server/ai";

export { MemoryDb } from "../src/lib/core/db";
export { createNote } from "../src/lib/core/service";

type ReviewModel = () => Promise<{ value: any; usage: { inputTokens: number; outputTokens: number } }>;

export async function processSavedNote(db: any, userId: string, noteId: string, model: ReviewModel) {
  const [note] = await db.select("notes", { id: noteId, user_id: userId });
  const job = await enqueueAi(db, userId, noteId, note.version);
  if (job?.status === "queued") {
    await runAiJob(db, job.id, {
      async extract() {
        const r = await model();
        return { result: r.value, usage: { inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costMicros: 0 } };
      },
    }, aiSettings());
  }
}

export async function confirmAiSuggestion(db: any, userId: string, suggestionId: string, _timeZone: string) {
  return confirmSuggestion(db, userId, suggestionId, {});
}

export async function dismissAiSuggestion(db: any, userId: string, suggestionId: string) {
  return dismissSuggestion(db, userId, suggestionId);
}
