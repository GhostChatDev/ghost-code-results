# Ghost Code results

Real apps built by **Ghost Code** (the coding agents in [Ghost Chat](https://ghostchat.tech)), with the agent
**Ghost Coded**, each from a single prompt, then checked automatically. Every app here was written by Ghost Code,
not by hand. We publish the cost, how long it took, what passed, and the Ghost Code bugs each test exposed.

These are our own tests, not a guarantee for every app.

## How the tests run

- The real Ghost Code agent loop, tools and prompts, with real AI models (through OpenRouter).
- A stand-in GitHub on our test machine: when Ghost Code commits, the app's own checks really run
  (install, build, tests) plus Ghost Code's browser check in a real Chromium (it opens the app, presses
  every button, adds something, refreshes, and tries a second browser). Background rounds of about
  5 minutes run like they do on ghostchat.tech.
- Cost is read from the real OpenRouter bill. These runs had no sandbox computer, so build errors were
  found by the GitHub checks (a slower, costlier loop than on ghostchat.tech, where Ghost Code can build
  in its own sandbox before committing).

## Full builds (one long prompt each)

| App | Prompt | Result | Time | Rounds | Commits | AI cost |
|---|---|---|---|---|---|---|
| [Confirm & Remind, Phase 1](confirm-and-remind-phase-1/) | [PROMPT.txt](confirm-and-remind-phase-1/PROMPT.txt): notes, reminders, Supabase auth + RLS, Web Push, IndexedDB drafts, PWA, tests | **Passed**: build, tests and browser check | 22 min | 6 | 15 | ~$2.47 |
| [SlotWise booking app](slotwise-booking/) | [PROMPT.txt](slotwise-booking/PROMPT.txt): email sign-in, owner/customer roles, week calendar slots, no double booking (enforced in the database), 2-hour cancel rule, Postgres + Prisma, tests | **Passed**: build, tests and browser check | 29 min | 8 | 12 | ~$2.36 |
| [Lantern Drift (original game)](lantern-drift-game/) | [PROMPT.txt](lantern-drift-game/PROMPT.txt): canvas platformer, fixed-step physics, wind and floating, 5 levels, 2 enemies, touch controls, saved progress, Web Audio sounds, level editor, tests | **Passed**: build, tests and browser check | 27 min | 8 | 20 | ~$2.34 |
| [Confirm & Remind, Phase 2](confirm-and-remind-phase-2/) | [PROMPT.txt](confirm-and-remind-phase-2/PROMPT.txt): AI suggestions for notes, nothing scheduled until the person confirms, quotas and budget, 30 sample notes | **Did not pass** ([our review](confirm-and-remind-phase-2/REVIEW.md)): checks were green, but the database change doesn't install and one tap can make two reminders | 24.5 min | 7 | 17 | ~$2.52 (all attempts ~$12.80) |

**What the booking app proved, in its own words:** no overlapping bookings (including two at the same
moment, enforced by the database), time-zone-aware slots and the cancellation rule are covered by passing
tests; the full sign-in and booking flows in a browser were not clicked through end to end.

The booking and game costs are split from one shared OpenRouter bill by the tokens each used (they ran at
the same time).

### Bugs the hard apps exposed (fixed)

- **A model wrote its tool call as text** (`<|open|>tools…`), and that became the game's final answer.
  Known tool-call markup is now cut before anything reaches the person.
- Our own test machine: a full disk and an over-eager clean-up script broke one earlier booking run; it was
  re-run from scratch for the result above.

**What it can't test here** (as the prompt itself asked to note): real Supabase, real push delivery and
real phones. The app runs in its documented mock mode for those; see its README.

### Ghost Code bugs this full build exposed (all fixed, November 20, 2026)

The same prompt was run five times. The first four runs stopped on a Ghost Code bug, which was fixed
before the next run:

1. **`.env.example` treated as a secret file**: the first commit (the whole app) was refused. Templates
   are allowed now; real `.env` files stay protected. One blocked file no longer sinks a whole commit.
2. **Next.js folders like `[id]` and `[...path]` couldn't be committed** (brackets weren't allowed in paths).
3. **The new privacy rule stopped its own work**: Ghost Code may never change sign-in or "who can see what"
   without the person's tap (added after an agent once signed every visitor in as one shared user to pass a
   check). The first versions also stopped a build that was editing sign-in code it had just written, and
   one triggered on the TypeScript keyword `private`. The rule now holds changes to the person's own
   sign-in code, or any sign-in change made right after the check found one browser's data visible to another.
4. **A save of "every file ever written"** went past GitHub's 25-files-per-commit limit. It now commits only
   what changed, in parts of 25.

Also fixed today from a live build of the same app: the budget now stops a whole session (it reset on
every message), old tool output is cleared so later steps stay cheap, the browser check understands
sign-in screens, empty commits are skipped, and real secret keys are refused at commit.

## The 50-app test (November 20, 2026)

50 different apps (to-do lists, shops with a database, apps with accounts, dashboards, games and more),
each built end to end by Ghost Coded and checked in a real browser:

- **48 of 50 passed the first time** (96%); the other 2 were fixed the same day (one Ghost Code bug, one
  bug in the check itself).
- About **10 minutes** and **44 steps** per app on average; about **$0.84** of AI per app.

---
Ghost Chat is built with Claude Code.
