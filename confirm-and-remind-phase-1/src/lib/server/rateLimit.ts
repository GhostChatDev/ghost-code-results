const hits = new Map<string, number[]>();

/** Sliding-window limiter. In-memory: per server instance (see README, Known limits). Returns false when over the limit. */
export function rateLimit(key: string, limit: number, windowMs = 60_000, now = Date.now()): boolean {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - (v[v.length - 1] ?? 0) >= windowMs) hits.delete(k);
  return true;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
