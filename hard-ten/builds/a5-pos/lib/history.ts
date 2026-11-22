import { query } from "./db";

export type SaleLineView = {
  id: string;
  sku: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate_bp: number;
  gross_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  refunded_quantity: number;
};

export type SaleRecord = {
  id: string;
  receipt_number: string;
  payment_method: "cash" | "card";
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  refunded_subtotal_cents: number;
  refunded_discount_cents: number;
  refunded_tax_cents: number;
  refunded_total_cents: number;
  status: "completed" | "partially_refunded" | "refunded";
  created_at: string;
  lines: SaleLineView[];
  refund_reason: string;
};

const lineJson = `json_build_object(
  'id', sl.id, 'sku', sl.sku, 'product_name', sl.product_name,
  'quantity', sl.quantity, 'unit_price_cents', sl.unit_price_cents,
  'tax_rate_bp', sl.tax_rate_bp, 'gross_cents', sl.gross_cents,
  'discount_cents', sl.discount_cents, 'tax_cents', sl.tax_cents,
  'total_cents', sl.total_cents, 'refunded_quantity', sl.refunded_quantity
)`;

export async function listSales(): Promise<SaleRecord[]> {
  const result = await query<SaleRecord>(
    `SELECT s.*, COALESCE(json_agg(${lineJson} ORDER BY sl.id) FILTER (WHERE sl.id IS NOT NULL), '[]') AS lines,
      COALESCE((SELECT string_agg(r.reason, '; ' ORDER BY r.created_at) FROM refunds r WHERE r.sale_id = s.id), '') AS refund_reason
     FROM sales s LEFT JOIN sale_lines sl ON sl.sale_id = s.id
     GROUP BY s.id ORDER BY s.created_at DESC LIMIT 100`,
  );
  return result.rows;
}

export async function getSale(id: string): Promise<SaleRecord | null> {
  const result = await query<SaleRecord>(
    `SELECT s.*, COALESCE(json_agg(${lineJson} ORDER BY sl.id) FILTER (WHERE sl.id IS NOT NULL), '[]') AS lines,
      COALESCE((SELECT string_agg(r.reason, '; ' ORDER BY r.created_at) FROM refunds r WHERE r.sale_id = s.id), '') AS refund_reason
     FROM sales s LEFT JOIN sale_lines sl ON sl.sale_id = s.id
     WHERE s.id = $1::uuid GROUP BY s.id`,
    [id],
  );
  return result.rows[0] ?? null;
}
