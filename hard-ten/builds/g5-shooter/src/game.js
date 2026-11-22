// Game state and simulation. All entities live in pre-made pools.
import { Pool } from './pool.js';
import { circlesOverlap, segmentHitsCircle, blockedByShield, clampCircle } from './collision.js';
import { TOTAL_WAVES, buildSpawnQueue, waveSpec, enemyHealth } from './waves.js';
import { input } from './input.js';
import { sfx } from './audio.js';

export const MAX_BULLETS = 600;
const HI_KEY = 'staticBloom.highScore';
const RM_KEY = 'staticBloom.reducedMotion';

function makeBullet() { return { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 3, life: 0, enemy: false, dmg: 1 }; }
function makeParticle() { return { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, hue: 0 }; }
function makeEnemy() {
  return { kind: 'chaser', x: 0, y: 0, vx: 0, vy: 0, r: 12, hp: 1, maxHp: 1, speed: 0, facing: 0,
    timer: 0, flash: 0, gen: 0, phase: 0, spin: 0, value: 100, inside: false };
}
function makePickup() { return { type: 'heal', x: 0, y: 0, life: 0, t: 0 }; }

export const PICKUP_TYPES = ['heal', 'rapid', 'spread'];

export const game = {
  W: 1000, H: 600,
  state: 'menu', // menu | playing | paused | between | over | won
  bullets: new Pool(MAX_BULLETS, makeBullet),
  particles: new Pool(900, makeParticle),
  enemies: new Pool(220, makeEnemy),
  pickups: new Pool(24, makePickup),
  player: { x: 500, y: 300, r: 11, hp: 100, maxHp: 100, aim: 0, cooldown: 0, invuln: 0, rapid: 0, spread: 0 },
  score: 0, mult: 1, multTimer: 0, highScore: Number(localStorage.getItem(HI_KEY)) || 0,
  newHigh: false,
  wave: 0, queue: [], queueIndex: 0, spawnTimer: 0, betweenTimer: 0, bossAlive: false,
  trauma: 0, hitStop: 0, time: 0, banner: '', bannerTimer: 0,
  reducedMotion: localStorage.getItem(RM_KEY) === '1' ||
    (localStorage.getItem(RM_KEY) === null && typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches),
};

const tmp = { x: 0, y: 0 };

export function setReducedMotion(on) {
  game.reducedMotion = on;
  localStorage.setItem(RM_KEY, on ? '1' : '0');
  if (on) { game.trauma = 0; game.hitStop = 0; }
}

export function addTrauma(a) {
  if (game.reducedMotion) return;
  game.trauma = Math.min(1, game.trauma + a);
}
export function hitStop(sec) {
  if (game.reducedMotion) return;
  game.hitStop = Math.max(game.hitStop, sec);
}

export function startGame() {
  game.bullets.releaseAll(); game.particles.releaseAll();
  game.enemies.releaseAll(); game.pickups.releaseAll();
  const p = game.player;
  p.x = game.W / 2; p.y = game.H / 2; p.hp = p.maxHp; p.cooldown = 0; p.invuln = 1; p.rapid = 0; p.spread = 0;
  game.score = 0; game.mult = 1; game.multTimer = 0; game.newHigh = false;
  game.trauma = 0; game.hitStop = 0; game.wave = 0;
  game.state = 'playing';
  nextWave();
}

export function nextWave() {
  game.wave++;
  buildSpawnQueue(game.wave, game.queue);
  game.queueIndex = 0;
  game.spawnTimer = 0.6;
  const s = waveSpec(game.wave);
  game.banner = s.boss ? `WAVE ${game.wave} — BOSS` : `WAVE ${game.wave}`;
  game.bannerTimer = 2;
  if (s.boss) sfx.boss(); else sfx.wave();
}

function spawnAtEdge(e) {
  const side = (Math.random() * 4) | 0;
  const m = 30;
  if (side === 0) { e.x = Math.random() * game.W; e.y = -m; }
  else if (side === 1) { e.x = game.W + m; e.y = Math.random() * game.H; }
  else if (side === 2) { e.x = Math.random() * game.W; e.y = game.H + m; }
  else { e.x = -m; e.y = Math.random() * game.H; }
}

