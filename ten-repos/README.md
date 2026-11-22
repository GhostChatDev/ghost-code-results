# Ten real repositories: do Ghost Code's own checks run on them?

Written on November 22, 2026, **before any of the ten is run**, so the bar can't move afterwards. The results are
published here either way.

## The question

Ghost Code reads a repository's own files to decide how to check a change: which install command, and which of the
repository's `typecheck`, `lint`, `test` and `build` scripts to run. On every test so far those were apps Ghost Code
had built itself. This asks the same of ten repositories it has never seen: five hard web apps and five hard web
games, each picked because it has a real test command.

**No model is involved and nothing is built.** No commit, branch or pull request is made anywhere. Each repository is
read once, at the commit pinned below, and only its own commands are run.

## The ten, and what Ghost Code picks for each

The install and commands below come from Ghost Code's own rule (`checksForRepo` in `lib/code/repo-kind.ts`, at
Ghost Code commit `a8dcb16`), applied to each repository's file list and `package.json`. Nothing is typed by hand.

| # | Repository (commit) | Kind | Install | Commands |
|---|---|---|---|---|
| 1 | `excalidraw/excalidraw` (`9c2e462ec23e`) | app: whiteboard | `yarn install` | `yarn run test`, `yarn run build` |
| 2 | `umami-software/umami` (`aad2c4cedd5c`) | app: web analytics | `pnpm install` | `pnpm run lint`, `pnpm run test`, `pnpm run build` |
| 3 | `elk-zone/elk` (`6b956a6d4a89`) | app: Mastodon client | `pnpm install` | `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `pnpm run build` |
| 4 | `ether/etherpad-lite` (`63c417d4f937`) | app: collaborative editor | `pnpm install` | `pnpm run lint`, `pnpm run test` |
| 5 | `hedgedoc/hedgedoc` (`c937fd26b5d2`) | app: collaborative notes | `pnpm install` | `pnpm run lint`, `pnpm run test`, `pnpm run build` |
| 6 | `skidding/flatris` (`c01772a90af5`) | game: multiplayer Tetris | `yarn install` | `yarn run lint`, `yarn run test`, `yarn run build` |
| 7 | `bitburner-official/bitburner-src` (`0c65cfb1d98b`) | game: programming incremental game | `npm install and pip install -r requirements.txt` | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `python -m pytest` |
| 8 | `smogon/pokemon-showdown` (`f1040ecb5f5d`) | game: battle simulator | `npm install` | `npm run tsc`, `npm run lint`, `npm test`, `npm run build` |
| 9 | `boardgameio/boardgame.io` (`47adef2b46e3`) | game: board game engine with example games | `pnpm install` | `pnpm run lint`, `pnpm run test`, `pnpm run build` |
| 10 | `pcottle/learnGitBranching` (`61c48bc874d3`) | game: interactive git puzzle levels | `yarn install` | `yarn run lint`, `yarn run test`, `yarn run build` |

## How each is run

- **Where:** on our test machine (Linux, Node 22, npm, yarn, pnpm, Python), not in Ghost Code's real sandbox. The
  real sandbox refused our access when we tried (403, not authorized), so this is a stand-in and is labelled as one.
  What that leaves untested is said under "What this cannot show".
- **How:** each command is run the way Ghost Code's `run_command` runs it: `bash -lc`, in the repository's folder,
  with `CI=1`, and stopped at **240 seconds**, the longest Ghost Code allows one command.
- **Install:** up to three tries of 240 seconds each, each continuing from the last (a model that sees a time-out
  runs it again). Every other command gets one try.
- **A command that times out** is then run once more with a 20-minute limit, only to learn whether Ghost Code's
  limit was the reason. That second run never changes the verdict.

## What is recorded, and what counts as green

For every command: its exit code, the seconds it took, and Ghost Code's own reading of it (passed; failed; timed
out; or not run, which is exit 127, a program that isn't there).

**A repository is green only if its install and every picked command pass inside Ghost Code's limits.**

For each one that is not green, the cause is read from the output and put in one of these, with the lines that show it:

1. **Ghost Code picked wrong:** a command that does not apply to this repository, or the wrong package manager.
2. **Ghost Code's limit:** the command passes with more time.
3. **The machine:** a tool, service or download the command needs that our machine does not have.
4. **The repository:** its own command fails for a reason that has nothing to do with Ghost Code (it needs a
   database or a browser to be set up first, or a test of its own is failing at this commit).

Only 1 and 2 are faults in Ghost Code. They are fixed with a test, after all ten are published, not between runs.

## What this cannot show

- **Ghost Code's sandbox image and its network rules.** The real sandbox only reaches package registries and code
  hosts, and may lack a tool our machine has. A green here is not a green there.
- **Whether Ghost Code can build these apps.** Nothing is built. This tests the checking, which every build
  depends on.
- **A success rate for Ghost Code as a whole.** Ten repositories is a small sample, chosen by us.

## Spending

No model calls, so nothing on the OpenRouter bill. No sandbox time is used, so nothing on the Vercel bill. The limit
agreed for this was $5; the expected cost is $0.
