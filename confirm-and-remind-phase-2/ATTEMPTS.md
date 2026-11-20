# Phase 2: every attempt, against the pass line

The pass line ([NEXT-ATTEMPT.md](NEXT-ATTEMPT.md)) was written before these attempts ran. Costs are read from
the real OpenRouter bill. Run 9 is reviewed in [REVIEW.md](REVIEW.md).

## Attempt 10: did not pass (paused at the step limit)

27.6 minutes · 9 rounds · 150 steps · 17 commits · **$4.54** of its $5.

| Pass line | Result |
|---|---|
| 1. Checks green, database changes install | **Partly.** The last check passed, and all 4 database change files install on Postgres 17 with a row in 11 of 11 tables. The 30 sample notes are tested. Missing from the required tests: "AI can't schedule without a confirmation" and "an AI outage or empty budget leaves notes working". |
| 2. Our review test, unchanged | **Couldn't run** (this build names its files differently), so we tested the real thing instead. **Confirm doesn't work in production:** the real Confirm button calls the database function `ai_confirm`, and on a real Postgres every call fails with `column reference "n.id" is ambiguous` (a variable and a table nickname share the name `n`). No reminder is ever created, by one tap or two, because Confirm itself is broken. *Correction: we first published, from reading the code, that confirming was "serialised by a lock inside one server process only". That was the wrong function: the button doesn't use it. The function it does use has a proper database lock, but fails before it gets that far.* |
| 3. A real save read back from a real database | **Missing:** no test uses a real database. |
| 4. Money comes back after a crash | **Missing:** no test stops a job after it reserved. |

**What it proved about Ghost Code:** in round 1, Ghost Code's new database check caught the same bug that
sank run 9 (`relation "ai_suggestions" already exists`), on the first commit, and Ghost Code fixed it in round
2. In run 9 that bug went unnoticed to the end. **What it exposed in Ghost Code:** its database check installs database functions but never calls one, and an error like the one above only shows when a function runs. The app's own tests use an in-memory stand-in, so they never ran it either. The fix is in Ghost Code's check: call every database function once with empty input, always rolled back.

**Why it stopped:** Ghost Code pauses a task at 150 steps and asks the person whether to go on. Phase 2,
with the stricter done rules, needs more than that. Ghost Code said plainly that the work wasn't verified.

**Next (attempt 11):** the same prompt, with the test runner tapping Continue at that pause the way a person
would, inside the same $5 limit.
