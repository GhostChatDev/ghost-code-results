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

**Attempt 17 result: did not finish. Paused by a false privacy hold in Ghost Code (not the machine this time).**
19 minutes · 6 rounds · 67 steps · **$1.42** of its $5. The machine was fine (database and Docker answering
throughout). In round 6, after its check had just passed, Ghost Code stopped to ask the person's permission for "a
change to sign-in": the line was a settings-page paragraph of plain text that mentions passwords ("…Passwords and
reminder titles are never sent"). Our runner has no person to tap Apply, so the run ended there, about half built:
the last check passed and the database changes install (4 files, 11 of 11 tables, 12 functions), but only 23 tests
exist, with no real-database test and no crash test yet. **Not a pass.**

**Seen working:** the new red-build rule fired once ("errors 2 → 2 · undone") and the next commit went green.
**Fixed in Ghost Code:** words on the screen aren't sign-in code: a text-only line or element no longer holds a
commit; a password input or session cookie in a page still does. A clean confirmation run is still owed.

## Attempt 18: the confirmation run, third try (rules written before it starts)

Same rules as attempts 16 and 17: the same prompt, Phase 1 app, pass line and judging, on Ghost Code's main as of
#267, **$5 for the attempt** from the real bill. The test machine's database and Docker were checked as answering
before the start. Published either way.

**Attempt 18 result: did not pass (2 of 4). It finished inside its limit, on a healthy machine.**
28.8 minutes · 9 rounds · 145 steps · **$4.50** of its $5. Ghost Code said "Done means: met."

| Pass line | Result |
|---|---|
| 1. Checks green, database changes install | **Passes.** The last check passed on its final commit `c000027`; 4 database change files install with rows in 11 of 11 tables; 8 database functions run cleanly; 62 tests pass. |
| 2. Our review test, unchanged | **Not run:** with items 3 and 4 already decided, we did not write its adapter. |
| 3. A real save read back from a real database | **Fails: no such test,** and its CI starts no database. |
| 4. Money comes back after a crash | An in-memory test stops a job after it reserved (`tests/ai.test.ts`); not on a real database. |

**Did it stop once its checks passed?** (the question asked of this run) Its checks first went green at 24m16s
(`c000023`). After that it made two more commits (both green: `c000025`, `c000027`), then asked for the same
commit's result three more times across two rounds before stopping at 28m47s. So: about 4.5 minutes and two
commits after the first green, and three repeat checks of a commit it already knew was green.

**Why Ghost Code's done check didn't send it back for item 3:** the check learns "this task changed the database"
from the files changed in the current round, or else from the pull request's file list. The last rounds only
touched tests and the README, and **our stand-in GitHub answers the pull request's file list with nothing**. On
real GitHub the list would have been there. So this miss is our test rig's, on top of a fragile design: the fix
is for Ghost Code to remember across rounds that the task touched the database (no lookup needed), and for the
stand-in to report a pull request's files like GitHub does.

**Seen working:** the red-build rule undid a commit that raised the errors ("errors 2 → 3 · undone"); the next
commit went green.

Attempt 15 remains the only attempt that passed all four items.

## Attempt 19: the confirmation run, fourth try (rules written before it starts)

Same rules as attempts 16 to 18: the same prompt, the same Phase 1 app, the same four-item pass line and the same
judging, **$5 for the attempt** from the real bill. Ghost Code's main as of #301 (commit `feafd02`). The test
machine's database and Docker were checked as answering before the start. Published either way.

What changed in Ghost Code since attempt 18, and so what this run is the first to try:

