// Exact minimum number of transfers. At each step one participant is cleared;
// an optimal solution exists with this property. Memoization and equal-balance
// pruning keep the exponential search practical for up to 12 nonzero balances.
export function settle(balances) {
  const people = balances.map(({ id, amount }) => ({ id, amount: BigInt(amount) })).filter(p => p.amount !== 0n);
  if (people.reduce((s, p) => s + p.amount, 0n) !== 0n) throw new Error('Balances do not add up to zero.');
  if (people.length > 12) throw new Error('Minimum settlement supports at most 12 members with nonzero balances.');
  const memo = new Map();
  function search(values) {
    const first = values.findIndex(v => v !== 0n);
    if (first === -1) return [];
    const key = values.join(',');
    if (memo.has(key)) return memo.get(key);
    let best = null;
    const seen = new Set();
    for (let j = first + 1; j < values.length; j++) {
      if (values[first] * values[j] >= 0n || seen.has(values[j].toString())) continue;
      seen.add(values[j].toString());
      const next = values.slice();
      const amount = values[first] < 0n ? -values[first] : values[first];
      const payment = values[first] < 0n
        ? { payer: people[first].id, payee: people[j].id, amount }
        : { payer: people[j].id, payee: people[first].id, amount };
      next[j] += values[first]; next[first] = 0n;
      const candidate = [payment, ...search(next)];
      if (!best || candidate.length < best.length) best = candidate;
      if (values[j] + values[first] === 0n) break;
    }
    if (!best) throw new Error('Cannot settle balances.');
    memo.set(key, best);
    return best;
  }
  return search(people.map(p => p.amount));
}
