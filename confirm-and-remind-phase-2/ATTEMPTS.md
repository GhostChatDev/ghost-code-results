# Phase 2: every attempt, against the pass line

The pass line ([NEXT-ATTEMPT.md](NEXT-ATTEMPT.md)) was written before these attempts ran. Costs are read from
the real OpenRouter bill. Run 9 is reviewed in [REVIEW.md](REVIEW.md).

## Attempt 10: did not pass (paused at the step limit)

27.6 minutes · 9 rounds · 150 steps · 17 commits · **$4.54** of its $5.

| Pass line | Result |
|---|---|
| 1. Checks green, database changes install | **Partly.** The last check passed, and all 4 database change files install on Postgres 17 with a row in 11 of 11 tables. The 30 sample notes are tested. Missing from the required tests: "AI can't schedule without a confirmation" and "an AI outage or empty budget leaves notes working". |
| 2. Our review test, unchanged | **2 of 4 pass.** The four cases are unchanged; this build names its functions differently, so a small adapter ([review-adapter.attempt10.ts](tests/review-adapter.attempt10.ts)) forwards them to the functions its own API routes call, adding nothing. Control: the same cases through run 9's adapter give run 9's published result (3 pass, 1 fail). **Passes:** the background job creates no reminder; someone else can't confirm your suggestion. **Fails:** two confirms at the same moment make **two reminders** (the in-memory store has no lock), and **Dismiss, then the job runs again** brings the dismissed suggestion back as a new one (no reminder is created, but the database function `ai_reserve` also allows a second job for the same note version). **In production, Confirm fails on every call** on a real Postgres: the database function `ai_confirm` errors with `column reference "n.id" is ambiguous` (a variable and a table nickname share the name `n`). *Correction: we first published, from reading the code, that confirming was "serialised by a lock inside one server process only". That was the wrong function: the button doesn't use it.* Also noted, not on the pass line: every user's AI reservation waits on one shared database lock (`pg_advisory_xact_lock(842991)`), fine for a few users, a bottleneck at scale. |
| 3. A real save read back from a real database | **Missing:** no test uses a real database. |
| 4. Money comes back after a crash | **Missing:** no test stops a job after it reserved. |

**What it proved about Ghost Code:** in round 1, Ghost Code's new database check caught the same bug that
sank run 9 (`relation "ai_suggestions" already exists`), on the first commit, and Ghost Code fixed it in round
2. In run 9 that bug went unnoticed to the end. **What it exposed in Ghost Code:** its database check installs database functions but never calls one, and an error like the one above only shows when a function runs. The app's own tests use an in-memory stand-in, so they never ran it either. The fix is in Ghost Code's check: call every database function once with empty input, always rolled back.

**Why it stopped:** Ghost Code pauses a task at 150 steps and asks the person whether to go on. Phase 2,
with the stricter done rules, needs more than that. Ghost Code said plainly that the work wasn't verified.

**Next (attempt 11):** the same prompt, with the test runner tapping Continue at that pause the way a person
would, inside the same $5 limit.

## Attempt 11: did not pass (close: one item fully, two in part)

35.4 minutes · 10 rounds · 20 commits · **$3.46** of its $5, of which about $0.15 was our own cache experiment
on the same key (the guard counts the whole key). It ended early because of **a bug in our test runner**: after
tapping Continue at Ghost Code's 150-step pause, the runner kept counting rounds from 10 instead of 1, so Ghost
Code's per-message round limit ended the new message after one round. Fixed in the runner; it cost this attempt
about $1.50 of its allowance.

| Pass line | Result |
|---|---|
| 1. Checks green, database changes install | **Fails on one thing.** The last check passed, and the app's own tests pass (63, plus 1 that needs a local Supabase). But it added `0003_ai.sql` next to Phase 1's `0003_claim_due.sql`: Supabase records changes by that number, so the two clash when deployed (Ghost Code's check now catches this). With the new file renumbered, everything installs on Postgres 17 with a row in 11 of 11 tables, and all 7 database functions run without a code error. |
| 2. Our review test, unchanged | **4 of 4 pass** through the in-memory path ([adapter](tests/review-adapter.attempt11.ts), the same four cases word for word): the job creates no reminder, someone else can't confirm yours, a dismissed suggestion doesn't come back, and **one tap makes one reminder**. **But production Confirm fails** whenever there is a reminder time: two confirms on a real Postgres both failed with `column "local_time" is of type time without time zone but expression is of type text`. No reminder is created, and the suggestion stays pending. (Its database lock and its one-key-per-suggestion design are right; it fails before it gets there.) |
| 3. A real save read back from a real database | **Written, not run here.** `tests/database.integration.test.ts` saves and confirms through the app's real Supabase code, and the app's CI starts a local Supabase and requires that test. Our test machine's stand-in CI doesn't run that job, and starting a local Supabase here was blocked by our machine's safety rules. On GitHub this test would very likely have caught both problems above. |
| 4. Money comes back after a crash | **Passes.** A 2-minute lease on each job; the expiry runs before every new reservation. Tested in memory by its own test ("releases a crashed worker's reserved budget") and by us on a real Postgres: a crashed worker's reservation went back to $0 and the job back to the queue. |

**What it showed about Ghost Code's new checks:** the database check caught the duplicate table (round 3) and,
with a row already in every table, a new required column with no default (`note_id … contains null values`,
round 8); Ghost Code fixed both. **What they don't cover yet:** calling each database function with empty
input stops at its first statement, so a type error deeper in (like the one above) needs a real call with real
input: the app's own database test, which our stand-in CI doesn't run.
