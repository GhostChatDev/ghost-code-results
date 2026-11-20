import type { Body, Level, Rect } from "./types";

export const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function solidAt(level: Pick<Level, "width" | "height" | "tiles">, x: number, y: number): boolean {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return false;
  return level.tiles[Math.floor(y)]?.[Math.floor(x)] === "#";
}

export interface CollisionResult {
  body: Body;
  hitX: -1 | 0 | 1;
  hitY: -1 | 0 | 1;
  platformId: string | null;
}

function tilesIn(level: Level, area: Rect): Rect[] {
  const result: Rect[] = [];
  const minX = Math.max(0, Math.floor(area.x) - 1);
  const maxX = Math.min(level.width - 1, Math.floor(area.x + area.w) + 1);
  const minY = Math.max(0, Math.floor(area.y) - 1);
  const maxY = Math.min(level.height - 1, Math.floor(area.y + area.h) + 1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (level.tiles[y]?.[x] === "#") result.push({ x, y, w: 1, h: 1 });
    }
  }
  result.push({ x: -1, y: -20, w: 1, h: level.height + 40 });
  result.push({ x: level.width, y: -20, w: 1, h: level.height + 40 });
  return result;
}

/** Sweep one axis to the earliest contact. Even a multi-tile delta cannot tunnel. */
export function moveBody(level: Level, source: Body, dx: number, dy: number, platforms: Rect[] = []): CollisionResult {
  const body = { ...source };
  let hitX: -1 | 0 | 1 = 0;
  let hitY: -1 | 0 | 1 = 0;
  let platformId: string | null = null;
  const area = {
    x: Math.min(body.x, body.x + dx), y: Math.min(body.y, body.y + dy),
    w: body.w + Math.abs(dx), h: body.h + Math.abs(dy),
  };
  const colliders = [...tilesIn(level, area), ...platforms];

  if (dx !== 0) {
    let allowed = dx;
    for (const r of colliders) {
      if (body.y + body.h <= r.y || body.y >= r.y + r.h) continue;
      if (dx > 0 && body.x + body.w <= r.x && body.x + body.w + dx >= r.x) {
        allowed = Math.min(allowed, r.x - body.x - body.w); hitX = 1;
      } else if (dx < 0 && body.x >= r.x + r.w && body.x + dx <= r.x + r.w) {
        allowed = Math.max(allowed, r.x + r.w - body.x); hitX = -1;
      }
    }
    body.x += allowed;
    if (hitX) body.vx = 0;
  }

  if (dy !== 0) {
    let allowed = dy;
    for (const r of colliders) {
      if (body.x + body.w <= r.x || body.x >= r.x + r.w) continue;
      const distance = dy > 0 ? r.y - body.y - body.h : r.y + r.h - body.y;
      const crosses = dy > 0
        ? body.y + body.h <= r.y && body.y + body.h + dy >= r.y
        : body.y >= r.y + r.h && body.y + dy <= r.y + r.h;
      if (!crosses || Math.abs(distance) > Math.abs(allowed)) continue;
      allowed = distance;
      hitY = dy > 0 ? 1 : -1;
      platformId = platforms.includes(r) ? (r as Rect & { id?: string }).id ?? null : null;
    }
    body.y += allowed;
    if (hitY) body.vy = 0;
  }
  return { body, hitX, hitY, platformId };
}
