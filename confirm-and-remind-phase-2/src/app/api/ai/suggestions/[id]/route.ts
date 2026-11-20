import { confirmAiSuggestion, dismissAiSuggestion } from "@/lib/core/aiService";
import { api } from "@/lib/server/api";
import { HttpError } from "@/lib/core/types";

/** This route is reached only after api() authenticates the bearer token. */
export const PATCH = api("ai.decision", 60, async (c) => {
  if (c.body.action === "dismiss") return { suggestion: await dismissAiSuggestion(c.db, c.userId, c.params.id!) };
  if (c.body.action !== "confirm") throw new HttpError(400, "Choose Confirm, Edit, or Dismiss.");
  const edit = c.body.edit;
  if (edit !== undefined && (typeof edit !== "object" || edit === null || Array.isArray(edit))) throw new HttpError(400, "Invalid edit");
  return confirmAiSuggestion(c.db, c.userId, c.params.id!, Intl.DateTimeFormat().resolvedOptions().timeZone, edit ? {
    title: typeof edit.title === "string" ? edit.title : undefined,
    dueAt: typeof edit.dueAt === "string" || edit.dueAt === null ? edit.dueAt : undefined,
    reminderAt: typeof edit.reminderAt === "string" || edit.reminderAt === null ? edit.reminderAt : undefined,
    createReminder: edit.createReminder === true,
  } : undefined);
});
