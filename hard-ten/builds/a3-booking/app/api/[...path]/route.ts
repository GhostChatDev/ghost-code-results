import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { AppError, cancelBooking, createBooking, getClientBooking, getWorkspaceData, saveSettings } from '@/lib/store';
import { generateSlotsForClientWindow, validZone } from '@/lib/scheduling';
import { buildBookingIcs } from '@/lib/ics';

export const dynamic = 'force-dynamic';

function providerAuthorized(request: NextRequest): boolean {
  const secret = process.env.PROVIDER_TOKEN;
  if (!secret) return true;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (Buffer.byteLength(secret) < 32 || Buffer.byteLength(secret) !== Buffer.byteLength(supplied)) return false;
  return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
}
function result(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } }); }
function fail(error: unknown) {
  if (error instanceof AppError) return result({ error: error.message }, error.status);
  console.error('Request failed', error);
  return result({ error: 'Unable to complete the request. Please try again.' }, 500);
}

type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const path = (await context.params).path.join('/');
    const url = request.nextUrl;
    if (path === 'workspace') {
      const data = await getWorkspaceData();
      return result({ provider: data.provider, services: data.services });
    }
    if (path === 'provider') {
      if (!providerAuthorized(request)) return result({ error: 'Provider access requires a valid provider token.' }, 401);
      return result(await getWorkspaceData());
    }
    if (path === 'slots') {
      const zone = url.searchParams.get('zone') ?? '';
      const date = url.searchParams.get('date') ?? '';
      const serviceId = url.searchParams.get('service') ?? '';
      if (!validZone(zone)) throw new AppError('Invalid time zone');
      try { if (Temporal.PlainDate.from(date).toString() !== date) throw new Error(); } catch { throw new AppError('Invalid date'); }
      const data = await getWorkspaceData();
      const service = data.services.find(s => s.id === serviceId);
      if (!service) throw new AppError('Service not found', 404);
      const slots = generateSlotsForClientWindow({ clientDate: date, clientZone: zone, providerZone: data.provider.timezone, hours: data.hours, daysOff: data.daysOff, duration: service.duration_minutes, buffer: service.buffer_minutes, occupied: data.bookings.filter(b => !b.cancelled_at) });
      return result({ slots });
    }
    if (path === 'booking' || path === 'ics') {
      const id = url.searchParams.get('id') ?? '';
      const token = url.searchParams.get('token') ?? '';
      const booking = await getClientBooking(id, token);
      if (!booking) throw new AppError('Booking not found', 404);
      if (path === 'booking') return result({ booking });
      const text = buildBookingIcs({ id: booking.id, serviceName: booking.service_name, providerName: (booking as unknown as { provider_name: string }).provider_name, clientName: booking.client_name, clientEmail: booking.client_email, startAt: booking.start_at, endAt: booking.end_at, createdAt: booking.created_at, cancelled: !!booking.cancelled_at });
      return new NextResponse(text, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="hourglass-booking-${booking.id.slice(0, 8)}.ics"`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    }
    return result({ error: 'Not found' }, 404);
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const path = (await context.params).path.join('/');
    const body = await request.json();
    if (path === 'bookings') return result(await createBooking(body), 201);
    if (path === 'cancel') { await cancelBooking(body.id, body.token); return result({ ok: true }); }
    if (path === 'provider') {
      if (!providerAuthorized(request)) return result({ error: 'Provider access requires a valid provider token.' }, 401);
      await saveSettings(body);
      return result({ ok: true });
    }
    return result({ error: 'Not found' }, 404);
  } catch (error) { return fail(error); }
}
