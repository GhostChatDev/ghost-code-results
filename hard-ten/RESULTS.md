# Hard ten: results

Rules, written before the first build: [RULES.md](RULES.md). Each build's final files are in [builds/](builds/).
Running total of the test is kept at the bottom.

## G1 Lantern Keep (tower defense, Ghost Gamer): **passed, 4 of 4**

14 minutes · 4 rounds · 6 commits · **$2.08** of its $4.

| Item | Result |
|---|---|
| 1. Checks | **Pass.** Last check passed on the final commit (`c00000d`). Its first check had failed; fixed in round 2. |
| 2. Browser | **Pass.** Ghost Code's browser check on the final commit: no console errors, no failed requests, no blank page, no sideways scroll; it opened the menu 3 times and clicked once. |
| 3. Own tests, covering the hard part | **Pass.** 10 of 10 pass (`npm test`). They cover A* routing around rocks and towers, and that a placement that would block every path is refused without taking gold. Also upgrades and the 70% sell, the wave schedule (only wave 10 has a boss), gold per kill. |
| 4. Hard part, by hand | **Pass.** We walled off a whole column tower by tower: 9 placed, the 10th refused with "Cannot build: this would block every path to the keep." The path went from 16 to 26 steps, every step one grid move apart and around the towers. |

**The second reviewer ran inside this build** (round 3), for the first time in a real build since it was added. It
raised 2 points:
- *The placement preview colours are inverted.* **Wrong:** `canPlace()` returns `null` for an allowed tile, and the
  code shows null as gold, a refusal as red, which is right. The builder did not change the code: it wrote a test
  that draws the preview and checks gold for an allowed tile and red for a refused one (it passes). Answered with
  evidence, not with words.
- *Hit effects from the last kill of a wave never expire.* **Right.** Fixed in `game-core.js`, with three tests
  (between waves, after winning, after losing).

So: one false alarm, disproved by a test; one real bug, fixed with tests. Not played for fun; not tried on a phone.

![Lantern Keep, desktop](builds/g1-tower-desktop.jpg)

## G2 Moss & Copper (platformer, Ghost Gamer): **passed, 4 of 4**

14 minutes · 4 rounds · 9 commits · **$1.46** of its $4.

| Item | Result |
|---|---|
| 1. Checks | **Pass.** Last check passed on the final commit (`c000015`). |
| 2. Browser | **Pass.** No console errors, failed requests, blank page or sideways scroll; it clicked "Begin the journey" and "Choose a world", and both worked. |
| 3. Own tests, covering the hard part | **Pass.** 14 of 14 pass. They are about exactly the hard part: a swept collision that catches a thin floor at falling speeds up to 60,000 px/s, ceilings and walls at speed, no false landing beside a platform, standing still for 600 steps; coyote time and jump buffering at 100 ms (in real steps: a coyote jump works at step 6 and not at 7); a held jump higher than a tap; wall slide and wall jump. The tests run the game's own physics code, read out of `index.html`. |
| 4. Hard part, by hand | **Pass.** A four-second fall, accelerating, onto a 2-pixel ledge: it lands on top (y 4964 for a 36-px player on a ledge at 5000), it doesn't pass through. The game runs a fixed 1/60 s step. Three levels as data ("The overgrown way", "The fernworks", "The copper canopy"), moving platforms, checkpoints, gears, level select, best times saved, and on-screen left / right / jump buttons on a phone. |

The second reviewer ran and found no problems. Not played to the end; not tried on a real phone.

![Moss & Copper, playing](builds/g2-platformer-play.jpg)

## G3 Ashen Stair (roguelike, Ghost Gamer): **passed, 4 of 4**

20 minutes · 5 rounds · 10 commits · **$1.74** of its $4.

| Item | Result |
|---|---|
| 1. Checks | **Pass.** Last check passed on the final commit (`c00001a`). |
| 2. Browser | **Pass.** No console errors, failed requests, blank page or sideways scroll; "Sound" and "Begin descent" both worked. |
| 3. Own tests, covering the hard part | **Pass.** 6 of 6 pass. 250 seeds × 5 floors all fully connected with the stairs reachable; the same seed gives the same floor, monsters and loot; line of sight stops at the first wall; combat math (defense subtracted, at least 1 damage, whole numbers). The tests run the game's own rules, read out of `index.html`. |
| 4. Hard part, by hand | **Pass.** With our own reachability check (not the build's), 2,000 random seeds across floors 1 to 5: **0** floors with an unreachable tile or unreachable stairs, and **2,000 of 2,000** identical when generated again from the same seed. Four monster kinds (Cinder rat, Ash wraith, Iron husk, Ember knight) and the boss, the Cinder Regent, on floor 5. Fog of war ("dim = explored"), potions and two weapons, tap-to-move, best run saved. |

The second reviewer ran and found no problems. Not played to the end; not tried on a real phone.

![Ashen Stair, start of a run](builds/g3-roguelike-play.jpg)

## G4 Tidepool Tiles (match-3, Ghost Gamer): **passed, 4 of 4**

12 minutes · 4 rounds · 9 commits · **$1.35** of its $4.

| Item | Result |
|---|---|
| 1. Checks | **Pass.** Last check passed on the final commit (`c000013`). |
| 2. Browser | **Pass.** No console errors, failed requests, blank page or sideways scroll; it clicked Levels, Rules, Sound and five tiles, and all worked. |
| 3. Own tests, covering the hard part | **Pass.** 13 of 13 pass: 100 seeds start with no match and a move; matches don't wrap across rows; a swap that makes no match rolls back exactly; cascades keep the order of surviving tiles and settle; 4 makes a line tile and 5 a colour bomb, each firing when matched or swapped, two bombs clearing the board; "no move left" reshuffles to a playable board; a long seeded game stays full and playable. The board logic is its own file (`engine.js`), and a test checks the page embeds exactly that file. |
| 4. Hard part, by hand | **Pass.** We played 300 seeded boards for 40 moves each (12,000 moves): **0** boards started with a match or with no move, and **0** ended a move with a gap, an unsettled match or no move left. 12 levels with goals (score, or tiles of a kind) and a move limit; stars; progress saved. |

Small things: a second copy of the screenshot check file was left in the repository's root (`ghost-screenshots.yml`; harmless, not a check GitHub runs). The tiles are emoji. The second reviewer ran and found no problems.

![Tidepool Tiles, phone](builds/g4-match3-phone.jpg)

