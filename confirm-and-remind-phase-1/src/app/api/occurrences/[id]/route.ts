import { api } from "@/lib/server/api";
import { reschedule, snooze, type SnoozeKind } from "@/lib/core/service";
import { HttpError } from "@/lib/core/types";

/** body: { action: "snooze", kind: "10m" | "1h" | "tomorrow" } or { action: "reschedule", at: ISO time } */
export const POST = api("occurrences.act", 60, async (c) => {
  const id = c.params.id!;
  if (c.body.action === "snooze") return { occurrence: await snooze(c.db, c.userId, id, c.body.kind as SnoozeKind) };
  if (c.body.action === "reschedule" && typeof c.body.at === "string") return { occurrence: await reschedule(c.db, c.userId, id, c.body.at) };
  throw new HttpError(400, "Unknown action");
});
