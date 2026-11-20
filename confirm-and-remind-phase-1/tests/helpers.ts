import { MemoryDb } from "../src/lib/core/db";
import type { PushSender, PushTarget, PushPayload } from "../src/lib/core/dispatch";
import { saveSubscription, createNote, createTask, createReminder } from "../src/lib/core/service";

export const A = "user-a";
export const B = "user-b";

export class FakeSender implements PushSender {
  sent: { target: PushTarget; payload: PushPayload }[] = [];
  status = 201;
  async send(target: PushTarget, payload: PushPayload) {
    this.sent.push({ target, payload });
    return { status: this.status };
  }
}

export async function seed(db: MemoryDb, user: string, at: string) {
  await saveSubscription(db, user, { endpoint: `https://push.example.com/${user}`, p256dh: "k", auth: "a" });
  const note = await createNote(db, user, { text: `secret of ${user}` });
  const task = await createTask(db, user, { title: `task of ${user}`, noteId: note.id });
  const { reminder, occurrence } = await createReminder(db, user, { taskId: task.id, remindAt: at });
  return { note, task, reminder, occurrence };
}
