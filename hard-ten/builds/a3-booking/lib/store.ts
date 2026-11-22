import crypto from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { pool } from './db';
import { generateSlots, generateSlotsForClientWindow, Hours, Slot, validZone } from './scheduling';

export type ProviderProfile = {
  id: number;
  name: string;
  timezone: string;
};

export type ServiceItem = {
  id: string;
  provider_id: number;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  active: boolean;
};

export type BookingRecord = {
  id: string;
  provider_id: number;
  service_id: string;
  service_name: string;
  client_name: string;
  client_email: string;
  start_at: string;
  end_at: string;
  blocked_until: string;
  cancelled_at: string | null;
  created_at: string;
  cancel_token?: string;
};

export type WorkspaceData = {
  provider: ProviderProfile;
  hours: Hours[];
  daysOff: string[];
  services: ServiceItem[];
  bookings: BookingRecord[];
};

export function hashCancelToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

let schemaReadyPromise: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const check = await pool.query(`SELECT to_regclass('public.providers') AS reg`);
      if (!check.rows[0]?.reg) {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const sqlPath = path.join(process.cwd(), 'migrations', '0001_initial.sql');
        const sql = await fs.readFile(sqlPath, 'utf8');
        await pool.query(sql);
      } else {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS booking_idempotency (
            idempotency_key text PRIMARY KEY CHECK (length(trim(idempotency_key)) BETWEEN 1 AND 128),
            booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
            cancel_token text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
          )
        `);
      }
    })().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}

export async function getWorkspaceData(): Promise<WorkspaceData> {
  await ensureSchema();
  const [provRes, hoursRes, offRes, svcRes, bookRes] = await Promise.all([
    pool.query(`SELECT id, name, timezone FROM providers WHERE id = 1`),
    pool.query(
      `SELECT weekday, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time
       FROM weekly_hours WHERE provider_id = 1 ORDER BY weekday ASC`
    ),
    pool.query(`SELECT to_char(day, 'YYYY-MM-DD') AS day FROM days_off WHERE provider_id = 1 ORDER BY day ASC`),
    pool.query(
      `SELECT id, provider_id, name, duration_minutes, buffer_minutes, active
       FROM services WHERE provider_id = 1 AND active = true ORDER BY duration_minutes ASC, name ASC`
    ),
    pool.query(
      `SELECT id, provider_id, service_id, service_name, client_name, client_email,
              start_at, end_at, blocked_until, cancelled_at, created_at
       FROM bookings WHERE provider_id = 1 ORDER BY start_at ASC`
    ),
  ]);

  const provider: ProviderProfile = provRes.rows[0] ?? {
    id: 1,
    name: 'Hourglass Desk',
    timezone: 'America/New_York',
  };

  return {
    provider,
    hours: hoursRes.rows,
    daysOff: offRes.rows.map((r) => r.day),
    services: svcRes.rows,
    bookings: bookRes.rows.map((r) => ({
      ...r,
      start_at: new Date(r.start_at).toISOString(),
      end_at: new Date(r.end_at).toISOString(),
      blocked_until: new Date(r.blocked_until).toISOString(),
      cancelled_at: r.cancelled_at ? new Date(r.cancelled_at).toISOString() : null,
      created_at: new Date(r.created_at).toISOString(),
    })),
  };
}
export class AppError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type BookingInput = { serviceId: string; start: string; name: string; email: string; idempotencyKey: string };

// Settings mutations take the same provider row lock, so availability cannot change mid-booking.
export async function createBooking(input: BookingInput): Promise<{ id: string; token: string }> {
  if (!input.idempotencyKey || input.idempotencyKey.length > 128 || input.idempotencyKey.length < 32) throw new AppError('Invalid request key');
  const name = String(input.name ?? '').trim();
  const email = String(input.email ?? '').trim();
  if (!name || name.length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Enter a valid name and email address');
  let start: string;
  try { start = Temporal.Instant.from(input.start).toString(); } catch { throw new AppError('Invalid appointment time'); }
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.idempotencyKey]);
    const prior = await client.query(`SELECT i.booking_id, i.cancel_token, b.service_id, b.start_at, b.client_name, b.client_email
      FROM booking_idempotency i JOIN bookings b ON b.id = i.booking_id WHERE i.idempotency_key = $1`, [input.idempotencyKey]);
    if (prior.rowCount) {
      const row = prior.rows[0];
      if (row.service_id !== input.serviceId || new Date(row.start_at).toISOString() !== new Date(start).toISOString() || row.client_name !== name || row.client_email !== email) throw new AppError('Request key was already used for another booking', 409);
      await client.query('COMMIT');
      return { id: row.booking_id, token: row.cancel_token };
    }
    const provider = (await client.query('SELECT timezone FROM providers WHERE id = 1 FOR UPDATE')).rows[0];
    const service = (await client.query('SELECT * FROM services WHERE id::text = $1 AND provider_id = 1 AND active', [input.serviceId])).rows[0];
    if (!provider || !service) throw new AppError('Service is unavailable', 404);
    const hours = (await client.query("SELECT weekday, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time FROM weekly_hours WHERE provider_id = 1")).rows;
    const daysOff = (await client.query("SELECT to_char(day, 'YYYY-MM-DD') AS day FROM days_off WHERE provider_id = 1")).rows.map(r => r.day);
    const occupied = (await client.query('SELECT start_at, blocked_until FROM bookings WHERE provider_id = 1 AND cancelled_at IS NULL')).rows;
    const date = Temporal.Instant.from(start).toZonedDateTimeISO(provider.timezone).toPlainDate().toString();
    const slot = generateSlots({ date, zone: provider.timezone, hours, daysOff, duration: service.duration_minutes, buffer: service.buffer_minutes, occupied }).find(s => s.start === start);
    if (!slot) throw new AppError('That time is no longer available', 409);
    const token = crypto.randomBytes(32).toString('base64url');
    const result = await client.query(`INSERT INTO bookings (provider_id, service_id, service_name, client_name, client_email, start_at, end_at, blocked_until, cancel_token_hash)
      VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [service.id, service.name, name, email, slot.start, slot.end, slot.blockedUntil, hashCancelToken(token)]);
    await client.query('INSERT INTO booking_idempotency (idempotency_key, booking_id, cancel_token) VALUES ($1,$2,$3)', [input.idempotencyKey, result.rows[0].id, token]);
    await client.query('COMMIT');
    return { id: result.rows[0].id, token };
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23P01') throw new AppError('That time is no longer available', 409);
    throw error;
  } finally { client.release(); }
}

