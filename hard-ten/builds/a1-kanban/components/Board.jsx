'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, closestCorners } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { applyAction, createHistory, record, undo, redo } from '../lib/board.mjs';
import { createQueue, replay } from '../lib/queue.mjs';
import Editor from './Editor.jsx';

const KEY = 'corkline-demo-v1';
const uid = () => crypto.randomUUID();
const blank = () => ({ id: uid(), title: '', description: '', dueDate: '', labels: [], checklist: [] });
function Icon({ name }) {
  const paths = { undo: 'M9 14 4 9l5-5M4 9h9a6 6 0 0 1 0 12h-2', redo: 'm15 14 5-5-5-5m5 5h-9a6 6 0 0 0 0 12h2', plus: 'M12 5v14M5 12h14', grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01', check: 'm5 12 4 4L19 6', calendar: 'M4 7h16v13H4zM8 4v6M16 4v6M4 11h16' };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function Card({ card, onEdit }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, data: { kind: 'card' } });
  const done = card.checklist.filter(i => i.done).length;
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .45 : 1 }} className="card">
    <div className="card-top"><div className="labels">{card.labels.map((label, i) => <span className={`label tone-${i % 3}`} key={`${label}-${i}`}>{label}</span>)}</div><button className="grip" aria-label={`Drag ${card.title}`} {...attributes} {...listeners}><Icon name="grip" /></button></div>
    <button className="card-title" onClick={() => onEdit(card.id)}>{card.title}</button>
    {card.description && <p className="card-description">{card.description}</p>}
    <div className="card-foot">{card.dueDate && <span><Icon name="calendar" />{card.dueDate}</span>}{card.checklist.length > 0 && <span><Icon name="check" />{done}/{card.checklist.length}</span>}</div>
  </article>;
}
function Column({ column, onEdit, onAdd }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { kind: 'column' } });
  return <section className={`column ${isOver ? 'over' : ''}`} ref={setNodeRef} aria-label={column.title}>
    <div className="column-head"><div><span className={`dot dot-${column.id}`} /><h2>{column.title}</h2><span className="count">{column.cards.length}</span></div><button className="icon-button" onClick={() => onAdd(column.id)} aria-label={`Add card to ${column.title}`}><Icon name="plus" /></button></div>
    <SortableContext items={column.cards.map(c => c.id)} strategy={verticalListSortingStrategy}><div className="cards">{column.cards.map(card => <Card key={card.id} card={card} onEdit={onEdit} />)}{!column.cards.length && <p className="empty">Drop a card here</p>}</div></SortableContext>
    <button className="add-card" onClick={() => onAdd(column.id)}><Icon name="plus" /> Add card</button>
  </section>;
}
export default function Board() {
  const [state, setState] = useState(null);
  const [history, setHistory] = useState(createHistory);
  const [status, setStatus] = useState('Loading board…');
  const [editor, setEditor] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const stateRef = useRef(null), historyRef = useRef(history), queueRef = useRef(null), syncingRef = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const persist = useCallback(next => {
    localStorage.setItem(KEY, JSON.stringify(next));
    stateRef.current = next; setState(next);
  }, []);
  const sync = useCallback(async () => {
    if (!queueRef.current || syncingRef.current) return;
    if (!navigator.onLine) { setStatus('Offline · changes saved on this device'); return; }
    syncingRef.current = true;
    try {
      setStatus('Syncing…');
      do {
        await queueRef.current.drain();
        const response = await fetch('/api/board', { cache: 'no-store' });
        if (!response.ok) throw new Error('Could not refresh board');
        const remote = await response.json();
        const current = stateRef.current;
        persist({ ...current, board: replay(remote.board, current.queue), revision: remote.revision });
      } while (stateRef.current.queue.length);
      setStatus('All changes saved');
    } catch (error) { setStatus(navigator.onLine ? `Sync paused · ${error.message}` : 'Offline · changes saved on this device'); }
    finally { syncingRef.current = false; }
  }, [persist]);
  useEffect(() => {
    let live = true;
    queueRef.current = createQueue({ load: () => stateRef.current, save: persist, send: async operation => {
      const response = await fetch('/api/board', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(operation) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Server unavailable'); }
      return response.json();
    } });
    (async () => {
      try {
        setStatus('Loading board…');
        const cached = localStorage.getItem(KEY);
        if (cached) { const parsed = JSON.parse(cached); if (!parsed.board || !Array.isArray(parsed.queue)) throw new Error('Invalid cached board'); persist(parsed); }
        else {
          const response = await fetch('/api/board', { cache: 'no-store' });
          if (!response.ok) throw new Error('Could not load board. Check the database connection.');
          const data = await response.json(); if (!live) return;
          persist({ board: data.board, revision: data.revision, queue: [] });
        }
        if (live) void sync();
      } catch (error) { if (live) setStatus(error.message); }
    })();
    const online = () => void sync();
    const offline = () => setStatus('Offline · changes saved on this device');
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    const timer = setInterval(() => { if (stateRef.current) void sync(); }, 15000);
    return () => { live = false; window.removeEventListener('online', online); window.removeEventListener('offline', offline); clearInterval(timer); };
  }, [persist, sync, attempts]);
  const enqueue = useCallback((board, action) => {
    try { const current = stateRef.current; persist({ ...current, board, queue: [...current.queue, { id: uid(), action }] }); void sync(); }
    catch (error) { setStatus(`Could not save locally · ${error.message}`); }
  }, [persist, sync]);
  const perform = useCallback(action => {
    try { const result = record(historyRef.current, stateRef.current.board, action); enqueue(result.board, action); historyRef.current = result.history; setHistory(result.history); }
    catch (error) { setStatus(error.message); }
  }, [enqueue]);
  const travel = useCallback(direction => {
    try { const result = (direction === 'undo' ? undo : redo)(historyRef.current, stateRef.current.board); if (!result) return; enqueue(result.board, result.action); historyRef.current = result.history; setHistory(result.history); }
    catch (error) { setStatus(error.message); }
  }, [enqueue]);
  useEffect(() => {
    const key = event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.target.closest('input, textarea, [contenteditable="true"]')) { event.preventDefault(); travel(event.shiftKey ? 'redo' : 'undo'); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [travel]);
  function dragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const board = stateRef.current.board;
    const source = board.columns.find(c => c.cards.some(card => card.id === active.id));
    const destination = board.columns.find(c => c.id === over.id || c.cards.some(card => card.id === over.id));
    if (!source || !destination) return;
    const targetIndex = destination.cards.findIndex(c => c.id === over.id);
    const index = targetIndex < 0 ? destination.cards.length : targetIndex;
    perform({ type: 'move', cardId: active.id, columnId: destination.id, index });
  }
  const edit = id => { const column = stateRef.current.board.columns.find(c => c.cards.some(card => card.id === id)); if (column) setEditor({ columnId: column.id, card: structuredClone(column.cards.find(c => c.id === id)), isNew: false }); };
  const add = columnId => setEditor({ columnId, card: blank(), isNew: true });
  return <><header className="topbar"><div className="brand"><span className="logo">C</span><strong>corkline</strong><span className="divider" /><span className="workspace">Team workspace</span></div><span className="top-note">A little more organized, together.</span></header>
    <main><div className="intro"><div><div className="eyebrow">YOUR WORKSPACE <span>/</span> BOARD</div><h1>Team workspace</h1><p>Good work happens one card at a time.</p></div><div className="intro-actions"><button className="button secondary" disabled={!history.undo.length} onClick={() => travel('undo')} title="Ctrl or Command + Z"><Icon name="undo" /> Undo</button><button className="button secondary" disabled={!history.redo.length} onClick={() => travel('redo')} title="Shift + Ctrl or Command + Z"><Icon name="redo" /> Redo</button>{state && <button className="button primary" onClick={() => add(state.board.columns[0].id)}><Icon name="plus" /> New card</button>}</div></div>
      <div className="board-bar"><div><span className="board-tab">Board view</span><span className="board-subtitle">Your team’s work, at a glance</span></div>{state && <button className="sync" onClick={() => void sync()} title="Retry syncing"><span className="sync-dot" />{status}</button>}</div>
      {!state ? <div className="loading" role="status">{status}{attempts > 0 && <span> · Retry {attempts}</span>} <button className="button secondary" onClick={() => setAttempts(count => count + 1)}>Retry</button></div> : <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={dragEnd}><div className="board">{state.board.columns.map(column => <Column key={column.id} column={column} onEdit={edit} onAdd={add} />)}</div></DndContext>}
      <p className="board-hint">Drag cards by the handle to move them. This demo board is shared; don’t add private information.</p>
    </main>{editor && <Editor key={editor.card.id} value={editor} onClose={() => setEditor(null)} onSave={card => { const current = stateRef.current.board.columns.find(c => c.cards.some(x => x.id === card.id)); const columnId = current?.id || editor.columnId; const index = current ? current.cards.findIndex(c => c.id === card.id) : stateRef.current.board.columns.find(c => c.id === columnId).cards.length; perform({ type: 'put', card, columnId, index }); setEditor(null); }} onDelete={() => { perform({ type: 'delete', cardId: editor.card.id }); setEditor(null); }} />}</>;
}
