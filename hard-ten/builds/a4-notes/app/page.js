'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { displayTags, editTags } from '../lib/tag-input.mjs';

const empty = () => ({ id: crypto.randomUUID(), title: '', body: '', tags: [], pinned: false, revision: 0 });
const fields = n => ({ title: n.title, body: n.body, tags: n.tags, pinned: n.pinned });
const same = (a, b) => JSON.stringify(fields(a)) === JSON.stringify(fields(b));
const date = value => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not saved yet';
function Highlight({ text }) {
  return String(text || '').split(/(⟦[^⟧]*⟧)/g).map((part, i) => part.startsWith('⟦') && part.endsWith('⟧') ? <mark key={i}>{part.slice(1, -1)}</mark> : part);
}
async function api(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok && res.status !== 409) throw new Error(data.error || 'Request failed');
  return data;
}
export default function Home() {
  const [notes, setNotes] = useState([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null);
  const [tagText, setTagText] = useState(null);
  const [base, setBase] = useState(null);
  const [view, setView] = useState('write');
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dirty = draft && (!base || !same(draft, base));
  const load = useCallback(async (q) => {
    const rows = await api('/api?q=' + encodeURIComponent(q));
    setNotes(rows);
    return rows;
  }, []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api('/api?q=' + encodeURIComponent(query)).then(rows => {
        if (!live) return;
        setNotes(rows);
        setDraft(curr => curr || rows[0] || empty());
        setBase(curr => curr || rows[0] || null);
        setError('');
      }).catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);
  useEffect(() => {
    const warn = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const preview = useMemo(() => sanitizeHtml(marked.parse(draft?.body || '', { async: false }), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'input']),
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, input: ['type', 'checked', 'disabled'], img: ['src', 'alt', 'title'] },
  }), [draft?.body]);
  function switchNote(next) {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setDraft(next); setTagText(null); setBase(next?.revision ? next : null); setView('write'); setVersions([]); setSelectedVersion(null); setConflict(null); setMessage('');
  }
  function update(key, value) { setDraft(d => ({ ...d, [key]: value })); setMessage(''); }
  function updateTags(text) {
    const edit = editTags(text);
    setTagText(edit.rawText);
    setDraft(d => ({ ...d, tags: edit.tags }));
    setMessage('');
  }
  async function save(restoreRevision, overrideBase) {
    if (!draft || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api('/api/' + draft.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: overrideBase ?? draft.revision, requestId: crypto.randomUUID(), note: fields(draft), ...(restoreRevision ? { restoreRevision } : {}) }) });
      if (result.conflict) { setConflict({ current: result.current, proposed: { ...draft }, restoreRevision }); return; }
      setDraft(result.note); setTagText(null); setBase(result.note); setConflict(null); setSelectedVersion(null);
      setMessage(restoreRevision ? 'Version restored as a new save.' : 'All changes saved.');
      await load(query);
      if (view === 'history') setVersions(await api('/api/' + draft.id + '/history'));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function openHistory() {
    if (!draft?.revision) return;
    setBusy(true); setError('');
    try { setVersions(await api('/api/' + draft.id + '/history')); setSelectedVersion(null); setView('history'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!draft || !window.confirm('Delete this note and all its history? This cannot be undone.')) return;
    if (!draft.revision) { switchNote(null); return; }
    setBusy(true); setError('');
    try {
      const result = await api('/api/' + draft.id + '?revision=' + draft.revision, { method: 'DELETE' });
      if (result.conflict) { setConflict({ current: result.current, proposed: draft }); return; }
      setDraft(null); setTagText(null); setBase(null); setMessage('Note deleted.'); await load(query);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function useCurrent() {
    setTagText(null);
    if (!conflict.current) { setDraft(null); setBase(null); }
    else { setDraft(conflict.current); setBase(conflict.current); }
    setConflict(null); setView('write'); setMessage('Loaded the latest saved version.'); load(query).catch(e => setError(e.message));
  }
  function keepMine() {
    if (!conflict.current) { setError('This note was deleted. Copy your text into a new note to keep it.'); setConflict(null); return; }
    save(conflict.restoreRevision, conflict.current.revision);
  }
  return <div className="shell">
    <aside className="sidebar"><div className="brand"><span className="brand-icon">Q</span><span>Quillstack<small>YOUR WRITING SPACE</small></span></div>
      <div className="side-label">WORKSPACE</div><div className="side-active"><span>▤</span> All notes <span className="side-count">{notes.length}</span></div>
      <div className="side-bottom"><div className="side-quote">A little space for<br />your big ideas.</div><p>Capture thoughts, find them later.</p><a href="/api/export">↓ &nbsp; Export all notes</a></div>
    </aside>
    <main className="workspace"><header className="topbar"><div><span className="breadcrumb">Workspace</span><span className="slash"> / </span><strong>All notes</strong></div><span className="top-caption">YOUR PERSONAL NOTEBOOK</span></header>
      <div className="page"><div className="page-heading"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>All notes <span className="heading-count">{notes.length}</span></h1><p>Every thought, all in one place.</p></div><button className="primary" onClick={() => switchNote(empty())}>+ New note</button></div>
        {error && <div className="notice error" role="alert">{error} <button onClick={() => { setError(''); load(query).catch(e => setError(e.message)); }}>Retry</button></div>}
        {message && <div className="notice" role="status">{message}</div>}
        <div className="columns"><section className="list-panel"><div className="list-head"><label className="search-label" htmlFor="search">Search notes</label><input id="search" type="search" placeholder="Search your notes..." value={query} onChange={e => setQuery(e.target.value)} /><div className="list-meta"><span>{query ? 'SEARCH RESULTS' : 'YOUR NOTES'}</span><span>{notes.length} NOTES</span></div></div>
          <div className="notes-list">{loading ? <div className="empty-list">Loading notes…</div> : notes.length === 0 ? <div className="empty-list">{query ? 'No notes match your search.' : 'Your notebook is empty. Create your first note to get started.'}</div> : notes.map(n => <button key={n.id} className={'note-card ' + (draft?.id === n.id ? 'selected' : '')} onClick={() => switchNote(n)} aria-pressed={draft?.id === n.id}><span className="note-title"><Highlight text={n.title_highlight || n.title || 'Untitled note'} /> {n.pinned && <span className="pin">◆</span>}</span><span className="note-excerpt"><Highlight text={n.body_highlight || n.body || 'No content yet'} /></span><span className="note-footer"><span>{date(n.updated_at)}</span><span>{n.tags.slice(0, 2).join(' · ')}</span></span></button>)}</div>
        </section>
        <section className="editor-panel">{!draft ? <div className="editor-empty"><div className="empty-icon">✎</div><h2>A blank page awaits</h2><p>Select a note or create a new one to start writing.</p><button className="primary" onClick={() => switchNote(empty())}>+ Create a note</button></div> : <>
          <div className="editor-top"><div><span className="eyebrow">{draft.revision ? 'EDITING NOTE' : 'NEW NOTE'}</span><div className="save-status">{dirty ? 'Unsaved changes' : 'Saved'} · {date(draft.updated_at)}</div></div><div className="actions"><button className="subtle" onClick={() => update('pinned', !draft.pinned)} aria-pressed={draft.pinned}>{draft.pinned ? '◆ Pinned' : 'Pin note'}</button><button className="primary" disabled={busy} onClick={() => save()}>Save note</button></div></div>
          <div className="editor-content"><label className="sr-only" htmlFor="title">Note title</label><input id="title" className="title-input" placeholder="Untitled note" value={draft.title} onChange={e => update('title', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
            <div className="tag-row"><label htmlFor="tags">TAGS</label><input id="tags" placeholder="Add tags, separated by commas" value={displayTags(tagText, draft.tags)} onChange={e => updateTags(e.target.value)} /></div>
            <div className="tabs"><button className={view === 'write' ? 'active' : ''} aria-pressed={view === 'write'} onClick={() => setView('write')}>Write & preview</button><button className={view === 'history' ? 'active' : ''} aria-pressed={view === 'history'} disabled={!draft.revision || busy} onClick={openHistory}>Version history</button><div className="tab-spacer" />{draft.revision > 0 && <a href={'/api/' + draft.id + '/export'}>↓ Export .md</a>}<button className="delete" onClick={remove} disabled={busy}>Delete</button></div>
            {view === 'write' ? <div className="writing"><div className="writing-pane"><div className="pane-label">MARKDOWN <span>WRITE</span></div><label className="sr-only" htmlFor="body">Markdown content</label><textarea id="body" placeholder="Start writing in Markdown..." value={draft.body} onChange={e => update('body', e.target.value)} /></div><div className="writing-pane preview"><div className="pane-label">PREVIEW <span>LIVE</span></div>{draft.body ? <div className="markdown" dangerouslySetInnerHTML={{ __html: preview }} /> : <p className="preview-empty">Your preview will appear here as you write.</p>}</div></div> : <div className="history"><h2>Version history</h2><p>Every save is preserved. Restoring creates a new version.</p><div className="version-list">{versions.map(v => <button key={v.revision} className={selectedVersion?.revision === v.revision ? 'selected' : ''} onClick={() => setSelectedVersion(v)}>Version {v.revision} <span>{date(v.created_at)}</span></button>)}</div>{selectedVersion && <div className="version-detail"><h3>{selectedVersion.title || 'Untitled note'}</h3><p>Tags: {selectedVersion.tags.join(', ') || 'None'} · {selectedVersion.pinned ? 'Pinned' : 'Not pinned'}</p><pre>{selectedVersion.body || '(Empty)'}</pre><button className="primary" disabled={busy} onClick={() => { if (!dirty || window.confirm('Restore this version and discard your unsaved changes?')) save(selectedVersion.revision); }}>Restore this version</button></div>}</div>}
          </div></>}</section></div>
      </div></main>
    {conflict && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="conflict-title"><div className="eyebrow">SAVE CONFLICT</div><h2 id="conflict-title">This note has changed</h2><p>Another tab saved a newer version. Your changes were not overwritten. Choose which version to keep.</p><div className="conflict-grid"><div><h3>Your version</h3><strong>{conflict.proposed.title || 'Untitled'}</strong><pre>{conflict.proposed.body}</pre><p>Tags: {conflict.proposed.tags.join(', ') || 'None'} · {conflict.proposed.pinned ? 'Pinned' : 'Not pinned'}</p></div><div><h3>Latest saved version</h3>{conflict.current ? <><strong>{conflict.current.title || 'Untitled'}</strong><pre>{conflict.current.body}</pre><p>Tags: {conflict.current.tags.join(', ') || 'None'} · {conflict.current.pinned ? 'Pinned' : 'Not pinned'}</p></> : <p>This note was deleted.</p>}</div></div><div className="modal-actions"><button onClick={() => setConflict(null)}>Keep editing</button><button onClick={useCurrent}>Use latest</button><button className="primary" disabled={busy || !conflict.current} onClick={keepMine}>{conflict.restoreRevision ? 'Restore selected version' : 'Save my version'}</button></div></div></div>}
  </div>;
}