const KIND_STATS = {
  chaser: { r: 11, speed: 115, value: 100 },
  shooter: { r: 13, speed: 70, value: 150 },
  splitter: { r: 17, speed: 80, value: 200 },
  shielded: { r: 15, speed: 60, value: 250 },
  minion: { r: 8, speed: 150, value: 50 },
  boss: { r: 46, speed: 45, value: 5000 },
};

export function spawnEnemy(kind, x, y, gen) {
  const e = game.enemies.acquire();
  if (!e) return null;
  const st = KIND_STATS[kind];
  e.kind = kind; e.r = st.r; e.speed = st.speed * (1 + game.wave * 0.015); e.value = st.value;
  e.hp = e.maxHp = kind === 'minion' ? 1 : enemyHealth(kind, game.wave);
  e.timer = 1 + Math.random() * 1.5; e.flash = 0; e.gen = gen || 0; e.phase = 0; e.spin = 0;
  e.vx = 0; e.vy = 0; e.inside = false;
  if (kind === 'splitter' && e.gen > 0) { e.r = 11; e.hp = e.maxHp = 2; e.speed *= 1.3; e.value = 80; }
  if (x === undefined) spawnAtEdge(e); else { e.x = x; e.y = y; }
  e.facing = Math.atan2(game.player.y - e.y, game.player.x - e.x);
  if (kind === 'boss') game.bossAlive = true;
  return e;
}

export function fireBullet(x, y, angle, speed, enemy, dmg, r) {
  const b = game.bullets.acquire();
  if (!b) return null;
  b.x = b.px = x; b.y = b.py = y;
  b.vx = Math.cos(angle) * speed; b.vy = Math.sin(angle) * speed;
  b.enemy = enemy; b.dmg = dmg; b.r = r; b.life = enemy ? 6 : 1.4;
  return b;
}

export function burst(x, y, n, hue, speed, size) {
  for (let i = 0; i < n; i++) {
    const p = game.particles.acquire();
    if (!p) return;
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
    p.max = p.life = 0.3 + Math.random() * 0.5; p.size = size * (0.5 + Math.random()); p.hue = hue;
  }
}

function dropPickup(x, y, chance) {
  if (Math.random() > chance) return;
  const k = game.pickups.acquire();
  if (!k) return;
  const p = game.player;
  k.type = p.hp < 50 && Math.random() < 0.5 ? 'heal' : PICKUP_TYPES[(Math.random() * 3) | 0];
  k.x = x; k.y = y; k.life = 10; k.t = 0;
}

/** Fills the bullet pool for the stress test; returns how many are alive. */
export function stress(n) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (!fireBullet(game.W / 2 + Math.cos(a) * 200, game.H / 2 + Math.sin(a) * 200, a + 1.4, 40, true, 0, 3)) break;
  }
  return game.bullets.active;
}

function addScore(v) {
  game.score += Math.round(v * game.mult);
  game.mult = Math.min(8, game.mult + 0.1);
  game.multTimer = 3;
  if (game.score > game.highScore) {
    game.highScore = game.score; game.newHigh = true;
    localStorage.setItem(HI_KEY, String(game.highScore));
  }
}

export function hurtPlayer(dmg) {
  const p = game.player;
  if (p.invuln > 0 || dmg <= 0) return;
  p.hp -= dmg; p.invuln = 0.8;
  game.mult = 1; game.multTimer = 0;
  addTrauma(0.55); hitStop(0.08); sfx.hurt();
  burst(p.x, p.y, 24, 0, 260, 3);
  if (p.hp <= 0) { p.hp = 0; game.state = 'over'; addTrauma(1); burst(p.x, p.y, 80, 190, 400, 4); }
}

