import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractWithModel } from "../src/lib/server/ai";

function files(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((name) => {
    const p = path.join(root, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const frontend = () => [
  ...files(path.join(process.cwd(), "src/app")).filter((f) => /\.(tsx|ts)$/.test(f) && !f.includes(`${path.sep}api${path.sep}`)),
  ...files(path.join(process.cwd(), "src/components")),
  ...files(path.join(process.cwd(), "src/lib/client")),
];

describe("AI secret and content boundaries", () => {
  it("keeps server configuration and secret identifiers out of frontend source", () => {
    for (const file of frontend()) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/AI_API_KEY|AI_BASE_URL|AI_EXTRACTION_MODEL|NEXT_PUBLIC_AI/);
      expect(source, file).not.toMatch(/process\.env/);
      expect(source, file).not.toContain("lib/server/ai");
    }
  });
  it("scans the built client bundle and source maps for the CI sentinel and configuration", () => {
    const bundle = files(path.join(process.cwd(), ".next/static"));
    expect(bundle.length, "run the production build before this test").toBeGreaterThan(0);
    for (const file of bundle.filter((f) => /\.(js|map|json)$/.test(f))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toContain("phase2-ci-sentinel-do-not-deploy");
      expect(text, file).not.toMatch(/AI_API_KEY|AI_EXTRACTION_MODEL|NEXT_PUBLIC_AI/);
    }
  });
  it("does not log secrets or note content and sanitizes provider failures", async () => {
    const secret = "test-only-not-a-secret";
    const note = "Private note text that must not appear in logs";
    const old = { AI_BASE_URL: process.env.AI_BASE_URL, AI_API_KEY: process.env.AI_API_KEY, AI_EXTRACTION_MODEL: process.env.AI_EXTRACTION_MODEL };
    process.env.AI_BASE_URL = "https://ai.example.invalid/v1"; process.env.AI_API_KEY = secret; process.env.AI_EXTRACTION_MODEL = "private-model";
    const logs: string[] = [];
    const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
    console.log = console.info = console.warn = console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
    try {
      const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error(`provider echoed ${secret} and ${note}`); };
    let failure: unknown;
    try { await extractWithModel(note, "2025-01-06T12:00:00.000Z", "America/New_York"); }
    catch (error) { failure = error; }
    finally { globalThis.fetch = originalFetch; }
      expect(failure).toBeInstanceOf(Error);
          // The server boundary, not this raw provider helper, classifies arbitrary provider errors.
          const { processSavedNote } = await import("../src/lib/server/aiJobs");
          const { MemoryDb: Db } = await import("../src/lib/core/db");
          const db = new Db();
          await db.insert("profiles", { id: "u", time_zone: "UTC", ai_enabled: true });
          const saved = await db.insert("notes", { user_id: "u", original_text: note, created_at: "2025-01-06T12:00:00.000Z" });
          globalThis.fetch = async () => { throw new Error(`provider echoed ${secret} and ${note}`); };
          try { await processSavedNote(db, "u", saved.id); } finally { globalThis.fetch = originalFetch; }
          expect((await db.select("ai_jobs", { id: (await db.select("ai_jobs", { note_id: saved.id }))[0]!.id }))[0]!.error_code).toBe("provider_error");
      expect(logs.join("\n")).not.toContain(secret);
      expect(logs.join("\n")).not.toContain(note);
    } finally {
      console.log = original.log; console.info = original.info; console.warn = original.warn; console.error = original.error;
      for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });
  it("stores only token/cost/job metadata in ai_usage", async () => {
    const { MemoryDb } = await import("../src/lib/core/db");
    const db = new MemoryDb();
    const row = await db.insert("ai_usage", { user_id: "u", job_id: "j", model: "m", reserved_cents: 1, actual_cents: 1 });
    expect(JSON.stringify(row)).not.toMatch(/original_text|source_quote|note_text|prompt|completion/);
    expect(row).toMatchObject({ user_id: "u", job_id: "j", model: "m", reserved_cents: 1, actual_cents: 1 });
  });
});
