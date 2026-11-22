import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  circlesOverlap, pointInRect, segmentHitsCircle, angleWithin, blockedByShield, clampCircle,
} from '../src/collision.js';
import { TOTAL_WAVES, isBossWave, waveSpec, buildSpawnQueue, enemyHealth } from '../src/waves.js';
import { Pool } from '../src/pool.js';

test('circlesOverlap: overlap, touch and miss', () => {
  assert.equal(circlesOverlap(0, 0, 5, 8, 0, 5), true);
  assert.equal(circlesOverlap(0, 0, 5, 10, 0, 5), true); // touching
  assert.equal(circlesOverlap(0, 0, 5, 10.01, 0, 5), false);
  assert.equal(circlesOverlap(0, 0, 1, 3, 3, 1), false);
});

test('pointInRect includes edges', () => {
  assert.equal(pointInRect(5, 5, 0, 0, 10, 10), true);
  assert.equal(pointInRect(10, 10, 0, 0, 10, 10), true);
  assert.equal(pointInRect(11, 5, 0, 0, 10, 10), false);
});

test('segmentHitsCircle catches fast bullets that skip over a target', () => {
  // start and end are both far from the circle, but the path crosses it
  assert.equal(circlesOverlap(0, 0, 2, 50, 0, 5), false);
  assert.equal(circlesOverlap(100, 0, 2, 50, 0, 5), false);
  assert.equal(segmentHitsCircle(0, 0, 100, 0, 2, 50, 0, 5), true);
  assert.equal(segmentHitsCircle(0, 20, 100, 20, 2, 50, 0, 5), false);
  assert.equal(segmentHitsCircle(3, 3, 3, 3, 1, 4, 4, 1), true); // zero-length step
});

test('angleWithin wraps around ±PI', () => {
  assert.equal(angleWithin(Math.PI - 0.1, -Math.PI + 0.1, 0.3), true);
  assert.equal(angleWithin(0, Math.PI, 1), false);
});

test('blockedByShield: front blocked, back open', () => {
  // enemy faces +x (angle 0); bullet moving -x arrives from the front
  assert.equal(blockedByShield(-10, 0, 0, Math.PI / 3), true);
  // bullet moving +x hits it from behind
  assert.equal(blockedByShield(10, 0, 0, Math.PI / 3), false);
});

test('clampCircle keeps circles inside the arena', () => {
  const o = { x: 0, y: 0 };
  clampCircle(o, -5, 500, 10, 200, 100);
  assert.deepEqual(o, { x: 10, y: 90 });
});

test('wave schedule: 20 waves, bosses on 5/10/15/20 only', () => {
  assert.equal(TOTAL_WAVES, 20);
  const bosses = [];
  for (let n = 1; n <= TOTAL_WAVES; n++) if (isBossWave(n)) bosses.push(n);
  assert.deepEqual(bosses, [5, 10, 15, 20]);
  for (let n = 1; n <= 20; n++) assert.equal(waveSpec(n).boss, isBossWave(n) ? 1 : 0);
  assert.throws(() => waveSpec(0), RangeError);
  assert.throws(() => waveSpec(21), RangeError);
});

test('wave schedule: kinds unlock in order and all 4 appear', () => {
  assert.equal(waveSpec(1).shooter, 0);
  assert.ok(waveSpec(2).shooter > 0);
  assert.equal(waveSpec(2).splitter, 0);
  assert.ok(waveSpec(3).splitter > 0);
  assert.equal(waveSpec(3).shielded, 0);
  assert.ok(waveSpec(4).shielded > 0);
  const w = waveSpec(19);
  assert.ok(w.chaser > 0 && w.shooter > 0 && w.splitter > 0 && w.shielded > 0);
});

test('wave schedule: normal waves grow, queue matches spec', () => {
  let prev = 0;
  for (let n = 1; n <= 20; n++) {
    const s = waveSpec(n);
    if (!s.boss) {
      assert.ok(s.total > prev, `wave ${n} should be larger than the last normal wave`);
      prev = s.total;
    }
    const q = buildSpawnQueue(n);
    assert.equal(q.length, s.total);
    if (s.boss) assert.equal(q[0], 'boss');
    assert.equal(q.filter((k) => k === 'shielded').length, s.shielded);
  }
  assert.ok(enemyHealth('boss', 20) > enemyHealth('boss', 5));
});

test('Pool hands out at most size objects and reuses them', () => {
  let made = 0;
  const p = new Pool(500, () => { made++; return { x: 0 }; });
  assert.equal(made, 500);
  const got = [];
  for (let i = 0; i < 500; i++) got.push(p.acquire());
  assert.equal(p.acquire(), null);
  assert.equal(p.active, 500);
  p.release(got[10]);
  p.release(got[10]); // double release is ignored
  assert.equal(p.active, 499);
  assert.equal(p.acquire(), got[10]);
  p.releaseAll();
  assert.equal(p.active, 0);
  assert.equal(made, 500);
});
