import Link from 'next/link';
import { DateTime } from 'luxon';
import { redirect } from 'next/navigation';
import { db } from '../../lib/db';
import { currentUser } from '../../lib/security';
import { slotsFor } from '../../lib/availability';
import { canModify } from '../../lib/scheduling';
import { saveBooking } from '../actions';

export const dynamic = 'force-dynamic';
type Params = Promise<{ service?: string; date?: string; booking?: string }>;
export default async function Book({ searchParams }: { searchParams: Params }) {
  const { service: requested, date: requestedDate, booking: bookingId } = await searchParams;
  const user = await currentUser();
  if (bookingId && !user) redirect('/sign-in');
  const studio = await db.studio.findUnique({ where: { id: 'studio' }, include: { services: { where: { active: true }, orderBy: { name: 'asc' } } } });
  if (!studio) return <section><h1>Booking unavailable</h1><p>The studio has not been set up yet.</p><Link className="text-link" href="/">Back to studio</Link></section>;
  const old = bookingId && user ? await db.booking.findUnique({ where: { id: bookingId } }) : null;
  if (bookingId && (!old || old.status !== 'ACTIVE' || !user || !canModify(user.role, user.id, old))) return <section><h1>Booking unavailable</h1><p>This booking cannot be changed.</p><Link className="text-link" href="/bookings">My bookings</Link></section>;
  const serviceId = requested || old?.serviceId || studio.services[0]?.id;
  const service = studio.services.find(s => s.id === serviceId);
  const today = DateTime.now().setZone(studio.timezone).startOf('day');
  const parsed = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? DateTime.fromISO(requestedDate, { zone: studio.timezone }) : today;
  const day = parsed && parsed.isValid && parsed.toISODate() === requestedDate ? parsed.startOf('day') : today;
  const date = day.toISODate()!;
  const week = day.startOf('week');
  const slots = service ? await slotsFor(date, service.id, old?.id) : [];
  const url = (nextDate: string, nextService = serviceId) => `/book?${new URLSearchParams({ ...(nextService ? { service: nextService } : {}), date: nextDate, ...(bookingId ? { booking: bookingId } : {}) })}`;
  return <section><p className="eyebrow">BOOK A LITTLE TIME FOR YOU</p><h1>{old ? 'Reschedule your booking' : 'Choose your time'}</h1><p>All times are in {studio.timezone}. Select a service, then a day and an available time.</p><div className="card"><h2>1. Choose a service</h2>{studio.services.length ? <div className="choices">{studio.services.map(s => <Link key={s.id} className={`choice ${s.id === serviceId ? 'selected' : ''}`} aria-current={s.id === serviceId ? 'true' : undefined} href={url(date, s.id)}>{s.name}<small>{s.duration} min · {new Intl.NumberFormat('en', { style: 'currency', currency: studio.currency }).format(s.price / 100)}</small></Link>)}</div> : <p>No services available right now.</p>}</div>{service && <><div className="card"><h2>2. Pick a day</h2><div className="week-header"><Link className="text-link" href={url(week.minus({ weeks: 1 }).toISODate()!)}>← Previous week</Link><strong>{week.toFormat('MMM d')} – {week.plus({ days: 6 }).toFormat('MMM d, yyyy')}</strong><Link className="text-link" href={url(week.plus({ weeks: 1 }).toISODate()!)}>Next week →</Link></div><div className="week">{Array.from({ length: 7 }, (_, i) => { const d = week.plus({ days: i }); const iso = d.toISODate()!; return <Link key={iso} href={url(iso)} aria-current={iso === date ? 'date' : undefined} className={`day ${iso === date ? 'selected' : ''}`}><span>{d.toFormat('ccc')}</span><strong>{d.toFormat('d')}</strong></Link>; })}</div></div><div className="card"><h2>3. Choose an available time</h2><p>{day.toFormat('EEEE, LLLL d, yyyy')}</p>{slots.length ? <div className="slots">{slots.map(slot => <form action={saveBooking} key={slot.toISOString()}><input type="hidden" name="serviceId" value={service.id}/><input type="hidden" name="start" value={slot.toISOString()}/>{old && <input type="hidden" name="bookingId" value={old.id}/>}<button className="choice" type="submit">{DateTime.fromJSDate(slot, { zone: studio.timezone }).toFormat('h:mm a ZZZZ')}</button></form>)}</div> : <p>No available times for this day. Try another date.</p>}{!user && <p>You’ll be asked to sign in before booking.</p>}</div></>}</section>;
}
