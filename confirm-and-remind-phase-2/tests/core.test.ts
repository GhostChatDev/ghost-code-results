import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { MemoryDb } from "../src/lib/core/db";
import { dispatchDue, GENERIC_TEXT } from "../src/lib/core/dispatch";
import {
  createNote, createReminder, createTask, deleteAccountData, deleteNote, exportAll, listNotes, listSubscriptions,
  materializeNext, OFFLINE_LABEL, removeSubscription, reschedule, saveSubscription, setTaskStatus, snooze, statusLabel, updateNote, updateProfile,
} from "../src/lib/core/service";
import { nextOccurrenceAfter } from "../src/lib/core/time";
import { clearDraft, loadDraft, saveDraft } from "../src/lib/drafts";
import { A, B, FakeSender, seed } from "./helpers";

const FIRE = "2025-06-01T10:00:00Z";
const t = (s: string) => Date.parse(s);

async function twoUsers() {
  const db = new MemoryDb();
  const a = await seed(db, A, FIRE);
  const b = await seed(db, B, FIRE);
  return { db, a, b };
}

describe("authorization: user B cannot touch user A", () => {
  it("cannot read, search, update or delete A's notes", async () => {
    const { db, a } = await twoUsers();
    expect((await listNotes(db, B)).map((n) => n.id)).not.toContain(a.note.id);
    expect(await listNotes(db, B, "secret")).toHaveLength(1);
    expect((await listNotes(db, B, "secret"))[0]!.original_text).toBe(`secret of ${B}`);
    await expect(updateNote(db, B, a.note.id, { pinned: true })).rejects.toMatchObject({ status: 404 });
    await expect(deleteNote(db, B, a.note.id)).rejects.toMatchObject({ status: 404 });
    expect((await db.select("notes", { id: a.note.id }))[0]!.pinned).toBe(false);
  });
  it("cannot use A's note, task, occurrence or subscription", async () => {
    const { db, a } = await twoUsers();
    await expect(createTask(db, B, { title: "x", noteId: a.note.id })).rejects.toMatchObject({ status: 404 });
    await expect(createReminder(db, B, { taskId: a.task.id, remindAt: FIRE })).rejects.toMatchObject({ status: 404 });
    await expect(setTaskStatus(db, B, a.task.id, "done")).rejects.toMatchObject({ status: 404 });
    await expect(snooze(db, B, a.occurrence.id, "10m")).rejects.toMatchObject({ status: 404 });
    await expect(reschedule(db, B, a.occurrence.id, "2099-01-01T00:00:00Z")).rejects.toMatchObject({ status: 404 });
    const subA = (await listSubscriptions(db, A))[0]!;
    expect((await listSubscriptions(db, B)).map((s) => s.id)).not.toContain(subA.id);
    await expect(removeSubscription(db, B, subA.id)).rejects.toMatchObject({ status: 404 });
    expect((await db.select("tasks", { id: a.task.id }))[0]!.status).toBe("open");
  });
});

describe("notes", () => {
  it("keeps original text, versions, and de-duplicates by client id", async () => {
    const db = new MemoryDb();
    const n1 = await createNote(db, A, { text: "  Call Sam  ", clientId: "c1" });
    const n2 = await createNote(db, A, { text: "  Call Sam  ", clientId: "c1" });
    expect(n2.id).toBe(n1.id);
    expect(n1.original_text).toBe("  Call Sam  ");
    await updateNote(db, A, n1.id, { text: "Call Sam at 5" });
    expect(await db.select("note_versions", { note_id: n1.id })).toHaveLength(2);
    expect(await db.select("notes", { user_id: A })).toHaveLength(1);
  });
});

