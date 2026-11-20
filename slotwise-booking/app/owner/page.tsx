import Link from 'next/link';
import { DateTime } from 'luxon';
import { redirect } from 'next/navigation';
import { db } from '../../lib/db';
import { currentUser } from '../../lib/security';
import { cancelBooking, signOut } from '../actions';

export const dynamic = 'force-dynamic';
export default async function Owner({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await currentUser();
  if (!user || user.role !== 'OWNER') redirect('/sign-in');
  const { notice, error } = await searchParams;
  const studio = await db.studio.findUnique({ where: { id: 'studio' } });
  const now = DateTime.now().setZone(studio?.timezone ?? 'UTC');
  const start = now.startOf('week');
  const end = start.plus({ weeks: 1 });
  const bookings = studio ? await db.booking.findMany({ where: { studioId: studio.id, status: 'ACTIVE', start: { gte: start.toJSDate(), lt: end.toJSDate() } }, include: { user: true, service: true }, orderBy: { start: 'asc' } }) : [];
  function list(items: typeof bookings) {
    return items.length ? items.map(b => <article className="card" key={b.id}><h2>{b.service.name}</h2><p>{b.user.name} · {DateTime.fromJSDate(b.start, { zone: studio?.timezone }).toFormat('cccc, LLL d · h:mm a ZZZZ')}</p><div className="actions"><Link className="button secondary" href={`/book?booking=${encodeURIComponent(b.id)}`}>Reschedule</Link><form action={cancelBooking}><input type="hidden" name="bookingId" value={b.id}/><button className="button secondary">Cancel booking</button></form></div></article>) : <p>No bookings in this period.</p>;
  }
  return <section><p className="eyebrow">STUDIO OVERVIEW</p><h1>Owner dashboard</h1><p>Bookings in {studio?.timezone ?? 'UTC'}</p>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}<div className="actions"><Link className="button" href="/owner/settings">Studio settings</Link><form action={signOut}><button className="button secondary">Sign out</button></form></div><h2>Today</h2>{list(bookings.filter(b => DateTime.fromJSDate(b.start, { zone: studio?.timezone }).hasSame(now, 'day')))}<h2>This week</h2>{list(bookings)}</section>;
}
