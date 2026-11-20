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
  ai_enabled?: boolean;
}
export type AiNoteStatus = "disabled" | "pending" | "ready" | "empty" | "failed" | "quota_exceeded";
export interface AiSuggestion {
  id: string;
  user_id: string;
  note_id: string;
  note_version: number;
  task_index: number;
  title: string;
  text: string;
  source_quote: string;
  proposed_due: string | null;
  proposed_reminder: string | null;
  resolved_due: string | null;
  resolved_reminder: string | null;
  needs_clarification: boolean;
  ambiguity_note: string | null;
  time_zone: string;
  note_created_at: string;
  status: "pending" | "confirmed" | "dismissed" | "stale";
  confirmed_task_id: string | null;
  confirmed_reminder_id: string | null;
  created_at: string;
}
export interface AiJob {
  id: string;
  user_id: string;
  note_id: string;
  note_version: number;
  note_created_at: string;
  time_zone: string;
  status: "reserved" | "running" | "ready" | "empty" | "failed" | "stale";
  model: string;
  input_tokens: number;
  output_tokens: number;
  reserved_cents: number;
  actual_cents: number;
  request_id: string | null;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
}
export interface AiUsage {
  id: string;
  user_id: string;
  job_id: string;
  note_version: number;
  model: string;
  input_tokens: number;
  output_tokens: number;
  reserved_cents: number;
  actual_cents: number;
  request_id: string | null;
  created_at: string;
}
export interface AiBudget {
  id: string;
  month: string;
  reserved_cents: number;
  spent_cents: number;
  updated_at: string;
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
  ai_status?: AiNoteStatus;
  ai_context_version?: number | null;
  ai_review_pending?: boolean;
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
  ai_suggestions: AiSuggestion;
  ai_jobs: AiJob;
  ai_usage: AiUsage;
  ai_budgets: AiBudget;
}
export type TableName = keyof TableMap;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
