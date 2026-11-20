import { api } from "@/lib/server/api";
import { listSubscriptions } from "@/lib/core/service";
import { GENERIC_TEXT } from "@/lib/core/dispatch";
import { getSender } from "@/lib/server/push";
import { pushConfigured } from "@/lib/server/env";
import { HttpError } from "@/lib/core/types";

/** Sends one test push to the caller's own devices. Reports what the push service answered (not whether it was shown). */
export const POST = api("push.test", 5, async (c) => {
  const subs = (await listSubscriptions(c.db, c.userId)).filter((s) => s.active);
  if (!subs.length) throw new HttpError(409, "No device is enabled yet");
  const sender = getSender();
  let accepted = 0;
  for (const s of subs) {
    const r = await sender.send(s, { title: "Confirm & Remind", body: GENERIC_TEXT, url: "/", tag: "test" });
    if (r.status >= 200 && r.status < 300) accepted++;
    else if (r.status === 404 || r.status === 410) await c.db.update("push_subscriptions", { id: s.id, user_id: c.userId }, { active: false });
  }
  return { devices: subs.length, accepted, simulated: !pushConfigured() };
});
