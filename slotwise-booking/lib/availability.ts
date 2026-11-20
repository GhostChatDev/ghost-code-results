import { DateTime } from 'luxon';
import type { Prisma } from '@prisma/client';
import { availableSlots } from './scheduling';
import { db } from './db';

type Client = Prisma.TransactionClient;
export async function slotsFor(date: string, serviceId: string, excludeBookingId?: string, client: Client = db) {
  const studio = await client.studio.findUnique({ where: { id: 'studio' }, include: { hours: true, breaks: true, daysOff: true } });
  const service = await client.service.findFirst({ where: { id: serviceId, studioId: 'studio', active: true } });
  if (!studio || !service || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const day = DateTime.fromISO(date, { zone: studio.timezone }).startOf('day');
  if (!day.isValid || day.toISODate() !== date) return [];
  const bookings = await client.booking.findMany({ where: { studioId: 'studio', status: 'ACTIVE', id: excludeBookingId ? { not: excludeBookingId } : undefined, start: { lt: day.plus({ days: 1 }).toJSDate() }, end: { gt: day.toJSDate() } }, select: { start: true, end: true } });
  return availableSlots({ date, zone: studio.timezone, duration: service.duration, hours: studio.hours.find(h => h.weekday === day.weekday) ?? null, breaks: studio.breaks.filter(b => b.weekday === day.weekday), dayOff: studio.daysOff.some(d => d.date === date), bookings });
}
