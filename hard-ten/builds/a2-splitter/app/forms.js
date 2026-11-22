'use client';
import { useState } from 'react';
import { money } from './utils.js';

const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'NZD', 'SGD'];
function Currency({ value, onChange, options = currencies }) { return <select value={value} onChange={e => onChange(e.target.value)}>{options.map(c => <option key={c} value={c}>{c}</option>)}</select>; }
export function GroupForm({ submit, busy }) {
  const [name, setName] = useState(''); const [currency, setCurrency] = useState('USD');
  return <form className="card form" onSubmit={async e => { e.preventDefault(); if (await submit('group', { name, currency })) setName(''); }}><div><h2>Create a group</h2><p>Choose a name and a main currency for balances.</p></div><label>Group name<input value={name} onChange={e => setName(e.target.value)} required maxLength={100} placeholder="e.g. Apartment" /></label><label>Main currency<Currency value={currency} onChange={setCurrency}/></label><button className="primary" disabled={busy}>Create group</button></form>;
}
export function MemberForm({ submit, busy, members }) {
  const [name, setName] = useState('');
  return <form className="card form" onSubmit={async e => { e.preventDefault(); if (await submit('member', { name })) setName(''); }}><div><h2>Group members</h2><p>Add everyone sharing expenses.</p></div><div>{members.length ? members.map(m => <div className="member-tag" key={m.id}>{m.name}</div>) : <p className="empty">No members added yet.</p>}</div><label>Member name<input value={name} onChange={e => setName(e.target.value)} required maxLength={100} placeholder="e.g. Alex" /></label><button className="primary" disabled={busy}>Add member</button></form>;
}
export function RateForm({ data, submit, busy }) {
  const [currency, setCurrency] = useState(currencies.find(c => c !== data.group.currency)); const [rate, setRate] = useState('');
  const options = currencies.filter(c => c !== data.group.currency);
  const selected = options.includes(currency) ? currency : options[0];
  return <form className="card form" onSubmit={async e => { e.preventDefault(); if (await submit('rate', { currency: selected, rate })) setRate(''); }}><div><h2>Exchange rates</h2><p>One unit of foreign currency equals how many {data.group.currency}?</p></div>{data.rates.length ? data.rates.map(r => <div className="rate-row" key={r.currency}>1 {r.currency} = {r.numerator}/{r.denominator} {data.group.currency}</div>) : <p className="empty">No exchange rates added yet.</p>}<label>Foreign currency<Currency value={selected} onChange={setCurrency} options={options}/></label><label>Rate in {data.group.currency}<input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} required placeholder="e.g. 1.08" /></label><button className="primary" disabled={busy}>Save rate</button><p className="footnote">Existing expenses keep the rate used when they were recorded.</p></form>;
}
export function ExpenseForm({ data, submit, busy }) {
  const [description, setDescription] = useState(''); const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(data.group.currency); const [payer, setPayer] = useState('');
  const [type, setType] = useState('equal'); const [included, setIncluded] = useState({}); const [values, setValues] = useState({});
  const options = [data.group.currency, ...data.rates.map(r => r.currency)];
  const code = options.includes(currency) ? currency : data.group.currency;
  const paidBy = data.members.some(m => m.id === payer) ? payer : data.members[0]?.id || '';
  const chosen = data.members.filter(m => included[m.id] !== false);
  async function save(e) {
    e.preventDefault();
    if (await submit('expense', { description, amount, currency:code, paidBy, splitType:type, shares:chosen.map(m => ({ id:m.id, value: values[m.id] || '0' })) })) { setDescription(''); setAmount(''); setValues({}); }
  }
  return <form className="card form" onSubmit={save}><div><h2>Add an expense</h2><p>Enter the details and choose how to split it.</p></div>{!data.members.length && <p className="empty">Add members in Settings before recording an expense.</p>}<label>Description<input value={description} onChange={e => setDescription(e.target.value)} required maxLength={200} placeholder="e.g. Groceries"/></label><div className="form-grid"><label>Amount<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00"/></label><label>Currency<Currency value={code} onChange={setCurrency} options={options}/></label></div><label>Paid by<select value={paidBy} onChange={e => setPayer(e.target.value)} required><option value="" disabled>Choose a member</option>{data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Split method<select value={type} onChange={e => setType(e.target.value)}><option value="equal">Equally</option><option value="exact">Exact amounts</option><option value="percentage">Percentages</option></select></label><fieldset><legend>Split between</legend>{data.members.map(m => <div className="split-row" key={m.id}><label className="check"><input type="checkbox" checked={included[m.id] !== false} onChange={e => setIncluded({ ...included, [m.id]:e.target.checked })}/>{m.name}</label>{type !== 'equal' && included[m.id] !== false && <label className="share-value"><span className="sr-only">{type === 'exact' ? 'Amount' : 'Percentage'} for {m.name}</span><input inputMode="decimal" placeholder={type === 'exact' ? '0.00' : '0%'} value={values[m.id] || ''} onChange={e => setValues({ ...values, [m.id]:e.target.value })}/></label>}</div>)}</fieldset>{type !== 'equal' && <p className="footnote">{type === 'exact' ? `Amounts must total the expense in ${code}.` : 'Percentages must total exactly 100, with up to two decimal places.'}</p>}<button className="primary" disabled={busy || !data.members.length || !chosen.length}>Save expense</button><p className="footnote">Amounts are stored in minor units. {data.expenses.length > 0 && `Latest expense: ${money(data.expenses[0].amount, data.expenses[0].currency)}.`}</p></form>;
}
