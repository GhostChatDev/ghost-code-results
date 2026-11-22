// Wave schedule: pure data, no DOM. 20 waves, a boss every 5th wave.

export const TOTAL_WAVES = 20;
export const BOSS_EVERY = 5;
export const KINDS = ['chaser', 'shooter', 'splitter', 'shielded'];

export function isBossWave(n) {
  return n >= 1 && n <= TOTAL_WAVES && n % BOSS_EVERY === 0;
}

/**
 * Returns the make-up of wave n (1-based):
 * { wave, chaser, shooter, splitter, shielded, boss, bossLevel, spawnInterval, total }
 * Kinds are introduced over time: chasers from wave 1, shooters from 2,
 * splitters from 3, shielded from 4. Boss waves have a boss plus a small escort.
 */
export function waveSpec(n) {
  if (!Number.isInteger(n) || n < 1 || n > TOTAL_WAVES) {
    throw new RangeError(`wave must be an integer 1..${TOTAL_WAVES}, got ${n}`);
  }
  // Precomputed once at load: calling this in the frame loop allocates nothing.
  return SPECS[n];
}

function computeSpec(n) {
  const boss = isBossWave(n);
  const scale = boss ? 0.4 : 1;
  const chaser = Math.round((4 + n * 1.5) * scale);
  const shooter = n >= 2 ? Math.round((1 + n * 0.6) * scale) : 0;
  const splitter = n >= 3 ? Math.round((1 + (n - 3) * 0.5) * scale) : 0;
  const shielded = n >= 4 ? Math.round((1 + (n - 4) * 0.4) * scale) : 0;
  const spawnInterval = Math.max(0.25, 1.1 - n * 0.04);
  const bossLevel = boss ? n / BOSS_EVERY : 0;
  return Object.freeze({
    wave: n,
    chaser,
    shooter,
    splitter,
    shielded,
    boss: boss ? 1 : 0,
    bossLevel,
    spawnInterval,
    total: chaser + shooter + splitter + shielded + (boss ? 1 : 0),
  });
}

const SPECS = [null];
for (let n = 1; n <= TOTAL_WAVES; n++) SPECS.push(computeSpec(n));

const BASE_HP = Object.freeze({ chaser: 2, shooter: 3, splitter: 4, shielded: 5, minion: 1 });

/** Health of each kind at wave n (enemies get a little tougher). No allocation. */
export function enemyHealth(kind, n) {
  const base = BASE_HP[kind];
  if (kind === 'boss') return 120 + 80 * (n / BOSS_EVERY);
  if (base === undefined) throw new Error(`unknown kind ${kind}`);
  return base + Math.floor(n / 4);
}

/**
 * Fills `queue` (a reusable array) with the spawn order for wave n, kinds
 * interleaved so the mix stays varied. Boss first on boss waves.
 * Called once per wave, outside the frame loop.
 */
export function buildSpawnQueue(n, queue = []) {
  const s = waveSpec(n);
  queue.length = 0;
  if (s.boss) queue.push('boss');
  const left = { chaser: s.chaser, shooter: s.shooter, splitter: s.splitter, shielded: s.shielded };
  let added = true;
  while (added) {
    added = false;
    for (const k of KINDS) {
      if (left[k] > 0) {
        queue.push(k);
        left[k]--;
        added = true;
      }
    }
  }
  return queue;
}
