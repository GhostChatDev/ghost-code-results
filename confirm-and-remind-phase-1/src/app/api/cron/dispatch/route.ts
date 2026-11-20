import { timingSafeEqual } from "node:crypto";
import { dispatchDue } from "@/lib/core/dispatch";
import { getDb } from "@/lib/server/db";
import { getSender } from "@/lib/server/push";
import { clientIp, rateLimit } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

function secretOk(req: Request): boolean {
  const want = process.env.CRON_SECRET ?? "";
  const h = req.headers.get("authorization") ?? "";
  const got = h.startsWith("Bearer ") ? h.slice(7) : req.headers.get("x-cron-secret") ?? "";
  if (want.length < 16 || got.length !== want.length) return false; // no secret configured = endpoint closed
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** Called every minute by the scheduler (see README). Claims due occurrences with a lock, rechecks them, sends pushes. */
async function run(req: Request): Promise<Response> {
  if (!rateLimit(`cron:${clientIp(req)}`, 30)) return Response.json({ error: "Too many requests" }, { status: 429 });
  if (!secretOk(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await dispatchDue(getDb(), getSender(), Date.now(), "cron-" + Math.random().toString(36).slice(2, 8));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Dispatch failed" }, { status: 500 });
  }
}
export const POST = run;
export const GET = run;
