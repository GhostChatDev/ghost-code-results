import test from 'node:test';
import assert from 'node:assert/strict';
import { settle } from '../lib/settle.mjs';

// A zero-sum group of k nonzero balances needs at least k-1 transfers.
// The optimum is n minus the maximum number of disjoint zero-sum groups.
function minimum(values) {
  const memo = new Map([[0, 0]]);
  function groups(mask) {
    if (memo.has(mask)) return memo.get(mask);
    let best = -Infinity;
    const first = mask & -mask;
    for (let part = mask; part; part = (part - 1) & mask) {
      if (!(part & first)) continue;
      let total = 0;
      for (let i = 0; i < values.length; i++) if (part & (1 << i)) total += values[i];
      if (total === 0) best = Math.max(best, 1 + groups(mask ^ part));
    }
    memo.set(mask, best);
    return best;
  }
  return values.length - groups((1 << values.length) - 1);
}

test('settlements clear balances and use the global minimum number of transfers', () => {
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++)
    for (let c = -3; c <= 3; c++) for (let d = -3; d <= 3; d++) {
      const values = [a, b, c, d, -a - b - c - d].filter(v => v !== 0);
      const balances = values.map((amount, id) => ({ id, amount }));
      const transfers = settle(balances);
      assert.equal(transfers.length, minimum(values), `balances ${values}`);
      const remaining = values.map(BigInt);
      for (const { payer, payee, amount } of transfers) {
        assert.ok(amount > 0n);
        assert.notEqual(payer, payee);
        remaining[payer] += amount;
        remaining[payee] -= amount;
      }
      assert.ok(remaining.every(v => v === 0n));
    }
});

test('settlement rejects unbalanced and oversized inputs', () => {
  assert.deepEqual(settle([]), []);
  assert.throws(() => settle([{ id: 1, amount: 1 }]), /zero/);
  const balances = Array.from({ length: 14 }, (_, id) => ({ id, amount: id < 7 ? 1 : -1 }));
  assert.throws(() => settle(balances), /12 members/);
});
