import { localParts, zonedToUtc } from "./time";

export interface RawAiTask {
  text: string;
  source_quote: string;
  proposed_due: string | null;
  proposed_reminder: string | null;
  needs_clarification: boolean;
  ambiguity_note: string | null;
}
export interface ValidatedAiTask extends RawAiTask {
  resolved_due: string | null;
  resolved_reminder: string | null;
  ambiguity_note: string | null;
}
export interface AiResolution {
  instant: string | null;
  needsClarification: boolean;
  note: string | null;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};
const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function clock(raw: string): { h: number; min: number } | null {
  if (/\bnoon\b/i.test(raw)) return { h: 12, min: 0 };
  if (/\bmidnight\b/i.test(raw)) return { h: 0, min: 0 };
  const m = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i.exec(raw)
    ?? /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(raw)
    ?? /\b(\d{1,2})\s*(am|pm)\b/i.exec(raw);
  if (!m) return null;
  let h = Number(m[1]);
  const meridiemValue = m[3] ?? (m[2] && /^(?:am|pm)$/i.test(m[2]) ? m[2] : undefined);
  const meridiem = meridiemValue?.toLowerCase();
  const minutes = meridiemValue === m[2] ? "0" : m[2];
  const min = Number(minutes ?? (meridiem ? "0" : "missing"));
  if (!Number.isInteger(min) || min > 59) return null;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (meridiem === "pm" ? 12 : 0);
  } else if (h > 23) return null;
  return { h, min };
}

function atLocal(day: Date, time: { h: number; min: number }, tz: string): string {
  return new Date(zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), time.h, time.min, tz)).toISOString();
}

/** Model output stays a proposal. Only exact, grounded clock times become instants. */
export function resolveAiDate(raw: string | null, noteCreatedAt: string, timeZone: string): AiResolution {
  if (raw === null || !raw.trim()) return { instant: null, needsClarification: false, note: null };
  const value = raw.trim();
  const unclear = (note: string): AiResolution => ({ instant: null, needsClarification: true, note });
  if (/(?<![\d/-])\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(value)) {
    return unclear("This numeric date is ambiguous. Choose the exact month and day.");
  }
  if (/\b(after|before|on|around)\s+(payday|then|later)|\b(sometime|eventually|later)\b/i.test(value)) {
    return unclear("No exact date and time were stated. Choose one before scheduling.");
  }
  const time = clock(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
  if (iso) {
    if (!iso[6]) {
      const ms = zonedToUtc(Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4]), Number(iso[5]), timeZone);
      return { instant: new Date(ms).toISOString(), needsClarification: false, note: null };
    }
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? unclear("Choose a valid date and time.") : { instant: new Date(ms).toISOString(), needsClarification: false, note: null };
  }
  const explicitDay = /^(\d{4})-(\d{2})-(\d{2})(?:\s+at\s+.*)?$/i.exec(value);
  const anchor = localParts(Date.parse(noteCreatedAt), timeZone);
  const today = new Date(Date.UTC(anchor.y, anchor.m - 1, anchor.d));
  let day: Date | null = null;
  if (explicitDay) day = new Date(Date.UTC(Number(explicitDay[1]), Number(explicitDay[2]) - 1, Number(explicitDay[3])));
  else if (/^(?:today\s+)?at\s+/i.test(value) || /^\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(value)) day = today;
  else if (/\btomorrow\b/i.test(value)) day = new Date(today.getTime() + 86_400_000);
  else {
    const weekday = Object.keys(WEEKDAYS).find((name) => new RegExp(`\\b(?:next\\s+)?${name}\\b`, "i").test(value));
    if (weekday) {
      const next = new RegExp(`\\bnext\\s+${weekday}\\b`, "i").test(value);
      const delta = ((WEEKDAYS[weekday]! - today.getUTCDay() + 7) % 7 || 7) + (next ? 7 : 0);
      day = new Date(today.getTime() + delta * 86_400_000);
    }
  }
  if (!day || Number.isNaN(day.getTime())) return unclear("Choose an exact date and time.");
  if (!time) return unclear(`A date was given (${localDate(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate())}), but no exact time. Choose a time.`);
  return { instant: atLocal(day, time, timeZone), needsClarification: false, note: null };
}

/** Past-tense completions are records, not new tasks. This is a backend guard, not model reasoning. */
export function isCompletedEvent(quote: string): boolean {
  return /\b(?:i\s+)?(?:already\s+)?(?:paid|completed|finished|called|attended|submitted)\b/i.test(quote)
    || /\b(?:went\s+to|did)\b.*\b(?:yesterday|last\s+(?:night|week|month)|already)\b/i.test(quote);
}

function cleanString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;
}

/** Strict whitelist parsing. A malformed task is dropped; no model field is passed through blindly. */
export function validateAiExtraction(value: unknown, noteText: string, noteCreatedAt: string, timeZone: string): { title: string; tasks: ValidatedAiTask[] } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const title = cleanString(root["title"], 300);
  if (!title || !Array.isArray(root["tasks"])) return null;
  const tasks: ValidatedAiTask[] = [];
  for (const candidate of root["tasks"].slice(0, 20)) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) continue;
    const raw = candidate as Record<string, unknown>;
    const text = cleanString(raw["text"], 300);
    const quote = cleanString(raw["source_quote"], 1000);
    if (!text || !quote || !noteText.includes(quote) || isCompletedEvent(quote)) continue;
    const dueRaw = raw["proposed_due"] ?? null;
    const reminderRaw = raw["proposed_reminder"] ?? null;
    if ((dueRaw !== null && typeof dueRaw !== "string") || (reminderRaw !== null && typeof reminderRaw !== "string")) continue;
    if (typeof raw["needs_clarification"] !== "boolean") continue;
    const suppliedNote = raw["ambiguity_note"];
    if (suppliedNote !== null && suppliedNote !== undefined && typeof suppliedNote !== "string") continue;
    const due = resolveAiDate(dueRaw, noteCreatedAt, timeZone);
    const reminder = resolveAiDate(reminderRaw, noteCreatedAt, timeZone);
    const ambiguousNumericDate = /(?<![\d/-])\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(quote);
    const flagged = raw["needs_clarification"] === true || ambiguousNumericDate;
    const needs = flagged || due.needsClarification || reminder.needsClarification;
    const note = [flagged ? cleanString(suppliedNote, 500) ?? (ambiguousNumericDate ? "This date has more than one interpretation." : "Clarification is needed before scheduling.") : null, due.note, reminder.note].filter(Boolean).join(" ") || null;
    tasks.push({
      text, source_quote: quote, proposed_due: dueRaw, proposed_reminder: reminderRaw,
      resolved_due: flagged ? null : due.instant, resolved_reminder: flagged ? null : reminder.instant,
      needs_clarification: needs, ambiguity_note: note,
    });
  }
  return { title, tasks };
}