export function killEnemy(e) {
  const big = e.kind === 'boss';
  addScore(e.value);
  burst(e.x, e.y, big ? 120 : 18, HUE[e.kind], big ? 500 : 240, big ? 5 : 3);
  sfx.kill();
  if (big) { addTrauma(1); hitStop(0.25); game.bossAlive = false; }
  else addTrauma(e.kind === 'splitter' || e.kind === 'shielded' ? 0.2 : 0.1);
  if (e.kind === 'splitter' && e.gen < 1) {
    for (let i = 0; i < 2; i++) spawnEnemy('splitter', e.x + (i ? 10 : -10), e.y, e.gen + 1);
  }
  dropPickup(e.x, e.y, big ? 1 : e.kind === 'minion' ? 0.02 : 0.07);
  game.enemies.release(e);
}

export const HUE = { chaser: 330, shooter: 45, splitter: 140, shielded: 210, minion: 280, boss: 0 };

export function updatePlayer(dt) {
  const p = game.player;
  p.x += input.moveX * 240 * dt; p.y += input.moveY * 240 * dt;
  clampCircle(tmp, p.x, p.y, p.r, game.W, game.H); p.x = tmp.x; p.y = tmp.y;
  if (input.useMouse && !input.touchMode) p.aim = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);
  else if (input.right.id !== -1) p.aim = Math.atan2(input.aimY, input.aimX);
  p.invuln = Math.max(0, p.invuln - dt);
  p.rapid = Math.max(0, p.rapid - dt); p.spread = Math.max(0, p.spread - dt);
  p.cooldown -= dt;
  if (input.firing && p.cooldown <= 0) {
    p.cooldown = p.rapid > 0 ? 0.05 : 0.11;
    const mx = p.x + Math.cos(p.aim) * 14, my = p.y + Math.sin(p.aim) * 14;
    fireBullet(mx, my, p.aim + (Math.random() - 0.5) * 0.04, 820, false, 1, 3);
    if (p.spread > 0) {
      fireBullet(mx, my, p.aim - 0.18, 800, false, 1, 3);
      fireBullet(mx, my, p.aim + 0.18, 800, false, 1, 3);
    }
    sfx.shoot();
  }
}

export function updateEnemy(e, dt) {
  const p = game.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const toP = Math.atan2(dy, dx);
  e.flash = Math.max(0, e.flash - dt);
  e.timer -= dt;
  let want = 1;
  if (e.kind === 'shooter') {
    want = d > 260 ? 1 : d < 180 ? -1 : 0;
    if (e.timer <= 0) { e.timer = Math.max(0.9, 2.2 - game.wave * 0.06); fireBullet(e.x, e.y, toP, 230, true, 10, 5); }
  } else if (e.kind === 'shielded') {
    // turns slowly toward the player so you can flank it
    let da = toP - e.facing;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    e.facing += Math.max(-1.4 * dt, Math.min(1.4 * dt, da));
  } else if (e.kind === 'boss') {
    e.spin += dt * (0.8 + e.phase * 0.3);
    want = d > 200 ? 1 : 0;
    if (e.timer <= 0) {
      const lvl = game.wave / 5;
      e.phase = e.hp < e.maxHp * 0.5 ? 1 : 0;
      e.timer = e.phase ? 0.55 : 0.85;
      const n = 10 + lvl * 4;
      for (let i = 0; i < n; i++) fireBullet(e.x, e.y, e.spin + (i / n) * Math.PI * 2, 150 + lvl * 15, true, 12, 6);
      if (e.phase && Math.random() < 0.35) spawnEnemy('minion', e.x, e.y, 0);
    }
  }
  if (e.kind !== 'shielded') e.facing = toP;
  const sp = e.kind === 'shielded' ? e.speed : e.speed;
  e.vx += ((dx / d) * sp * want - e.vx) * Math.min(1, dt * 4);
  e.vy += ((dy / d) * sp * want - e.vy) * Math.min(1, dt * 4);
  e.x += e.vx * dt; e.y += e.vy * dt;
  // keep inside once entered
  if (e.x > e.r && e.x < game.W - e.r && e.y > e.r && e.y < game.H - e.r) e.inside = true;
  if (e.inside) { clampCircle(tmp, e.x, e.y, e.r, game.W, game.H); e.x = tmp.x; e.y = tmp.y; }
  if (circlesOverlap(e.x, e.y, e.r, p.x, p.y, p.r)) hurtPlayer(e.kind === 'boss' ? 30 : 15);
}
