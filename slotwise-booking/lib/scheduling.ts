import { DateTime } from 'luxon';

export type Interval = { start: Date; end: Date };
export type Hours = { opens: number; closes: number };
export type BreakHours = { starts: number; ends: number };
export type SlotInput = { date: string; zone: string; duration: number; hours: Hours | null; breaks: BreakHours[]; dayOff: boolean; bookings: Interval[]; now?: Date };

export function canModify(role: 'OWNER' | 'CUSTOMER', actorId: string, booking: { userId: string; start: Date }, now = new Date()) {
  return role === 'OWNER' || (booking.userId === actorId && booking.start.getTime() - now.getTime() >= 2 * 60 * 60 * 1000);
}

// Walk real instants, not local wall-clock values: missing and repeated DST times are handled explicitly.
export function availableSlots(input: SlotInput): Date[] {
  const { date, zone, hours, breaks, bookings, dayOff, duration } = input;
  if (!hours || dayOff || !Number.isInteger(duration) || duration < 1 || duration > 1440 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const day = DateTime.fromISO(date, { zone }).startOf('day');
  if (!day.isValid || day.toISODate() !== date) return [];
  const endOfDay = day.plus({ days: 1 });
  const now = input.now?.getTime() ?? Date.now();
  const result: Date[] = [];
  for (let t = day.toMillis(); t < endOfDay.toMillis(); t += 60_000) {
    const local = DateTime.fromMillis(t, { zone });
    const minute = local.hour * 60 + local.minute;
    if (minute % 15 !== 0 || t <= now) continue;
    const end = t + duration * 60_000;
    if (end > endOfDay.toMillis() || bookings.some(b => b.start.getTime() < end && b.end.getTime() > t)) continue;
    let valid = true;
    for (let tick = t; tick < end; tick += 60_000) {
      const wall = DateTime.fromMillis(tick, { zone });
      const m = wall.hour * 60 + wall.minute;
      if (wall.toISODate() !== date || m < hours.opens || m >= hours.closes || breaks.some(b => m >= b.starts && m < b.ends)) { valid = false; break; }
    }
    if (valid) result.push(new Date(t));
  }
  return result;
}