describe("duplicates", () => {
  it("creating the same reminder twice yields one reminder and one occurrence", async () => {
    const db = new MemoryDb();
    const task = await createTask(db, A, { title: "Pay rent" });
    const r1 = await createReminder(db, A, { taskId: task.id, remindAt: FIRE });
    const r2 = await createReminder(db, A, { taskId: task.id, remindAt: FIRE });
    const r3 = await createReminder(db, A, { taskId: task.id, remindAt: "2025-07-01T10:00:00Z", clientId: "k" });
    const r4 = await createReminder(db, A, { taskId: task.id, remindAt: "2025-08-01T10:00:00Z", clientId: "k" });
    expect(r2.reminder.id).toBe(r1.reminder.id);
    expect(r4.reminder.id).toBe(r3.reminder.id);
    expect(await db.select("reminders", { user_id: A })).toHaveLength(2);
    expect(await db.select("reminder_occurrences", { user_id: A })).toHaveLength(2);
  });
  it("the same occurrence is never sent twice, even if the worker runs twice", async () => {
    const { db } = await twoUsers();
    const s = new FakeSender();
    const now = t(FIRE) + 60_000;
    await dispatchDue(db, s, now);
    await dispatchDue(db, s, now);
    await dispatchDue(db, s, now + 1000);
    expect(s.sent).toHaveLength(2); // one per user device
    expect(await db.select("notification_attempts", {})).toHaveLength(2);
  });
});

describe("dispatch", () => {
  it("sends the generic text by default and the title when allowed", async () => {
    const { db } = await twoUsers();
    await updateProfile(db, B, { show_task_title: true });
    const s = new FakeSender();
    await dispatchDue(db, s, t(FIRE) + 1000);
    const forA = s.sent.find((x) => x.target.endpoint.endsWith(A))!;
    const forB = s.sent.find((x) => x.target.endpoint.endsWith(B))!;
    expect(forA.payload.body).toBe(GENERIC_TEXT);
    expect(forB.payload.body).toBe(`task of ${B}`);
    expect(forA.payload.url).toContain("?task=");
  });
  it("never sends a completed or dismissed task's reminder", async () => {
    const { db, a, b } = await twoUsers();
    await setTaskStatus(db, A, a.task.id, "done");
    await setTaskStatus(db, B, b.task.id, "dismissed");
    const s = new FakeSender();
    await dispatchDue(db, s, t(FIRE) + 1000);
    expect(s.sent).toHaveLength(0);
    expect((await db.select("reminder_occurrences", { id: a.occurrence.id }))[0]!.status).toBe("completed");
    expect((await db.select("reminder_occurrences", { id: b.occurrence.id }))[0]!.status).toBe("cancelled");
  });
  it("never sends when the reminder was cancelled after it was claimed", async () => {
    const db = new MemoryDb();
    const a = await seed(db, A, FIRE);
    await db.update("reminders", { id: a.reminder.id }, { active: false });
    const s = new FakeSender();
    const r = await dispatchDue(db, s, t(FIRE) + 1000);
    expect(s.sent).toHaveLength(0);
    expect(r.skipped).toBe(1);
  });
  it("ignores expired reminders (no late alert)", async () => {
    const db = new MemoryDb();
    const a = await seed(db, A, FIRE);
    const s = new FakeSender();
    const r = await dispatchDue(db, s, t(FIRE) + 3 * 3600_000);
    expect(s.sent).toHaveLength(0);
    expect(r.expired).toBe(1);
    expect((await db.select("reminder_occurrences", { id: a.occurrence.id }))[0]!.status).toBe("expired");
  });
  it("retries a limited number of times with backoff, then succeeds without double send", async () => {
    const db = new MemoryDb();
    const a = await seed(db, A, FIRE);
    const s = new FakeSender();
    s.status = 500;
    const t0 = t(FIRE) + 1000;
    expect((await dispatchDue(db, s, t0)).retried).toBe(1);
    expect((await dispatchDue(db, s, t0 + 60_000)).claimed).toBe(0); // backoff not over
    s.status = 201;
    expect((await dispatchDue(db, s, t0 + 3 * 60_000)).sent).toBe(1);
    expect((await db.select("reminder_occurrences", { id: a.occurrence.id }))[0]!.status).toBe("accepted");
    expect(await db.select("notification_attempts", {})).toHaveLength(1);
  });
  it("gives up after the maximum attempts", async () => {
    const db = new MemoryDb();
    const a = await seed(db, A, FIRE);
    const s = new FakeSender();
    s.status = 500;
    let now = t(FIRE) + 1000;
    for (let i = 0; i < 8; i++) { await dispatchDue(db, s, now); now += 10 * 60_000; }
    expect(s.sent.length).toBeLessThanOrEqual(4);
    expect((await db.select("reminder_occurrences", { id: a.occurrence.id }))[0]!.status).toBe("failed");
  });
  it("disables an expired subscription (410)", async () => {
    const db = new MemoryDb();
    await seed(db, A, FIRE);
    const s = new FakeSender();
    s.status = 410;
    await dispatchDue(db, s, t(FIRE) + 1000);
    expect((await listSubscriptions(db, A))[0]!.active).toBe(false);
  });
  it("drops a reminder that would only be allowed after its expiry window (quiet hours)", async () => {
    const db = new MemoryDb();
    const a = await seed(db, A, "2025-06-01T23:00:00Z"); // expiry 120 min, quiet hours end in 8 h
    await updateProfile(db, A, { quiet_start: "22:00", quiet_end: "07:00" });
    const s = new FakeSender();
    await dispatchDue(db, s, t("2025-06-01T23:01:00Z"));
    expect(s.sent).toHaveLength(0);
    expect((await db.select("reminder_occurrences", { id: a.occurrence.id }))[0]!.status).toBe("expired");
  });
  it("holds a reminder during quiet hours until they end", async () => {
    const db = new MemoryDb();
    const task = await createTask(db, A, { title: "Long window" });
    const a = await createReminder(db, A, { taskId: task.id, remindAt: "2025-06-01T23:00:00Z", expiryMinutes: 720 });
    await updateProfile(db, A, { quiet_start: "22:00", quiet_end: "07:00" });
    await saveSubscription(db, A, { endpoint: "https://push.example.com/user-a", p256dh: "k", auth: "a" });
    const s = new FakeSender();
    await dispatchDue(db, s, t("2025-06-01T23:01:00Z"));
    expect(s.sent).toHaveLength(0);
    const o = (await db.select("reminder_occurrences", { id: a.occurrence.id }))[0]!;
    expect(o.status).toBe("scheduled");
    expect(o.next_attempt_at).toBe("2025-06-02T07:00:00.000Z");
  });
});

