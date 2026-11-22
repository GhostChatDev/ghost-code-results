import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate, cents, convert, rate, split } from '../lib/money.mjs';

const sum = values => values.reduce((a, b) => a + b, 0n);

test('equal splits conserve cents with deterministic remainders', () => {
  assert.deepEqual(split(10n, 'equal', ['', '', '']), [4n, 3n, 3n]);
  for (let amount = 1n; amount <= 500n; amount++) {
    for (let count = 1; count <= 12; count++) {
      const shares = split(amount, 'equal', Array(count).fill(''));
      assert.equal(sum(shares), amount);
      assert.ok(shares.every(x => x === amount / BigInt(count) || x === amount / BigInt(count) + 1n));
    }
  }
});

test('exact and percentage splits validate totals and conserve cents', () => {
  assert.deepEqual(split(101n, 'exact', ['0.50', '0.51']), [50n, 51n]);
  assert.throws(() => split(101n, 'exact', ['0.50', '0.50']), /add up/);
  assert.deepEqual(split(101n, 'percentage', ['33.33', '33.33', '33.34']), [34n, 33n, 34n]);
  assert.throws(() => split(101n, 'percentage', ['50', '49.99']), /add up/);
  assert.throws(() => split(101n, 'percentage', ['50', '50.01']), /add up/);
  for (let amount = 1n; amount <= 1000n; amount++) {
    assert.equal(sum(split(amount, 'percentage', ['12.34', '33.33', '54.33'])), amount);
    assert.equal(sum(allocate(amount, [1n, 0n, 7n])), amount);
  }
});

test('conversion uses integer rates and rounds half up', () => {
  assert.deepEqual(rate('1.23456789'), [123456789n, 100000000n]);
  assert.equal(cents('123.45'), 12345n);
  assert.equal(convert(1n, 1n, 2n), 1n);
  assert.equal(convert(1n, 49n, 100n), 0n);
  assert.equal(convert(12345n, 123n, 100n), 15184n);
  assert.equal(convert(9007199254740993n, 1n, 1n), 9007199254740993n);
  assert.throws(() => rate('0'), /positive/);
  assert.throws(() => cents('1.001'), /decimal places/);
  assert.throws(() => convert(1n, 1n, 0n), /Invalid/);
});
