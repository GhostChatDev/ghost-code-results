'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { settle } from '../lib/settle.mjs';
import { GroupForm, MemberForm, RateForm, ExpenseForm } from './forms.js';
import { money, date } from './utils.js';

export default function Home() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState('');
  const [screen, setScreen] = useState('Overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const lock = useRef(false);
  const load = useCallback(async (group = '') => {
    const response = await fetch(`/api/data?group=${encodeURIComponent(group)}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load the ledger.');
    setData(body);
    if (body.group) setSelected(body.group.id);
  }, []);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  async function submit(action, fields) {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const id = crypto.randomUUID();
    try {
      const response = await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, groupId: selected, ...fields }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save.');
      await load(action === 'group' ? id : selected);
      setNotice('Saved successfully.');
      return true;
    } catch (e) { setError(e.message + ' If the connection was interrupted, refresh before trying again.'); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  async function switchGroup(id) {
    setSelected(id); setError('');
    try { await load(id); } catch (e) { setError(e.message); }
  }
  const group = data?.group;
  let transfers = [], settlementError = '';
  if (group) {
    try { transfers = settle(data.balances); } catch (e) { settlementError = e.message; }
  }
  const names = Object.fromEntries((data?.members || []).map(m => [m.id, m.name]));
  const total = (data?.expenses || []).reduce((a, e) => a + BigInt(e.main_amount), 0n);
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brandmark">e</span><span>evenstep<small>SHARED EXPENSES</small></span></div>
      <div className="sidebar-label">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation">{['Overview', 'Expenses', 'Settle up', 'Activity', 'Settings'].map(item => <button key={item} className={screen === item ? 'nav-item active' : 'nav-item'} aria-current={screen === item ? 'page' : undefined} onClick={() => setScreen(item)}><span aria-hidden="true">{ {Overview:'◫',Expenses:'▤','Settle up':'⇄',Activity:'◷',Settings:'⚙'}[item]}</span>{item}</button>)}</nav>
      <div className="sidebar-note"><strong>Keep it even.</strong><p>One place for the things you share.</p></div>
    </aside>
    <main className="main">
      <header className="topbar"><span>YOUR SHARED LEDGER</span>{data?.groups.length > 0 && <label className="group-select">Group <select value={selected} onChange={e => switchGroup(e.target.value)}>{data.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}</header>
      <div className="content">
        {error && <div role="alert" className="alert error">{error}<button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
        {notice && <div role="status" className="alert success">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice('')}>×</button></div>}
        {!data ? <section className="card"><h1>Evenstep</h1><p>{error ? 'Unable to load your ledger. Check your database and try again.' : 'Loading your ledger…'}</p><button onClick={() => { setRetryCount(n => n + 1); load(selected).catch(e => setError(e.message)); }}>Retry{retryCount > 0 ? ` (${retryCount})` : ''}</button></section> : !group ? <><div className="heading"><div><div className="eyebrow">WELCOME TO EVENSTEP</div><h1>Sharing made simple.</h1><p>Start a group to keep track of what you share.</p></div></div><div className="narrow"><GroupForm submit={submit} busy={busy}/></div><p className="privacy">This deployment has no accounts or access control. Anyone who can reach it can view and change all groups.</p></> : <>
          <div className="heading"><div><div className="eyebrow">{group.name} / {screen.toUpperCase()}</div><h1>{screen === 'Overview' ? 'Your group at a glance.' : screen}</h1><p>{ {Overview:'A little clarity goes a long way.',Expenses:'Keep track of shared spending.', 'Settle up':'The fewest payments to make everyone even.',Activity:'A record of spending and payments.',Settings:'Manage your group and currencies.'}[screen]}</p></div>{screen === 'Overview' && <button className="primary" onClick={() => setScreen('Expenses')}>+ Add an expense</button>}</div>
          {screen === 'Overview' && <><div className="stats"><div className="stat"><span>TOTAL GROUP SPENDING</span><strong>{money(total, group.currency)}</strong><small>Converted at the rates used when saved</small></div><div className="stat"><span>GROUP MEMBERS</span><strong>{data.members.length}</strong><small>Sharing expenses together</small></div><div className="stat"><span>TO SETTLE</span><strong>{settlementError ? '—' : transfers.length}</strong><small>Minimum suggested payments</small></div></div><div className="grid"><section className="card"><div className="card-head"><div><h2>Group balances</h2><p>Who is owed and who owes</p></div><span className="pill">{group.currency}</span></div><BalanceList data={data}/></section><section className="card"><div className="card-head"><div><h2>Recent activity</h2><p>The latest in your group</p></div><button className="text-button" onClick={() => setScreen('Activity')}>View all →</button></div><Activity data={data} limit={4}/></section></div></>}
          {screen === 'Expenses' && <div className="grid"><ExpenseForm data={data} submit={submit} busy={busy}/><section className="card"><div className="card-head"><div><h2>Expenses</h2><p>All shared costs in this group</p></div><a className="text-button" href={`/api/export?group=${encodeURIComponent(group.id)}`}>Export CSV ↓</a></div>{data.expenses.length ? data.expenses.map(e => <div className="row" key={e.id}><div><strong>{e.description}</strong><small>{e.payer_name} paid · {date(e.created_at)} · {e.split_type}</small></div><div className="amount">{money(e.amount, e.currency)}<small>{e.currency !== group.currency ? money(e.main_amount, group.currency) : ''}</small></div></div>) : <p className="empty">No expenses yet. Add the first one to get started.</p>}</section></div>}
          {screen === 'Settle up' && <section className="card"><div className="card-head"><div><h2>Suggested payments</h2><p>Record a payment once it has actually been made.</p></div><span className="pill">{group.currency}</span></div>{settlementError ? <p className="empty">{settlementError}</p> : transfers.length ? transfers.map((t, i) => <div className="row" key={`${t.payer}-${t.payee}-${i}`}><div><strong>{names[t.payer]} → {names[t.payee]}</strong><small>Suggested transfer</small></div><div className="row-actions"><strong>{money(t.amount, group.currency)}</strong><button disabled={busy} onClick={() => submit('payment', { payer:t.payer, payee:t.payee, amount: `${t.amount / 100n}.${String(t.amount % 100n).padStart(2, '0')}` })}>Record payment</button></div></div>) : <p className="empty">Everyone is settled up. Nice and even.</p>}<p className="footnote">Suggestions minimize the number of payments for up to 12 members with nonzero balances. Some suggestions can temporarily overpay an intermediary.</p></section>}
          {screen === 'Activity' && <section className="card"><div className="card-head"><div><h2>Activity history</h2><p>Expenses and recorded payments, newest first</p></div><a className="text-button" href={`/api/export?group=${encodeURIComponent(group.id)}`}>Export expenses ↓</a></div><Activity data={data}/></section>}
          {screen === 'Settings' && <><div className="grid"><MemberForm submit={submit} busy={busy} members={data.members}/><RateForm data={data} submit={submit} busy={busy}/></div><div className="settings-group"><GroupForm submit={submit} busy={busy}/></div><p className="privacy">This deployment has no accounts or access control. Anyone who can reach it can view and change all groups.</p></>}
        </>}
      </div>
    </main>
  </div>;
}
function BalanceList({ data }) {
  if (!data.balances.length) return <p className="empty">No members yet. Add people in Settings.</p>;
  return data.balances.map(b => <div className="row" key={b.id}><div className="person"><span className="avatar">{b.name.slice(0, 1).toUpperCase()}</span><strong>{b.name}</strong></div><div className="amount"><strong className={BigInt(b.amount) > 0n ? 'positive' : ''}>{money(b.amount, data.group.currency)}</strong><small>{BigInt(b.amount) > 0n ? 'is owed' : BigInt(b.amount) < 0n ? 'owes' : 'settled up'}</small></div></div>);
}
function Activity({ data, limit }) {
  const entries = [...data.expenses.map(e => ({ ...e, kind:'expense' })), ...data.payments.map(p => ({ ...p, kind:'payment' }))].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  if (!entries.length) return <p className="empty">Nothing here yet. Your group activity will appear here.</p>;
  return entries.slice(0, limit || entries.length).map(e => <div className="row" key={`${e.kind}-${e.id}`}><div><strong>{e.kind === 'expense' ? e.description : `${e.payer_name} paid ${e.payee_name}`}</strong><small>{e.kind === 'expense' ? `${e.payer_name} paid · ` : 'Payment · '}{date(e.created_at)}</small></div><strong>{money(e.amount, e.kind === 'expense' ? e.currency : data.group.currency)}</strong></div>);
}
