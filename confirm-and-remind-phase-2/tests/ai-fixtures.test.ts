import { describe, expect, it } from "vitest";
import { createNote, ensureProfile } from "../src/lib/core/service";
import { MemoryDb } from "../src/lib/core/db";
import { processSavedNote } from "../src/lib/server/aiJobs";
import { ANCHOR, samples } from "./ai-fixtures";

const ENV = { AI_BASE_URL: "https://ai.example.invalid/v1", AI_API_KEY: "test-only-not-a-secret", AI_EXTRACTION_MODEL: "mock-extractor", AI_MONTHLY_BUDGET_USD: "100" };
async function withEnv<T>(fn: () => Promise<T>): Promise<T> {
  const old = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
  Object.assign(process.env, ENV);
  try { return await fn(); } finally { for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

describe("30-note mocked model matrix", () => {
  it("has exactly 30 unique samples", () => {
    expect(samples).toHaveLength(30);
    expect(new Set(samples.map((s) => s.name)).size).toBe(30);
  });

  for (const sample of samples) {
    it(sample.name, async () => {
      const db = new MemoryDb();
      const user = await db.insert("profiles", { id: "matrix-user", time_zone: "America/New_York", ai_enabled: true });
      const saved = await createNote(db, user.id, { text: sample.text });
      const [note] = await db.update("notes", { id: saved.id, user_id: user.id }, { created_at: ANCHOR });
      await withEnv(() => processSavedNote(db, user.id, note!.id, async () => ({ value: sample.raw, usage: { inputTokens: 10, outputTokens: 5, actualCents: 1, requestId: "fixture" } })));
      const suggestions = await db.select("ai_suggestions", { note_id: note!.id, user_id: user.id });
      expect(suggestions).toHaveLength(sample.count);
      expect(await db.select("tasks", { user_id: user.id })).toHaveLength(0);
      expect(await db.select("reminders", { user_id: user.id })).toHaveLength(0);
      expect(await db.select("reminder_occurrences", { user_id: user.id })).toHaveLength(0);
      if (sample.count === 0) return;
      expect(suggestions[0]!.status).toBe("pending");
      expect(suggestions[0]!.resolved_due).toBe(sample.due ?? null);
      expect(suggestions[0]!.resolved_reminder).toBe(sample.reminder ?? null);
      expect(suggestions[0]!.needs_clarification).toBe(sample.clarification ?? false);
      expect(suggestions[0]!.note_created_at).toBe(ANCHOR);
      expect(sample.text.includes(suggestions[0]!.source_quote)).toBe(true);
    });
  }

  it("keeps note saving independent from the AI opt-in", async () => {
    const db = new MemoryDb();
    const user = await ensureProfile(db, "manual-user");
    const note = await createNote(db, user.id, { text: "Saved with AI off" });
    expect(note.original_text).toBe("Saved with AI off");
    expect(await db.select("ai_jobs", { note_id: note.id })).toHaveLength(0);
  });
});
