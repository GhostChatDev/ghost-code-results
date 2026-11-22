// Attempt 21's adapter: the five names the review test uses, forwarded to what attempt 21's own code paths do.
// Nothing else is added: no locks, no checks, no retries.
//   POST /api/notes                       → createNote, then enqueueAiJob(db, userId, note) and (the route's
//                                           after()) processNextAiJob(db, userId)
//   POST /api/suggestions/:id/review      → select the caller's own suggestion (404 if it isn't theirs), then
//                                           db.reviewAiSuggestion({ suggestionId, userId, noteVersion, action, timeZone })
//                                           with exactly what the Confirm and Dismiss buttons send when nothing
//                                           was edited: { action, timeZone } and no title or dates
// Stood in for: the AI provider (the cases' own mocked answer, as the chat-completion JSON this app reads; it
// asks its model to keep date phrases like "tomorrow at 3pm" as written, so the cases' "tomorrow at 9am" goes in
// unchanged), and the Next.js `server-only` marker (a no-op, as on the server).
// One thing this build needs that the cases' setup doesn't do: it runs no AI job until the person has turned AI
// on in Settings, which records their consent (profiles.ai_consented_at). The cases write `ai_enabled: true`
// straight into the table. So the adapter turns AI on the way the app's own Settings route does
// (updateProfile(db, userId, { ai_enabled: true })), and nothing more.
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { enqueueAiJob, processNextAiJob } from "../src/lib/server/aiWorker";
import { updateProfile } from "../src/lib/core/service";

export { MemoryDb } from "../src/lib/core/db";
export { createNote } from "../src/lib/core/service";

type ReviewModel = () => Promise<{ value: any; usage: { inputTokens: number; outputTokens: number } }>;

export async function processSavedNote(db: any, userId: string, noteId: string, model: ReviewModel) {
  await updateProfile(db, userId, { ai_enabled: true });
  const note = (await db.select("notes", { id: noteId, user_id: userId }))[0];
  try { await enqueueAiJob(db, userId, note); } catch { /* as the route: a saved note never becomes an error */ }
  await processNextAiJob(db, userId, (async () => {
    const r = await model();
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(r.value) } }], usage: { prompt_tokens: r.usage.inputTokens, completion_tokens: r.usage.outputTokens, cost: 0 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch);
}

async function review(db: any, userId: string, suggestionId: string, action: "confirm" | "dismiss", timeZone?: string) {
  const suggestion = (await db.select("ai_suggestions", { id: suggestionId, user_id: userId }))[0];
  if (!suggestion) throw new Error("Not found");
  return db.reviewAiSuggestion({ suggestionId: suggestion.id, userId, noteVersion: suggestion.note_version, action, title: undefined, dueAt: undefined, remindAt: undefined, timeZone: timeZone ?? suggestion.time_zone });
}

export async function confirmAiSuggestion(db: any, userId: string, suggestionId: string, timeZone: string) {
  return review(db, userId, suggestionId, "confirm", timeZone);
}

export async function dismissAiSuggestion(db: any, userId: string, suggestionId: string) {
  return review(db, userId, suggestionId, "dismiss");
}
