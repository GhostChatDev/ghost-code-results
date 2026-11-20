import { api } from "@/lib/server/api";
import { processSavedNote } from "@/lib/server/aiJobs";
import { after } from "next/server";

export const GET = api("ai.review", 120, async (c) => {
  const note = (await c.db.select("notes", { id: c.params.noteId!, user_id: c.userId }))[0];
  if (!note) return Response.json({ error: "Not found" }, { status: 404 });
  const suggestions = await c.db.select("ai_suggestions", { note_id: note.id, user_id: c.userId, status: "pending" });
  const tasks = await c.db.select("tasks", { note_id: note.id, user_id: c.userId });
  const linkedItems = [];
  for (const task of tasks) {
    const reminders = await c.db.select("reminders", { task_id: task.id, user_id: c.userId });
    const occurrences = [];
    for (const reminder of reminders) occurrences.push(...await c.db.select("reminder_occurrences", { reminder_id: reminder.id, user_id: c.userId }));
    linkedItems.push({ task, occurrences });
  }
  return { note, suggestions: suggestions.sort((a, b) => a.task_index - b.task_index), linkedItems };
});

export const POST = api("ai.retry", 20, async (c) => {
  const note = (await c.db.select("notes", { id: c.params.noteId!, user_id: c.userId }))[0];
  if (!note) return Response.json({ error: "Not found" }, { status: 404 });
  after(() => processSavedNote(c.db, c.userId, note.id).catch(() => undefined));
  return { accepted: true };
});
