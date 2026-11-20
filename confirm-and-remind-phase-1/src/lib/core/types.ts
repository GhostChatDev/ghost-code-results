// Row types mirror the Postgres columns 1:1 (snake_case), so one service layer works on both the
// in-memory test database and Supabase.
export type TaskStatus = "open" | "done" | "dismissed";
export type Repeat = "none" | "daily" | "weekly" | "monthly";
export type OccStatus = "scheduled" | "queued" | "accepted" | "failed" | "completed" | "cancelled" | "expired";

export interface Profile {
  id: string;
  time_zone: string;
  quiet_start: string | null; // "HH:MM" local
  quiet_end: string | null;
  show_task_title: boolean;
  created_at: string;
}
export interface Note {
  id: string;
  user_id: string;
  original_text: string;
  pinned: boolean;
  version: number;
  client_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface NoteVersion {
  id: string;
  note_id: string;
  user_id: string;
  version: number;
  text: string;
  created_at: string;
}
export interface Task {
  id: string;
  user_id: string;
  note_id: string | null;
  title: string;
  due_at: string | null;
  time_zone: string;
  status: TaskStatus;
  source: "manual" | "ai";
  client_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface Reminder {
  id: string;
  user_id: string;
  task_id: string;
  remind_at: string;
  time_zone: string;
  repeat: Repeat;
  local_time: string; // "HH:MM"
  day_of_month: number | null;
  expiry_minutes: number;
  active: boolean;
  client_id: string | null;
  created_at: string;
}
export interface Occurrence {
  id: string;
  reminder_id: string;
  user_id: string;
  fire_at: string;
  status: OccStatus;
  claimed_by: string | null;
  claimed_until: string | null;
  attempts: number;
  next_attempt_at: string | null;
  created_at: string;
}
export interface PushSub {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string;
  active: boolean;
  failure_count: number;
  created_at: string;
}
export interface Attempt {
  id: string;
  user_id: string;
  occurrence_id: string | null;
  subscription_id: string | null;
  dispatch_key: string;
  status: "queued" | "accepted" | "failed" | "gone";
  http_status: number | null;
  attempt_no: number;
  created_at: string;
}
export interface AuditEvent {
  id: string;
  user_id: string | null;
  kind: string;
  meta: Record<string, unknown>;
  created_at: string;
}
export interface DeletionJob {
  id: string;
  user_id: string;
  status: "pending" | "done" | "failed";
  requested_at: string;
  finished_at: string | null;
}

export interface TableMap {
  profiles: Profile;
  notes: Note;
  note_versions: NoteVersion;
  tasks: Task;
  reminders: Reminder;
  reminder_occurrences: Occurrence;
  push_subscriptions: PushSub;
  notification_attempts: Attempt;
  audit_events: AuditEvent;
  deletion_jobs: DeletionJob;
}
export type TableName = keyof TableMap;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
