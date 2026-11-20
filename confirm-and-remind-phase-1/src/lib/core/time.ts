// Time-zone maths. Times are stored as UTC instants plus an IANA zone name; repeating reminders are
// expanded from WALL-CLOCK time in that zone, so "daily 08:00" stays 08:00 local across DST changes.
//
// RULES (documented, tested):
//  * Monthly reminders keep their requested day_of_month. In a month that is too short, the reminder
//    fires on the LAST day of that month (31st -> 30th/28th/29th). The next month goes back to the 31st.
//  * A local time that does not exist (spring-forward gap) fires at the same instant the clock jumps to,
//    i.e. shifted forward by the gap (02:30 -> 03:30).
//  * A local time that happens twice (fall-back) fires the FIRST time.

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface LocalParts { y: number; m: number; d: number; h: number; min: number }

export function localParts(ms: number, tz: string): LocalParts {
  const p: Record<string, number> = {};
  for (const part of fmt(tz).formatToParts(new Date(ms))) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { y: p["year"]!, m: p["month"]!, d: p["day"]!, h: p["hour"]!, min: p["minute"]! };
}

/** Offset (ms) of tz from UTC at the given instant. */
export function offsetAt(ms: number, tz: string): number {
  const p = fmt(tz).formatToParts(new Date(ms));
  const g: Record<string, number> = {};
  for (const part of p) if (part.type !== "literal") g[part.type] = Number(part.value);
  const asUtc = Date.UTC(g["year"]!, g["month"]! - 1, g["day"]!, g["hour"]!, g["minute"]!, g["second"]!);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Convert a wall-clock time in tz to a UTC instant (ms). */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const o1 = offsetAt(guess, tz);
  const t1 = guess - o1;
  const o2 = offsetAt(t1, tz);
  if (o1 === o2) return t1;
  const t2 = guess - o2;
  if (offsetAt(t2, tz) === o2) return t2;
  return t1; // inside a gap: shift forward
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function parseHHMM(s: string): { h: number; min: number } {
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) throw new Error("bad time");
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error("bad time");
  return { h, min };
}

export interface Recurrence {
  repeat: "none" | "daily" | "weekly" | "monthly";
  time_zone: string;
  local_time: string;
  day_of_month: number | null;
  /** UTC instant of the first occurrence (anchors weekday for weekly). */
  remind_at: string;
}

/** The first occurrence strictly after `afterMs`, or null for non-repeating reminders. */
export function nextOccurrenceAfter(r: Recurrence, afterMs: number): number | null {
  if (r.repeat === "none") return null;
  const { h, min } = parseHHMM(r.local_time);
  const tz = r.time_zone;
  const start = localParts(Math.max(afterMs, Date.parse(r.remind_at) - 1), tz);
  const anchor = localParts(Date.parse(r.remind_at), tz);
  const anchorWeekday = new Date(Date.UTC(anchor.y, anchor.m - 1, anchor.d)).getUTCDay();
  const wantDom = r.day_of_month ?? anchor.d;
  // Walk calendar days (pure date arithmetic) and convert each wall-clock candidate.
  for (let i = 0; i < 800; i++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i));
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    if (r.repeat === "weekly" && day.getUTCDay() !== anchorWeekday) continue;
    if (r.repeat === "monthly" && d !== Math.min(wantDom, daysInMonth(y, m))) continue;
    const t = zonedToUtc(y, m, d, h, min, tz);
    if (t > afterMs) return t;
  }
  return null;
}

/** Is the instant inside quiet hours (local wall-clock window, may cross midnight)? Returns the end instant or null. */
export function quietHoursEnd(ms: number, tz: string, start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const s = parseHHMM(start), e = parseHHMM(end);
  const lp = localParts(ms, tz);
  const now = lp.h * 60 + lp.min, a = s.h * 60 + s.min, b = e.h * 60 + e.min;
  if (a === b) return null;
  const inside = a < b ? now >= a && now < b : now >= a || now < b;
  if (!inside) return null;
  const endsToday = a < b || now < b;
  const day = new Date(Date.UTC(lp.y, lp.m - 1, lp.d + (endsToday ? 0 : 1)));
  return zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), e.h, e.min, tz);
}

/** "Tomorrow morning" = 09:00 local on the next calendar day. */
export function tomorrowMorning(nowMs: number, tz: string): number {
  const lp = localParts(nowMs, tz);
  const day = new Date(Date.UTC(lp.y, lp.m - 1, lp.d + 1));
  return zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 9, 0, tz);
}
