import { api } from "@/lib/server/api";
import { createNote, listNotes } from "@/lib/core/service";
import { processSavedNote } from "@/lib/server/aiJobs";
import { after } from "next/server";

export const GET = api("notes.list", 120, async (c) => ({ notes: await listNotes(c.db, c.userId, c.url.searchParams.get("q") ?? undefined) }));

export const POST = api("notes.create", 60, async (c) => {
  const note = await createNote(c.db, c.userId, { text: c.body.text, clientId: typeof c.body.clientId === "string" ? c.body.clientId.slice(0, 80) : undefined });
  after(() => processSavedNote(c.db, c.userId, note.id).catch(() => undefined));
  return { note };
});
