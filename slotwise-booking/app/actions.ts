'use server';

import { compare, hash } from 'bcryptjs';
import { DateTime } from 'luxon';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '../lib/db';
import { createSession, currentUser, endSession, rateLimit } from '../lib/security';
import { slotsFor } from '../lib/availability';
import { canModify } from '../lib/scheduling';

const text = (f: FormData, key: string) => String(f.get(key) ?? '').trim();
function fail(path: string, message: string): never { redirect(`${path}?error=${encodeURIComponent(message)}`); }
const emailSchema = z.string().email().max(254);
const passwordSchema = z.string().min(10).max(72);
const idSchema = z.string().min(1).max(100);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const num = (f: FormData, key: string) => Number(text(f, key));

export async function authenticate(f: FormData) {
  const email = text(f, 'email').toLowerCase();
  const password = text(f, 'password');
  const signup = text(f, 'mode') === 'signup';
  const name = text(f, 'name');
  if (!emailSchema.safeParse(email).success || !passwordSchema.safeParse(password).success || (signup && (!name || name.length > 100))) fail('/sign-in', 'Check your details. Passwords must be 10–72 characters.');
  if (!(await rateLimit(`auth:${email}`, 8, 900))) fail('/sign-in', 'Too many attempts. Try again later.');
  if (signup) {
    try { const user = await db.user.create({ data: { email, name, passwordHash: await hash(password, 12), role: 'CUSTOMER' } }); await createSession(user.id); }
    catch { fail('/sign-in', 'Could not create this account. Try signing in.'); }
  } else {
    const user = await db.user.findUnique({ where: { email } });
    // Always do a password hash comparison, even for an unknown email.
    const valid = await compare(password, user?.passwordHash ?? '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxJI5Zc6M1GqRhxaZ1ft5xGFm0K');
    if (!user || !valid) fail('/sign-in', 'Incorrect email or password.');
    await createSession(user.id);
  }
  redirect('/bookings');
}

export async function signOut() { await endSession(); redirect('/'); }

export async function saveBooking(f: FormData) {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  if (!(await rateLimit(`booking:${user.id}`, 30, 900))) fail('/bookings', 'Too many booking attempts. Try again later.');
  const serviceId = text(f, 'serviceId'), bookingId = text(f, 'bookingId'), startText = text(f, 'start');
  const start = new Date(startText);
  if (!idSchema.safeParse(serviceId).success || !Number.isFinite(start.getTime()) || (bookingId && !idSchema.safeParse(bookingId).success)) fail('/bookings', 'Invalid booking.');
  let error = '';
  try {
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Studio" WHERE "id" = 'studio' FOR UPDATE`;
      const studio = await tx.studio.findUnique({ where: { id: 'studio' } });
      const service = await tx.service.findFirst({ where: { id: serviceId, studioId: 'studio', active: true } });
      if (!studio || !service) throw new Error('Service unavailable.');
      if (bookingId) {
        const old = await tx.booking.findUnique({ where: { id: bookingId } });
        if (!old || old.status !== 'ACTIVE' || !canModify(user.role, user.id, old)) throw new Error('Booking cannot be changed.');
      }
      const date = DateTime.fromJSDate(start, { zone: studio.timezone }).toISODate();
      if (!date || !(await slotsFor(date, serviceId, bookingId || undefined, tx)).some(s => s.getTime() === start.getTime())) throw new Error('That time is no longer available.');
      const end = new Date(start.getTime() + service.duration * 60000);
      if (bookingId) await tx.booking.update({ where: { id: bookingId }, data: { serviceId, start, end } });
      else await tx.booking.create({ data: { userId: user.id, serviceId, studioId: studio.id, start, end } });
    });
  } catch (e) { error = e instanceof Error && ['Service unavailable.', 'Booking cannot be changed.', 'That time is no longer available.'].includes(e.message) ? e.message : 'Could not save booking; the time may have been taken.'; }
  if (error) fail('/bookings', error);
  revalidatePath('/'); revalidatePath('/bookings'); revalidatePath('/owner');
  redirect('/bookings?notice=Booking%20saved');
}

export async function cancelBooking(f: FormData) {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  const id = text(f, 'bookingId');
  if (!idSchema.safeParse(id).success) fail('/bookings', 'Invalid booking.');
  const booking = await db.booking.findUnique({ where: { id } });
  if (!booking || booking.status !== 'ACTIVE' || !canModify(user.role, user.id, booking)) fail('/bookings', 'Booking cannot be cancelled.');
  // Recheck ownership, status and cutoff atomically to avoid a race with rescheduling.
  const result = await db.booking.updateMany({ where: { id, status: 'ACTIVE', ...(user.role === 'CUSTOMER' ? { userId: user.id, start: { gte: new Date(Date.now() + 7200000) } } : {}) }, data: { status: 'CANCELLED' } });
  if (!result.count) fail('/bookings', 'Booking cannot be cancelled.');
  revalidatePath('/bookings'); revalidatePath('/owner');
  redirect(user.role === 'OWNER' ? '/owner?notice=Booking%20cancelled' : '/bookings?notice=Booking%20cancelled');
}

