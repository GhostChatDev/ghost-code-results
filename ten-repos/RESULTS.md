# Ten real repositories: the results

Run on November 22, 2026, under the rules in [README.md](README.md), which were published before any of the ten was
run (commit `9311cfd`). Nothing here changes those rules. Raw records for every command are in [raw/](raw/).

## The short answer

**4 of 10 are green.** Green means the install and every command Ghost Code picked passed inside Ghost Code's limits.

| # | Repository | Kind | Result | Cause, sorted by the rules |
|---|---|---|---|---|
| 1 | `excalidraw/excalidraw` | app | **green** | |
| 2 | `umami-software/umami` | app | not green | the machine (it has pnpm 10; the repository demands pnpm 12.3.4) |
| 3 | `elk-zone/elk` | app | not green | the machine (tests call a server it can't reach), and the repository (the build wants a Cloudflare account) |
| 4 | `ether/etherpad-lite` | app | not green | the machine (Node 22; the repository demands Node 24), and the repository (its own lint is broken) |
| 5 | `hedgedoc/hedgedoc` | app | not green | the machine (Node 22; the repository is set up for Node 24) |
| 6 | `skidding/flatris` | game | not green | the repository (the build needs a settings file made by hand first) |
| 7 | `bitburner-official/bitburner-src` | game | not green | **Ghost Code picked wrong** (twice), and the machine (Node 22; the repository demands Node 24) |
| 8 | `smogon/pokemon-showdown` | game | **green** | |
| 9 | `boardgameio/boardgame.io` | game | **green** | |
| 10 | `pcottle/learnGitBranching` | game | **green** | |

- **Ghost Code picked wrong: 1 repository** (bitburner). Two wrong picks, both fixed with tests (below).
- **Ghost Code's time limit: 0.** No command timed out. 44 commands took 1,066 seconds in all; the longest was
  excalidraw's tests at 185.6 seconds, inside the 240 allowed.
- **Apart from that one, the picks were right**: the package manager was right in all ten, and every JavaScript
  command picked is a script its repository really has (none ended in "command not found").

## What the sorting hides, and it is the main finding

The rules sort "Node 22, the repository needs Node 24" under "the machine", so by the rules it is not a fault in
Ghost Code. That is the letter of it. In fact **Ghost Code's real sandbox is also Node 22** (`runtime: "node22"` in
`lib/code/sandbox.ts`), so these would fail there the same way:

- **3 of the 10 need Node 24**: etherpad-lite and bitburner refuse to run on less, and hedgedoc is set up for it
  (`.nvmrc` says `24.20.0`).
- **1 of the 10 needs a pnpm newer than the machine has** and says so in a way pnpm does not act on by itself (umami).

So a fairer reading than the table: of the six that are not green, **four are held back by the versions of Node
and pnpm on offer** (umami, etherpad-lite, hedgedoc, bitburner), and the other two (elk, flatris) by things the
repository needs set up first. That is a limit of Ghost Code even though the rules, as written beforehand, do not
call it one. It is being fixed (below).

## Each repository, command by command

### 1. `excalidraw/excalidraw`: green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: yarn install` | passed | 0 | 62.0 |
| `yarn run test` | passed | 0 | 185.6 |
| `yarn run build` | passed | 0 | 24.0 |

2,716 tests passed (47 skipped by the repository itself).

### 2. `umami-software/umami`: not green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: pnpm install` | failed | 1 | 0.6 |
| `pnpm run lint` | failed | 1 | 0.5 |
| `pnpm run test` | failed | 1 | 0.4 |
| `pnpm run build` | failed | 1 | 0.4 |

**Cause: the machine.** Every command stopped in half a second with the same message:

```
ERR_PNPM_UNSUPPORTED_ENGINE  Unsupported environment (bad pnpm and/or Node.js version)
Expected version: 12.3.4
Got: 10.28.0
```

The repository's `package.json` demands pnpm 12.3.4 exactly (`engines.pnpm`). It does not also name it in `packageManager`, which is the field pnpm reads to switch itself to the right version (it did that by itself for elk, etherpad-lite and boardgame.io). Nothing of umami was actually checked.

### 3. `elk-zone/elk`: not green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: pnpm install` | passed | 0 | 34.2 |
| `pnpm run typecheck` | passed | 0 | 23.7 |
| `pnpm run lint` | passed | 0 | 15.0 |
| `pnpm run test` | failed | 1 | 15.3 |
| `pnpm run build` | failed | 1 | 61.0 |

**`pnpm run test`: the machine.** All 53 tests passed, but the run still ends red on 8 errors, each one a test reaching out to a Mastodon server:

```
Caused by: Error: getaddrinfo ENOTFOUND m.webtoo.ls
 Test Files  7 passed (7)
      Tests  53 passed (53)
     Errors  8 errors
```

Our machine cannot reach that server. Ghost Code's real sandbox could not either: it only reaches package registries and code hosts.

