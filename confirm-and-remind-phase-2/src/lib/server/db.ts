import { MemoryDb, type Db } from "../core/db";
import { isMock } from "./env";
import { SupabaseDb } from "./supabaseDb";

const g = globalThis as unknown as { __memDb?: MemoryDb; __sbDb?: SupabaseDb };

/** Real Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set; otherwise an in-memory MOCK (dev/test only, data is lost on restart). */
export function getDb(): Db {
  if (isMock()) return (g.__memDb ??= new MemoryDb());
  return (g.__sbDb ??= new SupabaseDb(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!));
}

export function adminClient() {
  const db = getDb();
  return db instanceof SupabaseDb ? db.client : null;
}
