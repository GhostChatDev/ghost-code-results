# A second reviewer with no shared context: does it find what we found?

November 22, 2026. Asked for: "Second reviewer with no shared context. Update this and put it live on Ghost Code
and see if there's improvement."

## What it is

When Ghost Code is about to call a task done on green checks, one separate model call reads **what was asked and
the task's diff, and nothing of the conversation**. It reports where the change doesn't do what was asked or breaks
for a person using it. A finding must name a file and line that are in the diff; something the request asks for
that nothing in the diff does must quote the request's own words. Anything it can't hold to either is dropped.

## The trial, before it went into any task

Three Phase 2 builds we had already judged by hand were given to it, each with the same request (the Phase 2 prompt)
and its diff against the Phase 1 app. Reviewer: Claude Sonnet 5.5 (the builds were written by GPT models). The raw
answers are in [second-review/](second-review/).

| Build | Our own judging | What the reviewer said | Cost |
|---|---|---|---|
| Attempt 21 | Failed (1 of 4). The defect our review test caught: **a plain Confirm is refused unless you Edit first.** | **Named that defect, in both runs.** First finding, first run: "On Confirm without Edit, the review page sends no title, and the Postgres RPC rejects a null p_title with a 400." | $0.10 |
| Attempt 22 | Failed. It called itself done with no screen and no routes to review a suggestion, and nothing stored. | **Found the missing review screen, the missing confirm, dismiss and review routes, and the Settings page calling a route that doesn't exist.** We checked each against the build's files: all true. It also said the database changes for the new tables are not in the diff. | $0.08 |
| Attempt 15 | **Passed all four items.** | Raised 5 points anyway. We checked one against the code (the database function refuses a suggestion with a due date and no reminder, while the in-memory path allows it): the code does say that. None of the five is a pass-line failure. | $0.10 |

## What this shows, both ways

- **It finds real defects that green checks did not.** In both failed builds it named the thing that made them fail,
  from the diff alone, for about ten cents.
- **Its count does not tell a good build from a bad one.** It raised five points on the build that passed. It will
  always have something to say, so every task now gets one more round of answering it.
- **It reads; it runs nothing.** A finding is a claim to check. "No problems found" would mean only that this
  reader found none in what it was shown.

## Two faults found by trying it first, both fixed before it shipped

1. **It answered nothing.** With 3,000 tokens of room it thought until the room ran out. It has 8,000 now and is
   told to think lightly. (That first empty run cost $0.12.)
2. **It mistook "missing" for "not shown to me".** On attempt 22 it first filed the missing database changes and
   routes under "could not judge". It is now told when it has been shown the whole change, with the list of files,
   and that anything not in the list was not changed. With that, it named them.

Trial cost in all: about $0.75.

## What is still not shown

Whether Ghost Code, told these things in the middle of a task, actually fixes them, and whether that changes the
result on the four-item pass line. That is attempt 23.
