"use client";
import { useCallback, useEffect, useState } from "react";
import CaptureSheet from "@/components/CaptureSheet";
import { Empty, ErrorLine, PageTitle, btn, btnDanger, btnPrimary, field } from "@/components/ui";
import { errMsg, useSession } from "@/lib/client/session";
import { fmtDateTime } from "@/lib/client/reminders";
import type { Note } from "@/lib/core/types";

function NoteCard({ note, onChanged, onError }: { note: Note; onChanged: () => void; onError: (m: string) => void }) {
  const { call } = useSession();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.original_text);
  const [busy, setBusy] = useState(false);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      onError(errMsg(e));
    }
    setBusy(false);
  }
  return (
    <li className="list-none rounded-2xl border border-calm-100 bg-white p-4">
      {note.pinned && <p className="mb-1 text-xs font-semibold uppercase text-calm-600">Pinned</p>}
      {editing ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`edit-${note.id}`} className="text-sm">Edit note</label>
          <textarea id={`edit-${note.id}`} rows={5} className={`${field} py-3`} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <button className={btnPrimary} disabled={busy || !text.trim()} onClick={() => act(async () => { await call(`/api/notes/${note.id}`, { method: "PATCH", body: { text } }); setEditing(false); })}>Save changes</button>
            <button className={btn} onClick={() => { setEditing(false); setText(note.original_text); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words text-base">{note.original_text}</p>
          <p className="mt-2 text-xs text-calm-600">Updated {fmtDateTime(note.updated_at)} · version {note.version}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={btn} disabled={busy} onClick={() => act(() => call(`/api/notes/${note.id}`, { method: "PATCH", body: { pinned: !note.pinned } }))}>{note.pinned ? "Unpin" : "Pin"}</button>
            <button className={btn} disabled={busy} onClick={() => setEditing(true)}>Edit</button>
            <button className={btnDanger} disabled={busy} onClick={() => { if (window.confirm("Delete this note?")) act(() => call(`/api/notes/${note.id}`, { method: "DELETE" })); }}>Delete</button>
          </div>
        </>
      )}
    </li>
  );
}

export default function NotesPage() {
  const { call } = useSession();
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await call<{ notes: Note[] }>(`/api/notes${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
      setNotes(r.notes);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [call, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    window.addEventListener("cr-refresh", load);
    return () => {
      clearTimeout(t);
      window.removeEventListener("cr-refresh", load);
    };
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Notes</PageTitle>
      <button className={btnPrimary} onClick={() => setAdding(true)}>Add note</button>
      <div role="search">
        <label htmlFor="q" className="sr-only">Search notes</label>
        <input id="q" type="search" className={field} placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorLine message={error} />
      {notes === null && !error && <p className="text-calm-600">Loading…</p>}
      {notes !== null && notes.length === 0 && <Empty title={q.trim() ? "No notes match" : "No notes yet"}>{q.trim() ? "Try other words." : "Tap Add note to write your first one."}</Empty>}
      <ul className="space-y-3">
        {(notes ?? []).map((n) => <NoteCard key={`${n.id}-${n.version}-${n.pinned}`} note={n} onChanged={load} onError={setError} />)}
      </ul>
      {adding && <CaptureSheet onClose={() => setAdding(false)} />}
    </div>
  );
}
