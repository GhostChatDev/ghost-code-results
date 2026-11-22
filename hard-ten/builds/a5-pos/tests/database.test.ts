import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { completeSale, refundSale } from "../lib/sales";
import { calculateSale } from "../lib/money";

// CI supplies a real PostgreSQL service. Locally: npm run db:migrate, then DATABASE_URL=... npm test.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const enabled = Boolean(process.env.DATABASE_URL);
const options = { skip: enabled ? false : "Set DATABASE_URL to run real PostgreSQL integration tests", timeout: 30000 };

test("stock is the ledger sum and movements are append-only", options, async () => {
  const sku = `TEST-${randomUUID().slice(0, 8)}`;
  const product = (await pool.query<{ id: string }>(
    "INSERT INTO products (sku,name,category,price_cents,tax_rate_bp) VALUES ($1,'Test coffee','Tests',250,0) RETURNING id", [sku],
  )).rows[0];
  await pool.query("SELECT add_stock_movement($1,'received',12,'Delivery',$2)", [product.id, randomUUID()]);
  await pool.query("SELECT add_stock_movement($1,'adjusted',-2,'Two damaged bags',$2)", [product.id, randomUUID()]);
  const stock = await pool.query("SELECT stock FROM product_stock WHERE id=$1", [product.id]);
  assert.equal(stock.rows[0].stock, 10);
  await assert.rejects(pool.query("UPDATE stock_movements SET quantity=999 WHERE product_id=$1", [product.id]), /append-only/);
  await assert.rejects(pool.query("DELETE FROM stock_movements WHERE product_id=$1", [product.id]), /append-only/);
  const unchanged = await pool.query("SELECT stock FROM product_stock WHERE id=$1", [product.id]);
  assert.equal(unchanged.rows[0].stock, 10);
});

test("a sale stores its exact totals and retries create only one sale", options, async () => {
  const product = (await pool.query<{ id: string }>(
    "INSERT INTO products (sku,name,category,price_cents,tax_rate_bp) VALUES ($1,'Test beans','Tests',1000,825) RETURNING id",
    [`TEST-${randomUUID().slice(0, 8)}`],
  )).rows[0];
  await pool.query("SELECT add_stock_movement($1,'received',5,'Test delivery',$2)", [product.id, randomUUID()]);
  const input = { lines: [{ productId: product.id, quantity: 2, unitPriceCents: 1000, taxRateBp: 825 }], discountCents: 33 };
  const key = randomUUID();
  const first = await completeSale({ ...input, requestKey: key });
  const again = await completeSale({ ...input, requestKey: key });
  assert.equal(again, first);
  const sale = (await pool.query("SELECT * FROM sales WHERE id=$1", [first])).rows[0];
  const expected = calculateSale(input.lines, 33);
  assert.equal(sale.subtotal_cents, expected.subtotalCents);
  assert.equal(sale.discount_cents, expected.discountCents);
  assert.equal(sale.tax_cents, expected.taxCents);
  assert.equal(sale.total_cents, expected.totalCents);
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM stock_movements WHERE sale_line_id IN (SELECT id FROM sale_lines WHERE sale_id=$1)", [first])).rows[0].count), 1);
  assert.equal((await pool.query("SELECT stock FROM product_stock WHERE id=$1", [product.id])).rows[0].stock, 3);
});

test("a failed sale leaves no sale, lines or stock movement behind", options, async () => {
  const ids: string[] = [];
  for (const [name, price] of [["First product", 500], ["Out of stock", 700]]) {
    const result = await pool.query<{ id: string }>(
      "INSERT INTO products (sku,name,category,price_cents,tax_rate_bp) VALUES ($1,$2,'Tests',$3,0) RETURNING id",
      [`TEST-${randomUUID().slice(0, 8)}`, name, price],
    );
    ids.push(result.rows[0].id);
  }
  await pool.query("SELECT add_stock_movement($1,'received',3,'Test delivery',$2)", [ids[0], randomUUID()]);
  const before = (await pool.query("SELECT count(*)::int AS count FROM sales")).rows[0].count;
  await assert.rejects(completeSale({ lines: [
    { productId: ids[0], quantity: 1, unitPriceCents: 500, taxRateBp: 0 },
    { productId: ids[1], quantity: 1, unitPriceCents: 700, taxRateBp: 0 },
  ], requestKey: randomUUID() }), /Not enough stock/);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM sales")).rows[0].count, before);
  assert.equal((await pool.query("SELECT stock FROM product_stock WHERE id=$1", [ids[0]])).rows[0].stock, 3);
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM stock_movements WHERE product_id=ANY($1::uuid[]) AND kind='sold'", [ids])).rows[0].count), 0);
});

test("partial and whole-sale refunds return stock and preserve all cents", options, async () => {
  const product = (await pool.query<{ id: string }>(
    "INSERT INTO products (sku,name,category,price_cents,tax_rate_bp) VALUES ($1,'Refund test','Tests',333,875) RETURNING id",
    [`TEST-${randomUUID().slice(0, 8)}`],
  )).rows[0];
  await pool.query("SELECT add_stock_movement($1,'received',6,'Test delivery',$2)", [product.id, randomUUID()]);
  const sale = await completeSale({ lines: [{ productId: product.id, quantity: 3, unitPriceCents: 333, taxRateBp: 875 }], discountCents: 7, requestKey: randomUUID() });
  const line = (await pool.query<{ id: string; tax_cents: number; discount_cents: number }>("SELECT * FROM sale_lines WHERE sale_id=$1", [sale])).rows[0];
  await refundSale(sale, [{ saleLineId: line.id, quantity: 1 }], "One returned", randomUUID());
  assert.equal((await pool.query("SELECT stock FROM product_stock WHERE id=$1", [product.id])).rows[0].stock, 4);
  await assert.rejects(refundSale(sale, [{ saleLineId: line.id, quantity: 3 }], "Too many", randomUUID()), /exceeds/);
  const refundKey = randomUUID();
  const refund = await refundSale(sale, [{ saleLineId: line.id, quantity: 2 }], "Rest returned", refundKey);
  assert.equal(await refundSale(sale, [{ saleLineId: line.id, quantity: 2 }], "Rest returned", refundKey), refund);
  assert.equal((await pool.query("SELECT stock FROM product_stock WHERE id=$1", [product.id])).rows[0].stock, 6);
  const sums = await pool.query("SELECT COALESCE(sum(discount_cents),0)::int AS discount,COALESCE(sum(tax_cents),0)::int AS tax FROM refund_lines WHERE sale_line_id=$1", [line.id]);
  assert.equal(sums.rows[0].discount, line.discount_cents);
  assert.equal(sums.rows[0].tax, line.tax_cents);
  assert.equal((await pool.query("SELECT refunded_quantity FROM sale_lines WHERE id=$1", [line.id])).rows[0].refunded_quantity, 3);
});
