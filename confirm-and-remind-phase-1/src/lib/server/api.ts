import type { Db } from "../core/db";
import { HttpError } from "../core/types";
import { authenticate } from "./auth";
import { getDb } from "./db";
import { clientIp, rateLimit } from "./rateLimit";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Ctx {
  req: Request;
  url: URL;
  userId: string;
  db: Db;
  params: Record<string, string>;
  body: Record<string, any>;
}
type RouteCtx = { params: Promise<any> };

/**
 * Wraps an API route: IP rate limit -> sign-in (ownership starts here) -> per-user rate limit -> JSON body -> errors.
 * Error messages are generic; note content is never logged.
 */
export function api(name: string, limit: number, fn: (c: Ctx) => Promise<unknown>) {
  // Next's route type check wants a required second argument; routes without params still get a context at runtime,
  // but we tolerate a missing one (rc?.params below).
  return async (req: Request, rc: RouteCtx): Promise<Response> => {
    try {
      if (!rateLimit(`ip:${clientIp(req)}`, 600)) throw new HttpError(429, "Too many requests");
      const userId = await authenticate(req);
      if (!rateLimit(`u:${userId}:${name}`, limit)) throw new HttpError(429, "Too many requests, slow down");
      let body: Record<string, any> = {};
      if (req.method !== "GET" && req.method !== "DELETE") {
        const text = await req.text();
        if (text.length > 200_000) throw new HttpError(413, "Request too large");
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          throw new HttpError(400, "Bad JSON");
        }
        if (typeof body !== "object" || body === null || Array.isArray(body)) throw new HttpError(400, "Bad JSON");
      }
      const params: Record<string, string> = (await rc?.params) ?? {};
      for (const v of Object.values(params)) if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw new HttpError(404, "Not found");
      const out = await fn({ req, url: new URL(req.url), userId, db: getDb(), params, body });
      return out instanceof Response ? out : Response.json(out ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}
