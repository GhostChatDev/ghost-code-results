import { api } from "@/lib/server/api";
import { listSubscriptions, removeSubscription, saveSubscription } from "@/lib/core/service";
import { HttpError } from "@/lib/core/types";

export const GET = api("push.list", 60, async (c) => ({
  devices: (await listSubscriptions(c.db, c.userId)).map((s) => ({ id: s.id, label: s.label, active: s.active, created_at: s.created_at })),
}));

export const POST = api("push.save", 20, async (c) => {
  const s = c.body.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
  if (!s?.endpoint || !s.keys?.p256dh || !s.keys.auth) throw new HttpError(400, "Bad subscription");
  const row = await saveSubscription(c.db, c.userId, { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, label: typeof c.body.label === "string" ? c.body.label : undefined });
  return { device: { id: row.id, label: row.label, active: row.active } };
});

export const DELETE = api("push.remove", 20, async (c) => {
  const id = c.url.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Not found");
  await removeSubscription(c.db, c.userId, id);
  return { ok: true };
});
