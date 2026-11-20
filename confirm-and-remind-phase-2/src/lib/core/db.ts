import type { AiBudget, AiJob, Occurrence, TableMap, TableName } from "./types";

export interface AiReservation {
  userId: string;
  noteId: string;
  noteVersion: number;
  model: string;
  reserveCents: number;
  monthlyBudgetCents: number;
  userDailyJobs: number;
  userMonthlyJobs: number;
  globalMonthlyJobs: number;
  now?: Date;
}

/** Minimal table-level data port. Equality filters only; the service adds user_id to every filter. */
export interface Db {
  select<T extends TableName>(t: T, where: Partial<TableMap[T]>): Promise<TableMap[T][]>;
  insert<T extends TableName>(t: T, row: Partial<TableMap[T]>): Promise<TableMap[T]>;
  update<T extends TableName>(t: T, where: Partial<TableMap[T]>, patch: Partial<TableMap[T]>): Promise<TableMap[T][]>;
  remove<T extends TableName>(t: T, where: Partial<TableMap[T]>): Promise<number>;
  /** Full-text search over the caller's notes. */
  searchNotes(userId: string, q: string): Promise<TableMap["notes"][]>;
  /** Atomically claim due occurrences (server/scheduler only). */
  claimDue(worker: string, max: number, lockSeconds: number, nowMs: number): Promise<Occurrence[]>;
  /** Atomically enforce all quotas and reserve budget before any model request. */
  reserveAiJob(input: AiReservation): Promise<AiJob | null>;
  /** Release the reservation and record the actual (possibly zero) AI-only cost. */
  settleAiBudget(job: AiJob, actualCents: number): Promise<void>;
}

let counter = 0;
export function uuid(): string {
  counter++;
  return globalThis.crypto.randomUUID();
}

const DEFAULTS: { [K in TableName]?: () => Record<string, unknown> } = {
  notes: () => ({ pinned: false, version: 1, client_id: null }),
  tasks: () => ({ note_id: null, due_at: null, status: "open", source: "manual", client_id: null, completed_at: null }),
  reminders: () => ({ repeat: "none", day_of_month: null, expiry_minutes: 120, active: true, client_id: null }),
  reminder_occurrences: () => ({ status: "scheduled", claimed_by: null, claimed_until: null, attempts: 0, next_attempt_at: null }),
  push_subscriptions: () => ({ label: "This device", active: true, failure_count: 0 }),
  notification_attempts: () => ({ http_status: null, attempt_no: 1, occurrence_id: null, subscription_id: null }),
  audit_events: () => ({ meta: {} }),
  deletion_jobs: () => ({ status: "pending", finished_at: null }),
  profiles: () => ({ time_zone: "UTC", quiet_start: null, quiet_end: null, show_task_title: false, ai_enabled: false }),
  ai_jobs: () => ({ status: "reserved", input_tokens: 0, output_tokens: 0, actual_cents: 0, request_id: null, error_code: null, completed_at: null }),
  ai_suggestions: () => ({ status: "pending", confirmed_task_id: null, confirmed_reminder_id: null }),
};