- It remembers across rounds that the task changed the database, so the done check can ask for a real-database test
  even when the last rounds only touch tests (attempt 18's miss). Our stand-in GitHub also reports a pull request's
  files now.
- A commit whose checks already passed isn't checked again, and once the checks of the head commit have passed
  with task-list items still open, it stops (the post-pass stop). **The question for this run is the same as for
  attempt 18: did it stop once its checks passed?** Counted as: commits and repeat checks after the first green.
- A command that doesn't exist is "unverified", not a failure; reads wait out rate limits.

Judged on the four items, not on the total spent.

**Attempt 19 result: did not pass (0 of 4). Ghost Code stopped itself after the first of six task-list items.**
8.0 minutes · 2 rounds · 14 steps · **$0.52** of its $5, on a healthy machine.

| Pass line | Result |
|---|---|
| 1. Checks green, database changes install | Its one commit (`c000003`: a suggestion validator and its test) was green, but no database change for Phase 2 was written. **Fails.** |
| 2. Our review test, unchanged | **Not run:** there is no confirm or review flow to test. |
| 3. A real save read back from a real database | **Fails:** not built. |
| 4. Money comes back after a crash | **Fails:** not built. |

**Why it stopped: a fault in Ghost Code, added the same day.** Its new "post-pass stop" fired as soon as the head
commit's checks had passed **while task-list items were still open**. A build that commits one part at a time is
green after its first part, so the run ended there, with the message "Stopped after 14 steps: the branch head
(c000003) already passed every check. 5 task-list items are still open". The rule was meant for attempt 18's case
(finished, green work that goes on being polished) and was written the wrong way round; its tests covered a model
that keeps going after a pass, never a build with real work left. This run is what showed it.

**The question for this run** (did it stop once its checks passed?): yes, far too early. That answers it in the
worst way: stopping on "green" is only right when the list is done.

**Fix (Ghost Code pull request #303):** the stop fires only when the task list is done and the head commit's
checks have passed; never while items are open. Two tests now hold both shapes: attempt 19's (green first commit,
items open: keeps building) and attempt 18's (list done and green: one closing answer, no more steps).

Attempt 15 remains the only attempt that passed all four items. Spent on confirmation tries 16 to 19: $11.24.

## Attempt 20: the confirmation run, fifth try (rules written before it starts)

Same rules as attempts 16 to 19: the same prompt, the same Phase 1 app, the same four-item pass line and the same
judging, **$5 for the attempt** from the real bill. Ghost Code's main as of #305 (commit `3440ec0`). The test
machine's database and Docker were checked as answering before the start. Published either way.

What changed in Ghost Code since attempt 19, and so what this run is the first to try:

- The post-pass stop is fixed (#303): it fires only when the task list is done and the head commit's checks have
  passed, never while items are open. **The question for this run: does it build past its first green commit, and
  does it stop once the list is done and green?** Counted as: task-list items done at the end, and commits and
  repeat checks after the list was done and green.
- A round can end with one of four statuses (#302); only "blocked" and "needs an answer" stop automatic rounds.
- A refused GitHub write is explained and, when only the person can fix it, stops the run (#304). The stand-in
  GitHub accepts every write, so this should not come up.

Judged on the four items, not on the total spent.

**Attempt 20 result: did not pass (0 of 4). It built for seven rounds, then Ghost Code stopped itself again, for a
new reason.**
25.1 minutes · 7 rounds · 126 steps · 18 commits · **$2.81** of its $5, on a healthy machine.

| Pass line | Result |
|---|---|
| 1. Checks green, database changes install | The last commit that was checked (`c00001f`) was green, the four database change files install on a real Postgres, and the app's own 23 tests pass. But one more commit was made after that and never checked. **Not met: the final commit is unchecked.** |
| 2. Our review test, unchanged | **Fails:** it could not start. It imports `src/lib/server/aiJobs`, which this build does not have. |
| 3. A real save read back from a real database | **Fails:** no test uses a real database. |
| 4. Money comes back after a crash | **Fails:** the recovery code is there, but no test stops a job after it reserved. |

**The question for this run** (does it build past its first green commit, and does it stop once the list is done and
green?): the first half is yes. It kept building through seven rounds and 18 commits, where attempt 19 stopped after
one. The second half was never reached.

**Why it stopped: a second fault in Ghost Code from the same day.** Round 7 ran out of steps, and its closing answer
ended with the status line "BLOCKED: step limit reached before committing tests, fixing the production SQL contract,
updating documentation, and running final verification". A "blocked" status stops automatic rounds (#302), so the
build ended there with work left and said "Ghost Code stopped here instead of trying again by itself". Running into
a round's own limit is not being blocked; the next round should have carried on. Its own closing answer listed what
was left: an uncommitted test file, a database function that still uses Phase 1 column names, the README, and the
final verification.

**Fix (Ghost Code, pull request to follow #308):** a "blocked" in an answer that Ghost Code itself forced (the
round's last step, or its time running out) is kept as "not finished yet" and the next round carries on. Said at an
ending the model chose, "blocked" still stops. A test holds attempt 20's exact ending, through the whole loop.

Attempt 15 remains the only attempt that passed all four items. Spent on confirmation tries 16 to 20: $14.05.

## Attempt 21: the confirmation run, sixth try (rules written before it starts)

Same rules as attempts 16 to 20: the same prompt, the same Phase 1 app, the same four-item pass line and the same
judging, **$5 for the attempt** from the real bill. Ghost Code's main as of #311 (commit `657845e`). The test
machine's database and Docker were checked as answering before the start. Published either way.

What changed in Ghost Code since attempt 20, and so what this run is the first to try:

- A round that runs out of steps or time is no longer taken as "blocked" (#310): its closing answer is kept as
  "not finished yet" and the next round carries on. That is what ended attempt 20 at round 7.
- Whether work is done is worked out from the checks, not from the model's status line (#307).

**The questions for this run:** does it keep going past a round that runs out of steps, and does it stop once the
task list is done and the head commit is green? Counted as: rounds run, task-list items done at the end, and what
ended the run.

Attempts 19 and 20 were each ended early by a fault in Ghost Code that was added the same day. This is the first
run with both fixed. Judged on the four items, not on the total spent.

**Attempt 21 result: did not pass (1 of 4). It ran to its own end for the first time since attempt 18, but on a
green that our test machine should not have given.**
31.2 minutes · 9 rounds · 123 steps · 24 commits · **$2.83** of its $5, on a healthy machine.

| Pass line | Result |
|---|---|
| 1. Checks green, database changes install | **Passes as our machine measures it:** the final commit's build, type check, 62 tests and browser check passed, and the four database change files install on a real Postgres with rows in the tables. **But see the note below:** the build's own second check job fails when run by hand. |
| 2. Our review test, unchanged | **3 of 4 pass** ([adapter](tests/review-adapter.attempt21.ts)). The fourth, "one tap, one reminder", fails with **no reminder at all**: a plain Confirm is refused with "Check the task and time zone". The Confirm button only sends a title when the person has tapped Edit first, and both the in-memory code and the database function refuse a confirm without one. So in this build, Confirm does not work unless you edit first. |
| 3. A real save read back from a real database | **Fails: written but never shown.** The build has the right test (`tests/phase2-data-layer.ts`: save a note twice through its own data code, read one back), in a second check job with a real Postgres. That job cannot pass: its own setup step inserts a profile that the database already created by itself (a trigger on new users), and stops on "duplicate key". Run by hand, statement by statement as the workflow would, it stops there. |
| 4. Money comes back after a crash | **Fails: written but never shown.** The recovery is in the code (claiming a job releases an expired reservation first) and `tests/phase2-postgres.sql` has the right case (a worker that dies after reserving). The file stops at its 12th line on the same duplicate profile, before any case runs. |

**The questions for this run** (does it keep going past a round that runs out of steps, and does it stop once the
list is done and green?): yes to both. It went through eight round endings and stopped at round 9 with its task
list done and its last check green, with no commits after that check. Both faults that ended attempts 19 and 20 are
gone.

**The note on item 1, and what our machine got wrong.** Our stand-in for GitHub runs a build's install, type check,
tests, build and browser check. It does not run a second job that starts its own database containers, and it
reported the whole check as passed. On real GitHub that job would have been red, and Ghost Code would have gone on
fixing it. Here it was told "passed", so its final answer says "real-Postgres data-layer tests also passed", which
nothing showed. That sentence is our machine's fault as much as the build's. The fix is on our side: the stand-in
must run every job of a workflow, or report the ones it cannot run as not run. Until then a green from it means
"the first job is green".

**One thing in the adapter to know about.** This build runs no AI job until the person has turned AI on in
Settings, which records consent. The cases' setup writes `ai_enabled: true` straight into the table. The adapter
turns AI on the way the app's own Settings route does (`updateProfile`), and nothing else; it says so at its top.

Attempt 15 remains the only attempt that passed all four items. Spent on confirmation tries 16 to 21: $16.88.