describe("snooze and reschedule", () => {
  it("moves only the chosen occurrence", async () => {
    const db = new MemoryDb();
    const task = await createTask(db, A, { title: "Meds" });
    const { reminder, occurrence } = await createReminder(db, A, { taskId: task.id, remindAt: "2025-06-01T08:00:00Z", repeat: "daily" });
    const second = (await materializeNext(db, reminder, t("2025-06-01T08:00:00Z")))!;
    const now = t("2025-06-01T08:01:00Z");
    const moved = await snooze(db, A, occurrence.id, "10m", now);
    expect(moved.id).toBe(occurrence.id);
    expect(moved.fire_at).toBe("2025-06-01T08:11:00.000Z");
    expect((await db.select("reminder_occurrences", { id: second.id }))[0]!.fire_at).toBe(second.fire_at);
    expect((await snooze(db, A, occurrence.id, "1h", now)).fire_at).toBe("2025-06-01T09:01:00.000Z");
  });
  it("tomorrow morning is 09:00 in the user's zone; reschedule rejects the past", async () => {
    const db = new MemoryDb();
    await updateProfile(db, A, { time_zone: "America/New_York" });
    const task = await createTask(db, A, { title: "x" });
    const { occurrence } = await createReminder(db, A, { taskId: task.id, remindAt: "2025-06-01T15:00:00Z" });
    const now = t("2025-06-01T15:00:00Z");
    expect((await snooze(db, A, occurrence.id, "tomorrow", now)).fire_at).toBe("2025-06-02T13:00:00.000Z");
    expect((await reschedule(db, A, occurrence.id, "2025-06-05T12:00:00Z", now)).fire_at).toBe("2025-06-05T12:00:00.000Z");
    await expect(reschedule(db, A, occurrence.id, "2020-01-01T00:00:00Z", now)).rejects.toMatchObject({ status: 400 });
  });
  it("a snoozed reminder is not sent early", async () => {
    const db = new MemoryDb();
    const a = await seed(db, A, FIRE);
    await snooze(db, A, a.occurrence.id, "1h", t(FIRE));
    const s = new FakeSender();
    await dispatchDue(db, s, t(FIRE) + 5 * 60_000);
    expect(s.sent).toHaveLength(0);
    await dispatchDue(db, s, t(FIRE) + 61 * 60_000);
    expect(s.sent).toHaveLength(1);
  });
});

