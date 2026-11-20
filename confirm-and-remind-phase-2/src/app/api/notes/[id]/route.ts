import { api } from "@/lib/server/api";
import { deleteNote, updateNote } from "@/lib/core/service";
import { processSavedNote } from "@/lib/server/aiJobs";
import { discardStaleSuggestions } from "@/lib/core/aiService";
import { after } from "next/server";

export const PATCH = api("notes.update", 90, async (c) => {
  const note = await updateNote(c.db, c.userId, c.params.id!, {
    text: typeof c.body.text === "string" ? c.body.text : undefined,
    pinned: typeof c.body.pinned === "boolean" ? c.body.pinned : undefined,
  });
  after(async () => {
    await discardStaleSuggestions(c.db, c.userId, note.id, note.version);
    await processSavedNote(c.db, c.userId, note.id);
  });
  return { note };
});

export const DELETE = api("notes.delete", 30, async (c) => {
  await deleteNote(c.db, c.userId, c.params.id!);
  return { ok: true };
});
