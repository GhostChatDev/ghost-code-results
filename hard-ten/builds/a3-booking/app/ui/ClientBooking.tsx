'use client';
import { useEffect, useState } from 'react';

type Service = { id: string; name: string; duration_minutes: number; buffer_minutes: number };
type Slot = { start: string; end: string; blockedUntil: string };
type Receipt = { id: string; token: string };
const nextWeekdayAt = (zone: string) => {
  const d = new Date(Date.now() + 86400000);
  while (true) {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }).format(d);
    if (wd !== 'Sun' && wd !== 'Sat') break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};
const display = (time: string, zone: string) => new Intl.DateTimeFormat('en', { timeZone: zone, hour: 'numeric', minute: '2-digit', timeZoneName: 'shortOffset' }).format(new Date(time));
async function request(url: string, init?: RequestInit) { const response = await fetch(url, init); const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Request failed'); return value; }

export default function ClientBooking() {
  const [services, setServices] = useState<Service[]>([]); const [provider, setProvider] = useState('');
  const [service, setService] = useState(''); const [zone, setZone] = useState('UTC'); const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]); const [selected, setSelected] = useState('');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [notice, setNotice] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(''); const [cancelled, setCancelled] = useState(false);
  useEffect(() => {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; setZone(z); setDate(nextWeekdayAt(z)); setKey(crypto.randomUUID());
    const hash = new URLSearchParams(location.hash.slice(1)); const id = hash.get('id'); const token = hash.get('token');
    if (id && token) setReceipt({ id, token });
    request('/api/workspace').then(data => { setProvider(data.provider.name); setServices(data.services); setService(data.services[0]?.id || ''); }).catch(e => setNotice(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!date || !service || !zone) return;
    const controller = new AbortController(); setSelected(''); setLoading(true);
    request(`/api/slots?${new URLSearchParams({ date, service, zone })}`, { signal: controller.signal }).then(data => { setSlots(data.slots); setSelected(data.slots[0]?.start || ''); setNotice(''); }).catch(e => { if (e.name !== 'AbortError') setNotice(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, service, zone]);
  async function book(event: React.FormEvent) {
    event.preventDefault(); if (!selected) { setNotice('Choose an available time first.'); return; }
    setBusy(true); setNotice('');
    try { const result = await request('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceId: service, start: selected, name, email, idempotencyKey: key }) }); setReceipt(result); history.replaceState(null, '', `#${new URLSearchParams(result).toString()}`); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not book'); } finally { setBusy(false); }
  }
  async function cancel() {
    if (!receipt || !confirm('Cancel this appointment?')) return;
    setBusy(true); try { await request('/api/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(receipt) }); setCancelled(true); setNotice('Your appointment was cancelled.'); } catch (e) { setNotice(e instanceof Error ? e.message : 'Cancellation failed'); } finally { setBusy(false); }
  }
  const change = () => { setKey(crypto.randomUUID()); };
  return <><div className="heading"><div><p className="eyebrow">YOUR TIME, WELL SPENT</p><h1>Make space for a conversation.</h1><p>Choose a service and find a time that works for you.</p></div><span className="pill">{provider || 'Hourglass Desk'}</span></div>
    {notice && <div role="status" className="notice">{notice}</div>}
    {receipt ? <section className="card confirmation"><p className="eyebrow">YOUR APPOINTMENT</p><h2>{cancelled ? 'Appointment cancelled' : 'Booking link ready'}</h2><p>Keep this page address in a safe place. It is your private link to download your calendar file or cancel your appointment.</p><p>Cancellation is available until 24 hours before the appointment starts.</p><div className="actions"><a className="button" href={`/api/ics?${new URLSearchParams(receipt)}`}>Download calendar file</a>{!cancelled && <button className="secondary" disabled={busy} onClick={cancel}>Cancel appointment</button>}<button className="secondary" onClick={() => { setReceipt(null); setCancelled(false); history.replaceState(null, '', location.pathname); setKey(crypto.randomUUID()); }}>Book another</button></div></section> :
    <div className="booking-layout"><section className="card"><div className="card-heading"><div><p className="eyebrow">01 / PICK A TIME</p><h2>Find your moment</h2></div><span className="subtle">Times shown in your time zone</span></div>
      <div className="field-grid"><label>Service<select value={service} onChange={e => { setService(e.target.value); change(); }}>{services.map(s => <option value={s.id} key={s.id}>{s.name} · {s.duration_minutes} min</option>)}</select></label><label>Your time zone<select value={zone} onChange={e => { setZone(e.target.value); change(); }}><option value="UTC">UTC</option>{Intl.supportedValuesOf('timeZone').filter(z => z !== 'UTC').map(z => <option key={z} value={z}>{z}</option>)}</select></label><label>Date<input type="date" value={date} onChange={e => { setDate(e.target.value); change(); }} /></label></div>
      <div className="slot-heading"><div><h3>Available times</h3><p>{date || 'Choose a date'} · {zone}</p></div><span className="pill">15 min intervals</span></div>
      {loading ? <p className="empty">Finding available times…</p> : slots.length ? <div className="slot-grid">{slots.map(slot => <button type="button" key={slot.start} className={selected === slot.start ? 'slot active' : 'slot'} aria-pressed={selected === slot.start} onClick={() => { setSelected(slot.start); change(); }}>{display(slot.start, zone)}</button>)}</div> : <p className="empty">No open times for this date. Try another date or service.</p>}
    </section><section className="card"><p className="eyebrow">02 / YOUR DETAILS</p><h2>Let's make it official.</h2><p className="muted">We'll reserve your time and give you a calendar file to keep.</p><form onSubmit={book} className="stack"><label>Your name<input required maxLength={100} value={name} onChange={e => { setName(e.target.value); change(); }} placeholder="Your full name" /></label><label>Email address<input type="email" required maxLength={254} value={email} onChange={e => { setEmail(e.target.value); change(); }} placeholder="you@example.com" /></label><div className="summary"><span>Your selection</span><strong>{selected ? `${date} at ${display(selected, zone)}` : 'Choose a time to continue'}</strong><small>{zone}</small></div><button className="button" disabled={busy || !selected}>{busy ? 'Booking…' : 'Confirm appointment'}</button></form><p className="footnote">Need to change plans? Cancel up to 24 hours before your appointment.</p></section></div>}
  </>;
}
