"use client";
import { useState } from "react";
import { errMsg, useSession } from "@/lib/client/session";
import { LIVE, OFFLINE_LABEL, addReminder, fmtDateTime, getPending, statusLabel, type Item } from "@/lib/client/reminders";
import { localInputToIso, toLocalInput } from "@/lib/client/dates";
import type { Occurrence } from "@/lib/core/types";
import { btn, btnDanger, ErrorLine, field } from "./ui";

/** The occurrence to show: the next live one, else the most recent one. */
export function currentOccurrence(item: Item): Occurrence | null {
  const sorted = [...item.occurrences].sort((a, b) => a.fire_at.localeCompare(b.fire_at));
  return sorted.find((o) => LIVE.includes(o.status)) ?? sorted[sorted.length - 1] ?? null;
}

export default function TaskCard({ item, highlight }: { item: Item; highlight?: boolean }) {
  const { call } = useSession();
  const { task } = item;
  const occ = currentOccurrence(item);
  const live = occ !== null && LIVE.includes(occ.status);
  const waiting = getPending().some((p) => p.taskId === task.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [when, setWhen] = useState("");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      await fn();
      window.dispatchEvent(new Event("cr-refresh"));
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusy(false);
  }

  const setStatus = (status: "open" | "done" | "dismissed") =>
    run(async () => {
      await call(`/api/tasks/${task.id}`, { method: "PATCH", body: { status } });
    });
  const snooze = (kind: "10m" | "1h" | "tomorrow") =>
    run(async () => {
      if (occ) await call(`/api/occurrences/${occ.id}`, { method: "POST", body: { action: "snooze", kind } });
    });
  const remove = () =>
    run(async () => {
      if (window.confirm("Delete this task?")) await call(`/api/tasks/${task.id}`, { method: "DELETE" });
    });
  const saveTime = () =>
    run(async () => {
      const iso = localInputToIso(when);
      if (!iso) throw new Error("Pick a date and time");
      if (live && occ) {
        await call(`/api/occurrences/${occ.id}`, { method: "POST", body: { action: "reschedule", at: iso } });
      } else {
        const r = await addReminder(call, task.id, iso);
        if (r === "offline") setInfo(OFFLINE_LABEL);
      }
      setPicker(false);
    });

  const isOpen = task.status === "open";
  return (
    <li id={`task-${task.id}`} className={`list-none rounded-2xl border bg-white p-4 ${highlight ? "border-calm-500 ring-2 ring-calm-500" : "border-calm-100"}`}>
      <p className={`text-lg font-medium ${isOpen ? "" : "text-calm-500 line-through"}`}>{task.title}</p>
      <div className="mt-1 space-y-0.5 text-sm text-calm-600">
        {task.due_at && <p>Due: {fmtDateTime(task.due_at)}</p>}
        {occ && (
          <p>
            Reminder: {fmtDateTime(occ.fire_at)} · <span className="font-medium" data-testid="status">{statusLabel(occ.status)}</span>
          </p>
        )}
        {(waiting || info) && <p className="text-amber-800">{OFFLINE_LABEL}</p>}
        {!isOpen && <p>{task.status === "done" ? "Done" : "Dismissed"}</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {isOpen ? (
          <button className={btn} disabled={busy} onClick={() => setStatus("done")}>Done</button>
        ) : (
          <button className={btn} disabled={busy} onClick={() => setStatus("open")}>Reopen</button>
        )}
        {isOpen && live && (
          <>
            <button className={btn} disabled={busy} onClick={() => snooze("10m")}>Snooze 10 min</button>
            <button className={btn} disabled={busy} onClick={() => snooze("1h")}>Snooze 1 hour</button>
            <button className={btn} disabled={busy} onClick={() => snooze("tomorrow")}>Tomorrow morning</button>
          </>
        )}
        {isOpen && (
          <button className={btn} disabled={busy} onClick={() => { setPicker(!picker); setWhen(toLocalInput(new Date(Date.now() + 3600_000))); }}>
            {live ? "Reschedule" : "Add reminder"}
          </button>
        )}
        {isOpen && <button className={btn} disabled={busy} onClick={() => setStatus("dismissed")}>Dismiss</button>}
        <button className={btnDanger} disabled={busy} onClick={remove}>Delete</button>
      </div>
      {picker && (
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={`when-${task.id}`} className="text-sm">Reminder time</label>
          <input id={`when-${task.id}`} type="datetime-local" className={field} value={when} onChange={(e) => setWhen(e.target.value)} />
          <button className={btn} disabled={busy} onClick={saveTime}>Save reminder time</button>
        </div>
      )}
      <div className="mt-2"><ErrorLine message={err} /></div>
    </li>
  );
}
