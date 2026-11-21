// Attempt 15's adapter: the five names the review test uses, forwarded to what attempt 15's own code paths do.
// Nothing else is added: no locks, no checks, no retries.
//   POST /api/notes                  → createNote, then (the route's after()) db.enqueueAi(note.id, userId) and,
//                                      if a job was queued, runOneAiJob(db, provider)
//   POST /api/ai/suggestions confirm → confirmAiSuggestion(db, userId, id)
//   POST /api/ai/suggestions dismiss → dismissAiSuggestion(db, userId, id)
// Stood in for: the AI provider (the cases' own mocked answer, as the JSON text a chat completion returns; this
// app asks its model for local wall times like "tomorrow at 3pm", so the cases' "tomorrow at 9am" goes in
// unchanged), and the Next.js `server-only` marker that src/lib/server/ai.ts imports (a no-op, as on the server).
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runOneAiJob } from "../src/lib/server/ai";
import { confirmAiSuggestion as confirmRoute, dismissAiSuggestion as dismissRoute } from "../src/lib/core/aiService";

export { MemoryDb } from "../src/lib/core/db";
export { createNote } from "../src/lib/core/service";

type ReviewModel = () => Promise<{ value: any; usage: { inputTokens: number; outputTokens: number } }>;

export async function processSavedNote(db: any, userId: string, noteId: string, model: ReviewModel) {
  const job = await db.enqueueAi(noteId, userId);
  if (job) {
    await runOneAiJob(db, async () => {
      const r = await model();
      return { content: JSON.stringify(r.value), inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costUsd: 0 };
    });
  }
}

export async function confirmAiSuggestion(db: any, userId: string, suggestionId: string, _timeZone: string) {
  return confirmRoute(db, userId, suggestionId);
}

export async function dismissAiSuggestion(db: any, userId: string, suggestionId: string) {
  return dismissRoute(db, userId, suggestionId);
}
