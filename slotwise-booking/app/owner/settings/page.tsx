import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '../../../lib/db';
import { currentUser } from '../../../lib/security';
import { saveStudio, addService, toggleService, setHours, addBreak, removeBreak, addDayOff, removeDayOff } from '../../actions';

export const dynamic = 'force-dynamic';
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const time = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const user = await currentUser();
  if (!user || user.role !== 'OWNER') redirect('/sign-in');
  const { error, notice } = await searchParams;
  const studio = await db.studio.findUnique({ where: { id: 'studio' }, include: { services: true, hours: true, breaks: true, daysOff: true } });
  return <section><p className="eyebrow">YOUR STUDIO</p><h1>Settings</h1><Link className="text-link" href="/owner">← Dashboard</Link>{error && <p role="alert" className="notice error">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
    <div className="card"><h2>Studio details</h2><form action={saveStudio} className="form-stack"><label>Studio name<input name="name" required maxLength={100} defaultValue={studio?.name}/></label><label>IANA time zone<input name="timezone" required defaultValue={studio?.timezone ?? 'America/New_York'}/></label><label>Currency code<input name="currency" required maxLength={3} defaultValue={studio?.currency ?? 'USD'}/></label><button className="button">Save studio</button></form></div>
    {studio && <><div className="card"><h2>Services</h2>{studio.services.map(s => <div className="settings-row" key={s.id}><span>{s.name} · {s.duration} min · {s.price} cents · {s.active ? 'Active' : 'Inactive'}</span><form action={toggleService}><input type="hidden" name="id" value={s.id}/><button className="button secondary">{s.active ? 'Deactivate' : 'Activate'}</button></form></div>)}<form action={addService} className="form-stack"><label>Service name<input name="name" required maxLength={100}/></label><label>Duration in minutes<input name="duration" type="number" min="1" max="480" required/></label><label>Price in cents<input name="price" type="number" min="0" max="10000000" required/></label><button className="button">Add service</button></form></div>
    <div className="card"><h2>Opening hours</h2>{days.map((day, index) => { const hours = studio.hours.find(h => h.weekday === index + 1); return <form action={setHours} className="settings-row" key={day}><strong>{day}</strong><input type="hidden" name="weekday" value={index + 1}/><label>Opens<input aria-label={`${day} opens`} name="opens" type="time" defaultValue={time(hours?.opens ?? 540)}/></label><label>Closes<input aria-label={`${day} closes`} name="closes" type="time" defaultValue={time(hours?.closes ?? 1020)}/></label><label><input type="checkbox" name="closed" defaultChecked={!hours}/> Closed</label><button className="button secondary">Save</button></form>; })}</div>
    <div className="card"><h2>Weekly breaks</h2>{studio.breaks.map(b => <div className="settings-row" key={b.id}><span>{days[b.weekday - 1]} · {time(b.starts)}–{time(b.ends)}</span><form action={removeBreak}><input type="hidden" name="id" value={b.id}/><button className="button secondary">Remove break</button></form></div>)}<form action={addBreak} className="form-stack"><label>Day<select name="weekday">{days.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label><label>Starts<input type="time" name="starts" required/></label><label>Ends<input type="time" name="ends" required/></label><button className="button">Add break</button></form></div>
    <div className="card"><h2>Days off</h2>{studio.daysOff.map(d => <div className="settings-row" key={d.id}><span>{d.date}</span><form action={removeDayOff}><input type="hidden" name="id" value={d.id}/><button className="button secondary">Remove day off</button></form></div>)}<form action={addDayOff} className="form-stack"><label>Date<input type="date" name="date" required/></label><button className="button">Add day off</button></form></div></>}
  </section>;
}