export async function getClientBooking(id: string, token: string): Promise<BookingRecord | null> {
  if (!id || !token || token.length > 128) return null;
  await ensureSchema();
  const result = await pool.query(`SELECT b.*, p.name AS provider_name FROM bookings b JOIN providers p ON p.id = b.provider_id
    WHERE b.id::text = $1 AND b.cancel_token_hash = $2`, [id, hashCancelToken(token)]);
  return result.rows[0] ?? null;
}

export async function cancelBooking(id: string, token: string): Promise<void> {
  await ensureSchema();
  const result = await pool.query(`UPDATE bookings SET cancelled_at = now()
    WHERE id::text = $1 AND cancel_token_hash = $2 AND cancelled_at IS NULL
    AND start_at >= now() + interval '24 hours' RETURNING id`, [id, hashCancelToken(token)]);
  if (!result.rowCount) throw new AppError('Booking not found, already cancelled, or within 24 hours of its start', 400);
}

export async function saveSettings(input: { name: string; timezone: string; hours: Hours[]; daysOff: string[]; services: { id?: string; name: string; duration_minutes: number; buffer_minutes: number }[] }): Promise<void> {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100 || !validZone(input.timezone)) throw new AppError('Enter a provider name and valid time zone');
  if (!Array.isArray(input.hours) || !Array.isArray(input.daysOff) || !Array.isArray(input.services)) throw new AppError('Invalid settings');
  const weekdays = new Set<number>();
  for (const h of input.hours) {
    if (!Number.isInteger(h.weekday) || h.weekday < 0 || h.weekday > 6 || weekdays.has(h.weekday) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.start_time) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.end_time) || h.start_time >= h.end_time) throw new AppError('Invalid weekly hours');
    weekdays.add(h.weekday);
  }
  for (const day of input.daysOff) { try { if (Temporal.PlainDate.from(day).toString() !== day) throw new Error(); } catch { throw new AppError('Invalid day off'); } }
  for (const s of input.services) {
    if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 100 || !Number.isInteger(s.duration_minutes) || s.duration_minutes < 15 || s.duration_minutes > 120 || !Number.isInteger(s.buffer_minutes) || s.buffer_minutes < 0 || s.buffer_minutes > 120) throw new AppError('Invalid service');
  }
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM providers WHERE id = 1 FOR UPDATE');
    await client.query('UPDATE providers SET name = $1, timezone = $2 WHERE id = 1', [input.name.trim(), input.timezone]);
    await client.query('DELETE FROM weekly_hours WHERE provider_id = 1');
    for (const h of input.hours) await client.query('INSERT INTO weekly_hours VALUES (1,$1,$2,$3)', [h.weekday, h.start_time, h.end_time]);
    await client.query('DELETE FROM days_off WHERE provider_id = 1');
    for (const d of new Set(input.daysOff)) await client.query('INSERT INTO days_off VALUES (1,$1)', [d]);
    await client.query('UPDATE services SET active = false WHERE provider_id = 1');
    for (const s of input.services) {
      if (s.id) {
        const result = await client.query('UPDATE services SET name=$1, duration_minutes=$2, buffer_minutes=$3, active=true WHERE id::text=$4 AND provider_id=1', [s.name.trim(), s.duration_minutes, s.buffer_minutes, s.id]);
        if (!result.rowCount) throw new AppError('Service not found');
      } else await client.query('INSERT INTO services (provider_id,name,duration_minutes,buffer_minutes) VALUES (1,$1,$2,$3)', [s.name.trim(), s.duration_minutes, s.buffer_minutes]);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
