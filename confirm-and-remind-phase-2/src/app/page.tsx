"use client";
import { useEffect, useState } from "react";
import CaptureSheet from "@/components/CaptureSheet";
import AiReviewSheet from "@/components/AiReviewSheet";
import TaskCard, { currentOccurrence } from "@/components/TaskCard";
import { Empty, ErrorLine, PageTitle, btnPrimary } from "@/components/ui";
import { useItems } from "@/lib/client/hooks";
import { LIVE, type Item } from "@/lib/client/reminders";
import { endOfDay, startOfDay } from "@/lib/client/dates";

export default function TodayPage() {
  const { items, error } = useItems();
  const [adding, setAdding] = useState(false);
  const [reviewNote, setReviewNote] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    // A tapped notification opens /?task=<id>: show that exact task first.
    setFocus(new URLSearchParams(window.location.search).get("task"));
  }, []);

  const now = new Date();
  const dayStart = startOfDay(now).getTime();
  const dayEnd = endOfDay(now).getTime();
  const open = (items ?? []).filter((i) => i.task.status === "open");
  const fireAt = (i: Item): number | null => {
    const o = currentOccurrence(i);
    return o && LIVE.includes(o.status) ? new Date(o.fire_at).getTime() : null;
  };
  const overdue = open.filter((i) => {
    const due = i.task.due_at ? new Date(i.task.due_at).getTime() : null;
    const f = fireAt(i);
    return (due !== null && due < dayStart) || (f !== null && f < dayStart);
  });
  const today = open.filter((i) => {
    if (overdue.includes(i)) return false;
    const f = fireAt(i);
    const due = i.task.due_at ? new Date(i.task.due_at).getTime() : null;
    return (f !== null && f < dayEnd) || (due !== null && due < dayEnd);
  });
  const focused = focus ? (items ?? []).find((i) => i.task.id === focus) : undefined;
  const rest = (list: Item[]) => list.filter((i) => i !== focused);

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>Today</PageTitle>
      <button className={`${btnPrimary} min-h-16 text-xl`} onClick={() => setAdding(true)}>Add note</button>
      <ErrorLine message={error} />
      {items === null && !error && <p className="text-calm-600">Loading…</p>}
      {focused && <section aria-label="Opened from notification"><h2 className="mb-2 text-lg font-semibold">Opened from your reminder</h2><ul className="space-y-3"><TaskCard item={focused} highlight /></ul></section>}
      {items !== null && <>
        <section aria-label="Overdue"><h2 className="mb-2 text-lg font-semibold">Overdue</h2>{rest(overdue).length ? <ul className="space-y-3">{rest(overdue).map((i) => <TaskCard key={i.task.id} item={i} />)}</ul> : <Empty title="Nothing overdue" />}</section>
        <section aria-label="Today's reminders"><h2 className="mb-2 text-lg font-semibold">Today</h2>{rest(today).length ? <ul className="space-y-3">{rest(today).map((i) => <TaskCard key={i.task.id} item={i} />)}</ul> : <Empty title="Nothing planned for today">Tap Add note to write something down.</Empty>}</section>
      </>}
      {adding && <CaptureSheet onClose={() => setAdding(false)} onSaved={(note) => setReviewNote(note.id)} />}
      {reviewNote && <AiReviewSheet noteId={reviewNote} onClose={() => setReviewNote(null)} />}
    </div>
  );
}
