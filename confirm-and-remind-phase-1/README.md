# Confirm & Remind

Write it down. Confirm what matters. Get reminded.

A notes and reminders PWA (Next.js, TypeScript, Tailwind, Supabase, Web Push). **Phase 1 only: notes and manual reminders. No AI features yet.**

## Status of this branch

| Part | State |
| --- | --- |
| Database migrations with row-level security | written (`supabase/migrations/0001..0003`), not run against a real Supabase project |
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
4. **Environment**: copy `.env.example` to `.env.local` and fill in the placeholders. The service-role key, the VAPID private key and `CRON_SECRET` are server-only: never expose them to the browser.
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

## What's coming in Phase 2

AI suggestions from notes (tasks, source quotes, proposed due times) and the Review screen. The `ai_suggestions` table and the reserved `AI_*` variables are already in place and stay server-side.