async function requireOwner() {
  const user = await currentUser();
  if (!user || user.role !== 'OWNER') redirect('/sign-in');
  return user;
}

export async function saveStudio(f: FormData) {
  await requireOwner();
  const name = text(f, 'name'), timezone = text(f, 'timezone'), currency = text(f, 'currency').toUpperCase();
  if (!name || name.length > 100 || !DateTime.now().setZone(timezone).isValid || !/^[A-Z]{3}$/.test(currency)) fail('/owner/settings', 'Enter a valid name, IANA time zone and three-letter currency.');
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Studio" WHERE "id" = 'studio' FOR UPDATE`;
    await tx.studio.upsert({ where: { id: 'studio' }, create: { id: 'studio', name, timezone, currency }, update: { name, timezone, currency } });
  });
  revalidatePath('/'); redirect('/owner/settings?notice=Studio%20saved');
}

export async function addService(f: FormData) {
  await requireOwner();
  const name = text(f, 'name'), duration = num(f, 'duration'), price = num(f, 'price');
  if (!name || name.length > 100 || !Number.isInteger(duration) || duration < 1 || duration > 480 || !Number.isInteger(price) || price < 0 || price > 10000000) fail('/owner/settings', 'Enter a service name, duration and price in cents.');
  await db.service.create({ data: { name, duration, price, studioId: 'studio' } });
  revalidatePath('/'); redirect('/owner/settings?notice=Service%20added');
}

export async function toggleService(f: FormData) {
  await requireOwner();
  const id = text(f, 'id');
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Studio" WHERE "id" = 'studio' FOR UPDATE`;
    const service = await tx.service.findFirst({ where: { id, studioId: 'studio' } });
    if (service) await tx.service.update({ where: { id }, data: { active: !service.active } });
  });
  revalidatePath('/'); redirect('/owner/settings?notice=Service%20updated');
}

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return -1;
  const hours = Number(match[1]), mins = Number(match[2]);
  return hours < 24 && mins < 60 ? hours * 60 + mins : -1;
}
export async function setHours(f: FormData) {
  await requireOwner();
  const weekday = num(f, 'weekday'), opens = minutes(text(f, 'opens')), closes = minutes(text(f, 'closes'));
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || (!f.has('closed') && (opens < 0 || closes <= opens))) fail('/owner/settings', 'Enter valid opening hours.');
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Studio" WHERE "id" = 'studio' FOR UPDATE`;
    if (f.has('closed')) await tx.openingHour.deleteMany({ where: { studioId: 'studio', weekday } });
    else await tx.openingHour.upsert({ where: { studioId_weekday: { studioId: 'studio', weekday } }, create: { studioId: 'studio', weekday, opens, closes }, update: { opens, closes } });
  });
  redirect('/owner/settings?notice=Hours%20saved');
}
export async function addBreak(f: FormData) {
  await requireOwner();
  const weekday = num(f, 'weekday'), starts = minutes(text(f, 'starts')), ends = minutes(text(f, 'ends'));
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || starts < 0 || ends <= starts) fail('/owner/settings', 'Enter a valid break.');
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Studio" WHERE "id" = 'studio' FOR UPDATE`;
    await tx.break.create({ data: { studioId: 'studio', weekday, starts, ends } });
  });
  redirect('/owner/settings?notice=Break%20added');
}
export async function removeBreak(f: FormData) {
  await requireOwner();
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Studio" WHERE "id" = 'studio' FOR UPDATE`;
    await tx.break.deleteMany({ where: { id: text(f, 'id'), studioId: 'studio' } });
  });
  redirect('/owner/settings?notice=Break%20removed');
}
export async function addDayOff(f: FormData) {
  await requireOwner();
  const date = text(f, 'date'), parsed = DateTime.fromISO(date);
  if (!dateSchema.safeParse(date).success || !parsed.isValid || parsed.toISODate() !== date) fail('/owner/settings', 'Enter a valid date.');
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Studio" WHERE "id" = 'studio' FOR UPDATE`;
    await tx.dayOff.upsert({ where: { studioId_date: { studioId: 'studio', date } }, create: { studioId: 'studio', date }, update: {} });
  });
  redirect('/owner/settings?notice=Day%20off%20saved');
}
export async function removeDayOff(f: FormData) {
  await requireOwner();
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Studio" WHERE "id" = 'studio' FOR UPDATE`;
    await tx.dayOff.deleteMany({ where: { id: text(f, 'id'), studioId: 'studio' } });
  });
  redirect('/owner/settings?notice=Day%20off%20removed');
}
