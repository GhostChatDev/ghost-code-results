import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Db } from "../core/db";
import type { Occurrence, TableMap, TableName } from "../core/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Service-role access: RLS is bypassed here, so EVERY call from the service layer carries user_id in its filter.
// SERVER ONLY: never import this file from client code.

function filters(q: any, where: Record<string, unknown>) {
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
    q = v === null ? q.is(k, null) : q.eq(k, v);
  }
  return q;
}

/** Postgres `time` columns come back as HH:MM:SS; the core logic works with HH:MM. */
function norm<T>(row: any): T {
  for (const k of ["quiet_start", "quiet_end", "local_time"]) if (typeof row[k] === "string") row[k] = row[k].slice(0, 5);
  return row as T;
}

function check(error: { message: string } | null) {
  if (error) throw new Error("database error: " + error.message.slice(0, 200)); // never include row content
}

export class SupabaseDb implements Db {
  readonly client: SupabaseClient;
  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  async select<T extends TableName>(t: T, where: Partial<TableMap[T]>): Promise<TableMap[T][]> {
    const { data, error } = await filters(this.client.from(t).select("*"), where as Record<string, unknown>);
    check(error);
    return (data as any[]).map((r) => norm<TableMap[T]>(r));
  }
  async insert<T extends TableName>(t: T, row: Partial<TableMap[T]>): Promise<TableMap[T]> {
    const { data, error } = await this.client.from(t).insert(row as any).select().single();
    check(error);
    return norm<TableMap[T]>(data);
  }
  async update<T extends TableName>(t: T, where: Partial<TableMap[T]>, patch: Partial<TableMap[T]>): Promise<TableMap[T][]> {
    if (Object.keys(patch).length === 0) return this.select(t, where);
    const { data, error } = await filters(this.client.from(t).update(patch as any), where as Record<string, unknown>).select();
    check(error);
    return (data as any[]).map((r) => norm<TableMap[T]>(r));
  }
  async remove<T extends TableName>(t: T, where: Partial<TableMap[T]>): Promise<number> {
    const { error, count } = await filters(this.client.from(t).delete({ count: "exact" }), where as Record<string, unknown>);
    check(error);
    return count ?? 0;
  }
  async searchNotes(userId: string, q: string) {
    const { data, error } = await this.client
      .from("notes")
      .select("*")
      .eq("user_id", userId)
      .textSearch("search", q, { type: "websearch", config: "simple" })
      .limit(100);
    check(error);
    return (data as any[]).map((r) => norm<TableMap["notes"]>(r));
  }
  async claimDue(worker: string, max: number, lockSeconds: number, nowMs: number): Promise<Occurrence[]> {
    const { data, error } = await this.client.rpc("claim_due_occurrences", { p_worker: worker, p_max: max, p_lock_seconds: lockSeconds, p_now: new Date(nowMs).toISOString() });
    check(error);
    return (data ?? []) as Occurrence[];
  }
}
