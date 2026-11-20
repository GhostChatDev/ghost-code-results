// Our review of this build, as tests that state the right behaviour. "One tap, one reminder" FAILS on this
// build (two confirms at the same moment both succeed); it is published failing on purpose, as the record.
// Run from the app folder: npx vitest run tests/review-no-tap-routes.test.ts (with that build's tests/review-adapter.ts)
//
// The no-tap routes (the same list is used for Ghost Code's own Apply button):
//   1. the button        - only an explicit Confirm tap sends a confirm request
//   2. the background job - only writes suggestions, never tasks or reminders
//   3. the API           - confirm only works on your own suggestion
//   4. a new session     - no approval carries over
//   5. Dismiss, then the job runs again - a dismissed suggestion never comes back as a reminder
import { it, expect } from "vitest";
// The four cases below never change. Each build gets a small adapter (review-adapter.ts, published with its
// result) that only forwards these five names to that build's own functions, the ones its API routes call.
import { MemoryDb, createNote, processSavedNote, confirmAiSuggestion, dismissAiSuggestion } from "./review-adapter";

Object.assign(process.env, { AI_BASE_URL: "https://example.invalid/v1", AI_API_KEY: "test-key", AI_EXTRACTION_MODEL: "test-model" });
const model = async () => ({ value: { title: "t", tasks: [{ text: "Pay rent", source_quote: "Pay rent tomorrow at 9am", proposed_due: "tomorrow at 9am", proposed_reminder: "tomorrow at 9am", needs_clarification: false, ambiguity_note: null }] }, usage: { inputTokens: 1, outputTokens: 1, actualCents: 0, requestId: null } });

async function setup() {
  const db = new MemoryDb();
  await db.insert("profiles", { id: "u", time_zone: "UTC", ai_enabled: true });
  await db.insert("profiles", { id: "other", time_zone: "UTC", ai_enabled: true });
  const note = await createNote(db, "u", { text: "Pay rent tomorrow at 9am" });
  await processSavedNote(db, "u", note.id, model as never);
  const [s] = await db.select("ai_suggestions", { user_id: "u" });
  return { db, note, s: s! };
}

it("route 2: the background job creates no reminder", async () => {
  const { db } = await setup();
  expect(await db.select("reminders", { user_id: "u" })).toHaveLength(0);
});

it("route 3: someone else can't confirm your suggestion", async () => {
  const { db, s } = await setup();
  await expect(confirmAiSuggestion(db, "other", s.id, "UTC")).rejects.toThrow();
  expect(await db.select("reminders", {})).toHaveLength(0);
});

it("route 5: Dismiss, then the job runs again: no reminder, no suggestion back", async () => {
  const { db, note, s } = await setup();
  await dismissAiSuggestion(db, "u", s.id);
  // A second job for the same note version is refused (here as a duplicate-job error; the Postgres version
  // skips it quietly). Either way, what matters is below: nothing comes back.
  await processSavedNote(db, "u", note.id, model as never).catch(() => {});
  expect(await db.select("reminders", { user_id: "u" })).toHaveLength(0);
  expect((await db.select("ai_suggestions", { user_id: "u" })).filter((x: any) => x.status === "pending")).toHaveLength(0);
});

it("one tap, one reminder: two confirms at the same moment make one reminder (FAILS on this build)", async () => {
  const { db, s } = await setup();
  await Promise.allSettled([confirmAiSuggestion(db, "u", s.id, "UTC"), confirmAiSuggestion(db, "u", s.id, "UTC")]);
  expect(await db.select("reminders", { user_id: "u" })).toHaveLength(1);
});
