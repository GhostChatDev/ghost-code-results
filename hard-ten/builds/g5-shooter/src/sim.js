// One fixed simulation step: bullets, collisions, waves, pickups, particles.
import { game, updatePlayer, updateEnemy, killEnemy, hurtPlayer, spawnEnemy, nextWave, burst, addTrauma, hitStop, HUE } from './game.js';
import { circlesOverlap, segmentHitsCircle, blockedByShield } from './collision.js';
import { TOTAL_WAVES, waveSpec } from './waves.js';
import { sfx } from './audio.js';

const SHIELD_ARC = Math.PI / 3;

function updateBullets(dt) {
  const items = game.bullets.items;
  const enemies = game.enemies.items;
  const p = game.player;
  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    if (!b.alive) continue;
    b.px = b.x; b.py = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -20 || b.y < -20 || b.x > game.W + 20 || b.y > game.H + 20) { game.bullets.release(b); continue; }
    if (b.enemy) {
      if (b.dmg > 0 && circlesOverlap(b.x, b.y, b.r, p.x, p.y, p.r)) { hurtPlayer(b.dmg); game.bullets.release(b); }
      continue;
    }
    for (let j = 0; j < enemies.length; j++) {
      const e = enemies[j];
      if (!e.alive) continue;
      if (!segmentHitsCircle(b.px, b.py, b.x, b.y, b.r, e.x, e.y, e.r)) continue;
      if (e.kind === 'shielded' && blockedByShield(b.vx, b.vy, e.facing, SHIELD_ARC)) {
        burst(b.x, b.y, 3, 200, 120, 2); sfx.block();
        game.bullets.release(b);
        break;
      }
      e.hp -= b.dmg; e.flash = 0.06;
      game.bullets.release(b);
      if (e.hp <= 0) killEnemy(e);
      else { sfx.hit(); if (e.kind === 'boss') { addTrauma(0.03); if (e.hp % 25 === 0) hitStop(0.05); } }
      break;
    }
  }
}

function updatePickups(dt) {
  const items = game.pickups.items;
  const p = game.player;
  for (let i = 0; i < items.length; i++) {
    const k = items[i];
    if (!k.alive) continue;
    k.life -= dt; k.t += dt;
    if (k.life <= 0) { game.pickups.release(k); continue; }
    if (circlesOverlap(k.x, k.y, 10, p.x, p.y, p.r + 6)) {
      if (k.type === 'heal') p.hp = Math.min(p.maxHp, p.hp + 30);
      else if (k.type === 'rapid') p.rapid = 8;
      else p.spread = 8;
      burst(k.x, k.y, 16, k.type === 'heal' ? 120 : k.type === 'rapid' ? 50 : 190, 180, 2);
      sfx.pickup();
      game.pickups.release(k);
    }
  }
}

function updateParticles(dt) {
  const items = game.particles.items;
  for (let i = 0; i < items.length; i++) {
    const q = items[i];
    if (!q.alive) continue;
    q.life -= dt;
    if (q.life <= 0) { game.particles.release(q); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx *= 0.92; q.vy *= 0.92;
  }
}

export function updateWaves(dt) {
  // A fatal hit earlier in this step ends the run: never turn it into a win.
  if (game.state !== 'playing' || game.player.hp <= 0) return;
  if (game.queueIndex < game.queue.length) {
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      game.spawnTimer = waveSpec(game.wave).spawnInterval;
      if (spawnEnemy(game.queue[game.queueIndex], undefined, undefined, 0)) game.queueIndex++;
    }
    return;
  }
  if (game.enemies.active > 0) return;
  if (game.wave >= TOTAL_WAVES) { game.state = 'won'; return; }
  if (game.betweenTimer <= 0) { game.betweenTimer = 2; game.banner = 'WAVE CLEAR'; game.bannerTimer = 1.6; }
  game.betweenTimer -= dt;
  if (game.betweenTimer <= 0) nextWave();
}

/** Advances the world one fixed step `dt`. Effects (particles, shake) keep running in hit-stop. */
export function step(dt) {
  game.time += dt;
  game.trauma = Math.max(0, game.trauma - dt * 1.4);
  game.bannerTimer = Math.max(0, game.bannerTimer - dt);
  updateParticles(dt);
  if (game.state !== 'playing') return;
  if (game.hitStop > 0) { game.hitStop -= dt; return; }
  if (game.multTimer > 0) { game.multTimer -= dt; if (game.multTimer <= 0) game.mult = 1; }
  updatePlayer(dt);
  const enemies = game.enemies.items;
  for (let i = 0; i < enemies.length; i++) if (enemies[i].alive) updateEnemy(enemies[i], dt);
  updateBullets(dt);
  updatePickups(dt);
  updateWaves(dt);
}

export { HUE };
