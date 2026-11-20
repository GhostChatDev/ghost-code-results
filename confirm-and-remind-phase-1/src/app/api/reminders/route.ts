import { api } from "@/lib/server/api";
import { createReminder } from "@/lib/core/service";
import type { Repeat } from "@/lib/core/types";

/** The reply is the server's confirmation: the app shows "Scheduled" only after this returns. */
export const POST = api("reminders.create", 60, async (c) =>
  createReminder(c.db, c.userId, {
    taskId: c.body.taskId,
    remindAt: c.body.remindAt,
    repeat: c.body.repeat as Repeat | undefined,
    dayOfMonth: typeof c.body.dayOfMonth === "number" ? c.body.dayOfMonth : undefined,
    expiryMinutes: typeof c.body.expiryMinutes === "number" ? c.body.expiryMinutes : undefined,
    clientId: typeof c.body.clientId === "string" ? c.body.clientId.slice(0, 80) : undefined,
  }),
);
