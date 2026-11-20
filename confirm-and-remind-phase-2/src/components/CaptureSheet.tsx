"use client";
import { useState } from "react";
import { ApiError, errMsg, useSession } from "@/lib/client/session";
import { useDraft } from "@/lib/client/hooks";
import { addReminder, OFFLINE_LABEL } from "@/lib/client/reminders";
import { localInputToIso } from "@/lib/client/dates";
import type { Note, Task } from "@/lib/core/types";
import { btn, btnPrimary, ErrorLine, field } from "./ui";

/** Fast capture. Typing goes to an IndexedDB draft at once; Save only waits for the note itself. */
export default function CaptureSheet({ onClose, onSaved }: { onClose: () => void; onSaved?: (note: Note) => void }) {
  const { call } = useSession();
  const [mode, setMode] = useState<"note" | "task">("note");
  const draft = useDraft("capture-note");
  const [title, setTitle] = useState("");
  const [alsoTask, setAlsoTask] = useState(false);
  const [due, setDue] = useState("");
  const [remind, setRemind] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function finish(taskId: string) {
    const iso = localInputToIso(remind);
    if (!iso) return;
    try {
      if ((await addReminder(call, taskId, iso)) === "offline") setInfo(OFFLINE_LABEL);
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  async function saveNote() {
    const text = draft.text.trim();
    if (!text) return setErr("Type something first");
    setBusy(true);
    setErr(null);
    try {
      const { note } = await call<{ note: Note }>("/api/notes", { method: "POST", body: { text: draft.text, clientId: draft.clientId.current } });
      draft.clear();
      if (alsoTask) {
        const first = text.split("\n")[0] ?? text;
        const { task } = await call<{ task: Task }>("/api/tasks", {
          method: "POST",
          body: { title: (title.trim() || first).slice(0, 200), noteId: note.id, dueAt: localInputToIso(due) },
        });
        await finish(task.id);
      }
      window.dispatchEvent(new Event("cr-refresh"));
      onSaved?.(note);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setInfo("Saved on this device as a draft. Press Save again when you are back online.");
      else setErr(errMsg(e));
    }
    setBusy(false);
  }

  async function saveTask() {
    if (!title.trim()) return setErr("Give the task a title");
    setBusy(true);
    setErr(null);
    try {
      const { task } = await call<{ task: Task }>("/api/tasks", { method: "POST", body: { title: title.trim().slice(0, 200), dueAt: localInputToIso(due) } });
      await finish(task.id);
      window.dispatchEvent(new Event("cr-refresh"));
      if (!info) onClose();
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusy(false);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Add" className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-calm-50 p-5 sm:rounded-3xl">
        <div className="mb-3 flex gap-2">
          <button className={btn} aria-pressed={mode === "note"} onClick={() => setMode("note")}>Note</button>
          <button className={btn} aria-pressed={mode === "task"} onClick={() => setMode("task")}>Task only</button>
          <button className={`${btn} ml-auto`} onClick={onClose}>Close</button>
        </div>
        {mode === "note" ? (
          <div className="flex flex-col gap-3">
            {draft.restored && <p className="text-sm text-calm-600">Draft restored from this device.</p>}
            <label htmlFor="note-text" className="text-sm">Your note</label>
            <textarea id="note-text" autoFocus rows={6} className={`${field} py-3`} value={draft.text} onChange={(e) => draft.setText(e.target.value)} placeholder="Pay the electric bill by Friday" />
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="h-5 w-5" checked={alsoTask} onChange={(e) => setAlsoTask(e.target.checked)} />
              Also make a task from this note
            </label>
          </div>
        ) : null}
        {(mode === "task" || alsoTask) && (
          <div className="mt-3 flex flex-col gap-3">
            <label htmlFor="task-title" className="text-sm">Task title {mode === "note" && "(optional, defaults to the first line)"}</label>
            <input id="task-title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
            <label htmlFor="task-due" className="text-sm">Due (optional)</label>
            <input id="task-due" type="datetime-local" className={field} value={due} onChange={(e) => setDue(e.target.value)} />
            <label htmlFor="task-remind" className="text-sm">Remind me at (optional, separate from the due date)</label>
            <input id="task-remind" type="datetime-local" className={field} value={remind} onChange={(e) => setRemind(e.target.value)} />
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {info && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{info}</p>}
          <ErrorLine message={err} />
          <button className={btnPrimary} disabled={busy} onClick={mode === "note" ? saveNote : saveTask}>{mode === "note" ? "Save note" : "Save task"}</button>
        </div>
      </div>
    </div>
  );
}
