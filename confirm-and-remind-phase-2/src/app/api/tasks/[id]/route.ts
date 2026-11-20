import { api } from "@/lib/server/api";
import { deleteTask, setTaskStatus, updateTask } from "@/lib/core/service";
import type { TaskStatus } from "@/lib/core/types";

export const PATCH = api("tasks.update", 90, async (c) => {
  const id = c.params.id!;
  if (typeof c.body.status === "string") return { task: await setTaskStatus(c.db, c.userId, id, c.body.status as TaskStatus) };
  return {
    task: await updateTask(c.db, c.userId, id, {
      title: typeof c.body.title === "string" ? c.body.title : undefined,
      dueAt: c.body.dueAt === null || typeof c.body.dueAt === "string" ? c.body.dueAt : undefined,
    }),
  };
});

export const DELETE = api("tasks.delete", 30, async (c) => {
  await deleteTask(c.db, c.userId, c.params.id!);
  return { ok: true };
});
