import "server-only";
import { AI_MAX_TASKS, AI_NOTE_LIMIT, type AiUsageResult } from "../core/aiService";
import { validateAiExtraction } from "../core/ai";

export interface AiLimits {
  dailyJobs: number;
  monthlyUserJobs: number;
  monthlyGlobalJobs: number;
  monthlyBudgetCents: number;
  reserveCents: number;
  maxOutputTokens: number;
}

const integer = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

export function aiConfig() {
  const baseUrl = process.env.AI_BASE_URL?.replace(/\/$/, "") ?? "";
  const apiKey = process.env.AI_API_KEY ?? "";
  const model = process.env.AI_EXTRACTION_MODEL ?? "";
  const limits: AiLimits = {
    dailyJobs: integer(process.env.AI_USER_DAILY_QUOTA, 20, 1, 1000),
    monthlyUserJobs: integer(process.env.AI_USER_MONTHLY_QUOTA, 200, 1, 100000),
    monthlyGlobalJobs: integer(process.env.AI_GLOBAL_MONTHLY_QUOTA, 10000, 1, 10000000),
    monthlyBudgetCents: integer(process.env.AI_MONTHLY_BUDGET_CENTS, 1000, 0, 100000000),
    reserveCents: integer(process.env.AI_RESERVE_CENTS, 5, 0, 100000),
    maxOutputTokens: integer(process.env.AI_MAX_OUTPUT_TOKENS, 900, 64, 4096),
  };
  return { configured: Boolean(baseUrl && apiKey && model), baseUrl, apiKey, model, limits };
}

function messageText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;
  const text = value.map((part) => typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text" ? (part as { text?: unknown }).text : "").join("");
  return typeof text === "string" ? text : null;
}

export type AiExtractor = typeof extractWithModel;

/** Server only. Model and endpoint come exclusively from process.env; caller input cannot override either. */
export async function extractWithModel(noteText: string, noteCreatedAt: string, timeZone: string): Promise<{ value: unknown; usage: AiUsageResult }> {
  const config = aiConfig();
  if (!config.configured) throw new Error("ai_not_configured");
  if (noteText.length > AI_NOTE_LIMIT) throw new Error("note_too_large");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      cache: "no-store",
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: config.limits.maxOutputTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Extract only explicit future tasks from a personal note. Return JSON with title and tasks array. Each task has text, source_quote, proposed_due, proposed_reminder, needs_clarification, ambiguity_note. source_quote must be an exact verbatim substring of the note. Never invent deadlines. Completed events and notes without tasks produce an empty tasks array. Use null for unscheduled or unclear values. Do not include confidence scores, explanations, tools, or extra fields." },
          { role: "user", content: JSON.stringify({ note_created_at: noteCreatedAt, time_zone: timeZone, note: noteText }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`ai_http_${response.status}`);
    const payload = await response.json() as Record<string, unknown>;
    const choice = Array.isArray(payload["choices"]) ? payload["choices"][0] : null;
    const message = typeof choice === "object" && choice !== null ? (choice as Record<string, unknown>)["message"] : null;
    const content = messageText(typeof message === "object" && message !== null ? (message as Record<string, unknown>)["content"] : null);
    if (!content) throw new Error("ai_empty_response");
    let value: unknown;
    try { value = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")); }
    catch { throw new Error("ai_invalid_json"); }
    const usage = typeof payload["usage"] === "object" && payload["usage"] !== null ? payload["usage"] as Record<string, unknown> : {};
    return { value, usage: {
      inputTokens: Math.max(0, Math.floor(Number(usage["prompt_tokens"]) || 0)),
      outputTokens: Math.max(0, Math.floor(Number(usage["completion_tokens"]) || 0)),
      actualCents: 0,
      requestId: typeof payload["id"] === "string" ? payload["id"].slice(0, 120) : null,
    } };
  } finally {
    clearTimeout(timeout);
  }
}

/** Reused by the sample-note suite to prove parser behavior independently of a live provider. */
export function validateMockedModel(value: unknown, text: string, createdAt: string, zone: string) {
  const result = validateAiExtraction(value, text, createdAt, zone);
  return result ? { ...result, tasks: result.tasks.slice(0, AI_MAX_TASKS) } : null;
}
