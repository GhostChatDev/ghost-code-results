// Attempt 13's adapter: the five names the review test uses, forwarded to what attempt 13's own code paths do.
// Nothing else is added: no locks, no checks, no retries.
//   POST /api/notes                → createNote, then queueSuggestionJob(db, userId, noteId, Boolean(aiConfig())),
//                                    then runSuggestionJob with the services the route builds (validate =
//                                    suggestionsForModel, environment = aiConfig()'s budget and quota)
//   POST /api/review/{id} confirm  → confirmSuggestion(db, userId, id, {}), with what review/page.tsx sends: no
//                                    text or times, so the suggestion's own values are used
//   POST /api/review/{id} dismiss  → dismissSuggestion(db, userId, id)
// The AI provider is stood in for with the cases' own mocked answer, checked by the app's own
// validateModelResult (what callProvider does). This app asks its model for dates as exact instants (ISO text),
// not phrases, so the one date phrase the cases use is written in that form: "tomorrow at 9am" → tomorrow 09:00
// UTC (the cases' time zone). Any other phrase is refused. The app then resolves the date from the quote itself.
import { MemoryDb as AppMemoryDb } from "../src/lib/core/db";
import { queueSuggestionJob, runSuggestionJob } from "../src/lib/core/aiJobs";
import { suggestionsForModel, validateModelResult } from "../src/lib/core/ai";
import { confirmSuggestion, dismissSuggestion } from "../src/lib/core/review";
import { aiConfig, workerId } from "../src/lib/server/ai";

export const MemoryDb = AppMemoryDb;
export { createNote } from "../src/lib/core/service";

type ReviewModel = () => Promise<{ value: any; usage: { inputTokens: number; outputTokens: number } }>;

const tomorrowAt9Utc = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 9, 0)).toISOString();
};
const DATE_PHRASES: Record<string, () => string> = { "tomorrow at 9am": tomorrowAt9Utc };
const instant = (v: unknown) => {
  if (v === null || v === undefined) return null;
  const f = DATE_PHRASES[String(v)];
  if (!f) throw new Error(`adapter: no translation for the date phrase ${JSON.stringify(v)}`);
  return f();
};

// POST /api/notes after the save: queue the job, then run it (what the route's after() does).
export async function processSavedNote(db: any, userId: string, noteId: string, model: ReviewModel) {
  const config = aiConfig();
  const job = await queueSuggestionJob(db, userId, noteId, Boolean(config));
  if (!job || !config) return;
  await runSuggestionJob(db, job.id, workerId(), {
    provider: async () => {
      const r = await model();
      const raw = { ...r.value, tasks: r.value.tasks.map((t: any) => ({ ...t, proposed_due: instant(t.proposed_due), proposed_reminder: instant(t.proposed_reminder) })) };
      return { result: validateModelResult(raw), inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costMicros: 0, requestId: null };
    },
    validate: (n: any, _p, reply) => reply.result ? suggestionsForModel(reply.result, { noteText: n.original_text, createdAt: n.created_at, timeZone: n.created_zone }) : [],
    environment: () => ({ enabled: true, reserveMicros: config.reserveMicros, budgetMicros: config.monthlyBudgetMicros, globalQuota: config.globalMonthlyQuota }),
  });
}

// POST /api/review/{id} { action: "confirm" }: the review page sends no text or times.
export async function confirmAiSuggestion(db: any, userId: string, suggestionId: string, _timeZone: string) {
  return confirmSuggestion(db, userId, suggestionId, {});
}

// POST /api/review/{id} { action: "dismiss" }
export async function dismissAiSuggestion(db: any, userId: string, suggestionId: string) {
  return dismissSuggestion(db, userId, suggestionId);
}
