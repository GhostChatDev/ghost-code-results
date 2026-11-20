import Link from 'next/link';
import { DateTime } from 'luxon';
import { redirect } from 'next/navigation';
import { currentUser } from '../../lib/security';
import { db } from '../../lib/db';
import { canModify } from '../../lib/scheduling';
import { cancelBooking, signOut } from '../actions';

export const dynamic = 'force-dynamic';
type Params = Promise<{ error?: string; notice?: string }>;
export default async function Bookings({ searchParams }: { searchParams: Params }) {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  const { id: userId, role } = user;
  const { error, notice } = await searchParams;
  const bookings = await db.booking.findMany({ where: { userId }, include: { service: true, studio: true }, orderBy: { start: 'asc' } });
  const now = new Date();
  const upcoming = bookings.filter(b => b.status === 'ACTIVE' && b.start > now);
  const past = bookings.filter(b => b.status !== 'ACTIVE' || b.start <= now).reverse();
  function list(items: typeof bookings) {
    if (!items.length) return <p>No bookings here yet.</p>;
    return items.map(b => <article className="card" key={b.id}><h2>{b.service.name}</h2><p>{DateTime.fromJSDate(b.start, { zone: b.studio.timezone }).toFormat('cccc, LLLL d, yyyy · h:mm a ZZZZ')}</p><p>{b.status === 'CANCELLED' ? 'Cancelled' : 'Confirmed'}</p>{b.status === 'ACTIVE' && canModify(role, userId, b, now) && <div className="actions"><Link className="button secondary" href={`/book?booking=${encodeURIComponent(b.id)}`}>Reschedule</Link><form action={cancelBooking}><input type="hidden" name="bookingId" value={b.id}/><button className="button secondary" type="submit">Cancel booking</button></form></div>}</article>);
  }
  return <section><p className="eyebrow">YOUR TIME</p><h1>My bookings</h1><p>Welcome, {user.name}. You can change bookings up to two hours before they start.</p>{error && <p role="alert" className="notice error">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}<div className="actions"><Link className="button" href="/">Book a service</Link><form action={signOut}><button className="button secondary" type="submit">Sign out</button></form></div><h2>Upcoming</h2>{list(upcoming)}<h2>Past and cancelled</h2>{list(past)}</section>;
}
