# Ten real repositories, run 2: after the fixes

Written on November 22, 2026, **before run 2 is started**. Asked for after the first results: "So you're upgrading
Node 24. And you can fix the three. Test it again."

## What is different from run 1, and nothing else

The rules are the ones in [README.md](README.md). Three things change, each because of a fix or a fault found in run 1:

1. **The picks come from the fixed Ghost Code** (Ghost Chat pull request #326, commit `b840c36` on its branch). For
   bitburner that means no Python checks and an install line that is a real command. The other nine get the same
   picks as before.
2. **Node is chosen by Ghost Code's new rule**, read from each repository's own files (`.nvmrc`, `.node-version`,
   or `engines` in `package.json`): Node 24 for elk, etherpad-lite, hedgedoc and bitburner; Node 22 for the other
   six. On our machine that is Node v24.22.1 and Node v22.23.4.
3. **Each copy is a git repository** (git init and one commit), the way Ghost Code's sandbox makes it. In run 1 our
   copies were plain folders, which was our mistake and broke one build.

Same as run 1: `bash -lc`, `CI=1`, 240 seconds a command, install retried only after a time-out, the same ten
commits, no model, nothing built, no pull request anywhere.

## What we expect, said beforehand

From the extra runs already published in [RESULTS.md](RESULTS.md): **6 of 10 green** (the four from run 1, plus
bitburner and hedgedoc). We expect these four to stay not green, for reasons the fixes do not touch:

- umami: demands pnpm 12.3.4 in a way pnpm does not act on by itself (not fixed), and needs a database.
- elk: its tests call a server the machine cannot reach, and its build wants a Cloudflare account.
- etherpad-lite: its own lint setup is broken at this commit.
- flatris: its build needs a settings file made by hand.

If the result differs from this, in either direction, it is published as it comes out.

## Still not shown

This is still our test machine, not Ghost Code's real sandbox. A real sandbox started with Node 24 has not been
seen yet.

---

# Run 2: the results

Run on November 22, 2026, after the rules above were published (commit `9386df5`).

**6 of 10 are green.** We said 6 beforehand.

| # | Repository | Node | Run 1 | Run 2 | What still fails |
|---|---|---|---|---|---|
| 1 | `excalidraw/excalidraw` | 22 | green | **green** |  |
| 2 | `umami-software/umami` | 22 | not green | **not green** | pnpm 12.3.4 demanded, pnpm 10 here (not fixed); it also needs a database |
| 3 | `elk-zone/elk` | 24 | not green | **not green** | tests call a server the machine cannot reach; the build wants a Cloudflare account |
| 4 | `ether/etherpad-lite` | 24 | not green | **not green** | its own lint setup is broken at this commit (its tests now pass on Node 24) |
| 5 | `hedgedoc/hedgedoc` | 24 | not green | **green** |  |
| 6 | `skidding/flatris` | 22 | not green | **not green** | the build needs a settings file made by hand |
| 7 | `bitburner-official/bitburner-src` | 24 | not green | **green** |  |
| 8 | `smogon/pokemon-showdown` | 22 | green | **green** |  |
| 9 | `boardgameio/boardgame.io` | 22 | green | **green** |  |
| 10 | `pcottle/learnGitBranching` | 22 | green | **green** |  |

- 41 commands, 1,226 seconds in all. Time-outs: 0. The longest was excalidraw/excalidraw: `yarn run test` at 196.0 seconds, inside the 240 allowed.
- Raw records: `raw/run2-*.json`.

## Each repository, command by command

### 1. `excalidraw/excalidraw` (Node 22): green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: yarn install` | passed | 0 | 56.4 |
| `yarn run test` | passed | 0 | 196.0 |
| `yarn run build` | passed | 0 | 32.4 |

### 2. `umami-software/umami` (Node 22): not green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: pnpm install` | failed | 1 | 0.4 |
| `pnpm run lint` | failed | 1 | 0.4 |
| `pnpm run test` | failed | 1 | 0.4 |
| `pnpm run build` | failed | 1 | 0.4 |

### 3. `elk-zone/elk` (Node 24): not green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: pnpm install` | passed | 0 | 16.2 |
| `pnpm run typecheck` | passed | 0 | 23.7 |
| `pnpm run lint` | passed | 0 | 15.2 |
| `pnpm run test` | failed | 1 | 15.1 |
| `pnpm run build` | failed | 1 | 56.0 |

### 4. `ether/etherpad-lite` (Node 24): not green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: pnpm install` | passed | 0 | 1.7 |
| `pnpm run lint` | failed | 1 | 0.7 |
| `pnpm run test` | passed | 0 | 50.5 |

### 5. `hedgedoc/hedgedoc` (Node 24): green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: pnpm install` | passed | 0 | 14.2 |
| `pnpm run lint` | passed | 0 | 19.2 |
| `pnpm run test` | passed | 0 | 28.4 |
| `pnpm run build` | passed | 0 | 114.8 |

### 6. `skidding/flatris` (Node 22): not green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: yarn install` | passed | 0 | 34.1 |
| `yarn run lint` | passed | 0 | 3.2 |
| `yarn run test` | passed | 0 | 1.3 |
| `yarn run build` | failed | 1 | 0.4 |

### 7. `bitburner-official/bitburner-src` (Node 24): green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: npm install` | passed | 0 | 26.7 |
| `npm run typecheck` | passed | 0 | 25.1 |
| `npm run lint` | passed | 0 | 36.2 |
| `npm test` | passed | 0 | 41.8 |
| `npm run build` | passed | 0 | 146.4 |

### 8. `smogon/pokemon-showdown` (Node 22): green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: npm install` | passed | 0 | 87.4 |
| `npm run tsc` | passed | 0 | 7.8 |
| `npm run lint` | passed | 0 | 30.6 |
| `npm test` | passed | 0 | 49.7 |
| `npm run build` | passed | 0 | 2.6 |

### 9. `boardgameio/boardgame.io` (Node 22): green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: pnpm install` | passed | 0 | 3.9 |
| `pnpm run lint` | passed | 0 | 9.9 |
| `pnpm run test` | passed | 0 | 23.8 |
| `pnpm run build` | passed | 0 | 30.2 |

### 10. `pcottle/learnGitBranching` (Node 22): green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: yarn install` | passed | 0 | 16.4 |
| `yarn run lint` | passed | 0 | 2.6 |
| `yarn run test` | passed | 0 | 1.2 |
| `yarn run build` | passed | 0 | 2.9 |

## What this shows, and what it does not

- The two fixes that could change a result did: with the Node each repository asks for, **hedgedoc and bitburner
  went from not green to green**, and etherpad-lite's tests now pass (its own lint still fails).
- The wrong Python pick is gone: bitburner got four JavaScript commands and one runnable install line.
- The four that are still not green fail for the reasons written down before the run. None of them is a wrong pick
  by Ghost Code or its time limit.
- **Not shown:** Ghost Code's real sandbox started with Node 24. This ran on our test machine. The first real
  proof is a real Ghost Code task on a repository that asks for Node 24.