/** In-memory database that enforces the same unique keys as the SQL schema. Used for tests and local mock mode. */
export class MemoryDb implements Db {
  private tables = new Map<TableName, Record<string, unknown>[]>();
  private rows(t: TableName): Record<string, unknown>[] {
    let r = this.tables.get(t);
    if (!r) this.tables.set(t, (r = []));
    return r;
  }
  private match(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([k, v]) => v === undefined || row[k] === v);
  }
  async select<T extends TableName>(t: T, where: Partial<TableMap[T]>): Promise<TableMap[T][]> {
    return this.rows(t).filter((r) => this.match(r, where)).map((r) => ({ ...r })) as unknown as TableMap[T][];
  }
  async insert<T extends TableName>(t: T, row: Partial<TableMap[T]>): Promise<TableMap[T]> {
    const now = new Date().toISOString();
    const full: Record<string, unknown> = { id: uuid(), created_at: now, updated_at: now, ...(DEFAULTS[t]?.() ?? {}), ...row };
    if (t === "profiles") delete full["updated_at"];
    this.checkUnique(t, full);
    this.rows(t).push(full);
    return { ...full } as unknown as TableMap[T];
  }
  private checkUnique(t: TableName, row: Record<string, unknown>) {
    const keys: Partial<Record<TableName, string[][]>> = {
      notes: [["user_id", "client_id"]],
      tasks: [["user_id", "client_id"]],
      reminders: [["user_id", "client_id"]],
      reminder_occurrences: [["reminder_id", "fire_at"]],
      push_subscriptions: [["user_id", "endpoint"]],
      notification_attempts: [["dispatch_key"]],
      note_versions: [["note_id", "version"]],
      profiles: [["id"]],
      ai_jobs: [["note_id", "note_version"]],
      ai_suggestions: [["note_id", "note_version", "task_index"]],
      ai_usage: [["job_id"]],
      ai_budgets: [["month"]],
    };
    for (const cols of keys[t] ?? []) {
      if (cols.some((c) => row[c] === null || row[c] === undefined)) continue; // NULLs never collide in SQL
      if (this.rows(t).some((r) => cols.every((c) => r[c] === row[c]))) throw new Error(`unique violation on ${t}(${cols.join(",")})`);
    }
  }
  async update<T extends TableName>(t: T, where: Partial<TableMap[T]>, patch: Partial<TableMap[T]>): Promise<TableMap[T][]> {
    const out: TableMap[T][] = [];
    for (const r of this.rows(t)) {
      if (!this.match(r, where)) continue;
      if ("user_id" in patch && (patch as Record<string, unknown>)["user_id"] !== r["user_id"]) throw new Error("user_id is immutable");
      Object.assign(r, patch);
      if ("updated_at" in r) r["updated_at"] = new Date().toISOString();
      out.push({ ...r } as unknown as TableMap[T]);
    }
    return out;
  }
  async remove<T extends TableName>(t: T, where: Partial<TableMap[T]>): Promise<number> {
    const keep = this.rows(t).filter((r) => !this.match(r, where));
    const n = this.rows(t).length - keep.length;
    this.tables.set(t, keep);
    return n;
  }
  async searchNotes(userId: string, q: string) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const all = (await this.select("notes", { user_id: userId })) as TableMap["notes"][];
    return all.filter((n) => words.every((w) => n.original_text.toLowerCase().includes(w)));
  }
  async claimDue(worker: string, max: number, lockSeconds: number, nowMs: number): Promise<Occurrence[]> {
    const due = this.rows("reminder_occurrences")
      .filter((o) => {
        const s = o["status"];
        const next = (o["next_attempt_at"] as string | null) ?? (o["fire_at"] as string);
        const until = o["claimed_until"] as string | null;
        return (s === "scheduled" || s === "queued") && Date.parse(o["fire_at"] as string) <= nowMs && Date.parse(next) <= nowMs && (!until || Date.parse(until) < nowMs);
      })
      .sort((a, b) => Date.parse(a["fire_at"] as string) - Date.parse(b["fire_at"] as string))
      .slice(0, max);
    for (const o of due) {
      o["claimed_by"] = worker;
      o["claimed_until"] = new Date(nowMs + lockSeconds * 1000).toISOString();
      o["status"] = "queued";
    }
    return due.map((o) => ({ ...o })) as unknown as Occurrence[];
  }
  /** A single synchronous critical section gives the in-memory adapter the same guarantees as the SQL RPC. */
  async reserveAiJob(input: AiReservation): Promise<AiJob | null> {
    const now = input.now ?? new Date();
    const note = this.rows("notes").find((n) => n["id"] === input.noteId && n["user_id"] === input.userId);
    const profile = this.rows("profiles").find((p) => p["id"] === input.userId);
    if (!note || note["version"] !== input.noteVersion || !profile?.["ai_enabled"] || String(note["original_text"]).length > 12_000) return null;
    const day = now.toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const start = new Date(`${day}T00:00:00.000Z`).getTime();
    const monthStart = new Date(`${month}-01T00:00:00.000Z`).getTime();
    const jobs = this.rows("ai_jobs");
    const doneToday = jobs.filter((j) => j["user_id"] === input.userId && Date.parse(j["created_at"] as string) >= start).length;
    const userMonth = jobs.filter((j) => j["user_id"] === input.userId && Date.parse(j["created_at"] as string) >= monthStart).length;
    const allMonth = jobs.filter((j) => Date.parse(j["created_at"] as string) >= monthStart).length;
    const budget = this.rows("ai_budgets").find((b) => b["month"] === month) as unknown as AiBudget | undefined;
    const committed = budget ? budget.reserved_cents + budget.spent_cents : 0;
    if (doneToday >= input.userDailyJobs || userMonth >= input.userMonthlyJobs || allMonth >= input.globalMonthlyJobs || committed + input.reserveCents > input.monthlyBudgetCents) return null;
    const job = await this.insert("ai_jobs", {
      user_id: input.userId, note_id: input.noteId, note_version: input.noteVersion,
      note_created_at: note["created_at"] as string, time_zone: profile["time_zone"] as string, model: input.model,
      reserved_cents: input.reserveCents, status: "reserved",
    });
    if (budget) { budget.reserved_cents += input.reserveCents; budget.updated_at = now.toISOString(); }
    else this.rows("ai_budgets").push({ id: uuid(), month, reserved_cents: input.reserveCents, spent_cents: 0, updated_at: now.toISOString() });
    return job;
  }
  async settleAiBudget(job: AiJob, actualCents: number): Promise<void> {
    const month = job.created_at.slice(0, 7);
    const budget = this.rows("ai_budgets").find((b) => b["month"] === month);
    if (budget) {
      budget["reserved_cents"] = Math.max(0, Number(budget["reserved_cents"]) - job.reserved_cents);
      budget["spent_cents"] = Number(budget["spent_cents"]) + Math.max(0, actualCents);
      budget["updated_at"] = new Date().toISOString();
    }
  }
}
