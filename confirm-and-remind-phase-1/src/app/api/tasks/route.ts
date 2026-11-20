import { api } from "@/lib/server/api";
import { createTask, listUpcoming } from "@/lib/core/service";

/** Tasks with their reminder occurrences (used by Today and Upcoming). */
export const GET = api("tasks.list", 120, async (c) => ({ items: await listUpcoming(c.db, c.userId) }));

export const POST = api("tasks.create", 60, async (c) => ({
  task: await createTask(c.db, c.userId, {
    title: c.body.title,
    noteId: typeof c.body.noteId === "string" ? c.body.noteId : null,
    dueAt: typeof c.body.dueAt === "string" ? c.body.dueAt : null,
    clientId: typeof c.body.clientId === "string" ? c.body.clientId.slice(0, 80) : undefined,
  }),
}));
