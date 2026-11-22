'use client';
import { useState } from 'react';

export default function Editor({ value, onClose, onSave, onDelete }) {
  const [card, setCard] = useState(value.card);
  const [labels, setLabels] = useState(value.card.labels.join(', '));
  const [item, setItem] = useState('');
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    if (!card.title.trim()) { setError('Please give this card a title.'); return; }
    const parsed = labels.split(',').map(s => s.trim()).filter(Boolean);
    if (parsed.length > 20 || parsed.some(s => s.length > 50)) { setError('Use up to 20 labels, each at most 50 characters.'); return; }
    onSave({ ...card, title: card.title.trim(), labels: parsed });
  }
  function addItem() {
    const text = item.trim();
    if (!text || card.checklist.length >= 100) return;
    setCard({ ...card, checklist: [...card.checklist, { id: crypto.randomUUID(), text, done: false }] });
    setItem('');
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <div className="modal-heading"><div><p className="eyebrow">CARD DETAILS</p><h2 id="editor-title">{value.isNew ? 'Create a card' : 'Edit card'}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close editor">×</button></div>
      <form onSubmit={submit}>
        <label>Title<input autoFocus maxLength={200} value={card.title} onChange={e => setCard({ ...card, title: e.target.value })} required /></label>
        <label>Description<textarea maxLength={10000} rows={3} value={card.description} onChange={e => setCard({ ...card, description: e.target.value })} /></label>
        <div className="form-row"><label>Due date<input type="date" value={card.dueDate} onChange={e => setCard({ ...card, dueDate: e.target.value })} /></label><label>Labels <span className="field-hint">comma separated</span><input value={labels} onChange={e => setLabels(e.target.value)} /></label></div>
        <fieldset><legend>Checklist</legend>{card.checklist.map(entry => <div className="check-row" key={entry.id}><label><input type="checkbox" checked={entry.done} onChange={e => setCard({ ...card, checklist: card.checklist.map(x => x.id === entry.id ? { ...x, done: e.target.checked } : x) })} /><span>{entry.text}</span></label><button type="button" className="icon-button" aria-label={`Remove ${entry.text}`} onClick={() => setCard({ ...card, checklist: card.checklist.filter(x => x.id !== entry.id) })}>×</button></div>)}
          <div className="check-add"><input aria-label="New checklist item" value={item} maxLength={200} onChange={e => setItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} placeholder="Add a checklist item" /><button type="button" className="button secondary" disabled={!item.trim()} onClick={addItem}>Add item</button></div>
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">{!value.isNew && <button type="button" className="button danger" onClick={onDelete}>Delete card</button>}<span /><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" type="submit">Save card</button></div>
      </form>
    </section>
  </div>;
}
