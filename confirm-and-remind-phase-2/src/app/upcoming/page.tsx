"use client";
import { useState } from "react";
import TaskCard, { currentOccurrence } from "@/components/TaskCard";
import { Empty, ErrorLine, PageTitle, btn } from "@/components/ui";
import { useItems } from "@/lib/client/hooks";
import { dayKey, dayLabel } from "@/lib/client/dates";
import type { Item } from "@/lib/client/reminders";

type Filter = "notdone" | "done" | "all";

function when(i: Item): Date | null {
  const o = currentOccurrence(i);
  const iso = o?.fire_at ?? i.task.due_at;
  return iso ? new Date(iso) : null;
}

export default function UpcomingPage() {
  const { items, error } = useItems();
  const [filter, setFilter] = useState<Filter>("notdone");

  const shown = (items ?? []).filter((i) => (filter === "all" ? true : filter === "done" ? i.task.status !== "open" : i.task.status === "open"));
  const groups = new Map<string, { label: string; items: Item[] }>();
  const undated: Item[] = [];
  for (const i of [...shown].sort((a, b) => (when(a)?.getTime() ?? Infinity) - (when(b)?.getTime() ?? Infinity))) {
    const d = when(i);
    if (!d) { undated.push(i); continue; }
    const k = dayKey(d);
    if (!groups.has(k)) groups.set(k, { label: dayLabel(d), items: [] });
    groups.get(k)!.items.push(i);
  }
  const tabs: { id: Filter; label: string }[] = [{ id: "notdone", label: "Not done" }, { id: "done", label: "Done" }, { id: "all", label: "All" }];

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Upcoming</PageTitle>
      <div role="group" aria-label="Filter" className="flex gap-2">
        {tabs.map((t) => (
          <button key={t.id} className={`${btn} ${filter === t.id ? "border-calm-600 bg-calm-100" : ""}`} aria-pressed={filter === t.id} onClick={() => setFilter(t.id)}>{t.label}</button>
        ))}
      </div>
      <ErrorLine message={error} />
      {items === null && !error && <p className="text-calm-600">Loading…</p>}
      {items !== null && shown.length === 0 && <Empty title={filter === "done" ? "Nothing done yet" : "Nothing coming up"}>Tasks you add on Today will show here.</Empty>}
      {[...groups.entries()].map(([k, g]) => (
        <section key={k} aria-label={g.label}>
          <h2 className="mb-2 text-lg font-semibold">{g.label}</h2>
          <ul className="space-y-3">{g.items.map((i) => <TaskCard key={i.task.id} item={i} />)}</ul>
        </section>
      ))}
      {undated.length > 0 && (
        <section aria-label="No date">
          <h2 className="mb-2 text-lg font-semibold">No date</h2>
          <ul className="space-y-3">{undated.map((i) => <TaskCard key={i.task.id} item={i} />)}</ul>
        </section>
      )}
    </div>
  );
}
