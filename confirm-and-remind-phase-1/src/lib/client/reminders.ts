import { ApiError, type Call } from "./session";
import type { Occurrence, OccStatus, Task } from "@/lib/core/types";

export interface Item { task: Task; occurrences: Occurrence[] }

export const LIVE: OccStatus[] = ["scheduled", "queued", "accepted", "failed"];
export const OFFLINE_LABEL = "Saved on this device. Reminder is not scheduled yet.";

/** Labels shown only for what the server has stored. */
export function statusLabel(s: OccStatus): string {
  switch (s) {
    case "scheduled": return "Scheduled";
    case "queued": return "Queued";
    case "accepted": return "Accepted by push service";
    case "failed": return "Failed";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    case "expired": return "Expired";
  }
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ---- reminders created while offline wait here (this device only) until the server confirms them ----
export interface PendingReminder { taskId: string; remindAt: string; clientId: string }
const KEY = "cr-pending-reminders";

export function getPending(): PendingReminder[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as PendingReminder[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function setPending(list: PendingReminder[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** "scheduled" = the server confirmed the save. "offline" = kept on this device only. */
export async function addReminder(call: Call, taskId: string, remindAtIso: string): Promise<"scheduled" | "offline"> {
  const clientId = crypto.randomUUID();
  try {
    await call("/api/reminders", { method: "POST", body: { taskId, remindAt: remindAtIso, clientId } });
    return "scheduled";
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) {
      setPending([...getPending(), { taskId, remindAt: remindAtIso, clientId }]);
      return "offline";
    }
    throw e;
  }
}

/** Sends waiting reminders. Safe to repeat: the clientId makes the server ignore duplicates. Returns how many were confirmed. */
export async function syncPending(call: Call): Promise<number> {
  let done = 0;
  for (const p of getPending()) {
    try {
      await call("/api/reminders", { method: "POST", body: p });
      done++;
      setPending(getPending().filter((x) => x.clientId !== p.clientId));
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) break;
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) setPending(getPending().filter((x) => x.clientId !== p.clientId));
    }
  }
  return done;
}
