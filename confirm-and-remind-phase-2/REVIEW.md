# Confirm & Remind, Phase 2: our review

**Result: did not pass.** Ghost Code said "goal met", and its own checks (build, tests, browser check)
were green. We don't take that on trust: we read the code and ran our own tests against it. The
main promise holds, but the build has real bugs, so it isn't a pass.

Prompt: [PROMPT.txt](PROMPT.txt): AI suggestions for notes, with nothing scheduled until the person confirms.

## The promise, in two lines

1. Build, tests (including 30 sample notes against a mocked model) and the browser check pass; the review
   screen shows each suggestion with its exact quote, full date, time zone, and Confirm / Edit / Dismiss.
2. No reminder exists until the signed-in person taps Confirm, by any route.

## What we checked, and how

Our tests: [tests/review-no-tap-routes.test.ts](tests/review-no-tap-routes.test.ts) (run with `npx vitest run tests/review-no-tap-routes.test.ts`).

| Route to a reminder without a tap | Result |
|---|---|
| 1. The button: anything confirming on its own | **Holds**: only an explicit Confirm tap sends a confirm (read in the code) |
| 2. The background job | **Holds**: it writes suggestions only, never tasks or reminders (test) |
| 3. The API: confirming someone else's suggestion | **Holds**: refused (test) |
| 4. A new session | **Holds**: no approval carries over; every confirm needs the signed-in owner (read in the code) |
| 5. Dismiss, then the job runs again | **Holds**: nothing comes back (test). An *edited* note can be suggested again |
| **One tap, one reminder** | **Fails**: two confirms arriving at the same moment both succeed and make **two reminders** (test, failing on purpose) |

## Bugs found

1. **The database change doesn't install.** `0004_ai_phase_2.sql` creates `ai_suggestions`, which Phase 1
   already created. We ran it on a real Postgres: Phase 1's three files apply; this one stops with
   `relation "ai_suggestions" already exists`. Read-through: `ai_budgets` also declares two primary keys.
   So the AI feature can't run on a real database.
2. **One tap can make two reminders** (above). Confirm checks "still pending?" and creates the reminder
   in separate steps, not in one database transaction.
3. **A budget reservation is never given back if the process dies** mid-job (read-through): there's no
   expiry. A job discarded as stale keeps its reservation too, and the real spend is recorded as $0, so
   the monthly cap only counts reservations.
4. **The secret check proves less than it says:** it scans the build output, but CI runs the tests before
   the build, and the test key value is never put into a build.

The key itself is only read on the server, and date handling uses the note's creation time and the
person's time zone, as asked.

## Why Ghost Code's checks were green anyway

The app's CI never applied the database changes to a real database, so bug 1 was invisible. That's a gap in
Ghost Code, not only in this app: it will make apps with a database apply their changes to a real Postgres
in CI, which would have caught this on the first commit.

## Cost

| | Time | Rounds | Commits | AI cost |
|---|---|---|---|---|
| This build (run 9) | 24.5 min | 7 | 17 | ~$2.52 |
| All Phase 2 attempts (runs 1 to 9) | | | | ~$12.80 |

Runs 1 to 8 stopped on Ghost Code bugs or on our test machine, and each was fixed before the next run:
the privacy rule's false alarms (a page *using* sign-in, a push-notification key named `auth`, ownership
checks *moved* to another file); a full disk on our machine; and a missing browser tool on our machine,
which Ghost Code spent 8 rounds trying to fix in the app. That last one led to a new rule: the same
failure, word for word, after a code change, about the check's own computer, stops after two checks.

We set a spending limit for these attempts before run 9, so there's no run 10 until the Ghost Code fix
above is in.