describe("time zones", () => {
  const ny = (remind_at: string, repeat: "daily" | "monthly", dom: number | null = null) =>
    ({ repeat, time_zone: "America/New_York", local_time: "08:00", day_of_month: dom, remind_at });
  it("daily 8:00 stays 8:00 local across spring-forward and fall-back", () => {
    const r = ny("2025-03-08T13:00:00Z", "daily");
    expect(new Date(nextOccurrenceAfter(r, t("2025-03-08T13:00:00Z"))!).toISOString()).toBe("2025-03-09T12:00:00.000Z");
    const f = ny("2025-11-01T12:00:00Z", "daily");
    expect(new Date(nextOccurrenceAfter(f, t("2025-11-01T12:00:00Z"))!).toISOString()).toBe("2025-11-02T13:00:00.000Z");
  });
  it("monthly on the 31st falls back to the last day of short months, then returns to the 31st", () => {
    const r = { repeat: "monthly" as const, time_zone: "America/New_York", local_time: "09:00", day_of_month: 31, remind_at: "2025-01-31T14:00:00Z" };
    const feb = nextOccurrenceAfter(r, t("2025-01-31T14:00:00Z"))!;
    expect(new Date(feb).toISOString()).toBe("2025-02-28T14:00:00.000Z");
    expect(new Date(nextOccurrenceAfter(r, feb)!).toISOString()).toBe("2025-03-31T13:00:00.000Z");
    const leap = { ...r, remind_at: "2024-01-31T14:00:00Z" };
    expect(new Date(nextOccurrenceAfter(leap, t("2024-01-31T14:00:00Z"))!).toISOString()).toBe("2024-02-29T14:00:00.000Z");
  });
});

describe("draft recovery", () => {
  it("a draft is still there after a reload and is cleared after saving", async () => {
    await saveDraft("new-note", "Call the dentist", "cid-1");
    const back = await loadDraft("new-note"); // a fresh connection, like a page reload
    expect(back?.text).toBe("Call the dentist");
    expect(back?.clientId).toBe("cid-1");
    await clearDraft("new-note");
    expect(await loadDraft("new-note")).toBeNull();
  });
});

describe("labels", () => {
  it("uses the honest wording", () => {
    expect(statusLabel("scheduled")).toBe("Scheduled");
    expect(statusLabel("accepted")).toBe("Accepted by push service");
    expect(OFFLINE_LABEL).toBe("Saved on this device. Reminder is not scheduled yet.");
  });
});

describe("export and delete account", () => {
  it("exports only the caller's data in JSON and Markdown", async () => {
    const { db } = await twoUsers();
    const out = await exportAll(db, A);
    expect(out.json.notes).toHaveLength(1);
    expect(out.markdown).toContain(`secret of ${A}`);
    expect(out.markdown).not.toContain(`secret of ${B}`);
    expect(JSON.stringify(out.json)).not.toContain(B);
  });
  it("deleting an account removes all of its rows and keeps other users", async () => {
    const { db } = await twoUsers();
    await deleteAccountData(db, A);
    for (const tbl of ["notes", "note_versions", "tasks", "reminders", "reminder_occurrences", "push_subscriptions", "audit_events"] as const) {
      expect(await db.select(tbl, { user_id: A } as never)).toHaveLength(0);
    }
    expect(await db.select("profiles", { id: A })).toHaveLength(0);
    expect(await db.select("notes", { user_id: B })).toHaveLength(1);
    expect(await db.select("reminder_occurrences", { user_id: B })).toHaveLength(1);
    expect((await db.select("deletion_jobs", { user_id: A }))[0]!.status).toBe("done");
  });
});