**`pnpm run build`: the repository.** Ghost Code runs commands with `CI=1`, as a check should. Elk's settings read that as "this is the deployment build" and switch storage to Cloudflare (`driver: process.env.NUXT_STORAGE_DRIVER ?? (isCI ? 'cloudflare' : 'fs')` in `nuxt.config.ts`), which then wants an account:

```
[error] [unstorage] [cloudflare-kv-http] Missing required option `accountId`.
```

### 4. `ether/etherpad-lite`: not green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: pnpm install` | passed | 0 | 6.3 |
| `pnpm run lint` | failed | 1 | 0.7 |
| `pnpm run test` | failed | 1 | 2.7 |

**`pnpm run lint`: the repository.** It ships an old-style lint settings file (`src/.eslintrc.cjs`) together with ESLint 10, which no longer reads that kind of file. Its own workflows do not run this command.

```
ESLint: 10.15.0
ESLint couldn't find an eslint.config.* file.
```

**`pnpm run test`: the machine.**

```
[ERROR] settings - Running Etherpad on Node v22.23.4 is not supported. Please upgrade at least to Node 24.0.0
```

### 5. `hedgedoc/hedgedoc`: not green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: pnpm install` | passed | 0 | 20.9 |
| `pnpm run lint` | passed | 0 | 15.5 |
| `pnpm run test` | failed | 1 | 3.9 |
| `pnpm run build` | passed | 0 | 133.0 |

**`pnpm run test`: the machine.** One of its packages fails to load a test file on Node 22, and the test tool's own message names the cure. The repository's `.nvmrc` asks for Node `24.20.0`.

```
@hedgedoc/html-to-react:test: FAIL src/index.spec.tsx
    Must use import to load ES Module: .../node_modules/htmlparser2/dist/index.js
      - Use Node v24.9+ where Jest supports require(esm) natively
```

Lint and the build (133 seconds) passed.

### 6. `skidding/flatris`: not green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: yarn install` | passed | 0 | 30.4 |
| `yarn run lint` | passed | 0 | 2.8 |
| `yarn run test` | passed | 0 | 1.7 |
| `yarn run build` | failed | 1 | 0.3 |

**`yarn run build`: the repository.** The build reads a settings file that is not in the repository (only an example of it is, `.env.example.js`). Someone has to make it by hand first.

```
$ env-cmd next build web
Error: Failed to find .env file at default paths: [./.env,./.env.js,./.env.json]
```

Lint and tests passed.

### 7. `bitburner-official/bitburner-src`: not green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `npm install and pip install -r requirements.txt (as picked)` | not runnable as written | none | 0.0 |
| `install: npm install` | failed | 1 | 26.8 |
| `install: pip install -r requirements.txt` | failed | 1 | 3.8 |
| `npm run typecheck` | passed | 0 | 23.7 |
| `npm run lint` | passed | 0 | 40.6 |
| `npm test` | failed | 1 | 66.0 |
| `npm run build` | failed | 1 | 0.4 |
| `python -m pytest` | failed | 5 | 0.7 |

**The install line: Ghost Code picked wrong.** It joined two installs with the word "and": `npm install and pip install -r requirements.txt`. That is a sentence, not a command (typed into a shell, npm would try to install packages named "and" and "pip"). It was recorded as picked and its two halves were run instead.

**`pip install` and `python -m pytest`: Ghost Code picked wrong.** This is a JavaScript game. It has a `requirements.txt` only for building its documentation, and a folder named `test/` full of JavaScript tests. Ghost Code's rule took "a requirements file plus a test folder" to mean "Python tests", so it added Python checks to a repository with no Python tests:

```
collected 0 items
============================ no tests ran in 0.27s =============================
```

