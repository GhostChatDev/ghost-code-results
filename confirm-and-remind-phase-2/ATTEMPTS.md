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
| 2. Our review test, unchanged | **4 of 4 pass** through the in-memory path ([adapter](tests/review-adapter.attempt11.ts), the same four cases word for word) *(Correction to how it was first run: the judge's copy also had an empty `server-only` package added. That stand-in now lives in the published adapter, and the result is the same 4 of 4 with nothing added to the copy.)*: the job creates no reminder, someone else can't confirm yours, a dismissed suggestion doesn't come back, and **one tap makes one reminder**. **But production Confirm fails** whenever there is a reminder time: two confirms on a real Postgres both failed with `column "local_time" is of type time without time zone but expression is of type text`. No reminder is created, and the suggestion stays pending. (Its database lock and its one-key-per-suggestion design are right; it fails before it gets there.) |
| 3. A real save read back from a real database | **Written, not run here.** `tests/database.integration.test.ts` saves and confirms through the app's real Supabase code, and the app's CI starts a local Supabase and requires that test. Our test machine's stand-in CI doesn't run that job, and starting a local Supabase here was blocked by our machine's safety rules. On GitHub this test would very likely have caught both problems above. |
| 4. Money comes back after a crash | **Passes.** A 2-minute lease on each job; the expiry runs before every new reservation. Tested in memory by its own test ("releases a crashed worker's reserved budget") and by us on a real Postgres: a crashed worker's reservation went back to $0 and the job back to the queue. |

**What it showed about Ghost Code's new checks:** the database check caught the duplicate table (round 3) and,
with a row already in every table, a new required column with no default (`note_id … contains null values`,
round 8); Ghost Code fixed both. **What they don't cover yet:** calling each database function with empty
input stops at its first statement, so a type error deeper in (like the one above) needs a real call with real
input: the app's own database test, which our stand-in CI doesn't run.

## Attempt 12: did not pass, on one broken test file (the closest yet)

26 minutes · 8 rounds · **$3.14** of its $5. Ghost Code marked every goal ✅; the judging below is ours.

| Pass line | Result |
|---|---|
| 1. Checks green, database changes install | **Fails, because of one test file.** All 4 database change files install on Postgres 17 with a row in 11 of 11 tables, all 8 database functions run cleanly, the 30 sample notes are tested, and 66 of the app's tests pass. But its own real-database test (`tests/aiPostgres.test.ts`, which its CI runs on a fresh Postgres) **crashes in its setup**: it calls `updateProfile(db, user, { timeZone, aiEnabled })` while the app takes `time_zone` / `ai_enabled`, so the update has nothing to set (`syntax error at or near "where"`) and all 3 of its tests are skipped. On GitHub that CI would be red. We ran it exactly as its CI does, on a fresh `postgres:16-alpine`. |
| 2. Our review test, unchanged | **4 of 4 pass** ([adapter](tests/review-adapter.attempt12.ts); this app asks its model for dates as structured objects, so the cases' one date phrase, "tomorrow at 9am", is written in that form and any other phrase is refused). **And in production:** two confirms at the same moment on a real Postgres returned the **same reminder**: exactly one reminder and one task, stored at 09:00. The first attempt where production Confirm works. |
| 3. A real save read back from a real database | **Fails:** the test that does this is the one above, which never runs. |
| 4. Money comes back after a crash | **Passes.** The job runner releases a crashed worker's reservation before claiming new jobs: tested on a real Postgres, $0.05 reserved went back to $0, the usage record was marked released, and a new worker took the job. |

**Why Ghost Code didn't see it:** our test machine's stand-in CI runs install, build and test, but not the
workflow's own database settings, so that test was skipped there and everything looked green. Real GitHub CI
would have shown the failure and Ghost Code would have fixed it. That gap decided items in attempts 11 and 12,
so the stand-in is being fixed before attempt 13 (see the Ghost Code changes).

**Attempt 12, run again through the fixed stand-in CI** (it now runs a check the way the workflow asks: the
workflow's own Postgres image with its settings, its database URL, and its own steps such as `npm run typecheck`).
On a clean `postgres:16-alpine` the check is **red**, the way GitHub would show it:
- `npm test`: its database test fails with `syntax error at or near "where"`; Postgres's own log shows the
  statement `update profiles set  where id=$1` (the test passes `timeZone` where the app takes `time_zone`).
- `npm run typecheck`: the same test file doesn't compile (`'timeZone' does not exist … did you mean 'time_zone'`,
  and two errors about a `note` field that `Note` doesn't have).

So the failure is **Ghost Code's output** (a test that doesn't compile or run on a clean machine), not our test
machine. Our stand-in only hid it, by skipping the workflow's typecheck step and database settings.
**Machine:** Node v22.23.4; PostgreSQL 16.15 locally; checks use `postgres:16-alpine` (PostgreSQL 16.16), the
image the attempt's own workflow names.

## Attempt 13: did not pass (two items of four; the app itself is the best yet)

28.6 minutes · 9 rounds · **$3.44** of its $5. Ghost Code said "The goal is met on commit `c000023`"; the
judging below is ours, the same four steps as attempt 12, run on an untouched copy of its final code.

| Pass line | Result |
|---|---|
| 1. Checks green, database changes install | **Passes.** The last check passed. All 4 database change files install on Postgres 17 with a row in 11 of 11 tables, and all 5 database functions run cleanly. Re-run through the fixed stand-in CI (the way its workflow asks): install, build, 64 tests (including the 30 sample notes) and `npm run typecheck` all pass. |
| 2. Our review test, unchanged | **4 of 4 pass** ([adapter](tests/review-adapter.attempt13.ts); this app asks its model for exact times, so the cases' one date phrase, "tomorrow at 9am", is written as tomorrow 09:00 UTC, and any other phrase is refused). **And in production:** its Confirm runs inside Postgres (`confirm_ai_suggestion`); **ten** confirms of the same suggestion at the same moment on a real Postgres made exactly **one task, one reminder and one alert**, and all ten got that same reminder back. |
| 3. A real save read back from a real database | **Fails: there is no such test.** Every test uses the in-memory stand-in, and its workflow starts no database. (Its database code is correct where we tested it, see items 2 and 4, but nothing in the app shows that.) |
| 4. Money comes back after a crash | **Fails on the test; the code works.** On a real Postgres: a worker reserved $0.01, a second worker was refused while the first one's lease was live, and two minutes after the first "crashed" the reservation was released and a new worker took the job. Ten workers at once with budget for one: exactly one reservation. But the pass line asks for a test that stops a job mid-way, and the app has none. Also found: the release only happens when another job starts, and nothing re-runs a job whose worker died (no retry route), so that note's suggestions never arrive. |

**What it exposed in Ghost Code:** Ghost Code's done rules already say "every database function the app calls
has a real-database test" and "money comes back after a crash", but they are instructions to the model, not a
check. The model read them, skipped both, and reported the goal met. The fix (before attempt 14): Ghost Code
itself looks at the repository before it accepts "done", and refuses it while an app with database functions
has no test that reaches a real database.

**Machine:** Node v22.23.4; PostgreSQL 16.15 locally (where items 2 and 4 were tested); the database-change check
uses `postgres:17-alpine`. Its workflow names no database image.

## Attempt 14: did not pass (one item of four)

29.6 minutes · 8 rounds · 144 steps · **$1.91** of its $5. Ghost Code said "Phase 2 is complete" and listed
CI and the browser check as passing (true). It also said, correctly, that "real Supabase migration execution …
still require[s] deployment-environment verification".

| Pass line | Result |
|---|---|
| 1. Checks green, database changes install | **Passes.** The last check passed on `c000021`. All 4 database change files install on Postgres 17 with a row in 11 of 11 tables, and 10 database functions run cleanly on empty input. 63 of the app's tests pass. |
| 2. Our review test, unchanged | **4 of 4 pass** on its in-memory path ([adapter](tests/review-adapter.attempt14.ts); this app works the date out from the quote itself, so the cases' model answer goes in unchanged). **But production Confirm fails on every call:** on a real Postgres, `confirm_ai` stops with `column "local_time" is of type time without time zone but expression is of type text` (the same mistake as attempt 11). No task or reminder is ever created; ten taps at once made none. Calling the function with empty input (the database check) returns before that line, and the app's tests use the in-memory stand-in, so nothing showed it. |
| 3. A real save read back from a real database | **Fails: there is no such test.** This is the test that would have caught item 2's bug. |
| 4. Money comes back after a crash | **Fails on the test.** The code has a recovery step (`recover_ai`, run before every reservation), but no test stops a job mid-way. |

**What it exposed in Ghost Code (again):** the done check added after attempt 13 (#258) never ran. It only looked
at files changed in the *current round*, and the last round only touched page files; and its "Not shown yet"
line was only added when the model had been sent back earlier in that round. The fix: the check looks at
everything the task changed on its branch (not one round), and the line is added to any final answer of a
database task that still lacks the proof.

## Attempt 15: all four items pass (first time), with one note on the night limit

35.3 minutes · 9 rounds · 139 steps · **$3.24** of its $5. It ran with the fix from attempt 14 (the done check
looks at the whole task). It stopped at Ghost Code's 9-round limit for one message, saying plainly what was left
(one README correction, not committed); it didn't claim to be done.

| Pass line | Result |
|---|---|
| 1. Checks green, database changes install | **Passes.** The last check passed on `c000027` (CI with its PostgreSQL tests, and Ghost Screenshots). The final commit after it is the round-end save of one file, `README.md`; the app code is the same. Re-run through the fixed stand-in CI on the final code, with the workflow's own `postgres:16-alpine`: install, build, **67 of 67 tests** (including its 4 real-database tests) and `npm run typecheck` pass. All 4 database change files install on Postgres 17 with a row in 11 of 11 tables, and its 8 database functions run cleanly. |
| 2. Our review test, unchanged | **4 of 4 pass** ([adapter](tests/review-adapter.attempt15.ts); this app asks its model for local wall times like "tomorrow at 3pm", so the cases' answer goes in unchanged). **And in production:** its Confirm runs in Postgres (`confirm_ai_suggestion`); **ten** confirms of one suggestion at the same moment made **one task, one reminder and one alert**: the first got `already: false`, the other nine `already: true`. |
| 3. A real save read back from a real database | **Passes.** `tests/aiDatabase.test.ts` runs on the workflow's Postgres: it saves through the app's own database functions (the ones its server code calls, with matching parameter names) and reads back; 8 workers claiming one job at once get exactly 1 claim; a double confirm leaves exactly one task, one reminder and one alert; the recorded usage is the provider's cost with no note text in it. (It calls those functions directly, not through the app's TypeScript wrapper.) |
| 4. Money comes back after a crash | **Passes.** Its test stops a job after it reserved (the provider fails) and shows the reservation released and the job queued again. A worker that dies without reporting is covered too, which we tested on a real Postgres: while its 2-minute lease is live a second worker is refused; after it, the second worker takes the job over and the money held stays at one reservation ($0.0006), never doubled. (That crash case is our test, not the app's.) |

**Note on the night limit:** the guard reads the real bill every 20 seconds. Its last reading as the attempt ended
was $3.06 for the attempt and **$19.86 for the night**, so it never stopped the run. Charges that posted after the
attempt ended bring the night to **$20.04**: 4 cents past the $20 we published. We're stating it as it is.

**Machine:** Node v22.23.4; PostgreSQL 16.15 locally (items 2 and 4); the stand-in CI used the workflow's own
`postgres:16-alpine`; the database-change check uses `postgres:17-alpine`.

## Attempt 16: confirmation run (rules written before it starts)

Attempt 15 passed all four items, but the night's bill ended 4 cents over its $20 limit after late charges. This
run is to settle it: **the same prompt, the same Phase 1 app, the same pass line and the same judging** (the judge
script, a re-run through the stand-in CI, the four cases on its own adapter, real-Postgres tests of Confirm and
of crash recovery), on Ghost Code as merged by #264. **Spending limit: $5 for the attempt** (a fresh budget, read
from the real bill every 20 seconds; reaching it stops the attempt and counts as not passed). Published either way.

**Attempt 16 result: void, our test machine's fault. Not a pass, and not a judgement of the build.**
22 minutes · 11 rounds · **$4.80** of its $5. Our test machine had restarted shortly before the run and its
Postgres (which the stand-in check uses to install the app's database changes) was not running. Every check failed
with `connection to server at "127.0.0.1", port 5432 failed: Connection refused`, from the check's own step, not
from the app. We missed it at the start (our pre-flight printed nothing and we went on).

**What it exposed in Ghost Code anyway:** it changed the app five times for a failure that was the check's own
computer, before stopping with "the same failure came back". Its stop rule for machine problems didn't know this
message. Fixed: a database-change check that can't reach its own database is named an environment failure (stop
after two checks and say so). And our runner now refuses to start, spending nothing, when its Postgres isn't
answering. Attempt 15 stays the only attempt that passed all four items, with its 4-cent note; a clean
confirmation run is still owed.

## Attempt 17: the confirmation run again (rules written before it starts)

Attempt 16 was void (our machine). Same rules as written for it: the same prompt, Phase 1 app, pass line and
judging, on Ghost Code's main as of #265, **$5 for the attempt** from the real bill. The test machine's database
was checked as answering before the start. Published either way.
