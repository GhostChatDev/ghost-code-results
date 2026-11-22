const MAX = 9223372036854775807n;

export function integer(value) {
  if (!/^(0|[1-9]\d*)$/.test(String(value))) throw new Error('Enter a non-negative whole number.');
  const result = BigInt(value);
  if (result > MAX) throw new Error('Amount is too large.');
  return result;
}

export function decimal(value, maxPlaces = 2) {
  const text = String(value).trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(text);
  if (!match || (match[2] || '').length > maxPlaces) throw new Error(`Enter a valid non-negative number with at most ${maxPlaces} decimal places.`);
  const fraction = match[2] || '';
  return [BigInt(match[1] + fraction), 10n ** BigInt(fraction.length)];
}

export function cents(value) {
  const [n, d] = decimal(value, 2);
  const result = n * 100n / d;
  if (result > MAX) throw new Error('Amount is too large.');
  return result;
}

export function rate(value) {
  const [n, d] = decimal(value, 8);
  if (n <= 0n || n > MAX) throw new Error('Rate must be positive and within range.');
  return [n, d];
}

export function convert(amount, numerator, denominator) {
  amount = BigInt(amount); numerator = BigInt(numerator); denominator = BigInt(denominator);
  if (amount < 0n || numerator <= 0n || denominator <= 0n) throw new Error('Invalid conversion.');
  const result = (amount * numerator * 2n + denominator) / (2n * denominator);
  if (result > MAX) throw new Error('Converted amount is too large.');
  return result;
}

// Largest-remainder allocation: deterministic ties follow the supplied member order.
export function allocate(total, weights) {
  total = BigInt(total); weights = weights.map(BigInt);
  if (total < 0n || weights.length === 0 || weights.some(w => w < 0n)) throw new Error('Invalid split.');
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum === 0n) throw new Error('Split weights must add up to more than zero.');
  const rows = weights.map((w, i) => ({ i, value: total * w / sum, remainder: total * w % sum }));
  let left = total - rows.reduce((a, r) => a + r.value, 0n);
  const order = [...rows].sort((a, b) => a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1);
  for (const row of order) { if (!left) break; row.value++; left--; }
  return rows.map(r => r.value);
}

export function split(total, type, values) {
  total = BigInt(total);
  if (total <= 0n || !values.length) throw new Error('Choose members and a positive amount.');
  if (type === 'equal') return allocate(total, values.map(() => 1n));
  if (type === 'exact') {
    const parts = values.map(cents);
    if (parts.reduce((a, b) => a + b, 0n) !== total) throw new Error('Exact shares must add up to the expense amount.');
    return parts;
  }
  if (type === 'percentage') {
    const parts = values.map(cents);
    if (parts.reduce((a, b) => a + b, 0n) !== 10000n) throw new Error('Percentages must add up to 100.');
    return allocate(total, parts);
  }
  throw new Error('Unknown split type.');
}
