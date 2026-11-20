import Link from 'next/link';
import { db } from '../lib/db';

export const dynamic = 'force-dynamic';
export default async function Home() {
  if (!process.env.DATABASE_URL) return <section className="hero"><p className="eyebrow">SLOTWISE</p><h1>Studio setup required</h1><p>The database is not configured. Set DATABASE_URL and run the migrations as described in the README.</p></section>;
  const studio = await db.studio.findUnique({ where: { id: 'studio' }, include: { services: { where: { active: true }, orderBy: { name: 'asc' } } } });
  return <section className="hero"><p className="eyebrow">A LITTLE MORE ROOM IN YOUR DAY</p><h1>{studio ? `Welcome to ${studio.name}.` : 'Good things happen on your schedule.'}</h1><p>Book time with your favorite independent studio, simply.</p><div className="section-heading"><div><p className="eyebrow">MAKE TIME FOR YOU</p><h2>Services</h2></div>{studio && <span className="muted">Times shown in {studio.timezone}</span>}</div>{!studio ? <div className="card"><h2>Welcome to SlotWise</h2><p>The studio hasn’t been set up yet. Follow the setup instructions in the README to get started.</p></div> : studio.services.length === 0 ? <div className="card"><p>There are no services available yet. Please check back soon.</p></div> : <div className="grid">{studio.services.map(service => <article className="card service-card" key={service.id}><div><h2>{service.name}</h2><p>{service.duration} min · {new Intl.NumberFormat('en', { style: 'currency', currency: studio.currency }).format(service.price / 100)}</p></div><Link className="button" href={`/book?service=${encodeURIComponent(service.id)}`}>Book <span className="sr-only">{service.name}</span></Link></article>)}</div>}</section>;
}
