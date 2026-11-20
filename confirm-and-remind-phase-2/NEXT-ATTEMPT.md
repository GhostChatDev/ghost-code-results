# Phase 2, next attempt: what counts as a pass (written before it runs)

Written on November 20, 2026, before the attempt starts, so the bar can't move afterwards. The result is
published here either way.

The attempt runs the same prompt ([PROMPT.txt](PROMPT.txt)) from the same Phase 1 app, after these Ghost Code
fixes: database changes are installed in an empty Postgres 17 on every check, with a made-up row in every
table before each later change; and the done rule for apps with a database (a record saved through the app's
own code and read back, and the same write sent twice leaves one record).

**It passes only if all four hold:**

1. **Checks:** on the final commit, the build, the tests (including the 30 sample notes) and the browser
   check pass, **and** every database change installs in Postgres 17, each one on top of the earlier ones
   with rows in the tables.
2. **No reminder without a tap, one tap, one reminder:** our review test
   [tests/review-no-tap-routes.test.ts](tests/review-no-tap-routes.test.ts) passes all four cases, unchanged:
   the background job, someone else's suggestion, Dismiss then the job runs again, and two confirms at the
   same moment making exactly one reminder.
3. **A real save:** a test saves one record through the app's own data code into a real Postgres and reads it
   back, and the same write sent twice leaves one record.
4. **Money comes back:** if a job dies after reserving budget, the reservation is given back (an expiry or a
   recovery step), shown by a test that stops a job mid-way.

**Spending limit for this attempt: $5.** If it's reached first, the attempt stops and counts as not passed.