(exit code 5: pytest's "I found nothing to run").

**`npm install`: the machine.**

```
Incorrect node version
'package.json' specifies ">=24", you are currently running "v22.23.4".
```

**`npm test`: the machine.** 4,577 tests passed and 2 failed, in two files (40 saved comparisons differ). On Node 24 the same command passes (see the extra runs).

**`npm run build`: the machine, and here it was our own test setup.** The build asks git for the current commit. Our copy of the repository was a plain folder, not a git repository; Ghost Code's sandbox makes it one.

```
[webpack-cli] Error: Command failed: git rev-parse --short HEAD
fatal: not a git repository (or any of the parent directories): .git
```

### 8. `smogon/pokemon-showdown`: green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: npm install` | passed | 0 | 92.5 |
| `npm run tsc` | passed | 0 | 6.7 |
| `npm run lint` | passed | 0 | 28.5 |
| `npm test` | passed | 0 | 44.1 |
| `npm run build` | passed | 0 | 2.4 |

2,571 tests passed (69 skipped by the repository itself).

### 9. `boardgameio/boardgame.io`: green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: pnpm install` | passed | 0 | 4.8 |
| `pnpm run lint` | passed | 0 | 9.9 |
| `pnpm run test` | passed | 0 | 30.4 |
| `pnpm run build` | passed | 0 | 25.6 |

910 tests passed in 43 files.

### 10. `pcottle/learnGitBranching`: green

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: yarn install` | passed | 0 | 12.8 |
| `yarn run lint` | passed | 0 | 2.3 |
| `yarn run test` | passed | 0 | 1.0 |
| `yarn run build` | passed | 0 | 2.2 |

498 test cases passed.

## Extra runs on Node 24 (outside the rules; they change no verdict)

To learn whether Node and pnpm were the whole cause for those four, each was run once more with what it asks for:
Node 24 (v24.22.1), the pnpm version it names, and in a folder that is a git repository the way Ghost Code's sandbox
makes one. Same limits: `CI=1`, 240 seconds a command. These runs were not in the rules published beforehand, so
they count for nothing in the result above. They are here because they say what to fix.

| Repository | With Node 24 | What still fails, and why |
|---|---|---|
| `bitburner-official/bitburner-src` | **everything passes** (install, typecheck, lint, 4,579 tests, build) | nothing |
| `hedgedoc/hedgedoc` | **everything passes** (install, lint, tests, build) | nothing |
| `ether/etherpad-lite` | tests pass | its own lint, as before (the repository) |
| `umami-software/umami` | install passes with pnpm 12.3.4 | lint: 6 errors of its own. Tests and build: both need a database address (`DATABASE_URL`) that is not there (the repository) |

**So with Node 24 on offer, 6 of the 10 would be green instead of 4.** The four left (umami, elk, etherpad-lite,
flatris) each need something a checker cannot give them by itself: a database, an account, a settings file, a
server to talk to, or a lint setup that is broken in the repository itself.

**`bitburner-official/bitburner-src`**

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: npm install` | passed | 0 | 26.8 |
| `npm run typecheck` | passed | 0 | 24.3 |
| `npm run lint` | passed | 0 | 38.5 |
| `npm test` | passed | 0 | 42.8 |
| `npm run build` | passed | 0 | 145.1 |

**`ether/etherpad-lite`**

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: pnpm install` | passed | 0 | 4.2 |
| `pnpm run lint` | failed | 1 | 3.3 |
| `pnpm run test` | passed | 0 | 51.2 |

**`hedgedoc/hedgedoc`**

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: pnpm install` | passed | 0 | 11.2 |
| `pnpm run lint` | passed | 0 | 14.9 |
| `pnpm run test` | passed | 0 | 43.1 |
| `pnpm run build` | passed | 0 | 111.9 |

**`umami-software/umami`**

| Command | Result | Exit code | Seconds |
|---|---|---|---|
| `install: pnpm install` | passed | 0 | 10.3 |
| `pnpm run lint` | failed | 1 | 3.9 |
| `pnpm run test` | failed | 1 | 3.6 |
| `pnpm run build` | failed | 1 | 3.0 |

## What gets fixed in Ghost Code

By the rules, only "picked wrong" and "the time limit" count as Ghost Code's faults. The first two below are those.
The third is the main finding, fixed although the rules do not require it.

1. **Python checks picked for a repository with no Python tests** (bitburner). The rule now needs real Python test
   files (`test_*.py`, `*_test.py`, or `.py` files under `test/` or `tests/`), not just a folder named `test`.
2. **An install line that is not a command** (bitburner): two installs were joined with the word "and". They are now
   joined so the line runs as written (`npm install && pip install -r requirements.txt`).
3. **Node 24.** Ghost Code now reads the Node version a repository asks for (`.nvmrc`, or `engines` in
   `package.json`) and starts the sandbox with Node 24 when it needs it. If that cannot be started, it falls back
   to the usual sandbox and tells the model that a refusal over the Node version is not caused by its change.

Each has a test built from the repository that showed it. They are in Ghost Chat pull request #326. Not fixed: a repository that demands an exact pnpm
version only in `engines` (umami). Even with the right pnpm, umami still needs a database, so the fix would not
have turned it green; it is noted, not done.

## What this still cannot show

- **The real sandbox.** All of this ran on our test machine. The Node 24 fix in particular has been tested with
  stand-ins only: we could not start a real Ghost Code sandbox from here (our access was refused), so the first
  real proof of it will be a real task on a repository that asks for Node 24.
- **Whether Ghost Code can build or change these apps.** Nothing was built. This tested the checking only.
- **A success rate.** Ten repositories, chosen by us, is a small sample.
- **One thing we got wrong in our own setup:** our copies of the repositories were plain folders, not git
  repositories, which broke bitburner's build in the main run. Ghost Code's sandbox does make a git repository.
  The main run's verdict stands as recorded; the extra run above used a git folder.

## Spending

No model calls and no sandbox time: $0, against the $5 agreed.
