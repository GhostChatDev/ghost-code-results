import { databaseError, query } from "./db";
import type { Product, Sale, SaleLine } from "./types";

export type CartLine = {
  productId: string;
  quantity: number;
  unitPriceCents: number;
  taxRateBp: number;
};

export type RefundLine = { saleLineId: string; quantity: number };
export type Refund = {
  id: string;
  reason: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  created_at: string;
  lines: RefundLine[] | null;
};
export type SaleDetail = Sale & { lines: SaleLine[]; refunds: Refund[] };

/** The database computes and locks every amount itself; a UUID makes a retry idempotent. */
export async function completeSale(
  lines: CartLine[], discountCents: number, paymentMethod: "cash" | "card", requestKey: string,
): Promise<string> {
  try {
    return (await query<{ complete_sale: string }>(
      "SELECT complete_sale($1,$2::jsonb,$3,$4::uuid)",
      [paymentMethod, JSON.stringify(lines), discountCents, requestKey],
    )).rows[0].complete_sale;
  } catch (error) { throw databaseError(error); }
}

export async function listSales(limit = 60): Promise<Sale[]> {
  return (await query<Sale>("SELECT * FROM sales ORDER BY created_at DESC LIMIT $1", [Math.min(200, Math.max(1, limit))])).rows;
}

export async function getSale(id: string): Promise<SaleDetail | null> {
  const sale = (await query<Sale>("SELECT * FROM sales WHERE id=$1", [id])).rows[0];
  if (!sale) return null;
  const [lines, refunds] = await Promise.all([
    query<SaleLine & { barcode: string | null }>(`SELECT sl.*, p.barcode FROM sale_lines sl JOIN products p ON p.id=sl.product_id
      WHERE sl.sale_id=$1 ORDER BY sl.product_name`, [id]),
    query<Refund>(`SELECT r.*, (SELECT json_agg(json_build_object('saleLineId', rl.sale_line_id, 'quantity', rl.quantity))
      FROM refund_lines rl WHERE rl.refund_id=r.id) AS lines FROM refunds r WHERE r.sale_id=$1 ORDER BY r.created_at DESC`, [id]),
  ]);
  return { ...sale, lines: lines.rows, refunds: refunds.rows };
}

export async function refundSale(saleId: string, lines: RefundLine[], reason: string, requestKey: string): Promise<string> {
  if (!reason.trim()) throw new Error("Give a reason for the refund");
  try {
    return (await query<{ refund_sale: string }>("SELECT refund_sale($1,$2,$3::jsonb,$4::uuid)",
      [saleId, reason.trim(), JSON.stringify(lines), requestKey])).rows[0].refund_sale;
  } catch (error) { throw databaseError(error); }
}

export type DayReport = {
  gross: number; discount: number; subtotal: number; tax: number; net: number;
  sales_count: number; items_sold: number; refunded: number; refund_count: number;
};

export async function dailyReport(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Choose a valid report date");
  const params = [day];
  const [totals, top, hourly, payments, low] = await Promise.all([
    query<DayReport>(`SELECT COALESCE(sum(gross_cents),0)::int AS gross, COALESCE(sum(discount_cents),0)::int AS discount,
      COALESCE(sum(subtotal_cents),0)::int AS subtotal, COALESCE(sum(tax_cents),0)::int AS tax,
      COALESCE(sum(total_cents),0)::int AS net, count(*)::int AS sales_count,
      COALESCE((SELECT sum(quantity) FROM sale_lines sl JOIN sales s2 ON s2.id=sl.sale_id
        WHERE s2.created_at >= $1::date AND s2.created_at < $1::date + 1),0)::int AS items_sold,
      COALESCE((SELECT sum(total_cents) FROM refunds r WHERE r.created_at >= $1::date AND r.created_at < $1::date + 1),0)::int AS refunded,
      (SELECT count(*) FROM refunds r WHERE r.created_at >= $1::date AND r.created_at < $1::date + 1)::int AS refund_count
      FROM sales s WHERE s.created_at >= $1::date AND s.created_at < $1::date + 1`, params),
    query<{ sku: string; name: string; quantity: number; total: number }>(`SELECT sl.sku,sl.product_name AS name,
      sum(sl.quantity)::int AS quantity,sum(sl.gross_cents-sl.discount_cents+sl.tax_cents)::int AS total
      FROM sale_lines sl JOIN sales s ON s.id=sl.sale_id
      WHERE s.created_at >= $1::date AND s.created_at < $1::date + 1
      GROUP BY sl.sku,sl.product_name ORDER BY total DESC LIMIT 6`, params),
    query<{ hour: number; sales: number; total: number }>(`SELECT extract(hour FROM created_at)::int AS hour,
      count(*)::int AS sales, sum(total_cents)::int AS total
      FROM sales WHERE created_at >= $1::date AND created_at < $1::date + 1 GROUP BY 1 ORDER BY 1`, params),
    query<{ payment_method: string; sales: number; total: number }>(`SELECT payment_method, count(*)::int AS sales,
      sum(total_cents)::int AS total FROM sales WHERE created_at >= $1::date AND created_at < $1::date + 1
      GROUP BY payment_method`, params),
    query<Product>("SELECT * FROM product_stock WHERE active AND stock <= low_stock_threshold ORDER BY stock,name LIMIT 6"),
  ]);
  return { totals: totals.rows[0], top: top.rows, hourly: hourly.rows, payments: payments.rows, low: low.rows };
}
