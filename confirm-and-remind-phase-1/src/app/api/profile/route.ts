import { api } from "@/lib/server/api";
import { ensureProfile, updateProfile } from "@/lib/core/service";
import { HttpError } from "@/lib/core/types";

const hhmm = (v: unknown): string | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return v;
  throw new HttpError(400, "Bad time");
};

export const GET = api("profile.get", 120, async (c) => ({ profile: await ensureProfile(c.db, c.userId) }));

export const PATCH = api("profile.update", 30, async (c) => ({
  profile: await updateProfile(c.db, c.userId, {
    time_zone: typeof c.body.time_zone === "string" ? c.body.time_zone : undefined,
    quiet_start: hhmm(c.body.quiet_start),
    quiet_end: hhmm(c.body.quiet_end),
    show_task_title: typeof c.body.show_task_title === "boolean" ? c.body.show_task_title : undefined,
  }),
}));
