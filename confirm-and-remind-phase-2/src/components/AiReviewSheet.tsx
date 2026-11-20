"use client";
import { useCallback, useEffect, useState } from "react";
import { zonedToUtc } from "@/lib/core/time";
import type { AiSuggestion, Note, Occurrence, Task } from "@/lib/core/types";
import { errMsg, useSession } from "@/lib/client/session";
import TaskCard from "./TaskCard";
import { btn, btnDanger, btnPrimary, ErrorLine, field } from "./ui";

type LinkedItem = { task: Task; occurrences: Occurrence[] };
type Review = { note: Note; suggestions: AiSuggestion[]; linkedItems: LinkedItem[] };
const pad = (n: number) => String(n).padStart(2, "0");

function fullDate(iso: string | null, zone: string): string {
  if (!iso) return "No exact time proposed — unscheduled";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "long", timeZone: zone }).format(new Date(iso));
  } catch { return `${iso} (${zone})`; }
}

function inputDate(iso: string | null, zone: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function zonedInput(value: string, zone: string): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), zone)).toISOString();
}

function SuggestionCard({ suggestion, onDone }: { suggestion: AiSuggestion; onDone: () => void }) {
  const { call } = useSession();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(suggestion.text);
  const [due, setDue] = useState(inputDate(suggestion.resolved_due, suggestion.time_zone));
  const [reminder, setReminder] = useState(inputDate(suggestion.resolved_reminder, suggestion.time_zone));
  const [withReminder, setWithReminder] = useState(Boolean(suggestion.resolved_reminder));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "confirm" | "dismiss") {
    setBusy(true);
    setError(null);
    try {
      await call(`/api/ai/suggestions/${suggestion.id}`, { method: "PATCH", body: action === "dismiss" ? { action } : {
        action, edit: { title: title.trim(), dueAt: zonedInput(due, suggestion.time_zone), reminderAt: withReminder ? zonedInput(reminder, suggestion.time_zone) : null, createReminder: withReminder },
      } });
      window.dispatchEvent(new Event("cr-refresh"));
      onDone();
    } catch (e) { setError(errMsg(e)); }
    setBusy(false);
  }

  return (
    <section className="rounded-2xl border border-calm-100 bg-white p-4" aria-label={`Suggestion: ${suggestion.text}`}>
      {editing ? <label className="flex flex-col gap-1 text-sm">Task title<input className={field} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} /></label> : <h3 className="text-lg font-medium">{suggestion.text}</h3>}
      <blockquote className="mt-2 border-l-4 border-calm-200 pl-3 text-sm text-calm-700">“{suggestion.source_quote}”</blockquote>
      <dl className="mt-3 space-y-2 text-sm">
        <div><dt className="font-medium">Proposed due</dt><dd>{fullDate(suggestion.resolved_due, suggestion.time_zone)}</dd></div>
        <div><dt className="font-medium">Proposed reminder</dt><dd>{fullDate(suggestion.resolved_reminder, suggestion.time_zone)}</dd></div>
        <div><dt className="font-medium">Time zone</dt><dd>{suggestion.time_zone}</dd></div>
      </dl>
      {suggestion.needs_clarification && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Needs your input: {suggestion.ambiguity_note ?? "Choose an exact date and time."} Nothing is scheduled yet.</p>}
      {!editing && <p className="mt-2 text-xs text-calm-600">This is only a suggestion. Confirm creates the task; only a proposed reminder time creates a reminder.</p>}
      {editing && <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">Due ({suggestion.time_zone})<input type="datetime-local" className={field} value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={withReminder} onChange={(e) => setWithReminder(e.target.checked)} />Create a reminder when I confirm</label>
        {withReminder && <label className="flex flex-col gap-1 text-sm">Reminder ({suggestion.time_zone})<input type="datetime-local" className={field} value={reminder} onChange={(e) => setReminder(e.target.value)} /></label>}
      </div>}
      <ErrorLine message={error} />
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={busy || !title.trim() || (editing && withReminder && !reminder)} onClick={() => void decide("confirm")}>{withReminder || suggestion.resolved_reminder ? "Confirm" : "Confirm task without reminder"}</button>
        <button className={btn} disabled={busy} onClick={() => setEditing(!editing)}>{editing ? "Stop editing" : "Edit"}</button>
        <button className={btnDanger} disabled={busy} onClick={() => void decide("dismiss")}>Dismiss</button>
      </div>
    </section>
  );
}
export default function AiReviewSheet({ noteId, changed = false, onClose }: { noteId: string; changed?: boolean; onClose: () => void }) {
  const { call } = useSession();
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReminders, setShowReminders] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await call<Review>(`/api/ai/${noteId}`);
      setReview(r);
      setError(null);
    } catch (e) { setError(errMsg(e)); }
  }, [call, noteId]);

  useEffect(() => { void load(); }, [load]);

  async function retry() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await call(`/api/ai/${noteId}`, { method: "POST" });
      setInfo("Review requested. Your note is safe. Come back to Review suggestions in a moment.");
    } catch (e) { setError(errMsg(e)); }
    setBusy(false);
  }

  const pending = review?.suggestions.filter((s) => s.status === "pending" && s.note_version === review.note.version) ?? [];
  return (
    <div role="dialog" aria-modal="true" aria-label="AI suggestion review" className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-calm-50 p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-2xl font-semibold">Review suggestions</h2><p className="mt-1 text-sm text-calm-600">AI can suggest. Only you can confirm.</p></div>
          <button className={btn} onClick={onClose}>Close</button>
        </div>
        {changed && <div className="mt-4 rounded-xl bg-amber-50 p-3 text-amber-900">
          <p>This note changed. Review its linked reminders?</p>
          <button className={`${btn} mt-2`} onClick={() => setShowReminders(!showReminders)}>{showReminders ? "Hide linked reminders" : "Review linked reminders"}</button>
        </div>}
        {showReminders && <section className="mt-3" aria-label="Linked reminders">
          {review?.linkedItems.length ? <ul className="space-y-3">{review.linkedItems.map((item) => <TaskCard key={item.task.id} item={item} />)}</ul> : <p className="rounded-xl bg-white p-3 text-sm">No linked reminders.</p>}
        </section>}
        <ErrorLine message={error} />
        {info && <p role="status" className="mt-3 rounded-xl bg-calm-50 p-3 text-sm">{info}</p>}
        {!review && !error && <p className="mt-4">Loading suggestions…</p>}
        {review && <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-white p-3 text-sm text-calm-600">Saved note: {review.note.original_text}</p>}
        {pending.length > 0 && <div className="mt-4 space-y-3">{pending.map((s) => <SuggestionCard key={s.id} suggestion={s} onDone={load} />)}</div>}
        {review && pending.length === 0 && <div className="mt-4 rounded-2xl border border-dashed border-calm-100 bg-white p-4">
          <p>No suggestions are waiting. The note is saved; no reminder was created by AI.</p>
          <p className="mt-2 text-sm text-calm-600">If AI is off, unavailable, over budget, or found nothing clear to suggest, you can still make a task and reminder yourself.</p>
          <button className={`${btn} mt-3`} disabled={busy} onClick={() => void retry()}>Try AI review again</button>
        </div>}
      </div>
    </div>
  );
}
