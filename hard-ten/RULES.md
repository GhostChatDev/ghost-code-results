# Hard ten: five hard games and five hard apps (rules written before any build starts)

November 22, 2026. The owner asked for a heavy test: five hard games and five hard apps, each built from an empty
repository by Ghost Code in one task. This page is written before the first build starts and is not changed
afterwards; results go in [RESULTS.md](RESULTS.md), published whatever they show.

## What is built

The ten briefs are in [briefs/](briefs/), word for word what Ghost Code is given. Every game and app is original
(names, rules and art made up for this test). Each brief names one or two **hard parts**, the things a quick build
usually gets wrong:

| # | Brief | Agent | Hard part |
|---|---|---|---|
| G1 | Lantern Keep, tower defense | Ghost Gamer | A* paths re-planned on every placement; a tower that would block every path is refused |
| G2 | Moss & Copper, platformer | Ghost Gamer | Fixed-step physics, coyote time and jump buffering, no falling through platforms at speed |
| G3 | Ashen Stair, roguelike | Ghost Gamer | Seeded floor generator that is always fully connected; field of view with fog |
| G4 | Tidepool Tiles, match-3 | Ghost Gamer | Cascades, two special tiles, "no move left" reshuffle, board logic apart from drawing |
| G5 | Static Bloom, arena shooter | Ghost Gamer | 500 bullets at 60 fps from object pools; twin-stick on desktop and phone |
| A1 | Corkline, kanban | Ghost Coded | Stored card order, undo/redo, offline queue that sends each change once |
| A2 | Evenstep, shared expenses | Ghost Coded | Integer cents, splits that never lose a cent, minimal settle-up payments |
| A3 | Hourglass Desk, booking | Ghost Coded | Time zones and a DST change; a double booking made impossible by the database |
| A4 | Quillstack, notes | Ghost Coded | Postgres full-text search with ranking; refusing to save over a newer version |
| A5 | Tallyroom, point of sale | Ghost Coded | Stock as a ledger; a sale in one transaction; tax and discount rounding in cents |

## How each is run

- Ghost Code as it is on main (commit `bd53448`), on our test machine: a stand-in GitHub that runs each check file
  in Docker, Postgres for the apps, an empty repository to start. Up to 9 rounds of 285 seconds, as on
  ghostchat.tech. The model behind each agent is the one the agent picks; we do not choose it.
- **$4 per build**, read from the real OpenRouter bill every 20 seconds; the build is stopped at $4. The whole test
  is stopped at $42. Builds run one after another, in the order of the table.
- Nothing is approved on Ghost Code's behalf: a stop that waits for a person ends the build there.

## How each is judged (the same for all ten)

1. **Checks:** the last check on the final commit passed on our machine.
2. **Browser:** Ghost Code's own browser check (it opens the built app, looks for a blank page, console errors and
   failed requests) passed on the final commit.
3. **Its own tests pass, and they test the hard part:** we read the test files and name which hard part each covers.
4. **The hard part, by hand:** we read the code for the hard part and try the one case the brief names (for
   example: place a tower that blocks every path; book the same slot twice at once; a 3-way split of $10.00).

A build **passes** with all four. Partial results are reported item by item. We say what we could not check (our
test machine runs one job per check file; a phone is not tried; nothing is played for fun).

## Said beforehand

- From earlier tests: whole apps with a database are where Ghost Code struggles most (the Phase 2 hard test has
  one pass in eleven tries). We expect the apps to do worse than the games.
- We expect most games to load and play, and most to miss at least one named hard part.
- A pass on more than five of the ten would surprise us.
