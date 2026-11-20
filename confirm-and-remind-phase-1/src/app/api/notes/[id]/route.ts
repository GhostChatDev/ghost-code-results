import { api } from "@/lib/server/api";
import { deleteNote, updateNote } from "@/lib/core/service";

export const PATCH = api("notes.update", 90, async (c) => ({
  note: await updateNote(c.db, c.userId, c.params.id!, {
    text: typeof c.body.text === "string" ? c.body.text : undefined,
    pinned: typeof c.body.pinned === "boolean" ? c.body.pinned : undefined,
  }),
}));

export const DELETE = api("notes.delete", 30, async (c) => {
  await deleteNote(c.db, c.userId, c.params.id!);
  return { ok: true };
});
