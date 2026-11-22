// Review fix: the wave schedule allocates nothing when called from the frame loop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOTAL_WAVES, waveSpec, enemyHealth } from '../src/waves.js';

test('waveSpec returns the same precomputed object on every call', () => {
  for (let n = 1; n <= TOTAL_WAVES; n++) {
    assert.equal(waveSpec(n), waveSpec(n));
    assert.ok(Object.isFrozen(waveSpec(n)));
  }
});

test('waveSpec and enemyHealth keep their values and errors', () => {
  assert.equal(waveSpec(5).boss, 1);
  assert.equal(waveSpec(4).boss, 0);
  assert.throws(() => waveSpec(0), RangeError);
  assert.throws(() => waveSpec(21), RangeError);
  assert.equal(enemyHealth('chaser', 1), 2);
  assert.throws(() => enemyHealth('nope', 1));
});
