import { describe, expect, it } from "vitest";
import { resolveAiDate, validateAiExtraction } from "../src/lib/core/ai";
import { confirmAiSuggestion, discardStaleSuggestions } from "../src/lib/core/aiService";
import { MemoryDb } from "../src/lib/core/db";
import { createNote, createReminder, createTask } from "../src/lib/core/service";
import { extractWithModel } from "../src/lib/server/ai";
import { processSavedNote } from "../src/lib/server/aiJobs";
import { ANCHOR, task } from "./ai-fixtures";

const ENV = { AI_BASE_URL: "https://ai.example.invalid/v1", AI_API_KEY: "test-only-not-a-secret", AI_EXTRACTION_MODEL: "server-model", AI_MAX_OUTPUT_TOKENS: "500" };
async function env<T>(fn: () => Promise<T>): Promise<T> {
  const old = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
  Object.assign(process.env, ENV);
  try { return await fn(); } finally { for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
async function seed(text = "Pay rent tomorrow at 9am.") {
  const db = new MemoryDb();
  const profile = await db.insert("profiles", { id: "u", time_zone: "America/New_York", ai_enabled: true });
  const saved = await createNote(db, profile.id, { text });
  const [note] = await db.update("notes", { id: saved.id, user_id: profile.id }, { created_at: ANCHOR });
  return { db, profile, note: note! };
}
const extractor = (value: unknown) => async () => ({ value, usage: { inputTokens: 10, outputTokens: 5, actualCents: 1, requestId: "mock" } });
async function extract(db: MemoryDb, userId: string, noteId: string, value: unknown) {
  await env(() => processSavedNote(db, userId, noteId, extractor(value)));
  return db.select("ai_suggestions", { user_id: userId, note_id: noteId });
}
const modelBody = (body: unknown) => ({ choices: [{ message: { content: typeof body === "string" ? body : JSON.stringify(body) } }], usage: { prompt_tokens: 10, completion_tokens: 5 }, id: "mock" });
const response = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

describe("validated extraction and anchored dates", () => {
  it("uses only server configuration and caps output", async () => {
    let init: RequestInit | undefined; let url = "";
    const original = globalThis.fetch;
    globalThis.fetch = async (input, options) => { url = String(input); init = options; return response(modelBody({ title: "Rent", tasks: [] })); };
    try {
      const result = await env(() => extractWithModel("Pay rent tomorrow", ANCHOR, "UTC"));
      expect(result.value).toEqual({ title: "Rent", tasks: [] });
      expect(url).toBe("https://ai.example.invalid/v1/chat/completions");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer test-only-not-a-secret" });
      const request = JSON.parse(String(init?.body));
      expect(request.model).toBe("server-model");
      expect(request.max_tokens).toBe(500);
      expect(request.response_format).toEqual({ type: "json_object" });
    } finally { globalThis.fetch = original; }
  });
  it("rejects malformed JSON, fake/missing quotes and drops extra fields", async () => {
    const original = globalThis.fetch;
    try {
      globalThis.fetch = async () => response(modelBody("not json"));
      await expect(env(() => extractWithModel("Real quote", ANCHOR, "UTC"))).rejects.toThrow("ai_invalid_json");
      const fake = validateAiExtraction({ title: "x", tasks: [task("Fake", "invented"), task("Missing", "")] }, "Real quote", ANCHOR, "UTC");
      expect(fake?.tasks).toEqual([]);
      const extra = validateAiExtraction({ title: "x", tasks: [{ ...task("Pay", "Real quote"), confidence: 0.99 }] }, "Real quote", ANCHOR, "UTC");
      expect(extra?.tasks[0]).not.toHaveProperty("confidence");
    } finally { globalThis.fetch = original; }
  });
  it("anchors relative dates to note creation, not job time", () => {
    expect(resolveAiDate("tomorrow at 9am", ANCHOR, "America/New_York").instant).toBe("2025-01-07T14:00:00.000Z");
    expect(resolveAiDate("tomorrow at 9am", ANCHOR, "America/New_York").instant).toBe("2025-01-07T14:00:00.000Z");
  });
  it.each(["Thursday afternoon", "after payday", "03/04", "2025-02-01", "tomorrow"])("does not invent a time for %s", (date) => {
    expect(resolveAiDate(date, ANCHOR, "UTC").instant).toBeNull();
  });
  it("rejects clarification when the model failed to flag ambiguity", async () => {
    const { db, profile, note } = await seed("Meeting 03/04 with Alex.");
    const suggestions = await extract(db, profile.id, note.id, { title: "Meeting", tasks: [task("Meeting", "03/04", "03/04", null, false)] });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.needs_clarification).toBe(true);
    expect(suggestions[0]!.resolved_due).toBeNull();
  });
});

describe("confirmation, stale versions, outages and budgets", () => {
  it("creates a reminder only on explicit confirmation and only once", async () => {
    const { db, profile, note } = await seed();
    const [s] = await extract(db, profile.id, note.id, { title: "Rent", tasks: [task("Pay rent", "tomorrow at 9am", "tomorrow at 9am", "tomorrow at 9am")] });
    expect(await db.select("tasks", { user_id: profile.id })).toHaveLength(0);
    expect(await db.select("reminders", { user_id: profile.id })).toHaveLength(0);
    const confirmed = await confirmAiSuggestion(db, profile.id, s!.id, "America/New_York");
    expect(confirmed.reminder!.remind_at).toBe("2025-01-07T14:00:00.000Z");
    expect(confirmed.task.source).toBe("ai");
    await expect(confirmAiSuggestion(db, profile.id, s!.id, "America/New_York")).rejects.toMatchObject({ status: 409 });
    expect(await db.select("reminders", { user_id: profile.id })).toHaveLength(1);
    await expect(confirmAiSuggestion(db, "someone-else", s!.id, "UTC")).rejects.toMatchObject({ status: 404 });
  });
  it("rejects stale decisions and preserves confirmed reminders when a note changes", async () => {
    const { db, profile, note } = await seed();
    const [suggestion] = await extract(db, profile.id, note.id, { title: "Rent", tasks: [task("Pay", "Pay rent", null, "tomorrow at 9am")] });
    const result = await confirmAiSuggestion(db, profile.id, suggestion!.id, "America/New_York");
    await db.update("notes", { id: note.id, user_id: profile.id }, { original_text: "Version two", version: 2 });
    await discardStaleSuggestions(db, profile.id, note.id, 2);
    expect((await db.select("ai_suggestions", { id: suggestion!.id }))[0]!.status).toBe("confirmed");
    expect((await db.select("reminders", { id: result.reminder!.id }))[0]).toEqual(result.reminder);
  });
  it("cannot overwrite a newer note or release a newer reservation from a stale job", async () => {
    const { db, profile, note } = await seed();
    const job = await db.insert("ai_jobs", { user_id: profile.id, note_id: note.id, note_version: 1, note_created_at: ANCHOR, time_zone: "America/New_York", model: "m", status: "running", reserved_cents: 100, created_at: ANCHOR });
    await db.update("notes", { id: note.id }, { original_text: "New text", version: 2 });
    await env(() => processSavedNote(db, profile.id, note.id, async () => { throw new Error("must not run"); }));
    expect((await db.select("notes", { id: note.id }))[0]!.original_text).toBe("New text");
    expect((await db.select("ai_jobs", { id: job.id }))[0]!.status).toBe("stale");
    expect(await db.select("ai_suggestions", { note_id: note.id })).toHaveLength(0);
  });
  it("keeps notes and manual reminders working during outage and budget exhaustion", async () => {
    const { db, profile, note } = await seed();
    await env(() => processSavedNote(db, profile.id, note.id, async () => { throw new Error("provider unavailable"); }));
    expect((await db.select("notes", { id: note.id }))[0]!.ai_status).toBe("failed");
    const manual = await createNote(db, profile.id, { text: "Manual still works" });
    const t = await createTask(db, profile.id, { title: "Manual reminder", noteId: manual.id });
    expect((await createReminder(db, profile.id, { taskId: t.id, remindAt: "2025-02-01T14:00:00Z" })).occurrence.status).toBe("scheduled");
    await db.update("ai_budgets", {}, { spent_cents: 10000 });
    const next = await createNote(db, profile.id, { text: "Budget note" });
    const reservation = await db.reserveAiJob({ userId: profile.id, noteId: next.id, noteVersion: 1, model: "m", reserveCents: 100, monthlyBudgetCents: 10000, userDailyJobs: 100, userMonthlyJobs: 1000, globalMonthlyJobs: 10000, now: new Date() });
    expect(reservation).toBeNull();
    expect((await createNote(db, profile.id, { text: "Still saved after cap" })).original_text).toBe("Still saved after cap");
  });
  it("requires an exact reminder and rejects empty edits", async () => {
    const { db, profile, note } = await seed("Thursday afternoon: report.");
    const [s] = await extract(db, profile.id, note.id, { title: "Report", tasks: [task("Report", "Thursday afternoon", "Thursday afternoon", null, true)] });
    await expect(confirmAiSuggestion(db, profile.id, s!.id, "UTC", { createReminder: true })).rejects.toMatchObject({ status: 400 });
    const confirmed = await confirmAiSuggestion(db, profile.id, s!.id, "UTC", { title: "Report", dueAt: "2025-01-09T20:00:00Z", reminderAt: null, createReminder: false });
    expect(confirmed.task.title).toBe("Report");
    expect(await db.select("reminders", { user_id: profile.id })).toHaveLength(0);
  });
});
