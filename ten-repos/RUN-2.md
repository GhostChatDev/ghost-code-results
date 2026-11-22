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
