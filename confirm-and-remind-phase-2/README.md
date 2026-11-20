# Confirm & Remind

Write it down. Confirm what matters. Get reminded.

A notes and reminders PWA (Next.js, TypeScript, Tailwind, Supabase, Web Push). **Phase 2 adds optional, user-confirmed AI suggestions; saving notes never depends on AI.**

## Status of this branch

| Part | State |
| --- | --- |
| Database migrations with row-level security | written (`supabase/migrations/0001..0004`, including AI usage and suggestions), not run against a real Supabase project |
| Core logic (notes, versions, tasks, reminders, snooze, reschedule, time zones, dispatch, export, delete) | written, with tests in `tests/` using an in-memory database |
| API routes with ownership checks and rate limits | written (`src/app/api`) |
| Service worker, manifest, icon | written (`public/`) |
| Screens (Today, Notes, Upcoming, Settings, Review), sign-in UI, IndexedDB draft capture | written; type-checked and built in CI |
| Mock mode | with no `SUPABASE_URL` set, the server uses an in-memory database and a local sign-in so the app can be tried without Supabase. Data is lost when the server restarts. Never use it in production |
| Real-browser click test | run by the "Ghost Screenshots" CI job (see its logs) |
| Real-phone push test, real Supabase project, real VAPID send | **not done: you must do these by hand** |

## Setup

1. **Supabase project**: create one at supabase.com. Copy the project URL, the anon key and the service-role key.
2. **Migrations**: run the files in `supabase/migrations/` in order (`supabase db push`, or paste them into the SQL editor).
3. **VAPID keys**: `npm run vapid` prints a public and a private key.
4. **Environment**: copy `.env.example` to `.env.local` and fill in the placeholders. The service-role key, VAPID private key, `CRON_SECRET`, and every `AI_*` value are server-only: never expose them to the browser or use a `NEXT_PUBLIC_` prefix. Leave `AI_BASE_URL`, `AI_API_KEY`, and `AI_EXTRACTION_MODEL` empty to disable model calls.
5. **Scheduler**: call `POST /api/cron/dispatch` every minute with the header `Authorization: Bearer <CRON_SECRET>` (Supabase pg_cron + pg_net, Vercel Cron, or any external cron). Without `CRON_SECRET` the endpoint stays closed.
6. `npm install`, `npm run dev`.

## Tests

`npm test` runs the Vitest suite. `npm run typecheck` runs TypeScript.

## Testing push on real devices

Push needs HTTPS (or localhost). Set `APP_ORIGIN` to your site.

- **iPhone**: Safari does not allow push in a normal tab. Add the app to the Home Screen, open it from the icon, then tap Enable notifications. Needs iOS 16.4 or later.
- **Android (Chrome)**: open the site, tap Enable notifications, then Send test notification.
- **Desktop (Chrome, Edge, Firefox)**: same as Android.

## Known limits

- Delivery is not guaranteed. A push service accepting a message does not mean the device showed it.
- Reminders are not exact-time alarms: the scheduler runs about once a minute, and the phone may delay delivery.
- Notes are protected by account sign-in and row-level security. They are **not** end-to-end encrypted.
- Monthly reminders on the 31st: in months with fewer days, the reminder moves to the last day of that month.
- The rate limiter keeps counts in server memory, so it is per server instance.

## Phase 2: AI suggestions with explicit confirmation

AI is off by default. Enable it in **Settings** after configuring the server variables. Settings explains that the note text, its creation time, and your time zone are sent to the configured model provider.

- The original note is saved first. Extraction runs afterward in `after(...)` and cannot block the save; an outage, invalid JSON, or exhausted budget never disables notes or manual reminders.
- The model can only propose tasks and dates. It cannot schedule, edit, delete, complete, or invoke tools. Review shows the exact source quote, full resolved date, proposed reminder, and time zone. **Confirm**, **Edit**, and **Dismiss** are separate actions; only an authenticated Confirm creates the reminder.
- Responses are schema-validated. Every `source_quote` must occur verbatim in the saved note. Invalid suggestions are discarded without changing the note. There is no confidence percentage.
- Relative dates use the note's creation time and the user's time zone. Missing times, vague events such as “after payday,” completed events, and ambiguous numeric dates require clarification rather than invented deadlines.
- Editing a note discards stale suggestions and stale jobs cannot overwrite a newer version. Existing confirmed reminders are never changed; the app asks “This note changed. Review its linked reminders?”

All model calls run on the server using `AI_BASE_URL`, `AI_API_KEY`, and `AI_EXTRACTION_MODEL`. The browser cannot select a URL or model. Optional `AI_MONTHLY_BUDGET_USD`, `AI_USER_MONTHLY_QUOTA`, `AI_GLOBAL_MONTHLY_QUOTA`, `AI_NOTE_LIMIT`, and `AI_MAX_OUTPUT_TOKENS` cap spending and work. Concurrent jobs reserve budget before calling the model. `ai_usage` stores request, token, cost, and job metadata only—never note content.

Run migration `0004_ai_phase_2.sql` before enabling AI. Tests in `tests/ai*.test.ts` cover confirmation, source grounding, stale jobs, outage/budget fallback, a 30-note mocked-model matrix, and client-secret boundaries. The real model provider and a production Supabase migration still require manual deployment verification.
