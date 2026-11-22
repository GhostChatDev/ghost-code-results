'use client';

import { useState } from 'react';
import ClientBooking from './ui/ClientBooking';
import ProviderPanel from './ui/ProviderPanel';

export default function Home() {
  const [view, setView] = useState<'book' | 'calendar' | 'settings'>('book');
  return <div className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark" aria-hidden="true">◒</span><span>Hourglass <strong>Desk</strong></span></div><span className="top-note">A little more time for what matters.</span></header>
    <div className="content"><nav aria-label="Main navigation" className="navigation">
      <button className={view === 'book' ? 'active' : ''} aria-current={view === 'book' ? 'page' : undefined} onClick={() => setView('book')}>Book an appointment</button>
      <button className={view === 'calendar' ? 'active' : ''} aria-current={view === 'calendar' ? 'page' : undefined} onClick={() => setView('calendar')}>Provider calendar</button>
      <button className={view === 'settings' ? 'active' : ''} aria-current={view === 'settings' ? 'page' : undefined} onClick={() => setView('settings')}>Availability &amp; services</button>
    </nav><main>{view === 'book' ? <ClientBooking /> : <ProviderPanel view={view} />}</main></div>
  </div>;
}
