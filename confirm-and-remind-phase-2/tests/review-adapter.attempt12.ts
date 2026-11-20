// Attempt 12's adapter: the five names the review test uses, forwarded to what attempt 12's own code paths do.
// Nothing else is added: no locks, no checks, no retries.
//   POST /api/notes                → createNote, then enqueueNoteAi (queues the AI job), then the job runs:
//                                    store.claimAiJobs + runAiJob(db, store, job, worker, aiPolicy(), provider)
//   POST /api/review/{id} confirm  → confirmAiSuggestion(store, userId, id, { taskText, dueAt, remindAt }),
//                                    with what SuggestionCard.tsx sends: the suggestion's own text and times
//   POST /api/review/{id} dismiss  → updateAiSuggestion(db, userId, id, "dismiss")
// The store is built the way getAiStore() builds it without Supabase (MemoryAiStore with the profiles reader), but
// not taken from getAiStore's process-wide cache, which would keep the first test's database for every test.
// The AI provider is stood in for with the cases' own mocked answer. This app asks its model for dates as
// LocalDateSpec objects, not text, so the one date phrase the cases use is written in that form:
// "tomorrow at 9am" → { kind: "relative", offset_days: 1, hour: 9, minute: 0 }. Any other phrase is refused.
import type { Db } from "../src/lib/core/db";
import { MemoryAiStore } from "../src/lib/core/aiStore";
import { runAiJob } from "../src/lib/core/aiWorker";
import { confirmAiSuggestion as confirmRoute, updateAiSuggestion } from "../src/lib/core/aiReview";
import { enqueueNoteAi } from "../src/lib/server/aiJobs";
import { aiPolicy } from "../src/lib/server/aiProvider";

export { MemoryDb } from "../src/lib/core/db";
export { createNote } from "../src/lib/core/service";

type ReviewModel = () => Promise<{ value: any; usage: { inputTokens: number; outputTokens: number } }>;

const DATE_PHRASES: Record<string, object> = { "tomorrow at 9am": { kind: "relative", offset_days: 1, hour: 9, minute: 0 } };
const spec = (v: unknown) => {
  if (v === null || v === undefined) return null;
  const s = DATE_PHRASES[String(v)];
  if (!s) throw new Error(`adapter: no translation for the date phrase ${JSON.stringify(v)}`);
  return s;
};

const storeFor = (db: Db) => new MemoryAiStore(db, async () => new Map((await db.select("profiles", {})).map((p: any) => [p.id, { time_zone: p.time_zone, ai_enabled: p.ai_enabled }])));

// POST /api/notes after the save: queue the job, then run it (the job runner the app's after() and cron call).
export async function processSavedNote(db: Db, userId: string, noteId: string, model: ReviewModel) {
  const [note] = await db.select("notes", { id: noteId, user_id: userId });
  await enqueueNoteAi(db, note as any);
  const store = storeFor(db);
  const worker = "review-test";
  for (const job of await store.claimAiJobs(worker, 3, 120, Date.now())) {
    await runAiJob(db, store, job, worker, aiPolicy(), async () => {
      const r = await model();
      const raw = { ...r.value, tasks: r.value.tasks.map((t: any) => ({ ...t, proposed_due: spec(t.proposed_due), proposed_reminder: spec(t.proposed_reminder) })) };
      return { raw, input: r.usage.inputTokens, output: r.usage.outputTokens, cost: 0, provider: "review-test" } as any;
    });
  }
}

// POST /api/review/{id} { action: "confirm" }, with what the suggestion card sends.
export async function confirmAiSuggestion(db: Db, userId: string, suggestionId: string, _timeZone: string) {
  const [s] = await db.select("ai_suggestions", { id: suggestionId });
  if (!s) throw new Error("Suggestion not found");
  return confirmRoute(storeFor(db), userId, suggestionId, { taskText: s.task_text, dueAt: s.proposed_due, remindAt: s.proposed_reminder });
}

// POST /api/review/{id} { action: "dismiss" }
export async function dismissAiSuggestion(db: Db, userId: string, suggestionId: string) {
  return updateAiSuggestion(db, userId, suggestionId, "dismiss");
}
