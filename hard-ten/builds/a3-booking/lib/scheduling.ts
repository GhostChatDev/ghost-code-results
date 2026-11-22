import { Temporal } from '@js-temporal/polyfill';

export type Hours = { weekday: number; start_time: string; end_time: string };
export type Interval = { start_at: string | Date; blocked_until: string | Date };
export type Slot = { start: string; end: string; blockedUntil: string };

export function validZone(zone: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
}

// Temporal's compatible disambiguation chooses the earlier occurrence in a fold.
// Round-trip the wall time so nonexistent spring-forward times are not shifted.
function wallInstant(date: Temporal.PlainDate, time: Temporal.PlainTime, zone: string): Temporal.Instant | null {
  const wall = date.toPlainDateTime(time);
  const zoned = wall.toZonedDateTime(zone, { disambiguation: 'compatible' });
  return zoned.toPlainDateTime().equals(wall) ? zoned.toInstant() : null;
}

export function generateSlots(options: {
  date: string; zone: string; hours: Hours[]; daysOff: string[];
  duration: number; buffer: number; occupied: Interval[]; now?: string;
}): Slot[] {
  const { date, zone, hours, daysOff, duration, buffer, occupied } = options;
  if (!validZone(zone) || daysOff.includes(date)) return [];
  const day = Temporal.PlainDate.from(date);
  const weekday = day.dayOfWeek % 7;
  const period = hours.find((item) => item.weekday === weekday);
  if (!period) return [];
  const startTime = Temporal.PlainTime.from(period.start_time);
  const endTime = Temporal.PlainTime.from(period.end_time);
  const now = Temporal.Instant.from(options.now ?? new Date().toISOString());
  const slots: Slot[] = [];
  const seen = new Set<string>();
  for (let wall = day.toPlainDateTime(startTime); Temporal.PlainDateTime.compare(wall, day.toPlainDateTime(endTime)) < 0; wall = wall.add({ minutes: 15 })) {
    const start = wallInstant(day, wall.toPlainTime(), zone);
    if (!start || Temporal.Instant.compare(start, now) <= 0) continue;
    const end = start.add({ minutes: duration });
    const blockedUntil = end.add({ minutes: buffer });
    // Require the whole occupied interval to end within the provider's working period.
    const closing = wallInstant(day, endTime, zone);
    if (!closing || Temporal.Instant.compare(blockedUntil, closing) > 0) continue;
    if (occupied.some((booking) => Temporal.Instant.compare(start, Temporal.Instant.from(new Date(booking.blocked_until).toISOString())) < 0 && Temporal.Instant.compare(blockedUntil, Temporal.Instant.from(new Date(booking.start_at).toISOString())) > 0)) continue;
    const key = start.toString();
    if (!seen.has(key)) { seen.add(key); slots.push({ start: key, end: end.toString(), blockedUntil: blockedUntil.toString() }); }
  }
  return slots;
}

export function dateInZone(instant: string, zone: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(zone).toPlainDate().toString();
}

export function generateSlotsForClientWindow(options: {
  clientDate: string;
  clientZone: string;
  daysCount?: number;
  providerZone: string;
  hours: Hours[];
  daysOff: string[];
  duration: number;
  buffer: number;
  occupied: Interval[];
  now?: string;
}): Slot[] {
  const { clientDate, clientZone, daysCount = 1, providerZone, hours, daysOff, duration, buffer, occupied, now } = options;
  if (!validZone(clientZone) || !validZone(providerZone)) return [];
  const startClientDay = Temporal.PlainDate.from(clientDate);
  const endClientDay = startClientDay.add({ days: Math.max(1, daysCount) });
  const winStart = startClientDay.toZonedDateTime({ timeZone: clientZone, plainTime: Temporal.PlainTime.from('00:00') }).toInstant();
  const winEnd = endClientDay.toZonedDateTime({ timeZone: clientZone, plainTime: Temporal.PlainTime.from('00:00') }).toInstant();

  const firstProviderDay = winStart.toZonedDateTimeISO(providerZone).toPlainDate().subtract({ days: 1 });
  const lastProviderDay = winEnd.toZonedDateTimeISO(providerZone).toPlainDate().add({ days: 1 });

  const allSlots: Slot[] = [];
  const seen = new Set<string>();
  for (
    let pDay = firstProviderDay;
    Temporal.PlainDate.compare(pDay, lastProviderDay) <= 0;
    pDay = pDay.add({ days: 1 })
  ) {
    const daySlots = generateSlots({
      date: pDay.toString(),
      zone: providerZone,
      hours,
      daysOff,
      duration,
      buffer,
      occupied,
      now,
    });
    for (const slot of daySlots) {
      const inst = Temporal.Instant.from(slot.start);
      if (
        Temporal.Instant.compare(inst, winStart) >= 0 &&
        Temporal.Instant.compare(inst, winEnd) < 0 &&
        !seen.has(slot.start)
      ) {
        seen.add(slot.start);
        allSlots.push(slot);
      }
    }
  }
  return allSlots.sort((a, b) =>
    Temporal.Instant.compare(Temporal.Instant.from(a.start), Temporal.Instant.from(b.start))
  );
}

