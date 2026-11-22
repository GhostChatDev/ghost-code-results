// Pure collision helpers (no DOM). Used by the game and by the unit tests.

/** True when two circles overlap (touching edges count as a hit). */
export function circlesOverlap(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

/** True when point (px, py) lies inside the rectangle (edges included). */
export function pointInRect(px, py, x, y, w, h) {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

/**
 * Swept test: does a circle of radius r moving from (x0,y0) to (x1,y1)
 * touch a circle at (cx,cy) radius cr during the step? Stops fast bullets
 * from tunnelling through small enemies.
 */
export function segmentHitsCircle(x0, y0, x1, y1, r, cx, cy, cr) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) {
    t = ((cx - x0) * dx + (cy - y0) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  const px = x0 + dx * t - cx;
  const py = y0 + dy * t - cy;
  const rr = r + cr;
  return px * px + py * py <= rr * rr;
}

/**
 * Is the angle `a` (radians) within `halfArc` of `facing`? Used for the
 * shielded enemy: bullets arriving from the front are blocked.
 */
export function angleWithin(a, facing, halfArc) {
  let d = a - facing;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= halfArc;
}

/**
 * Shield check: a bullet travelling with velocity (vx, vy) hits the shield of
 * an enemy facing `facing` when it comes from in front of the enemy, i.e. the
 * bullet moves against the facing direction.
 */
export function blockedByShield(vx, vy, facing, halfArc) {
  const incoming = Math.atan2(-vy, -vx);
  return angleWithin(incoming, facing, halfArc);
}

/** Clamp a circle inside the arena rectangle; writes into `out` (no allocation). */
export function clampCircle(out, x, y, r, w, h) {
  out.x = x < r ? r : x > w - r ? w - r : x;
  out.y = y < r ? r : y > h - r ? h - r : y;
  return out;
}
