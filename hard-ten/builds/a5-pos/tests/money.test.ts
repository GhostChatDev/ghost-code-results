import test from "node:test";
import assert from "node:assert/strict";
import { calculateSale, formatMoney, parseCents, roundedTax } from "../lib/money";

const line = (productId: string, unitPriceCents: number, taxRateBp: number, quantity = 1) =>
  ({ productId, unitPriceCents, taxRateBp, quantity });

test("money accepts decimal strings without floating-point conversion", () => {
  assert.equal(parseCents("12.34"), 1234);
  assert.equal(parseCents("0.01"), 1);
  assert.equal(parseCents("12."), 1200);
  assert.equal(formatMoney(1234), "$12.34");
  assert.throws(() => parseCents("1.234"));
  assert.throws(() => parseCents("-1"));
  assert.throws(() => parseCents("1e3"));
});

test("tax rounds to the nearest cent with exact half-up boundaries", () => {
  assert.equal(roundedTax(100, 725), 7);
  assert.equal(roundedTax(200, 725), 15);
  assert.equal(roundedTax(99, 825), 8);
  assert.equal(roundedTax(0, 825), 0);
  assert.equal(roundedTax(101, 0), 0);
});

test("discount shares are floored and the last line receives remaining cents", () => {
  const result = calculateSale([
    line("a", 1000, 825),
    line("b", 2000, 0),
    line("c", 3000, 2000),
  ], 100);
  assert.deepEqual(result.lines.map((item) => item.discountCents), [16, 33, 51]);
  assert.equal(result.lines.reduce((sum, item) => sum + item.discountCents, 0), 100);
  assert.equal(result.subtotalCents, 6000);
  assert.equal(result.taxCents, 1869);
  assert.equal(result.totalCents, 7769);
});

test("a discount of one cent across equal lines preserves deterministic tax", () => {
  const result = calculateSale([
    line("a", 10, 725), line("b", 10, 725), line("c", 10, 725),
  ], 1);
  assert.deepEqual(result.lines.map((item) => item.discountCents), [0, 0, 1]);
  assert.deepEqual(result.lines.map((item) => item.taxCents), [1, 1, 1]);
  assert.equal(result.totalCents, 32);
});

test("full discount produces no tax and zero due", () => {
  const result = calculateSale([line("a", 1234, 2000, 2)], 2468);
  assert.equal(result.taxCents, 0);
  assert.equal(result.totalCents, 0);
  assert.equal(result.lines[0].totalCents, 0);
});

test("each line keeps integer-cent subtotal, discount, tax and total", () => {
  const result = calculateSale([line("a", 333, 875, 3), line("b", 19, 0, 7)], 77);
  assert.equal(result.subtotalCents, 1132);
  assert.equal(result.discountCents, 77);
  for (const item of result.lines) {
    assert.equal(item.totalCents, item.grossCents - item.discountCents + item.taxCents);
    assert.ok(Number.isSafeInteger(item.totalCents));
  }
});

test("invalid quantities, prices and discounts are refused", () => {
  assert.throws(() => calculateSale([]));
  assert.throws(() => calculateSale([line("a", 100, 0, 0)]));
  assert.throws(() => calculateSale([line("a", 100, 0, 1.5)]));
  assert.throws(() => calculateSale([line("a", 100, 0)], 101));
  assert.throws(() => calculateSale([line("a", 10.5, 0)]));
});
